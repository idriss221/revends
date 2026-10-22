#!/usr/bin/env bash
# ============================================================================
# ReVends — déploiement production Vercel (gratuit, sans carte bancaire)
# ============================================================================
#
# POURQUOI CE SCRIPT ?
# -------------------
# Avec le preset « express », Vercel ne reprend dans la sortie statique que
# les fichiers TÉLÉVERSÉS : le build du front réalisé sur la machine Vercel
# n'est jamais servi par le CDN (constaté : `GET /` → 404 alors que l'API
# répondait parfaitement).
#
# Le front est donc construit ICI, copié dans `public/`, puis téléversé :
#   1. build du front (web/dist)
#   2. copie web/dist → public/  (public/ est l'entrée statique du preset)
#   3. `vercel deploy --prod`
#
# Le buildCommand distant ne fait QUE revalider le build du front ; il ne
# touche jamais à `public/` (le supprimer provoquerait un ENOENT au
# packaging de la fonction : les fichiers téléversés seraient_deleted
# avant d'être empaquetés).
#
# Usage : scripts/deploy-vercel.sh
# ============================================================================
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$(pwd)"

echo "▸ 1/3 — build du front (web/dist)…"
npm run build --prefix web

echo "▸ 2/3 — copie web/dist → public/…"
rm -rf "$ROOT/public"
mkdir -p "$ROOT/public"
cp -R "$ROOT/web/dist/." "$ROOT/public/"
echo "   public/ : $(find "$ROOT/public" -type f | wc -l) fichiers"

echo "▸ 3/3 — déploiement Vercel (production)…"
vercel deploy --prod --yes

echo
echo "✅ Déploiement terminé — https://revends.vercel.app"
echo "   Recette : /tmp/opencode/prove-prod.sh https://revends.vercel.app"
