import { NextRequest, NextResponse } from "next/server";
import {
  isAuthorizedAdminRequest,
  unauthorizedResponse,
} from "@/lib/admin/auth";
import { rebookingRadar } from "@/lib/crm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/clients/rebooking?weeks=6 — the re-booking radar, kept so the
 * Clients tab's weeks selector has an endpoint to refresh against.
 *
 * Just Manalized is a pure shop with no visits, so the radar is always empty
 * (it needs a past confirmed booking, and bookings are gone) — this returns
 * `{ weeks, clients: [] }` rather than erroring. Admin-only PII; auth rechecked.
 */
export async function GET(request: NextRequest) {
  if (!isAuthorizedAdminRequest(request)) return unauthorizedResponse();

  const weeksRaw = Number(request.nextUrl.searchParams.get("weeks"));
  const weeks =
    Number.isFinite(weeksRaw) && weeksRaw > 0 && weeksRaw <= 104
      ? Math.floor(weeksRaw)
      : 6;

  try {
    const clients = await rebookingRadar({ weeks });
    return NextResponse.json({ weeks, clients });
  } catch (error) {
    console.error("[admin/clients] Rebooking radar failed:", error);
    return NextResponse.json(
      { error: "Couldn't load the re-booking radar. Please try again." },
      { status: 500 }
    );
  }
}
