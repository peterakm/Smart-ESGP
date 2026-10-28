#!/bin/bash
# Dev convenience: some environments kill long-running background tunnel
# processes after a few minutes (observed with both cloudflared and ngrok —
# not something either tool does on its own, nothing ever appears in their
# logs at the moment they die). With a fixed ngrok static domain, restarting
# doesn't change the URL, so it's safe to just auto-restart forever whenever
# the process exits, instead of relying on someone noticing and restarting
# it manually each time.
#
# Usage:
#   NGROK_DOMAIN=your-domain.ngrok-free.dev scripts/keep-ngrok-alive.sh [port]
#
# NGROK_DOMAIN must be a reserved static domain from your own ngrok account
# (Cloud Edge > Domains in the ngrok dashboard). NGROK executable defaults to
# whatever `ngrok` resolves to on PATH; override with NGROK_BIN if needed.
NGROK="${NGROK_BIN:-ngrok}"
DOMAIN="${NGROK_DOMAIN:?Set NGROK_DOMAIN to your reserved ngrok static domain}"
PORT="${1:-3100}"

while true; do
  echo "[keep-alive] starting ngrok tunnel on $DOMAIN -> localhost:$PORT..."
  START=$(date +%s)
  "$NGROK" http --domain="$DOMAIN" "$PORT"
  RAN_FOR=$(( $(date +%s) - START ))
  # If ngrok died almost immediately, it's likely hitting a rate limit from
  # reconnecting too fast rather than a one-off environment kill — back off
  # harder in that case instead of hammering it.
  if [ "$RAN_FOR" -lt 5 ]; then
    echo "[keep-alive] ngrok exited after only ${RAN_FOR}s, backing off 15s..."
    sleep 15
  else
    echo "[keep-alive] ngrok exited after ${RAN_FOR}s, restarting in 3s..."
    sleep 3
  fi
done
