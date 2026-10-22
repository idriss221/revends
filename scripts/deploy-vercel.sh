#!/usr/bin/env bash
# ============================================================================
# ReVends — déploiement production Vercel (gratuit, sans carte bancaire)
# ============================================================================
#
# POURQUOI UN BUILD LOCAL + `--prebuilt` ?
# -------------------------------------
# Deux contraintes de la plateforme ont été mesurées :
#
#  1. Preset « express » : la sortie statique ne peut provenir QUE des
#     fichiers TÉLÉVERSÉS. Un build du front réalisé sur la machine Vercel
#     n'est jamais repris dans la sortie statique (mesuré : `GET /` → 404
#     alors que l'API répondait parfaitement).
#     → Le front est donc construit ICI, copié dans `public/`, puis envoyé.
#
#  2. Preset « express » : le routage est introspecté depuis l'application.
#     Le build distant (système « build-output » legacy) ignore la
#     réécriture de la racine `/` → `GET /` tombait sur la fonction (404).
#     Le build local, lui, produit la route `^/$ → /index.html` correcte.
#     → On déploie l'OUTPUT PRÉ-CONSTRUIT (`--prebuilt`), dont le routage a
#       été validé avant envoi.
#
# Le preset « Other » (api/[...path].ts + outputDirectory) a été écarté :
# la plateforme n'y génère que `^/api/([^/]+)$`, donc les routes métier à
# deux segments (/api/auth/login, /api/products/:id) tombent en 404.
#
# Usage : scripts/deploy-vercel.sh
# ============================================================================
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$(pwd)"

# ── Garde-fou sécurité ───────────────────────────────────────────────────────
# Le builder Vercel embarque dans le bundle de la fonction TOUT fichier
# `.env*` présent à la racine du projet (mesuré : le `.env` local, avec les
# mots de passe Google/Facebook et l'historique du session secret, s'est
# retrouvé dans `.vercel/output/functions/*.func/.env` → exposé en prod).
# On refuse donc de déployer tant qu'un `.env*` traîne à la racine.
LEAKED=$(find "$ROOT" -maxdepth 1 -name ".env*" -not -name ".env.example" -not -name ".env.local" -print 2>/dev/null)
if [ -n "$LEAKED" ]; then
  echo "❌ Fichier(s) .env* à la racine — secrets embarqués dans la fonction :" >&2
  echo "$LEAKED" | sed 's/^/     /' >&2
  echo "   → déplacez-les hors du dépôt (ex. ~/.revends-secrets/) puis relancez." >&2
  exit 1
fi

echo "▸ 1/4 — build du front (web/dist)…"
npm run build --prefix web

echo "▸ 2/4 — copie web/dist → public/ (sortie statique) + server/public/ (bundle fonction)…"
rm -rf "$ROOT/public" "$ROOT/server/public"
mkdir -p "$ROOT/public" "$ROOT/server/public"
cp -R "$ROOT/web/dist/." "$ROOT/public/"
cp -R "$ROOT/web/dist/." "$ROOT/server/public/"
echo "   public/ : $(find "$ROOT/public" -type f | wc -l) fichiers"
echo "   server/public/ : $(find "$ROOT/server/public" -type f | wc -l) fichiers (embarqués dans la fonction)"

echo "▸ 3/4 — build Vercel local (routes + bundle de la fonction)…"
rm -rf "$ROOT/.vercel/output"
vercel build --prod --yes
# Copier le build Vite COMPLET (index.html + assets) vers la sortie statique
# Cela garantit que l'HTML référence les bons hashes d'assets.
cp -R "$ROOT/web/dist/." "$ROOT/.vercel/output/static/"
echo "   static/ : $(find "$ROOT/.vercel/output/static" -type f | wc -l) fichiers (HTML + assets JS/CSS)"
node -e "
const c = require('$ROOT/.vercel/output/config.json');
console.log('   routes :');
(c.routes || []).forEach(r => console.log('    ', JSON.stringify(r)));
"

echo "▸ 4/4 — déploiement de l'output pré-construit (production)…"
vercel deploy --prebuilt --prod --yes

echo
echo "✅ Déploiement terminé — https://revends.vercel.app"
echo "   Recette : /tmp/opencode/prove-prod.sh https://revends.vercel.app"
