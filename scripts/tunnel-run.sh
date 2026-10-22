#!/usr/bin/env bash
# ============================================================================
#  ReVends — wrapper de tunnel permanent (appelé par systemd)
# ============================================================================
#  Lance cloudflared vers la stack locale et publie l'URL courante dans
#  ~/.local/state/revends/public-url.txt dès qu'elle est connue.
#  Relancé automatiquement par systemd (Restart=always).
# ============================================================================
set -uo pipefail

HOME_DIR="${HOME:?HOME manquant}"
STATE_DIR="$HOME_DIR/.local/state/revends"
LOG_FILE="$STATE_DIR/cloudflared.log"
URL_FILE="$STATE_DIR/public-url.txt"
BIN="$HOME_DIR/.local/bin/cloudflared"
TARGET="http://127.0.0.1:8080"

mkdir -p "$STATE_DIR"
rm -f "$URL_FILE"

# Publie l'URL en tâche de fond pendant que cloudflared tourne au premier plan.
(
  for _ in $(seq 1 120); do
    u="$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$LOG_FILE" 2>/dev/null | head -1 || true)"
    if [[ -n "$u" ]]; then
      printf '%s\n' "$u" > "$URL_FILE"
      exit 0
    fi
    sleep 1
  done
) &
URL_WATCHER=$!

exec "$BIN" tunnel --url "$TARGET" --no-autoupdate --logfile "$LOG_FILE"
