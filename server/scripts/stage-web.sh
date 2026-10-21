#!/usr/bin/env bash
# ============================================================================
# stage-web.sh — embarque le build front dans le contexte du Dockerfile.
#
# Contexte : le serveur Express sert la SPA depuis <server>/../web/dist
# (WEB_DIST, cf. server/src/app.ts). Le Dockerfile de production est dans
# server/ et le contexte de build Railway = dossier server/ UNIQUEMENT
# (`railway up` depuis server/) : le dossier web/ n'y est pas accessible.
# Ce script copie donc `web/dist` (build produit sur la machine de dev)
# vers `server/web-dist/`, qui EST dans le contexte et sera embarqué dans
# l'image (voir Dockerfile, section « stratégie front »).
#
# Usage :
#   cd server && bash scripts/stage-web.sh        (ou depuis la racine du repo)
#
# Prérequis : `web/dist` doit exister (cd ../web && npm run build).
# ============================================================================
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
server="$root/server"
web_src="$root/web/dist"
stage_dst="$server/web-dist"

if [[ ! -f "$web_src/index.html" ]]; then
  echo "❌ $web_src/index.html introuvable — build front requis :" >&2
  echo "   (cd \"$root/web\" && npm run build)" >&2
  exit 1
fi

# Alerte si le build front est plus ancien que les sources web (risque de
# servir un front obsolète) — ne bloque PAS, le buildé reste valide.
if [[ -n "$(find "$root/web/src" -type f -newer "$web_src/index.html" 2>/dev/null | head -n 1)" ]]; then
  echo "⚠  web/src contient des fichiers PLUS RÉCENTS que web/dist — " >&2
  echo "   pensez à relancer : (cd \"$root/web\" && npm run build)" >&2
fi

rm -rf "$stage_dst"
mkdir -p "$stage_dst"
cp -r "$web_src/." "$stage_dst/"

size="$(du -sh "$stage_dst" | cut -f1)"
echo "✔ front synchronisé : $web_src → $stage_dst ($size)"
echo "  Uploadez maintenant : cd \"$server\" && railway up"