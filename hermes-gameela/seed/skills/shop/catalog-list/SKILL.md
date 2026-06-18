---
name: catalog-list
description: List all Just Manalized products with prices and stock
version: 1.0.0
metadata:
  hermes:
    tags: [shop, products, read]
    category: shop
---
# List the product catalog

## When to use
When Manal asks what's in the shop, prices, what's in stock, what's sold out, or to
find a product's slug before editing it.

## Procedure
1. Call (read-only — no confirmation needed):
   ```sh
   curl -s -H "x-admin-key: $SHOP_ADMIN_KEY" "$SHOP_API_BASE/api/admin/catalog"
   ```
2. The response is `{"products":[{slug, en:{name,sub}, priceEgp, quantity, soldOut, active, photo}, …]}`.
3. Summarise each as `Name — LE <priceEgp> — <quantity> left` (or `sold out`).

## Pitfalls
- `quantity: null` means stock is not tracked (show "untracked", not 0).
- Use the `slug` from here when calling edit/remove skills.

## Verification
You listed the current products with prices and stock straight from the API.
