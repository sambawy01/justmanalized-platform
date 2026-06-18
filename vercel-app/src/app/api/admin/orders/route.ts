import { NextRequest, NextResponse } from "next/server";
import {
  isAuthorizedAdminRequest,
  unauthorizedResponse,
} from "@/lib/admin/auth";
import {
  getCatalog,
  decrementQuantities,
  effectiveSoldOut,
} from "@/lib/catalog";
import { saveOrder, type StoredOrder, type StoredOrderItem } from "@/lib/orders";

export const runtime = "nodejs";

/**
 * POST /api/admin/orders — record a PHYSICAL (in-store) sale at the El Gouna shop.
 *
 * Body: { items: [{ slug, qty }], customerName?, note? }
 *
 * It reuses the normal order pipeline so the sale behaves exactly like a paid,
 * delivered order: tracked stock is decremented, and it counts toward revenue
 * (status "delivered" is a revenue status). It is tagged channel:"in_store" so
 * the admin list and any reporting can tell shop walk-ins from website orders.
 *
 * Auth: Basic or the legacy admin key (proxy + per-route, defense in depth).
 */

function generateOrderNumber(): string {
  const ts = Date.now().toString(36).slice(-4);
  const rand = Math.floor(Math.random() * 36 * 36)
    .toString(36)
    .padStart(2, "0");
  return `JM-${(ts + rand).toUpperCase()}`;
}

interface InItem {
  slug: string;
  qty: number;
}

export async function POST(request: NextRequest) {
  if (!isAuthorizedAdminRequest(request)) return unauthorizedResponse();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const b = body as {
    items?: unknown;
    customerName?: unknown;
    note?: unknown;
  };

  if (!Array.isArray(b.items) || b.items.length === 0) {
    return NextResponse.json(
      { error: "Add at least one product." },
      { status: 400 }
    );
  }

  // Normalise + validate items shape.
  const requested: InItem[] = [];
  for (const raw of b.items) {
    const it = raw as { slug?: unknown; qty?: unknown };
    const slug = typeof it.slug === "string" ? it.slug : "";
    const qty =
      typeof it.qty === "number" && Number.isInteger(it.qty) ? it.qty : 0;
    if (!slug || qty < 1 || qty > 99) {
      return NextResponse.json(
        { error: "Each item needs a product and a quantity of 1–99." },
        { status: 400 }
      );
    }
    requested.push({ slug, qty });
  }

  let catalog;
  try {
    catalog = await getCatalog();
  } catch {
    return NextResponse.json(
      { error: "Couldn't load the catalog. Please try again." },
      { status: 503 }
    );
  }

  // Build line items against live catalog prices; validate stock.
  const items: StoredOrderItem[] = [];
  let totalEgp = 0;
  let totalRub = 0;
  for (const { slug, qty } of requested) {
    const product = catalog.find((p) => p.slug === slug);
    if (!product) {
      return NextResponse.json(
        { error: `Unknown product: ${slug}` },
        { status: 400 }
      );
    }
    if (effectiveSoldOut(product)) {
      return NextResponse.json(
        { error: `“${product.en.name}” is sold out.` },
        { status: 400 }
      );
    }
    if (typeof product.quantity === "number" && qty > product.quantity) {
      return NextResponse.json(
        {
          error: `Only ${product.quantity} left of “${product.en.name}”.`,
        },
        { status: 400 }
      );
    }
    const lineEgp = product.priceEgp * qty;
    const lineRub = product.priceRub * qty;
    totalEgp += lineEgp;
    totalRub += lineRub;
    items.push({
      slug,
      qty,
      names: { en: product.en.name, ru: product.ru.name },
      lineTotals: { egp: lineEgp, rub: lineRub },
    });
  }

  const customerName =
    typeof b.customerName === "string" && b.customerName.trim()
      ? b.customerName.trim().slice(0, 80)
      : "Walk-in";
  const extraNote =
    typeof b.note === "string" && b.note.trim()
      ? ` — ${b.note.trim().slice(0, 200)}`
      : "";

  const createdAt = new Date().toISOString();
  const orderNumber = generateOrderNumber();
  const record: StoredOrder = {
    orderNumber,
    createdAt,
    status: "delivered", // paid & collected in person → a revenue status
    items,
    totals: { egp: totalEgp, rub: totalRub },
    name: customerName,
    phone: "",
    email: "",
    address: "El Gouna shop (in-store)",
    note: `In-store sale — El Gouna shop${extraNote}`,
    lang: "en",
    channel: "in_store",
    statusHistory: [{ status: "delivered", at: createdAt }],
  };

  // Decrement tracked stock first (so an over-sell can't slip through), then
  // persist the order. Both mirror the website order flow.
  try {
    await decrementQuantities(requested);
  } catch (error) {
    console.error(`[admin/orders] Stock decrement failed (${orderNumber}):`, error);
    return NextResponse.json(
      { error: "Couldn't update inventory. The sale was not recorded." },
      { status: 500 }
    );
  }

  try {
    await saveOrder(record);
  } catch (error) {
    console.error(`[admin/orders] Save failed (${orderNumber}):`, error);
    return NextResponse.json(
      {
        error:
          "Inventory was updated but saving the sale failed. Please check the catalog and try again.",
      },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, order: record });
}
