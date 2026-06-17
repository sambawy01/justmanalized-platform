import { brandedEmailHtml, escapeHtml } from "../branded-email";
import { cairoDateKey } from "../daily-brief-email";
import { listOrders, type StoredOrder } from "../orders";
import { cairoSubjectDate, cairoWeekdayNow, type CairoWeekday } from "./shared";

/**
 * The owner's Sunday-18:00-Cairo weekly report (/api/cron/weekly-report):
 * this week vs last week across shop orders. (The original studio report also
 * tracked bookings/treatments; Just Manalized is a pure shop.)
 *
 * WEEK DEFINITION: Cairo calendar weeks, Monday through Sunday. Everything is
 * bucketed by its Africa/Cairo calendar date (cairoDateKey) so the boundaries
 * are Cairo-midnight exact without any UTC-offset arithmetic — DST-proof by
 * construction. Orders count by their CREATED date and reflect their status at
 * report time (an order cancelled on Saturday counts as a cancellation).
 *
 * Metrics per week:
 * - orders count + revenue EGP over delivered+shipped+confirmed (cancelled
 *   and still-unconfirmed "ordered" carts are NOT revenue)
 * - cancellations: cancelled orders
 *
 * The finance P&L's `extraSections` slot (see `buildWeeklyReportEmail`) lets an
 * "Expenses / P&L" ReportSection slot in between the built-in sections and the
 * signoff with zero changes to the renderer.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The single source of truth for which order statuses count as REVENUE:
 * confirmed, shipped and delivered. Cancelled orders and still-unconfirmed
 * "ordered" carts are NOT revenue. Exported so the finance P&L
 * (@/lib/finance-report) computes the SAME shop number over a date range —
 * there is exactly one revenue rule in the codebase.
 */
export const ORDER_REVENUE_STATUSES: ReadonlySet<string> = new Set([
  "confirmed",
  "shipped",
  "delivered",
]);

/** Backwards-compatible local alias. */
const REVENUE_STATUSES = ORDER_REVENUE_STATUSES;

/**
 * Sum EGP revenue over a set of orders, counting only revenue statuses
 * (ORDER_REVENUE_STATUSES). The pure heart of the weekly report's revenue
 * line, reused verbatim by the finance P&L so both agree by construction.
 */
export function orderRevenueEgp(orders: StoredOrder[]): number {
  return orders
    .filter((o) => REVENUE_STATUSES.has(o.status))
    .reduce(
      (sum, o) => sum + (Number.isFinite(o.totals?.egp) ? o.totals.egp : 0),
      0
    );
}

/** Orders among `orders` that count as revenue (statuses in the set). */
export function revenueOrders(orders: StoredOrder[]): StoredOrder[] {
  return orders.filter((o) => REVENUE_STATUSES.has(o.status));
}

/** A titled block of plain lines — text and HTML render from the same data. */
export interface ReportSection {
  title: string;
  /** Plain-text lines; escaped for HTML by the renderer. */
  lines: string[];
}

export interface WeekStats {
  /** Inclusive Cairo date-key range, e.g. "2026-06-08 – 2026-06-14". */
  label: string;
  ordersCount: number;
  revenueEgp: number;
  cancelledOrders: number;
}

export interface WeeklyReportData {
  thisWeek: WeekStats;
  lastWeek: WeekStats;
  failures: string[];
  now: Date;
}

const WEEKDAY_INDEX: Record<CairoWeekday, number> = {
  Mon: 0,
  Tue: 1,
  Wed: 2,
  Thu: 3,
  Fri: 4,
  Sat: 5,
  Sun: 6,
};

/**
 * The 7 Cairo date keys of the Mon–Sun week containing `now`, shifted back
 * `weeksBack` weeks. Stepping whole 24h blocks from an evening instant and
 * re-deriving the Cairo date key per step is DST-safe (a 1h offset flip
 * never moves an 18:00-local instant across a date boundary).
 */
export function cairoWeekKeys(now: Date, weeksBack: number): string[] {
  const todayIdx = WEEKDAY_INDEX[cairoWeekdayNow(now)];
  const keys: string[] = [];
  for (let i = 0; i < 7; i++) {
    const offsetDays = todayIdx - i + weeksBack * 7;
    keys.push(cairoDateKey(new Date(now.getTime() - offsetDays * DAY_MS)));
  }
  return keys;
}

function computeWeekStats(keys: string[], orders: StoredOrder[]): WeekStats {
  const keySet = new Set(keys);

  const inWeekOrders = orders.filter((o) =>
    keySet.has(cairoDateKey(new Date(o.createdAt)))
  );
  const inWeekRevenueOrders = revenueOrders(inWeekOrders);
  const revenueEgp = orderRevenueEgp(inWeekOrders);
  const cancelledOrders = inWeekOrders.filter(
    (o) => o.status === "cancelled"
  ).length;

  return {
    label: `${keys[0]} – ${keys[6]}`,
    ordersCount: inWeekRevenueOrders.length,
    revenueEgp,
    cancelledOrders,
  };
}

/**
 * Gather both weeks' raw data — fail-soft per source like the daily brief.
 */
export async function gatherWeeklyReportData(
  now: Date = new Date()
): Promise<WeeklyReportData> {
  const failures: string[] = [];

  let orders: StoredOrder[] = [];
  try {
    orders = await listOrders({ limit: 200 });
  } catch (error) {
    console.error("[weekly-report] Failed to load shop orders:", error);
    failures.push("shop orders");
  }

  const thisWeekKeys = cairoWeekKeys(now, 0);
  const lastWeekKeys = cairoWeekKeys(now, 1);

  return {
    thisWeek: computeWeekStats(thisWeekKeys, orders),
    lastWeek: computeWeekStats(lastWeekKeys, orders),
    failures,
    now,
  };
}

/** "7 (last week 5, +2)" — the comparison voice of every metric line. */
function compared(current: number, previous: number, unit = ""): string {
  const delta = current - previous;
  const sign = delta > 0 ? `+${delta}` : `${delta}`;
  const deltaText = delta === 0 ? "unchanged" : sign;
  return `${current}${unit} (last week ${previous}${unit}, ${deltaText})`;
}

export interface WeeklyReport {
  subject: string;
  text: string;
  html: string;
  sections: ReportSection[];
}

export function buildWeeklyReportEmail(
  data: WeeklyReportData,
  options: { extraSections?: ReportSection[] } = {}
): WeeklyReport {
  const { thisWeek, lastWeek, failures, now } = data;

  const sections: ReportSection[] = [];

  sections.push({
    title: "Shop orders",
    lines: [
      `Orders (confirmed/shipped/delivered): ${compared(thisWeek.ordersCount, lastWeek.ordersCount)}`,
      `Revenue: ${compared(thisWeek.revenueEgp, lastWeek.revenueEgp, " EGP")}`,
    ],
  });

  sections.push({
    title: "Cancellations",
    lines: [
      `Orders cancelled: ${compared(thisWeek.cancelledOrders, lastWeek.cancelledOrders)}`,
    ],
  });

  // Future P&L / expenses sections slot in here, before the signoff.
  sections.push(...(options.extraSections ?? []));

  const subjectDate = cairoSubjectDate(now);
  const subject = `Weekly report — week ending ${subjectDate}`;

  // --- text part -------------------------------------------------------------
  const textLines: string[] = [
    `Your week in review (${thisWeek.label}, Cairo time).`,
    "",
  ];
  if (failures.length) {
    textLines.push(
      `Heads up: couldn't load ${failures.join(" and ")} — the numbers below may be incomplete.`,
      ""
    );
  }
  for (const section of sections) {
    textLines.push(section.title);
    for (const l of section.lines) textLines.push(`  ${l}`);
    textLines.push("");
  }
  textLines.push("Have a restful Sunday!", "— your shop assistant");
  const text = textLines.join("\n");

  // --- html part ---------------------------------------------------------------
  const sectionTitle = (title: string) =>
    `<p style="margin:28px 0 8px;color:#847866;font-size:13px;text-transform:uppercase;letter-spacing:0.12em;">${escapeHtml(title)}</p>`;
  const line = (content: string) =>
    `<p style="margin:0 0 8px;color:#3A332C;font-size:15px;line-height:1.6;">${content}</p>`;

  let contentHtml = `<p style="margin:0 0 8px;color:#847866;font-size:14px;">${escapeHtml(thisWeek.label)} · Cairo time</p>`;
  if (failures.length) {
    contentHtml += `<div style="margin:0 0 16px;padding:12px 16px;border:1px solid #E5DCCB;border-radius:10px;background-color:#F4EFE7;"><p style="margin:0;color:#3A332C;font-size:14px;">Heads up: couldn't load ${escapeHtml(failures.join(" and "))} — the numbers below may be incomplete.</p></div>`;
  }
  for (const section of sections) {
    contentHtml += sectionTitle(section.title);
    for (const l of section.lines) {
      contentHtml += line(escapeHtml(l));
    }
  }
  contentHtml += `<p style="margin:28px 0 0;color:#847866;font-size:14px;">Have a restful Sunday!<br>— your shop assistant</p>`;

  const html = brandedEmailHtml({
    heading: `Your week in review`,
    contentHtml,
    belowCardHtml:
      "Weeks run Monday–Sunday in Cairo time (Africa/Cairo). Revenue counts confirmed, shipped and delivered orders.",
  });

  return { subject, text, html, sections };
}
