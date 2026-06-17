import {
  effectiveSoldOut,
  formatEgp,
  formatRub,
  type Product,
} from "@/lib/catalog";

/**
 * Single source of truth for the AI concierge knowledge base and system prompt.
 *
 * Just Manalized — a hats brand. The concierge answers questions about the
 * hats in the shop, sizing/fit, materials & care, shipping and orders. Shop
 * products are injected DYNAMICALLY: /api/chat loads the live catalog (falling
 * back to its built-in SEED on a blob failure) and passes it to
 * `buildSystemPrompt`, so the concierge always knows current prices and stock.
 *
 * NOTE (Track B / rebrand): the BRAND block below holds PLACEHOLDER brand
 * facts/contact. Replace with the real Just Manalized brief, voice, contact
 * channels and assistant persona name once supplied.
 */

export const BRAND = {
  name: "Just Manalized",
  // PLACEHOLDER persona — confirm the assistant's name/voice in the brand brief.
  assistantName: "the Just Manalized concierge",
  facts:
    "Just Manalized is a hats brand. We make and sell hats — see SHOP PRODUCTS for the current range, materials, sizing and prices. " +
    "Orders ship with cash on delivery across Egypt (typical delivery 24–72h). " +
    "[PLACEHOLDER brand story — replace with the real Just Manalized brief.]",
  // PLACEHOLDER contact channels — replace with the real ones.
  whatsappNumber: "",
  whatsappLink: "",
  contactEmail: "hello@justmanalized.com",
  shopLink: "https://justmanalized.com/shop.html",
};

/** One prompt line per shop product: names, price, availability, copy, care. */
function formatShopProduct(p: Product): string {
  const sub = p.en.sub ? ` (${p.en.sub} / ${p.ru.sub})` : "";
  const availability = effectiveSoldOut(p)
    ? "SOLD OUT — currently unavailable, cannot be ordered right now"
    : "in stock";
  const desc =
    p.en.desc || p.ru.desc
      ? ` Description: ${[p.en.desc, p.ru.desc].filter(Boolean).join(" / RU: ")}`
      : "";
  const care =
    p.usage && (p.usage.en || p.usage.ru)
      ? ` CARE / FIT: ${[p.usage.en, p.usage.ru].filter(Boolean).join(" / RU: ")}`
      : "";
  return `- ${p.en.name} / ${p.ru.name}${sub} — ${formatEgp(p.priceEgp)} / ${formatRub(p.priceRub)} — ${availability}.${desc}${care}`;
}

/**
 * Build the domain-restricted system prompt for the concierge.
 * `lang` is the UI language hint; the model must still follow the user's
 * actual language. `products` is the live shop catalog (active products) —
 * /api/chat passes the dynamic catalog or its SEED fallback.
 */
export function buildSystemPrompt(
  lang: "en" | "ru",
  products: readonly Product[] = []
): string {
  const shopSection =
    products.length > 0
      ? `

SHOP PRODUCTS (hats — cash on delivery, 24–72h delivery across Egypt; EN / RU names, Egyptian Pounds / Russian Rubles):
${products.map(formatShopProduct).join("\n")}`
      : "";

  const contactLine = BRAND.whatsappNumber
    ? `For anything we can't answer here, you can reach us on WhatsApp ${BRAND.whatsappNumber} (${BRAND.whatsappLink}) or by email at ${BRAND.contactEmail}.`
    : `For anything we can't answer here, you can reach us by email at ${BRAND.contactEmail}.`;

  return `You are ${BRAND.assistantName}, the AI assistant for ${BRAND.name}. When asked who you are, introduce yourself as ${BRAND.assistantName}.

ABOUT THE BRAND:
${BRAND.facts}

CONTACT:
${contactLine}
Browse and order at ${BRAND.shopLink}.

STRICT RULES:
1. Answer ONLY about ${BRAND.name}'s hats, the shop products, their materials, sizing and fit, care, prices, availability, shipping and orders. For anything off-topic, politely decline and steer back to the shop.
2. Reply in the user's language. (UI language hint: ${lang === "ru" ? "Russian" : "English"} — but always follow the language the user actually writes in.)
3. Keep answers to 120 words or fewer.
4. NEVER invent products, prices, materials, sizes or availability. Only use the exact data above.
5. When the user shows buying intent, point them to the shop: ${BRAND.shopLink}
6. Mention a product's availability when relevant (sold-out products cannot be ordered right now). You MAY share a product's CARE / FIT notes when asked. Do NOT invent details beyond the data above.`;
}
