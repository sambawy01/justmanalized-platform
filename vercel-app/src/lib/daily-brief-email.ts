import { brandedEmailHtml, escapeHtml } from "./branded-email";
import type { StoredOrder } from "./orders";

/**
 * The owner's morning daily brief, sent from /api/cron/daily-brief.
 *
 * One branded email (English — the ops language, matching /admin):
 * - "Shop orders needing action": orders still in ordered/confirmed status.
 *
 * (The original studio brief also listed appointments, pending booking
 * requests and a re-booking radar. Just Manalized is a pure shop, so the brief
 * is now order-centric.)
 *
 * Sent even when everything is empty ("All caught up — no orders waiting.") so
 * a missing brief always means a delivery problem, never an empty day.
 * Per-recipient Resend sends, same as the other owner emails.
 *
 * NOTE (Track B / rebrand): EMAIL_FROM, NOTIFY_EMAIL_DEFAULT and ADMIN_URL_BASE
 * are PLACEHOLDERS — set the real domain/address once supplied.
 */

const NOTIFY_EMAIL_DEFAULT = "hello@justmanalized.com";
const ADMIN_URL_BASE = "https://justmanalized.com/admin";
const EMAIL_FROM = "Just Manalized <orders@justmanalized.com>";
const CAIRO_TZ = "Africa/Cairo";

// --- Cairo time helpers ------------------------------------------------------

/** "YYYY-MM-DD" calendar date of an instant, in Cairo. */
export function cairoDateKey(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: CAIRO_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** Current hour-of-day (0–23) in Cairo — the DST-proof cron guard. */
export function cairoHourNow(now: Date = new Date()): number {
  return Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: CAIRO_TZ,
      hour: "numeric",
      hourCycle: "h23",
    }).format(now)
  );
}

/** "Thu 12 Jun" — subject-line date in Cairo. */
function cairoSubjectDate(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: CAIRO_TZ,
    weekday: "short",
    day: "numeric",
    month: "short",
  })
    .format(date)
    .replace(",", "");
}

// --- brief assembly -----------------------------------------------------------

export interface DailyBriefInput {
  /** All stored shop orders (any status — filtered here). */
  orders: StoredOrder[];
  /** Data sources that failed to load — surfaced in the email. */
  failures: string[];
  /** "Now" — injectable for tests. */
  now?: Date;
}

export interface DailyBrief {
  subject: string;
  text: string;
  html: string;
  counts: {
    orders: number;
  };
}

export function buildDailyBriefEmail(input: DailyBriefInput): DailyBrief {
  const now = input.now ?? new Date();

  const openOrders = input.orders.filter(
    (o) => o.status === "ordered" || o.status === "confirmed"
  );

  const adminToken = process.env.ADMIN_TOKEN || "";
  const adminLink = adminToken
    ? `${ADMIN_URL_BASE}?key=${encodeURIComponent(adminToken)}`
    : ADMIN_URL_BASE;

  const subjectDate = cairoSubjectDate(now);
  const orderCount = openOrders.length;
  const subject =
    orderCount > 0
      ? `Your day — ${subjectDate}: ${orderCount} order${orderCount === 1 ? "" : "s"} to action`
      : `Your day — ${subjectDate}: all caught up`;

  // --- text part -------------------------------------------------------------
  const textLines: string[] = [`Good morning! Your day — ${subjectDate}.`, ""];

  if (input.failures.length) {
    textLines.push(
      `Heads up: couldn't load ${input.failures.join(" and ")} — the section below may be incomplete.`,
      ""
    );
  }

  textLines.push(`Shop orders needing action (${openOrders.length})`);
  if (openOrders.length === 0) {
    textLines.push("  None — all orders are on their way or delivered.");
  } else {
    for (const o of openOrders) {
      const items = o.items.map((i) => `${i.qty}× ${i.names.en}`).join(", ");
      textLines.push(
        `  ${o.orderNumber} (${o.status}) · ${o.name} · ${o.phone} · ${o.totals.egp} EGP — ${items}`
      );
    }
    textLines.push(`  Manage orders here: ${adminLink}`);
  }

  textLines.push("", "Have a wonderful day!", "— your shop assistant");
  const text = textLines.join("\n");

  // --- html part ---------------------------------------------------------------
  const sectionTitle = (title: string) =>
    `<p style="margin:28px 0 8px;color:#847866;font-size:13px;text-transform:uppercase;letter-spacing:0.12em;">${escapeHtml(title)}</p>`;

  const line = (content: string, muted = false) =>
    `<p style="margin:0 0 8px;color:${muted ? "#847866" : "#3A332C"};font-size:15px;line-height:1.6;">${content}</p>`;

  const adminButton = (label: string) =>
    `<p style="margin:12px 0 0;"><a href="${adminLink}" style="display:inline-block;background-color:#3A332C;color:#FFFDF9;text-decoration:none;padding:10px 24px;border-radius:9999px;font-size:14px;">${escapeHtml(label)}</a></p>`;

  let contentHtml = "";

  if (input.failures.length) {
    contentHtml += `<div style="margin:0 0 16px;padding:12px 16px;border:1px solid #E5DCCB;border-radius:10px;background-color:#F4EFE7;"><p style="margin:0;color:#3A332C;font-size:14px;">Heads up: couldn't load ${escapeHtml(input.failures.join(" and "))} — the section below may be incomplete.</p></div>`;
  }

  contentHtml += sectionTitle(`Shop orders needing action (${openOrders.length})`);
  if (openOrders.length === 0) {
    contentHtml += line("None — all orders are on their way or delivered.", true);
  } else {
    for (const o of openOrders) {
      const items = o.items.map((i) => `${i.qty}× ${i.names.en}`).join(", ");
      contentHtml += line(
        `<strong>${escapeHtml(o.orderNumber)}</strong> (${escapeHtml(o.status)}) · ${escapeHtml(o.name)} · ${escapeHtml(o.phone)} · ${escapeHtml(String(o.totals.egp))} EGP<br><span style="color:#847866;font-size:14px;">${escapeHtml(items)}</span>`
      );
    }
    contentHtml += adminButton("Open admin");
  }

  contentHtml += `<p style="margin:28px 0 0;color:#847866;font-size:14px;">Have a wonderful day!<br>— your shop assistant</p>`;

  const html = brandedEmailHtml({
    heading: `Your day — ${subjectDate}`,
    contentHtml,
    belowCardHtml: "Times shown in Cairo time (Africa/Cairo).",
  });

  return {
    subject,
    text,
    html,
    counts: {
      orders: openOrders.length,
    },
  };
}

// --- sender (never throws) ------------------------------------------------------

export async function sendDailyBriefEmail(brief: DailyBrief): Promise<{
  sent: boolean;
  sentCount: number;
  failedCount: number;
  reason?: string;
}> {
  const apiKey = process.env.RESEND_API_KEY;
  const recipients = (process.env.NOTIFY_EMAIL || NOTIFY_EMAIL_DEFAULT)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (!apiKey) {
    // Graceful no-op — log one entry per recipient, mirroring the real sends.
    for (const recipient of recipients) {
      console.log(
        `[daily-brief] RESEND_API_KEY not set — would email ${recipient}:\nSubject: ${brief.subject}\n${brief.text}`
      );
    }
    return { sent: false, sentCount: 0, failedCount: 0, reason: "email-not-configured" };
  }

  // One Resend call per recipient so a single bounced inbox can't block the
  // other owner address (same pattern as the order notification emails).
  const outcomes = await Promise.all(
    recipients.map(async (recipient): Promise<boolean> => {
      try {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: EMAIL_FROM,
            to: [recipient],
            subject: brief.subject,
            text: brief.text,
            html: brief.html,
          }),
        });
        if (!res.ok) {
          const body = await res.text();
          console.error(
            `[daily-brief] Resend send to ${recipient} failed (${res.status}): ${body.slice(0, 300)}`
          );
          return false;
        }
        console.log(`[daily-brief] Sent to ${recipient}: ${brief.subject}`);
        return true;
      } catch (error) {
        console.error(`[daily-brief] Resend request error for ${recipient}:`, error);
        return false;
      }
    })
  );

  const sentCount = outcomes.filter(Boolean).length;
  return {
    sent: sentCount > 0,
    sentCount,
    failedCount: outcomes.length - sentCount,
  };
}
