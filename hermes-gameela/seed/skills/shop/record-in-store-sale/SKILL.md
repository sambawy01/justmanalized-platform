---
name: record-in-store-sale
description: Record a physical/walk-in sale at the El Gouna shop (decrements stock, counts revenue)
version: 1.0.0
metadata:
  hermes:
    tags: [shop, sales, pos, mutating]
    category: shop
---
# Record an in-store sale

## When to use
When Manal sells a hat (or a store-only item) in person — e.g. "sold a Turquoise
Oasis, cash" or sends a photo + "store sale: beach bag 500 cash". This records a
PAID sale: it counts as revenue, and for website hats it removes stock. Use this —
never the finance income log — for items sold in person.

## Two modes
- **Website hat:** identify it (look it up via `catalog-list` to get the slug).
- **Store-only item** (not on the website): provide `name` + `priceEgp` instead of a slug.

## Procedure
1. Gather: item(s) + quantity, payment (`cash`/`card`/`instapay`/`other`), optional
   customer email/phone. For a store-only item, the name and price.
2. **CONFIRM:** tell Manal exactly what you'll record — e.g. *"Record in-store sale:
   1× Turquoise Oasis, LE 2,800, cash — counts as revenue and removes 1 from stock.
   Go?"* — and WAIT for her yes.
3. On yes, POST:
   ```sh
   curl -s -X POST "$SHOP_API_BASE/api/admin/orders" \
     -H "x-admin-key: $SHOP_ADMIN_KEY" -H "Content-Type: application/json" \
     -d '{"items":[{"slug":"turquoise-oasis","qty":1}],"payment":"cash"}'
   ```
   - Store-only item instead: `"items":[{"custom":true,"name":"Beach bag","priceEgp":500,"qty":1}]`
   - Optional: `"customerEmail":"…","customerPhone":"…"`.
4. Report the returned `order.orderNumber` and total.

## Pitfalls
- Don't exceed available stock for a tracked website hat (the API will reject it).
- Custom items count as revenue but never change website stock.

## Verification
The API returned `{"ok":true,"order":{…}}` and you told Manal the sale number + total.
