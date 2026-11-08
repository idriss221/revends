#!/usr/bin/env bash
# ============================================================================
#  ReVends — mise en ligne locale + exposition publique (Cloudflare Tunnel)
# ============================================================================
#  Aucune carte bancaire, aucun compte : le site est servi depuis cette
#  machine et exposé en HTTPS via un tunnel Cloudflare « rapide ».
#
#  Usage :
#     ./scripts/deploy-tunnel.sh start    # démarre la stack + le tunnel
#     ./scripts/deploy-tunnel.sh url      # affiche l'URL publique courante
#     ./scripts/deploy-tunnel.sh status   # état de la stack et du tunnel
#     ./scripts/deploy-tunnel.sh stop     # arrête le tunnel (garde la stack)
#     ./scripts/deploy-tunnel.sh logs     # suit les logs du tunnel
#
#  ⚠️  L'URL trycloudflare est ÉPHÉMÈRE : elle change à chaque redémarrage
#      du tunnel. Pour une URL STABLE et définitive, voir « Domaine fixe »
#      en bas de ce fichier (nécessite un domaine gratuit sur Cloudflare).
# ============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export PATH="$HOME/.local/bin:$PATH"

COMPOSE_FILE="$ROOT/docker-compose.yml"
LOG_FILE="/tmp/opencode/cloudflared.log"
URL_FILE="/tmp/opencode/revends-public-url.txt"
LOCAL_URL="http://127.0.0.1:8080"

info() { printf '\033[1;34m▸\033[0m %s\n' "$*"; }
ok()   { printf '\033[1;32m✓\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m!\033[0m %s\n' "$*"; }
die()  { printf '\033[1;31m✗\033[0m %s\n' "$*" >&2; exit 1; }

require_cloudflared() {
  command -v cloudflared >/dev/null 2>&1 || \
    die "cloudflared introuvable. Installez-le : https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/"
}

wait_http() { # $1=url  $2=essais
  local url="$1" tries="${2:-40}" i=1
  while (( i <= tries )); do
    if curl -fsS -o /dev/null --max-time 5 "$url"; then return 0; fi
    sleep 2; (( i++ ))
  done
  return 1
}

start_stack() {
  info "Démarrage de la stack Docker (postgres, redis, api x3, nginx)…"
  docker compose -f "$COMPOSE_FILE" up -d
  info "Attente de l'API via nginx ($LOCAL_URL/api/health)…"
  wait_http "$LOCAL_URL/api/health" 60 || die "l'API ne répond pas en local"
  ok "API locale opérationnelle"
}

start_tunnel() {
  require_cloudflared
  mkdir -p "$(dirname "$LOG_FILE")"

  # Tunnel déjà vivant ? (on réutilise, pour ne pas changer d'URL sans raison)
  if pgrep -f "cloudflared tunnel --url $LOCAL_URL" >/dev/null 2>&1; then
    local cur
    cur="$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$LOG_FILE" 2>/dev/null | tail -1 || true)"
    if [[ -n "$cur" ]]; then
      ok "Tunnel déjà actif : $cur"
      printf '%s\n' "$cur" > "$URL_FILE"
      return 0
    fi
  fi

  info "Ouverture du tunnel Cloudflare vers $LOCAL_URL…"
  : > "$LOG_FILE"
  nohup cloudflared tunnel --url "$LOCAL_URL" --no-autoupdate >"$LOG_FILE" 2>&1 &
  disown || true

  local url="" i=1
  while (( i <= 40 )); do
    url="$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$LOG_FILE" 2>/dev/null | head -1 || true)"
    [[ -n "$url" ]] && break
    sleep 1; (( i++ ))
  done
  [[ -n "$url" ]] || die "URL publique introuvable (voir $LOG_FILE)"

  printf '%s\n' "$url" > "$URL_FILE"
  ok "Site en ligne : $url"
}

verify_public() {
  local url; url="$(cat "$URL_FILE" 2>/dev/null || true)"
  [[ -n "$url" ]] || die "aucune URL publique connue"
  info "Vérification publique de $url…"
  local health; health="$(curl -fsS --max-time 20 "$url/api/health" || true)"
  [[ "$health" == *'"ok"'* ]] || die "health publique KO : $health"
  local total; total="$(curl -fsS --max-time 20 "$url/api/products" | grep -oE '"total":[0-9]+' || true)"
  ok "Accueil : $(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "$url/")"
  ok "API health : $health"
  ok "Produits : ${total:-?}"
}

case "${1:-start}" in
  start)
    start_stack
    start_tunnel
    verify_public
    printf '\n\033[1;32m══ ReVends est en ligne ══\033[0m\n  %s\n\n' "$(cat "$URL_FILE")"
    warn "URL éphémère : elle changera si le tunnel redémarre."
    warn "Pour une URL fixe, voir « Domaine fixe » dans $0"
    ;;
  url)    cat "$URL_FILE" 2>/dev/null || die "aucune URL (lancez « start »)" ;;
  status)
    info "Stack Docker :"; docker compose -f "$COMPOSE_FILE" ps --format '  {{.Name}}  {{.Status}}' || true
    info "Tunnel :"; pgrep -af "cloudflared tunnel --url" || echo "  arrêté"
    info "URL :"; cat "$URL_FILE" 2>/dev/null || echo "  inconnue"
    ;;
  stop)
    pkill -f "cloudflared tunnel --url $LOCAL_URL" && ok "tunnel arrêté" || warn "aucun tunnel actif"
    rm -f "$URL_FILE"
    ;;
  logs)   tail -f "$LOG_FILE" ;;
  *)      die "usage: $0 {start|url|status|stop|logs}" ;;
esac

# ============================================================================
#  Domaine fixe (URL permanente, toujours sans carte bancaire)
# ============================================================================
#  1. Achetez/migrez un domaine chez Cloudflare (DNS gratuit), ou utilisez
#     un sous-domaine que vous possédez déjà.
#  2. cloudflared tunnel login                      # autorise votre zone
#  3. cloudflared tunnel create revends             # crée le tunnel nommé
#  4. cloudflared tunnel route dns revends revends.votre-domaine.com
#  5. Lancer avec la configuration nommée :
#       cloudflared tunnel run --url http://127.0.0.1:8080 revends
#     (ou via /etc/cloudflared/config.yml, puis service systemd :
#      sudo cloudflared service install)
#  Résultat : https://revends.votre-domaine.com — HTTPS, stable, gratuit.
# ============================================================================
