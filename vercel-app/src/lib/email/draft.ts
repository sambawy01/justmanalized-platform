import { fastModel } from "../assistant/agent";
import type { InboundEmail } from "./inbound";

/**
 * Turn an inbound customer email into { summary, draftSubject, draftText } via
 * the same Ollama backend the Telegram agent uses (OLLAMA_API_KEY → cloud, else
 * a local instance). This is a PLAIN completion — no tools — so it can't take
 * any action; the owner approves the draft on Telegram before anything sends.
 *
 * Never throws: on any model/parse failure it returns a safe fallback (a
 * truncated quote as the "summary" and an empty draft) so the route still
 * notifies the owner, who can reply manually.
 */

export interface EmailDraft {
  summary: string;
  draftSubject: string;
  draftText: string;
}

const SYSTEM_PROMPT = `You are Gameela, the operations assistant for Just Manalized, a small shop selling hand-embellished straw cowboy hats in El Gouna, Egypt (justmanalized.com). The owner is Manal. You are helping her triage an incoming customer email.

Produce STRICT JSON with exactly these keys:
- "summary": one or two sentences telling Manal what the sender wants (her language: English, unless the email is in Arabic, then Arabic).
- "draftSubject": a reply subject line. If replying, prefer "Re: <their subject>".
- "draftText": a warm, professional plain-text reply Manal could send as-is, signed "Just Manalized". Match the sender's language.

Rules: Never invent facts about orders, prices, stock, or shipping — if a real detail is needed that you don't have, write a polite reply that asks for it or promises to check. Keep the reply concise. Output ONLY the JSON object, nothing else.`;

function fallback(email: InboundEmail): EmailDraft {
  const subject = email.subject || "(no subject)";
  return {
    summary: `Email from ${email.fromName || email.fromEmail}: "${subject}". ${email.text
      .slice(0, 200)
      .replace(/\s+/g, " ")
      .trim()}`,
    draftSubject: subject.toLowerCase().startsWith("re:")
      ? subject
      : `Re: ${subject}`,
    draftText: "",
  };
}

function coerceDraft(parsed: unknown, email: InboundEmail): EmailDraft {
  if (!parsed || typeof parsed !== "object") return fallback(email);
  const o = parsed as Record<string, unknown>;
  const summary = typeof o.summary === "string" ? o.summary.trim() : "";
  const draftSubject =
    typeof o.draftSubject === "string" ? o.draftSubject.trim() : "";
  const draftText = typeof o.draftText === "string" ? o.draftText.trim() : "";
  if (!summary && !draftText) return fallback(email);
  const fb = fallback(email);
  return {
    summary: summary || fb.summary,
    draftSubject: (draftSubject || fb.draftSubject).slice(0, 200),
    draftText: draftText.slice(0, 6000),
  };
}

export async function draftEmailReply(
  email: InboundEmail,
  opts: { timeoutMs?: number } = {}
): Promise<EmailDraft> {
  const apiKey = process.env.OLLAMA_API_KEY;
  const baseUrl = apiKey
    ? "https://ollama.com/api/chat"
    : "http://localhost:11434/api/chat";

  const userContent = [
    `From: ${email.fromName ? `${email.fromName} <${email.fromEmail}>` : email.fromEmail}`,
    `Subject: ${email.subject}`,
    "",
    email.text || "(empty body)",
  ].join("\n");

  try {
    const res = await fetch(baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: fastModel(),
        stream: false,
        format: "json",
        options: { num_predict: 700 },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userContent },
        ],
      }),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 25_000),
    });
    if (!res.ok) {
      console.error(`[email-draft] model error ${res.status}`);
      return fallback(email);
    }
    const data = (await res.json()) as { message?: { content?: string } };
    const content = data.message?.content ?? "";
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      console.error("[email-draft] non-JSON model output");
      return fallback(email);
    }
    return coerceDraft(parsed, email);
  } catch (error) {
    console.error("[email-draft] draft failed:", error);
    return fallback(email);
  }
}
