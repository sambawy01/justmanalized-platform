# Gameela on Hermes Agent (Railway + Ollama Cloud)

Run the Telegram assistant **Gameela** as a [Hermes Agent](https://hermes-agent.org)
process on Railway, using **Ollama Cloud** as the LLM (OpenAI-compatible `/v1`).
Your shop backend stays on Vercel — Gameela's skills call its `/api/admin/*` over HTTPS.

> **Verified:** `POST https://ollama.com/v1/chat/completions` with a `tools` array
> returns proper `tool_calls` — so Hermes's "custom OpenAI-compatible endpoint" +
> function-calling works against Ollama Cloud.

## What's here
```
hermes-gameela/
├── Dockerfile          # python:3.11 + installs hermes; runs `hermes gateway`
├── entrypoint.sh       # seeds the volume once; writes ~/.hermes/.env from Railway vars
├── railway.toml        # dockerfile builder, always-restart
├── .env.example        # the Railway variables to set
└── seed/
    ├── config.yaml      # model → Ollama Cloud /v1 ; telegram
    ├── SOUL.md          # Gameela's identity + the CONFIRM-before-mutate house rules
    └── skills/shop/      # SKILL.md procedures (Markdown) that curl your admin API
        ├── _shop-api/        # base ref: auth + endpoint map + confirm rule
        ├── catalog-list/     # read example
        ├── record-in-store-sale/  # mutating example (POS sale)
        └── set-order-status/      # mutating example
```

## Deploy (one time)
1. **Railway → New Project → Deploy from GitHub repo** (`justmanalized-platform`).
2. Service **Settings → Root Directory = `hermes-gameela`** (so it builds this Dockerfile).
3. **Add a Volume**, mount path **`/data`** (this is `HERMES_HOME` — keeps config,
   memory and self-improved skills across restarts). **Without this, Gameela resets every deploy.**
4. **Variables** (see `.env.example`):
   - `OPENAI_API_KEY` = your Ollama Cloud key  ·  `CUSTOM_BASE_URL` = `https://ollama.com/v1`
   - `TELEGRAM_BOT_TOKEN` = the @GameelaAi_bot token  ·  `TELEGRAM_ALLOWED_USERS` = Manal's numeric Telegram id
   - `SHOP_API_BASE` = `https://shop.justmanalized.com`  ·  `SHOP_ADMIN_KEY` = `ADMIN_TOKEN`
5. **Plan:** Hobby (~$5/mo) — must stay always-on (no sleep); Telegram uses long-polling (no public port).
6. Deploy. If the gateway doesn't auto-pick Telegram on first boot, open the Railway
   **shell** and run `hermes gateway setup` once (it writes to `/data`, so it persists), then redeploy.

## Verify
- Railway logs show `starting gateway (Telegram long-polling)…` and no errors.
- Message @GameelaAi_bot: *"what's in the shop?"* → she runs `catalog-list` (a read) and replies.
- *"sold a Turquoise Oasis, cash"* → she **asks you to confirm**, then records it (check the Orders/POS reflect it).

## Porting the rest of the 22 actions
Skills are just Markdown procedures that `curl` an endpoint (see `_shop-api`). Copy a
skill folder and point it at the right route:
- **Already callable** (write the skill): product edit (`PUT /api/admin/catalog/<slug>`),
  product remove (`DELETE …`), finance P&L (`GET /api/admin/finance`), clients (`GET /api/admin/clients`).
- **Need a small new GET route in the Vercel app first**, then a skill: `orders_list`,
  `order_lookup`, `stats_summary`, P&L-PDF. (These are internal to the old agent today.)

## Honest caveats
- **Confirm gate is now "soft"** — enforced by SOUL.md instructions, not the hard
  button your current serverless Gameela has. Keep `TELEGRAM_ALLOWED_USERS` set so only Manal can talk to it.
- **Voice/vision aren't ported** here (your current Groq-Whisper + vision live in the
  Vercel webhook). Hermes has its own multimodal handling — wire separately if needed.
- **This replaces the Telegram side only.** The website, web shop-concierge, and all
  shop APIs stay on Vercel. To switch back, just point the bot's webhook back at the
  Vercel route (or stop the Railway service) — nothing else changes.
