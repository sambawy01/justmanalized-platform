import { listOrders, type StoredOrder } from "./orders";

/**
 * Shared data gathering for the owner's daily brief — used by both the
 * morning cron email (/api/cron/daily-brief) and the assistant's `daily_brief`
 * Telegram tool, so the two views can never drift.
 *
 * (The original studio brief also gathered Cal bookings and a CRM re-booking
 * radar. Just Manalized is a pure shop, so the brief is order-centric.)
 *
 * Fail-soft per source: if Blob is down, the brief still renders with a
 * "couldn't load X" note instead of failing entirely.
 */

export interface DailyBriefData {
  orders: StoredOrder[];
  failures: string[];
}

export interface GatherOptions {
  /** Reserved for future opt-out flags; currently unused. */
  includeRebooking?: boolean;
}

export async function gatherDailyBriefData(
  _options: GatherOptions = {}
): Promise<DailyBriefData> {
  const failures: string[] = [];

  let orders: StoredOrder[] = [];
  try {
    orders = await listOrders();
  } catch (error) {
    console.error("[daily-brief] Failed to load shop orders:", error);
    failures.push("shop orders");
  }

  return { orders, failures };
}
