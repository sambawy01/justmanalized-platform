"use client";

import { useMemo, useState } from "react";
import type { Product } from "@/lib/catalog";

const SITE_BASE = "https://justmanalized.com/";
function photoSrc(photo: string): string {
  if (!photo) return "";
  return /^https?:\/\//i.test(photo) ? photo : SITE_BASE + photo;
}
function egp(n: number): string {
  return `LE ${n.toLocaleString("en-US")}`;
}
function isSoldOut(p: Product): boolean {
  return p.soldOut || p.quantity === 0;
}

const PAYMENTS = [
  { id: "cash", label: "Cash" },
  { id: "card", label: "Card" },
  { id: "instapay", label: "InstaPay" },
  { id: "other", label: "Other" },
] as const;
type PaymentId = (typeof PAYMENTS)[number]["id"];

export default function PosClient({
  products,
  adminKey,
}: {
  products: Product[];
  adminKey: string;
}) {
  const bySlug = useMemo(() => {
    const m = new Map<string, Product>();
    for (const p of products) m.set(p.slug, p);
    return m;
  }, [products]);

  const [cart, setCart] = useState<Record<string, number>>({});
  const [payment, setPayment] = useState<PaymentId>("cash");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ orderNumber: string; total: number } | null>(null);

  const lines = Object.entries(cart).filter(([, q]) => q > 0);
  const total = lines.reduce((sum, [slug, q]) => {
    const p = bySlug.get(slug);
    return sum + (p ? p.priceEgp * q : 0);
  }, 0);
  const count = lines.reduce((s, [, q]) => s + q, 0);

  function add(p: Product) {
    if (isSoldOut(p)) return;
    setError(null);
    setCart((c) => {
      const have = c[p.slug] ?? 0;
      const max = typeof p.quantity === "number" ? p.quantity : 99;
      if (have >= max) return c;
      return { ...c, [p.slug]: have + 1 };
    });
  }
  function dec(slug: string) {
    setCart((c) => {
      const have = (c[slug] ?? 0) - 1;
      const next = { ...c };
      if (have <= 0) delete next[slug];
      else next[slug] = have;
      return next;
    });
  }

  async function complete() {
    if (lines.length === 0) {
      setError("Add at least one product.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-key": adminKey },
        body: JSON.stringify({
          items: lines.map(([slug, qty]) => ({ slug, qty })),
          customerEmail: email,
          customerPhone: phone,
          payment,
        }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        setError(
          (payload && typeof payload.error === "string" && payload.error) ||
            `Couldn't complete the sale (${res.status})`
        );
        setBusy(false);
        return;
      }
      setDone({ orderNumber: payload?.order?.orderNumber ?? "", total });
    } catch {
      setError("Network error. Please try again.");
      setBusy(false);
    }
  }

  /* ----- success screen ----- */
  if (done) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center px-6 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#357F75] text-3xl text-[#FBF4E6]">
          ✓
        </div>
        <h1 className="mt-5 font-serif text-3xl text-[#38492E]">Sale recorded</h1>
        <p className="mt-2 text-[#5E6B4F]">
          {egp(done.total)} · {done.orderNumber}
        </p>
        <p className="mt-1 text-sm text-[#5E6B4F]">
          Inventory and revenue updated.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="mt-8 w-full rounded-full bg-[#357F75] px-6 py-3 font-medium text-[#FBF4E6] transition hover:opacity-90"
        >
          New sale
        </button>
        <a href="/admin" className="mt-3 text-sm text-[#357F75] underline">
          Back to admin
        </a>
      </main>
    );
  }

  /* ----- POS ----- */
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
      <header className="mb-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-dark.png?v=3" alt="Just Manalized" className="h-12 w-auto" />
          <h1 className="font-serif text-2xl text-[#38492E]">Store POS</h1>
        </div>
        <a href="/admin" className="text-sm text-[#357F75] underline">
          ← Admin
        </a>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        {/* product picker */}
        <section>
          <p className="mb-3 text-xs font-medium uppercase tracking-[0.12em] text-[#5E6B4F]">
            Tap a hat to add it
          </p>
          {products.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-[#38492E]/15 bg-[#FBF4E6]/60 px-6 py-10 text-center text-sm text-[#5E6B4F]">
              No products in the catalog yet.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {products.map((p) => {
                const out = isSoldOut(p);
                const inCart = cart[p.slug] ?? 0;
                return (
                  <button
                    key={p.slug}
                    type="button"
                    onClick={() => add(p)}
                    disabled={out}
                    className={`relative overflow-hidden rounded-2xl border bg-[#FBF4E6] text-left transition ${
                      out
                        ? "cursor-not-allowed border-[#38492E]/10 opacity-50"
                        : "border-[#357F75]/25 hover:border-[#357F75] hover:shadow-md active:scale-[0.98]"
                    }`}
                  >
                    <div className="aspect-square w-full overflow-hidden bg-[#EBDFC8]">
                      {p.photo ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={photoSrc(p.photo)}
                          alt={p.en.name}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center font-serif text-3xl text-[#357F75]/40">
                          {p.en.name.charAt(0)}
                        </div>
                      )}
                      {inCart > 0 && (
                        <span className="absolute right-2 top-2 flex h-6 min-w-6 items-center justify-center rounded-full bg-[#357F75] px-1.5 text-xs font-semibold text-[#FBF4E6]">
                          {inCart}
                        </span>
                      )}
                      {out && (
                        <span className="absolute left-2 top-2 rounded-full bg-[#38492E]/80 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#FBF4E6]">
                          Sold out
                        </span>
                      )}
                    </div>
                    <div className="px-3 py-2">
                      <p className="truncate font-serif text-sm text-[#38492E]">
                        {p.en.name}
                      </p>
                      <p className="text-xs text-[#5E6B4F]">
                        {egp(p.priceEgp)}
                        {typeof p.quantity === "number" && (
                          <span> · {p.quantity} left</span>
                        )}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {/* cart / checkout */}
        <aside className="lg:sticky lg:top-6 lg:self-start">
          <div className="rounded-2xl border border-[#357F75]/30 bg-[#FBF4E6] p-4">
            <h2 className="mb-3 font-serif text-lg text-[#38492E]">
              Cart {count > 0 && <span className="text-[#357F75]">· {count}</span>}
            </h2>

            {lines.length === 0 ? (
              <p className="py-4 text-center text-sm text-[#5E6B4F]">
                No items yet — tap a hat to start.
              </p>
            ) : (
              <ul className="mb-3 space-y-2">
                {lines.map(([slug, q]) => {
                  const p = bySlug.get(slug);
                  if (!p) return null;
                  return (
                    <li key={slug} className="flex items-center gap-2 text-sm">
                      <span className="flex-1 truncate text-[#38492E]">
                        {p.en.name}
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => dec(slug)}
                          className="grid h-7 w-7 place-items-center rounded-full border border-[#357F75]/40 text-[#357F75]"
                        >
                          −
                        </button>
                        <span className="w-5 text-center text-[#38492E]">{q}</span>
                        <button
                          type="button"
                          onClick={() => add(p)}
                          className="grid h-7 w-7 place-items-center rounded-full border border-[#357F75]/40 text-[#357F75]"
                        >
                          +
                        </button>
                      </div>
                      <span className="w-20 text-right text-[#5E6B4F]">
                        {egp(p.priceEgp * q)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}

            <div className="flex items-center justify-between border-t border-[#357F75]/20 pt-3">
              <span className="text-sm text-[#5E6B4F]">Total</span>
              <span className="font-serif text-xl text-[#38492E]">{egp(total)}</span>
            </div>

            {/* payment type */}
            <p className="mb-1 mt-4 text-xs font-medium uppercase tracking-[0.08em] text-[#5E6B4F]">
              Payment
            </p>
            <div className="grid grid-cols-2 gap-2">
              {PAYMENTS.map((pm) => (
                <button
                  key={pm.id}
                  type="button"
                  onClick={() => setPayment(pm.id)}
                  className={`rounded-xl border px-3 py-2 text-sm transition ${
                    payment === pm.id
                      ? "border-[#357F75] bg-[#357F75] text-[#FBF4E6]"
                      : "border-[#357F75]/30 text-[#38492E] hover:bg-[#357F75]/10"
                  }`}
                >
                  {pm.label}
                </button>
              ))}
            </div>

            {/* optional customer */}
            <p className="mb-1 mt-4 text-xs font-medium uppercase tracking-[0.08em] text-[#5E6B4F]">
              Customer (optional)
            </p>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              className="mb-2 w-full rounded-xl border border-[#3A332C]/15 bg-white px-3 py-2 text-sm text-[#38492E] outline-none focus:border-[#357F75]"
            />
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Phone"
              className="w-full rounded-xl border border-[#3A332C]/15 bg-white px-3 py-2 text-sm text-[#38492E] outline-none focus:border-[#357F75]"
            />

            {error && <p className="mt-3 text-sm text-[#B5483A]">{error}</p>}

            <button
              type="button"
              onClick={complete}
              disabled={busy || lines.length === 0}
              className="mt-4 w-full rounded-full bg-[#357F75] px-6 py-3 font-medium text-[#FBF4E6] transition hover:opacity-90 disabled:opacity-50"
            >
              {busy ? "Recording…" : `Complete sale · ${egp(total)}`}
            </button>
          </div>
        </aside>
      </div>
    </main>
  );
}
