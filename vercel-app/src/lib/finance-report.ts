import { listOrders, type StoredOrder } from "./orders";
import { orderRevenueEgp, revenueOrders } from "./reports/weekly-report";
import {
  filterByPeriod,
  listLedger,
  sumAmount,
  sumByCategory,
  type LedgerEntry,
} from "./finance";

/**
 * Profit & Loss for the shop — the period-agnostic engine behind the admin
 * Finance tab, the CSV/PDF exports, the assistant's finance_summary tool, and
 * the monthly P&L cron. (The original studio P&L also counted treatment
 * revenue from Cal bookings; Just Manalized is a pure shop.)
 *
 * THE NO-DOUBLE-ENTRY MODEL (deliberate — see @/lib/finance):
 *   REVENUE  = shop order revenue (live, from the order store)
 *            + manual income entries (ledger)
 *   EXPENSES = manual expense entries (ledger), by category
 *   NET      = REVENUE − EXPENSES
 *
 * Platform income is pulled LIVE and never mirrored into the ledger, so there
 * is nothing to reconcile. The shop revenue figure reuses the weekly report's
 * exact status rule (orderRevenueEgp / ORDER_REVENUE_STATUSES) so the two
 * surfaces agree by construction.
 *
 * The pure core (`computePnL`) takes already-gathered inputs so it is fully
 * unit-testable with no Blob I/O; `buildPnL` is the live async wrapper.
 */

const CAIRO_TZ = "Africa/Cairo";

// --- Period resolution --------------------------------------------------------

export interface PnLPeriod {
  /** Inclusive start date key, YYYY-MM-DD (Cairo). */
  from: string;
  /** Inclusive end date key, YYYY-MM-DD (Cairo). */
  to: string;
  /** Human label, e.g. "June 2026" or "this week (2026-06-08 – 2026-06-14)". */
  label: string;
  /** Stable machine tag for filenames/markers, e.g. "2026-06". */
  tag: string;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isRealDateKey(key: string): boolean {
  if (!DATE_RE.test(key)) return false;
  const d = new Date(`${key}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === key;
}

/** Today's Cairo calendar date as YYYY-MM-DD. */
function cairoTodayKey(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: CAIRO_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** Shift a YYYY-MM-DD key by whole days (UTC arithmetic — DST-irrelevant). */
function shiftDateKey(key: string, days: number): string {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** "2026-06" → "June 2026". */
export function monthLabel(yearMonth: string): string {
  const [y, m] = yearMonth.split("-").map(Number);
  return `${MONTH_NAMES[m - 1] ?? "?"} ${y}`;
}

/** Calendar month containing `key` (YYYY-MM-DD). */
function monthPeriodFor(key: string): PnLPeriod {
  const ym = key.slice(0, 7);
  const [y, m] = ym.split("-").map(Number);
  const from = `${ym}-01`;
  const to = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); // last day
  return { from, to, label: monthLabel(ym), tag: ym };
}

/** The calendar month BEFORE the month containing `now` (Cairo) — for the cron. */
export function previousMonthPeriod(now: Date = new Date()): PnLPeriod {
  const todayKey = cairoTodayKey(now);
  const firstOfThisMonth = `${todayKey.slice(0, 7)}-01`;
  const lastOfPrevMonth = shiftDateKey(firstOfThisMonth, -1);
  return monthPeriodFor(lastOfPrevMonth);
}

export type PeriodResult =
  | { ok: true; period: PnLPeriod }
  | { ok: false; error: string };

/**
 * Resolve a period request into concrete Cairo date bounds.
 * - week   → current Monday–Sunday (Cairo)
 * - month  → current calendar month (Cairo)
 * - custom → [from, to], both YYYY-MM-DD (swapped if reversed)
 */
export function resolvePeriod(input: {
  period: "week" | "month" | "custom";
  from?: string;
  to?: string;
  now?: Date;
}): PeriodResult {
  const now = input.now ?? new Date();
  const todayKey = cairoTodayKey(now);

  if (input.period === "custom") {
    let from = (input.from ?? "").trim();
    let to = (input.to ?? "").trim();
    if (!isRealDateKey(from) || !isRealDateKey(to)) {
      return {
        ok: false,
        error: "custom period needs both from and to as real YYYY-MM-DD dates",
      };
    }
    if (to < from) [from, to] = [to, from];
    return { ok: true, period: { from, to, label: `${from} – ${to}`, tag: `${from}_${to}` } };
  }

  if (input.period === "month") {
    return { ok: true, period: monthPeriodFor(todayKey) };
  }

  // week: current Monday–Sunday (Cairo). getUTCDay on the date key: 0 = Sun.
  const dow = new Date(`${todayKey}T00:00:00Z`).getUTCDay();
  const from = shiftDateKey(todayKey, -((dow + 6) % 7));
  const to = shiftDateKey(from, 6);
  return {
    ok: true,
    period: { from, to, label: `this week (${from} – ${to})`, tag: `week_${from}` },
  };
}

/**
 * Resolve a period from URL search params, accepting either:
 * - `month=YYYY-MM` (convenience for the admin month selector), or
 * - `period=week|month|custom` (+ `from`/`to` for custom).
 * Defaults to the current calendar month when nothing is given.
 */
export function resolvePeriodFromParams(
  params: URLSearchParams,
  now: Date = new Date()
): PeriodResult {
  const month = (params.get("month") ?? "").trim();
  if (month) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      return { ok: false, error: "month must be in YYYY-MM form" };
    }
    return { ok: true, period: monthPeriodFor(`${month}-01`) };
  }
  const period = (params.get("period") ?? "month") as "week" | "month" | "custom";
  if (!["week", "month", "custom"].includes(period)) {
    return { ok: false, error: "period must be week, month or custom" };
  }
  return resolvePeriod({
    period,
    from: params.get("from") ?? undefined,
    to: params.get("to") ?? undefined,
    now,
  });
}

// --- P&L shape ----------------------------------------------------------------

export interface CategoryLine {
  category: string;
  amountEgp: number;
}

export interface PnL {
  period: PnLPeriod;
  revenue: {
    shopEgp: number;
    manualIncomeEgp: number;
    totalEgp: number;
    manualIncomeByCategory: CategoryLine[];
  };
  expenses: {
    totalEgp: number;
    byCategory: CategoryLine[];
  };
  netEgp: number;
  counts: {
    revenueOrders: number;
    ledgerEntries: number;
  };
  /** Source ledger entries in range (for the CSV export). */
  entries: LedgerEntry[];
  /** Source failures gathered live (Cal/orders/ledger) — fail-soft like the brief. */
  failures: string[];
  generatedAt: string;
}

// --- Pure compute -------------------------------------------------------------

export interface PnLInputs {
  orders: StoredOrder[];
  ledger: LedgerEntry[];
  failures?: string[];
  now?: Date;
}

/** Cairo calendar date key of an instant. */
function cairoKeyOf(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: CAIRO_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/**
 * Compute the P&L from already-gathered inputs. Pure (no I/O) — the unit-test
 * seam. Shop revenue reuses orderRevenueEgp so it matches the weekly report
 * exactly for the same set of in-range orders.
 */
export function computePnL(period: PnLPeriod, inputs: PnLInputs): PnL {
  const now = inputs.now ?? new Date();

  // --- shop orders (by CREATED date, Cairo) ---
  const inRangeOrders = inputs.orders.filter((o) => {
    const k = cairoKeyOf(o.createdAt);
    return k >= period.from && k <= period.to;
  });
  const shopEgp = orderRevenueEgp(inRangeOrders);
  const revenueOrderCount = revenueOrders(inRangeOrders).length;

  // --- manual ledger entries in range ---
  const inRangeEntries = filterByPeriod(inputs.ledger, {
    from: period.from,
    to: period.to,
  });
  const incomeEntries = inRangeEntries.filter((e) => e.direction === "income");
  const expenseEntries = inRangeEntries.filter((e) => e.direction === "expense");
  const manualIncomeEgp = sumAmount(incomeEntries);
  const manualIncomeByCategory = sumByCategory(incomeEntries);
  const expenseTotalEgp = sumAmount(expenseEntries);
  const expenseByCategory = sumByCategory(expenseEntries);

  const totalRevenue = shopEgp + manualIncomeEgp;
  const netEgp = totalRevenue - expenseTotalEgp;

  return {
    period,
    revenue: {
      shopEgp,
      manualIncomeEgp,
      totalEgp: totalRevenue,
      manualIncomeByCategory,
    },
    expenses: {
      totalEgp: expenseTotalEgp,
      byCategory: expenseByCategory,
    },
    netEgp,
    counts: {
      revenueOrders: revenueOrderCount,
      ledgerEntries: inRangeEntries.length,
    },
    entries: inRangeEntries.slice().sort((a, b) => a.date.localeCompare(b.date)),
    failures: inputs.failures ?? [],
    generatedAt: now.toISOString(),
  };
}

// --- Live gather --------------------------------------------------------------

export interface PnLDataSources {
  listOrders: typeof listOrders;
  listLedger: typeof listLedger;
}

const liveSources: PnLDataSources = {
  listOrders,
  listLedger,
};

/**
 * Gather live data for `period` and compute the P&L. Fail-soft per source
 * (like the daily brief / weekly report): one backend being down degrades a
 * single revenue line and is reported in `failures`, never a hard 5xx.
 * `sources` is injectable for tests.
 */
export async function buildPnL(
  period: PnLPeriod,
  options: { now?: Date; sources?: PnLDataSources } = {}
): Promise<PnL> {
  const sources = options.sources ?? liveSources;
  const failures: string[] = [];

  let orders: StoredOrder[] = [];
  try {
    orders = await sources.listOrders({ limit: 200 });
  } catch (error) {
    console.error("[finance-report] Failed to load shop orders:", error);
    failures.push("shop orders");
  }

  let ledger: LedgerEntry[] = [];
  try {
    ledger = await sources.listLedger();
  } catch (error) {
    console.error("[finance-report] Failed to load ledger:", error);
    failures.push("ledger");
  }

  return computePnL(period, {
    orders,
    ledger,
    failures,
    now: options.now,
  });
}

// --- CSV export ---------------------------------------------------------------

/**
 * Leading characters a spreadsheet treats as the start of a FORMULA. A cell
 * beginning with one of these can execute on open (CSV injection / DDE).
 */
const CSV_FORMULA_LEAD_RE = /^[=+\-@\t\r]/;

/**
 * RFC-4180 field escaping with a formula-injection guard for STRING cells.
 *
 * Numbers are emitted verbatim — `netEgp` can legitimately be negative, and a
 * leading "-" on a NUMBER is a real value the sheet must keep numeric, never a
 * formula. For STRING cells (notes, categories), a value starting with one of
 * the formula lead characters is prefixed with a single apostrophe so the
 * spreadsheet renders it as literal text instead of evaluating it.
 */
function csvField(value: string | number): string {
  if (typeof value === "number") {
    // Numeric cells stay numeric — negatives included.
    return String(value);
  }
  let s = value;
  if (CSV_FORMULA_LEAD_RE.test(s)) {
    s = `'${s}`;
  }
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function csvRow(fields: (string | number)[]): string {
  return fields.map(csvField).join(",");
}

/**
 * Build a CSV of the ledger entries in range plus a summary block. The
 * leading line is a tagged title so the file is self-describing when opened
 * months later; the entries table follows, then a blank line and the P&L
 * summary. Excel/Numbers/LibreOffice all parse this as a single sheet.
 */
export function pnlToCsv(pnl: PnL): string {
  const rows: string[] = [];
  rows.push(csvRow([`Profit & Loss — ${pnl.period.label}`]));
  rows.push(csvRow([`Range`, `${pnl.period.from} to ${pnl.period.to}`]));
  rows.push(csvRow([`Generated`, pnl.generatedAt]));
  rows.push("");

  rows.push(csvRow(["Ledger entries (manual)"]));
  rows.push(
    csvRow(["date", "direction", "category", "amount_egp", "method", "note", "receipt_url"])
  );
  for (const e of pnl.entries) {
    rows.push(
      csvRow([
        e.date,
        e.direction,
        e.category,
        e.amountEgp,
        e.method,
        e.note,
        e.receiptUrl ?? "",
      ])
    );
  }
  rows.push("");

  rows.push(csvRow(["Summary"]));
  rows.push(csvRow(["Revenue — shop orders", pnl.revenue.shopEgp]));
  rows.push(csvRow(["Revenue — manual income", pnl.revenue.manualIncomeEgp]));
  rows.push(csvRow(["Revenue — TOTAL", pnl.revenue.totalEgp]));
  rows.push("");
  rows.push(csvRow(["Expenses by category"]));
  for (const c of pnl.expenses.byCategory) {
    rows.push(csvRow([`  ${c.category}`, c.amountEgp]));
  }
  rows.push(csvRow(["Expenses — TOTAL", pnl.expenses.totalEgp]));
  rows.push("");
  rows.push(csvRow(["NET (revenue − expenses)", pnl.netEgp]));

  // CRLF line endings — the safest cross-spreadsheet default.
  return rows.join("\r\n");
}

// --- PDF body (markdownish for the letterhead renderer) -----------------------

function egp(n: number): string {
  return `${Math.round(n).toLocaleString("en-US")} EGP`;
}

/**
 * Markdownish body for renderLetterheadPdf — headings (`# `) and bullets
 * (`- `). Kept compact so a normal month fits a single A4 page.
 */
export function pnlToLetterheadBody(pnl: PnL): string {
  const lines: string[] = [];
  lines.push(`Reporting period: ${pnl.period.from} to ${pnl.period.to} (Cairo time).`);
  if (pnl.failures.length) {
    lines.push(
      `Note: some data could not be loaded (${pnl.failures.join(", ")}) — figures below may be incomplete.`
    );
  }
  lines.push("");

  lines.push("# Revenue");
  lines.push(`- Shop orders: ${egp(pnl.revenue.shopEgp)}`);
  lines.push(`- Other income (cash, gift cards): ${egp(pnl.revenue.manualIncomeEgp)}`);
  lines.push(`- Total revenue: ${egp(pnl.revenue.totalEgp)}`);
  lines.push("");

  lines.push("# Expenses");
  if (pnl.expenses.byCategory.length === 0) {
    lines.push("- No expenses recorded this period.");
  } else {
    for (const c of pnl.expenses.byCategory) {
      lines.push(`- ${c.category}: ${egp(c.amountEgp)}`);
    }
  }
  lines.push(`- Total expenses: ${egp(pnl.expenses.totalEgp)}`);
  lines.push("");

  lines.push("# Net result");
  lines.push(
    `- Net ${pnl.netEgp >= 0 ? "profit" : "loss"}: ${egp(Math.abs(pnl.netEgp))}`
  );
  lines.push("");

  lines.push("# Notes");
  lines.push(
    "- Revenue counts confirmed, shipped and delivered shop orders, plus any manual cash/other income."
  );

  return lines.join("\n");
}

/** Filename stem for downloads: "pnl-2026-06". */
export function pnlFilename(pnl: PnL): string {
  const tag = pnl.period.tag.replace(/[^a-z0-9_-]+/gi, "-");
  return `pnl-${tag}`;
}
