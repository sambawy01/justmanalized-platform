---
name: shop-api
description: Base reference for calling the Just Manalized admin API (auth, confirm rule)
version: 1.0.0
metadata:
  hermes:
    tags: [shop, api, reference]
    category: shop
---
# Just Manalized admin API — base reference

Every shop skill calls the live backend over HTTPS using the terminal/execute-code
tool with `curl`. Two environment variables are always available (set on Railway):

- `SHOP_API_BASE` — e.g. `https://shop.justmanalized.com`
- `SHOP_ADMIN_KEY` — sent as the `x-admin-key` header on every request

## Auth pattern
```sh
curl -s -H "x-admin-key: $SHOP_ADMIN_KEY" "$SHOP_API_BASE/api/admin/<path>"
```

## THE CONFIRM RULE (critical)
- **GET** (read) calls: run freely.
- **POST / PUT / DELETE** (anything that changes data or contacts a customer):
  FIRST tell Manal exactly what you'll do and **wait for her explicit yes**, then run it.
  (See SOUL.md house rules.)

## Endpoints that exist today
| Action | Method + path |
|---|---|
| List products (full catalog incl. stock) | `GET /api/admin/catalog` |
| Edit a product (price/stock/soldOut/photo) | `PUT /api/admin/catalog/<slug>` |
| Remove (hide) a product | `DELETE /api/admin/catalog/<slug>` |
| Record an in-store sale | `POST /api/admin/orders` |
| Advance an order's status | `POST /api/admin/orders/<orderNumber>/status` |
| Finance P&L | `GET /api/admin/finance?period=month` |
| Clients / CRM overview | `GET /api/admin/clients` |

## Not yet exposed as HTTP (need small new GET routes to port)
`orders_list`, `order_lookup`, `stats_summary`, and the P&L PDF document are
currently internal to the old Telegram agent. To let Gameela do them, add read
endpoints (e.g. `GET /api/admin/orders`, `GET /api/admin/orders/<n>`,
`GET /api/admin/stats`) in the Vercel app — then add matching skills here.
