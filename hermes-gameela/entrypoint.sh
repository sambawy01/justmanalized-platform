#!/usr/bin/env sh
set -e

export HERMES_HOME="${HERMES_HOME:-/data}"
mkdir -p "$HERMES_HOME/skills"

# --- Seed config / persona / skills ONCE (never overwrite the volume's evolving
#     state: Hermes self-improves skills and accumulates memory in $HERMES_HOME). ---
[ -f "$HERMES_HOME/config.yaml" ] || cp /seed/config.yaml "$HERMES_HOME/config.yaml"
[ -f "$HERMES_HOME/SOUL.md" ]     || cp /seed/SOUL.md "$HERMES_HOME/SOUL.md"
[ -d "$HERMES_HOME/skills/shop" ] || cp -r /seed/skills/shop "$HERMES_HOME/skills/shop"

# --- Write Hermes secrets from the container env (Railway variables) into
#     ~/.hermes/.env. SHOP_API_BASE / SHOP_ADMIN_KEY also stay in the container
#     env, so the skills' curl commands inherit them directly. ---
cat > "$HERMES_HOME/.env" <<EOF
OPENAI_API_KEY=${OPENAI_API_KEY}
CUSTOM_BASE_URL=${CUSTOM_BASE_URL:-https://ollama.com/v1}
TELEGRAM_BOT_TOKEN=${TELEGRAM_BOT_TOKEN}
TELEGRAM_ALLOWED_USERS=${TELEGRAM_ALLOWED_USERS}
SHOP_API_BASE=${SHOP_API_BASE:-https://shop.justmanalized.com}
SHOP_ADMIN_KEY=${SHOP_ADMIN_KEY}
EOF
chmod 600 "$HERMES_HOME/.env"

echo "[gameela] HERMES_HOME=$HERMES_HOME — starting gateway (Telegram long-polling)…"
exec hermes gateway
