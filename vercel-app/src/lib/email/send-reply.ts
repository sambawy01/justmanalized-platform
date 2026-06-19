import { brandedEmailHtml, escapeHtml } from "../branded-email";

/**
 * Send a REPLY to an inbound customer email via Resend — the send half of the
 * inbound-email feature (`/api/email/inbound`). Mirrors the Resend REST shape
 * used by order-status-email.ts / tools.ts (same from/reply_to, branded HTML,
 * never-throws contract) and ADDS RFC-5322 threading headers so the reply
 * lands inside the customer's original thread instead of as a fresh message.
 *
 * - `inReplyTo` / `references` are the inbound email's Message-ID(s); when
 *   present they go out as the `In-Reply-To` and `References` headers.
 * - Never throws: returns `{ sent, reason? }` so the Telegram confirm handler
 *   can report the outcome as plain text.
 */

const EMAIL_FROM = "Just Manalized <orders@justmanalized.com>";
const REPLY_TO = "hello@justmanalized.com";

export interface SendReplyInput {
  to: string;
  subject: string;
  /** Plain-text body (also rendered into the branded HTML). */
  body: string;
  /** The inbound email's Message-ID, e.g. "<abc@mail.example.com>". */
  inReplyTo?: string;
  /** Full References chain (defaults to inReplyTo when omitted). */
  references?: string;
}

export interface SendReplyResult {
  sent: boolean;
  reason?: string;
}

function bodyToHtml(body: string): string {
  const contentHtml = body
    .split(/\n{2,}/)
    .map(
      (p) =>
        `<p style="margin:0 0 16px;color:#3A332C;font-size:15px;line-height:1.65;">${escapeHtml(
          p
        ).replace(/\n/g, "<br>")}</p>`
    )
    .join("");
  return contentHtml;
}

export async function sendEmailReply(
  input: SendReplyInput
): Promise<SendReplyResult> {
  const to = input.to.trim();
  const subject = input.subject.trim().slice(0, 200);
  const body = input.body.trim().slice(0, 8000);
  if (!to || !subject || !body) {
    return { sent: false, reason: "missing-fields" };
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.log(
      `[email-reply] RESEND_API_KEY not set — would reply to ${to}:\nSubject: ${subject}\n${body}`
    );
    return { sent: false, reason: "email-not-configured" };
  }

  // Threading headers — only when we actually have a Message-ID to reference.
  const headers: Record<string, string> = {};
  if (input.inReplyTo) {
    headers["In-Reply-To"] = input.inReplyTo;
    headers["References"] = (input.references || input.inReplyTo).slice(0, 2000);
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      signal: AbortSignal.timeout(12_000),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: EMAIL_FROM,
        to: [to],
        reply_to: REPLY_TO,
        subject,
        text: body,
        html: brandedEmailHtml({ heading: subject, contentHtml: bodyToHtml(body) }),
        ...(Object.keys(headers).length ? { headers } : {}),
      }),
    });
    if (!res.ok) {
      const detail = (await res.text()).slice(0, 300);
      console.error(
        `[email-reply] reply to ${to} failed (${res.status}): ${detail}`
      );
      return { sent: false, reason: `resend-${res.status}` };
    }
    return { sent: true };
  } catch (error) {
    console.error(`[email-reply] reply to ${to} network error:`, error);
    return { sent: false, reason: "resend-network-error" };
  }
}
