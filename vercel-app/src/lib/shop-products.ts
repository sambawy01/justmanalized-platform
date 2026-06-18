/**
 * SEED-ONLY shop catalog for Just Manalized — hand-embellished straw cowboy
 * hats (El Gouna / Abu Tig Marina).
 *
 * Orders are validated against the DYNAMIC catalog in @/lib/catalog (Vercel
 * Blob `catalog/products.json`, editable from /admin). This file is the seed
 * source: when the catalog blob does not exist yet, @/lib/catalog builds its
 * SEED from these products.
 *
 * Do NOT import this module from the order path — use @/lib/catalog.
 *
 * Prices are in EGP (integer units, no cents). PRICES ARE PLACEHOLDERS pending
 * the owner's confirmation. The site is English-only and EGP-only, so the RU
 * name mirrors the EN name and priceRub stays 0 (the dual-language/currency
 * schema is retained but unused).
 *
 * Slugs and prices MUST stay identical to the PRODUCTS array in /shop.js
 * (static site) — drift breaks order submission.
 */

export interface ShopProduct {
  slug: string;
  nameEn: string;
  nameRu: string;
  priceEgp: number;
  priceRub: number;
}

export const SHOP_PRODUCTS: readonly ShopProduct[] = [
  {
    slug: "golden-hour-rhinestone",
    nameEn: "Golden Hour",
    nameRu: "Golden Hour",
    priceEgp: 3500,
    priceRub: 0,
  },
  {
    slug: "magenta-sunset",
    nameEn: "Magenta Sunset",
    nameRu: "Magenta Sunset",
    priceEgp: 2800,
    priceRub: 0,
  },
  {
    slug: "turquoise-oasis",
    nameEn: "Turquoise Oasis",
    nameRu: "Turquoise Oasis",
    priceEgp: 2800,
    priceRub: 0,
  },
  {
    slug: "crimson-marina",
    nameEn: "Crimson Marina",
    nameRu: "Crimson Marina",
    priceEgp: 2600,
    priceRub: 0,
  },
  {
    slug: "coral-crush",
    nameEn: "Coral Crush",
    nameRu: "Coral Crush",
    priceEgp: 2400,
    priceRub: 0,
  },
  {
    slug: "wanderlust-red",
    nameEn: "Wanderlust",
    nameRu: "Wanderlust",
    priceEgp: 2600,
    priceRub: 0,
  },
  {
    slug: "midnight-marina",
    nameEn: "Midnight Marina",
    nameRu: "Midnight Marina",
    priceEgp: 2800,
    priceRub: 0,
  },
  {
    slug: "aqua-concho",
    nameEn: "Aqua Concho",
    nameRu: "Aqua Concho",
    priceEgp: 3000,
    priceRub: 0,
  },
] as const;

export const PRODUCTS_BY_SLUG: ReadonlyMap<string, ShopProduct> = new Map(
  SHOP_PRODUCTS.map((p) => [p.slug, p])
);

/** "3540" -> "LE 3,540" (EGP style). */
export function formatEgp(amount: number): string {
  return `LE ${amount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
}

/** "4900" -> "4 900 ₽" (RUB style, space-grouped). Unused (EGP-only) but kept for the schema. */
export function formatRub(amount: number): string {
  return `${amount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ")} ₽`;
}
