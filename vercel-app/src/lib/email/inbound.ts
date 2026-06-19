import { createHmac, timingSafeEqual } from "node:crypto";
import { put } from "@vercel/blob";
import { getPrivateBlob } from "../blob-read";

/**
 * Inbound-email plumbing for the `/api/email/inbound` webhook (Resend Inbound).
 *
 * Three jobs, all fail-closed / best-effort by design:
 * 1. `verifyResendSignature` — Resend signs webhooks with the Svix scheme
 *    (svix-id / svix-timestamp / svix-signature). We verify HMAC-SHA256 over
 *    `${id}.${timestamp}.${rawBody}` with RESEND_WEBHOOK_SECRET, constant-time,
 *    and reject anything we cannot prove — mirroring the Telegram webhook's
 *    fail-closed secret check.
 * 2. `fetchReceivedEmail` — Resend's webhook carries METADATA ONLY, so we pull
 *    the full parsed body from GET /emails/receiving/{id}.
 * 3. `claimInboundEmail` — exactly-once marker (Blob, allowOverwrite:false) so a
 *    redelivered webhook never drafts/notifies twice.
 */

// --- signature verification (Svix scheme) ------------------------------------

const SIGNATURE_TOLERANCE_SECONDS = 5 * 60;

export function inboundConfigured(): boolean {
  return Boolean(process.env.RESEND_WEBHOOK_SECRET);
}

/** Decode a Svix signing secret (`whsec_<base64>` or bare base64) to bytes. */
function secretKey(): Buffer | null {
  const raw = (process.env.RESEND_WEBHOOK_SECRET || "").trim();
  if (!raw) return null;
  const b64 = raw.startsWith("whsec_") ? raw.slice("whsec_".length) : raw;
  try {
    return Buffer.from(b64, "base64");
  } catch {
    return null;
  }
}

function constantTimeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/**
 * Verify a Resend/Svix-signed webhook. `rawBody` MUST be the exact bytes used
 * to compute the signature (read the request body as text BEFORE JSON.parse).
 * Returns false (fail closed) on any missing header, bad secret, stale
 * timestamp, or signature mismatch.
 */
export function verifyResendSignature(
  rawBody: string,
  headers: {
    svixId: string | null;
    svixTimestamp: string | null;
    svixSignature: string | null;
  }
): boolean {
  const key = secretKey();
  if (!key) return false;
  const { svixId, svixTimestamp, svixSignature } = headers;
  if (!svixId || !svixTimestamp || !svixSignature) return false;

  // Reject stale/forward-dated timestamps (replay protection).
  const ts = Number(svixTimestamp);
  if (!Number.isFinite(ts)) return false;
  const skew = Math.abs(Date.now() / 1000 - ts);
  if (skew > SIGNATURE_TOLERANCE_SECONDS) return false;

  const signedContent = `${svixId}.${svixTimestamp}.${rawBody}`;
  const expected = createHmac("sha256", key).update(signedContent).digest("base64");

  // svix-signature is a space-delimited list of `v1,<base64sig>` entries.
  for (const part of svixSignature.split(" ")) {
    const comma = part.indexOf(",");
    const sig = comma >= 0 ? part.slice(comma + 1) : part;
    if (sig && constantTimeEqual(sig, expected)) return true;
  }
  return false;
}

// --- received-email fetch ----------------------------------------------------

export interface InboundEmail {
  id: string;
  fromEmail: string;
  fromName: string;
  subject: string;
  text: string;
  /** RFC Message-ID of the inbound mail, for reply threading. */
  messageId: string;
}

/** Pull a single name+address out of Resend's `from` (string or object). */
function parseFrom(from: unknown): { email: string; name: string } {
  if (typeof from === "string") {
    const m = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(from);
    if (m) return { name: m[1].replace(/^"|"$/g, ""), email: m[2].trim() };
    return { name: "", email: from.trim() };
  }
  if (from && typeof from === "object") {
    const o = from as { email?: unknown; name?: unknown; address?: unknown };
    const email =
      typeof o.email === "string"
        ? o.email
        : typeof o.address === "string"
          ? o.address
          : "";
    const name = typeof o.name === "string" ? o.name : "";
    return { name, email: email.trim() };
  }
  return { name: "", email: "" };
}

/**
 * Retrieve the full parsed inbound email by id. Returns null on any failure
 * (no key, non-200, unparseable, or no usable sender) — the route degrades to
 * a 200 with no notification rather than crashing.
 */
export async function fetchReceivedEmail(
  id: string
): Promise<InboundEmail | null> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  let data: Record<string, unknown>;
  try {
    const res = await fetch(
      `https://api.resend.com/emails/receiving/${encodeURIComponent(id)}`,
      {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(15_000),
      }
    );
    if (!res.ok) {
      console.error(`[email-inbound] fetch ${id} failed (${res.status})`);
      return null;
    }
    data = (await res.json()) as Record<string, unknown>;
  } catch (error) {
    console.error(`[email-inbound] fetch ${id} error:`, error);
    return null;
  }

  const { email: fromEmail, name: fromName } = parseFrom(data.from);
  if (!fromEmail) return null;

  const headers = (data.headers ?? {}) as Record<string, unknown>;
  const messageId =
    typeof data.message_id === "string"
      ? data.message_id
      : typeof headers["message-id"] === "string"
        ? (headers["message-id"] as string)
        : "";

  const text =
    typeof data.text === "string" && data.text.trim()
      ? data.text
      : typeof data.subject === "string"
        ? ""
        : "";

  return {
    id,
    fromEmail,
    fromName,
    subject: typeof data.subject === "string" ? data.subject : "(no subject)",
    text: text.slice(0, 12000),
    messageId,
  };
}

// --- exactly-once claim ------------------------------------------------------

const INBOUND_ID_RE = /^[A-Za-z0-9._-]{1,200}$/;

function seenPath(id: string): string {
  return `emails/seen/${id}.json`;
}

/**
 * Claim an inbound email id exactly once (Blob put with allowOverwrite:false).
 * Returns true the FIRST time an id is seen; false on a redelivery (or on any
 * error → fail closed so a flaky write can't double-notify).
 */
export async function claimInboundEmail(id: string): Promise<boolean> {
  if (!INBOUND_ID_RE.test(id)) return false;
  try {
    await put(seenPath(id), JSON.stringify({ seenAt: new Date().toISOString() }), {
      access: "private",
      contentType: "application/json",
      addRandomSuffix: false,
      allowOverwrite: false,
    });
    return true;
  } catch {
    return false;
  }
}

/** Persist the parsed inbound email for audit / future "Edit" flows. */
export async function storeInboundThread(email: InboundEmail): Promise<void> {
  try {
    await put(
      `emails/threads/${email.id}.json`,
      JSON.stringify({ ...email, storedAt: new Date().toISOString() }, null, 2),
      {
        access: "private",
        contentType: "application/json",
        addRandomSuffix: false,
        allowOverwrite: true,
      }
    );
  } catch (error) {
    console.error(`[email-inbound] store thread ${email.id} failed:`, error);
  }
}

/** Read back a stored inbound thread (used by getPrivateBlob, may be null). */
export async function loadInboundThread(
  id: string
): Promise<InboundEmail | null> {
  if (!INBOUND_ID_RE.test(id)) return null;
  const result = await getPrivateBlob(`emails/threads/${id}.json`);
  if (!result || result.statusCode !== 200) return null;
  try {
    return (await new Response(result.stream).json()) as InboundEmail;
  } catch {
    return null;
  }
}
