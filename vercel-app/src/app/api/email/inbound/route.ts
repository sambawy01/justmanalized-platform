import { NextRequest, NextResponse } from "next/server";
import {
  claimInboundEmail,
  fetchReceivedEmail,
  inboundConfigured,
  storeInboundThread,
  verifyResendSignature,
} from "@/lib/email/inbound";
import { draftEmailReply } from "@/lib/email/draft";
import {
  appendAudit,
  createPendingAction,
  getOwnerChatId,
  NOTIFY_PENDING_TTL_MS,
} from "@/lib/assistant/state";
import { confirmEditCancelKeyboard, sendMessage } from "@/lib/telegram";

/**
 * POST /api/email/inbound — Resend Inbound webhook → Gameela drafts a reply →
 * the owner approves it on Telegram.
 *
 * Security & discipline mirror the Telegram webhook:
 * 1. Authenticity: Resend signs with the Svix scheme; we verify HMAC over the
 *    RAW body with RESEND_WEBHOOK_SECRET and fail closed (401) on any mismatch.
 *    Without the secret the route answers 501 (feature dormant).
 * 2. Exactly-once: an atomic Blob claim per received-email id — a redelivered
 *    webhook never drafts/notifies twice.
 * 3. Confirm gate: the drafted reply is parked as a pending action (the SAME
 *    machinery as every other mutation) and only sends from the owner's
 *    [✅ Send] tap (callback_query) handled by the Telegram webhook.
 *
 * Always answers 2xx once authenticated — Resend retries non-2xx, and a crash
 * loop would re-draft/re-notify. Real output goes out-of-band via sendMessage.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface ResendWebhookEvent {
  type?: string;
  data?: { email_id?: string; id?: string };
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!inboundConfigured()) {
    return NextResponse.json({ error: "not-configured" }, { status: 501 });
  }

  // Read the RAW body before parsing — the signature is computed over these
  // exact bytes.
  const rawBody = await request.text();
  const ok = verifyResendSignature(rawBody, {
    svixId: request.headers.get("svix-id"),
    svixTimestamp: request.headers.get("svix-timestamp"),
    svixSignature: request.headers.get("svix-signature"),
  });
  if (!ok) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // From here on: always 200 (Resend must not redeliver authenticated events).
  let event: ResendWebhookEvent;
  try {
    event = JSON.parse(rawBody) as ResendWebhookEvent;
  } catch {
    return NextResponse.json({ ok: true, ignored: "unparseable" });
  }

  if (event.type !== "email.received") {
    return NextResponse.json({ ok: true, ignored: event.type ?? "unknown" });
  }
  const emailId = event.data?.email_id ?? event.data?.id;
  if (!emailId) {
    return NextResponse.json({ ok: true, ignored: "no-id" });
  }

  try {
    // No owner bound → no one to notify. Don't consume the claim, so a later
    // binding could still pick up a redelivery. (getOwnerChatId fails closed.)
    let owner: number | null;
    try {
      owner = await getOwnerChatId();
    } catch (error) {
      console.error("[email-inbound] owner unreadable — skipping:", error);
      return NextResponse.json({ ok: true, skipped: "owner-unreadable" });
    }
    if (owner === null) {
      return NextResponse.json({ ok: true, skipped: "no-owner" });
    }

    // Exactly-once: first delivery wins; redeliveries no-op.
    if (!(await claimInboundEmail(emailId))) {
      return NextResponse.json({ ok: true, skipped: "already-seen" });
    }

    const email = await fetchReceivedEmail(emailId);
    if (!email) {
      return NextResponse.json({ ok: true, skipped: "fetch-failed" });
    }
    await storeInboundThread(email);

    const draft = await draftEmailReply(email);

    const senderLabel = email.fromName
      ? `${email.fromName} <${email.fromEmail}>`
      : email.fromEmail;
    const header =
      `📧 New email — ${senderLabel}\n` +
      `Subject: ${email.subject}\n\n` +
      `📝 ${draft.summary}`;

    await appendAudit({
      chatId: owner,
      kind: "email-received",
      detail: { from: email.fromEmail, subject: email.subject, id: emailId },
    });

    // No usable draft → notify only; nothing to send, so no confirm button.
    if (!draft.draftText) {
      await sendMessage(
        owner,
        `${header}\n\n(No draft — reply from your inbox or tell me what to say.)`
      );
      return NextResponse.json({ ok: true, notified: "no-draft" });
    }

    const pending = await createPendingAction({
      chatId: owner,
      tool: "email_send_reply",
      args: {
        to: email.fromEmail,
        subject: draft.draftSubject,
        body: draft.draftText,
        inReplyTo: email.messageId,
        references: email.messageId,
      },
      summary: `Reply to ${email.fromEmail}: "${draft.draftSubject}"`,
      ttlMs: NOTIFY_PENDING_TTL_MS,
    });

    await sendMessage(
      owner,
      `${header}\n\n✍️ Draft reply:\n${draft.draftText}`,
      { replyMarkup: confirmEditCancelKeyboard(pending.id) }
    );

    return NextResponse.json({ ok: true, notified: true });
  } catch (error) {
    console.error("[email-inbound] processing error:", error);
    // Still 200 — the claim already guards against a re-draft on redelivery.
    return NextResponse.json({ ok: true, error: "processing-failed" });
  }
}
