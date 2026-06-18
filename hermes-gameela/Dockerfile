# Gameela on Hermes Agent — Telegram ops assistant, LLM via Ollama Cloud (/v1).
# Runs the always-on `hermes gateway` (Telegram long-polling, no inbound port).
FROM python:3.11-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends curl git ca-certificates jq xz-utils \
 && rm -rf /var/lib/apt/lists/*

# Install Hermes Agent (NousResearch). The installer drops the `hermes` CLI;
# add the common install locations to PATH (adjust if the build log shows another).
RUN curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash
ENV PATH="/root/.local/bin:/usr/local/bin:${PATH}"

# Hermes keeps config + memory + skills here; on Railway this is the mounted volume.
ENV HERMES_HOME=/data

# Seed templates (copied into the volume on first boot only — see entrypoint).
COPY seed /seed
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
