---
name: set-order-status
description: Advance a shop order's status (confirmed/shipped/delivered/cancelled)
version: 1.0.0
metadata:
  hermes:
    tags: [shop, orders, mutating]
    category: shop
---
# Advance an order's status

## When to use
When Manal says an order moved along — "mark JM-AB12CD shipped", "delivered",
"cancel it". Valid flow: ordered → confirmed → shipped → delivered (cancel from
ordered/confirmed, with a reason). The customer gets a status email.

## Procedure
1. Get the order number (`JM-XXXXXX`) and the new status.
2. **CONFIRM:** *"Set JM-AB12CD to shipped — the customer gets a 'shipped' email. Go?"*
   and WAIT for yes. For a cancel, also collect the reason.
3. On yes, POST:
   ```sh
   curl -s -X POST "$SHOP_API_BASE/api/admin/orders/JM-AB12CD/status" \
     -H "x-admin-key: $SHOP_ADMIN_KEY" -H "Content-Type: application/json" \
     -d '{"status":"shipped"}'
   ```
   - Cancelling: `-d '{"status":"cancelled","reason":{"code":"out-of-stock","note":"…"}}'`
4. Report the result (and whether the customer email was sent).

## Pitfalls
- Only legal transitions are accepted; if the API returns an invalid-transition
  error, tell Manal the order's current status.
- Cancelling restocks the items automatically.

## Verification
The API returned the updated order; you reported the new status to Manal.
