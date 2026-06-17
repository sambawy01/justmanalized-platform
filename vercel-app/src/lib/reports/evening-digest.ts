import { brandedEmailHtml, escapeHtml } from "../branded-email";
import type { StoredOrder } from "../orders";
import { cairoSubjectDate } from "./shared";

/**
 * The owner's 20:00-Cairo evening digest (/api/cron/evening-digest):
 *
 * - "Orders stuck in 'ordered' 48h+": shop orders never confirmed within two
 *   days of being placed.
 *
 * (The original studio digest also previewed tomorrow's appointments and
 * pending booking requests. Just Manalized is a pure shop, so the digest is
 * order-centric.)
 *
 * EMPTY-STATE POLICY (deliberate, opposite of the morning brief): when the
 * digest is empty it is SKIPPED ENTIRELY — no Telegram, no email. The morning
 * brief is the daily heartbeat; the evening digest is an action nudge, and an
 * evening "nothing needs you" message every single day is pure noise.
 * EXCEPTION: when a data source failed to load, the digest still goes out with
 * the failure note — "empty because we couldn't look" must not masquerade as a
 * genuinely quiet evening.
 *
 * NOTE (Track B / rebrand): the admin base URL is a PLACEHOLDER.
 */

export interface EveningDigestInput {
  /** All stored shop orders (any status — filtered here). */
  orders: StoredOrder[];
  /** Data sources that failed to load — surfaced, and they suppress the skip. */
  failures: string[];
  /** "Now" — injectable for tests. */
  now?: Date;
}

export interface EveningDigest {
  /** True → nothing to say, the cron route sends NOTHING. */
  empty: boolean;
  subject: string;
  text: string;
  html: string;
  counts: { staleOrders: number };
}

const ORDER_STALE_MS = 48 * 60 * 60 * 1000;

export function buildEveningDigest(input: EveningDigestInput): EveningDigest {
  const now = input.now ?? new Date();

  const staleOrderCutoff = now.getTime() - ORDER_STALE_MS;
  const staleOrders = input.orders.filter((o) => {
    if (o.status !== "ordered") return false;
    const createdMs = new Date(o.createdAt).getTime();
    return !Number.isNaN(createdMs) && createdMs <= staleOrderCutoff;
  });

  const empty = staleOrders.length === 0 && input.failures.length === 0;

  const subjectDate = cairoSubjectDate(now);
  const subject = `Evening digest — ${subjectDate}: ${staleOrders.length} order(s) need action`;

  const adminToken = process.env.ADMIN_TOKEN || "";
  const adminBase = "https://justmanalized.com/admin";
  const adminLink = adminToken
    ? `${adminBase}?key=${encodeURIComponent(adminToken)}`
    : adminBase;

  // --- text part -------------------------------------------------------------
  const textLines: string[] = [`Good evening! Orders at a glance.`, ""];

  if (input.failures.length) {
    textLines.push(
      `Heads up: couldn't load ${input.failures.join(" and ")} — the section below may be incomplete.`,
      ""
    );
  }

  textLines.push(`Orders stuck in "ordered" 48h+ (${staleOrders.length})`);
  if (staleOrders.length === 0) {
    textLines.push("  None — every order has been picked up.");
  } else {
    for (const o of staleOrders) {
      const items = o.items.map((i) => `${i.qty}× ${i.names.en}`).join(", ");
      textLines.push(
        `  ${o.orderNumber} · ${o.name} · ${o.phone} · ${o.totals.egp} EGP — ${items}`
      );
    }
    textLines.push(`  Manage orders here: ${adminLink}`);
  }

  textLines.push("", "Rest well!", "— your shop assistant");
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

  contentHtml += sectionTitle(
    `Orders stuck in "ordered" 48h+ (${staleOrders.length})`
  );
  if (staleOrders.length === 0) {
    contentHtml += line("None — every order has been picked up.", true);
  } else {
    for (const o of staleOrders) {
      const items = o.items.map((i) => `${i.qty}× ${i.names.en}`).join(", ");
      contentHtml += line(
        `<strong>${escapeHtml(o.orderNumber)}</strong> · ${escapeHtml(o.name)} · ${escapeHtml(o.phone)} · ${escapeHtml(String(o.totals.egp))} EGP<br><span style="color:#847866;font-size:14px;">${escapeHtml(items)}</span>`
      );
    }
    contentHtml += adminButton("Open admin");
  }

  contentHtml += `<p style="margin:28px 0 0;color:#847866;font-size:14px;">Rest well!<br>— your shop assistant</p>`;

  const html = brandedEmailHtml({
    heading: `Orders at a glance — ${subjectDate}`,
    contentHtml,
    belowCardHtml: "Times shown in Cairo time (Africa/Cairo).",
  });

  return {
    empty,
    subject,
    text,
    html,
    counts: {
      staleOrders: staleOrders.length,
    },
  };
}
