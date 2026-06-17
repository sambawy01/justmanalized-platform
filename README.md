# Just Manalized

Hand-embellished straw cowboy hats — El Gouna, Egypt. Forked from the Holistic
Beauty studio site and converted into a pure e-commerce store (booking removed).

## Two parts

**Static storefront** (repo root) — deployed on GitHub Pages at
`justmanalized.com`:
- `index.html` — one-page marketing site (hero, brand story, the collection)
- `shop.html` + `shop.js` — the shop: products, cart, cash-on-delivery checkout
- `blog.html` — Journal (placeholder, ready for posts)
- `chat.js` — AI concierge widget (talks to the backend `/api/chat`)
- `styles.css` — design system · `main.js` / `nav.js` — motion + nav
- `assets/img/` — local photography, `assets/img/shop/` — product images

**Backend** (`vercel-app/`) — Next.js on Vercel at `shop.justmanalized.com`:
- Shop API (`/api/order`, `/api/products`), order + status emails (Resend)
- AI concierge (`/api/chat`) + **Mana**, the owner's Telegram assistant
  (orders, products, finance, CRM; new-order pushes with one-tap status
  updates: confirmed → shipped → delivered)
- `/admin` dashboard — Orders · Products · Finance (P&L) · Clients
- Cron jobs — daily brief, weekly/monthly reports, evening digest, backups

EN-only, prices in EGP. (The dual EN/RU + EGP/RUB schema is retained internally
but unused.)

## Local dev (backend)

```
cd vercel-app
cp .env.example .env   # fill in keys (see below)
npm install
npm run dev            # http://localhost:3000
```

## Environment / keys (`vercel-app/.env`)

`ADMIN_TOKEN` · `OLLAMA_API_KEY` (AI concierge) · `RESEND_API_KEY` (emails) ·
`NOTIFY_EMAIL` · `CRON_SECRET` · `TELEGRAM_BOT_TOKEN` + `TELEGRAM_WEBHOOK_SECRET`
(create the bot with @BotFather, then run `scripts/setup-telegram.mjs`).

## Deploy

- **Storefront:** repo Settings → Pages → branch `main`, `/ (root)`. `CNAME`
  points at `justmanalized.com`.
- **Backend:** a Vercel project rooted at `vercel-app/`, env vars set in the
  dashboard, domain `shop.justmanalized.com`.

## Placeholders to confirm (rebrand TODO)

- Product **prices** in `vercel-app/src/lib/shop-products.ts` (mirrored in
  `shop.js`) — currently placeholder EGP values.
- Owner display name (currently "the owner") in the Telegram assistant + the
  finance/CRM surfaces.
- A real **logo** image (emails/PDF/site currently use a text wordmark).
- Contact details: `hello@justmanalized.com`, phone/WhatsApp, Instagram
  `@justmanalized`.
- Real product names/copy (drafted from the photos — rename freely).
