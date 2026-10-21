# syntax=docker/dockerfile:1
# ============================================================================
# ReVends — image de production du service serveur (une seule entité Railway :
# API Express + SPA servie + uploads + cron de réservations, architecture §7).
#
# STRATÉGIE FRONT (décision devops) :
#   Le build SPA est produit sur la machine de dev (`web/dist`, Vite/React ;
#   voire `./web/dist` est déjà « avilit »). On COPIe ce build pré-existant
#   dans l'image finale au lieu de re-builder web dans un stage Docker car :
#     - le contexte de build Railway = dossier `server/` uniquement
#       (`railway up` depuis server/) : `web/` n'y est pas accessible ;
#     - le front n'embarque aucune variable de build (URLs relatives
#       /api et /uploads, vite.config.ts = proxy dev seulement) → pas de
#       rebuild nécessaire au déploiement, image plus légère et déploiement
#       plus rapide ;
#     - architecture.md §7.3-6 : « web/dist, copié dans l'image serveur ».
#   `scripts/stage-web.sh` synchronise `web/dist` → `server/web-dist/` avant
#   chaque `railway up`. Un front absent = `COPY web-dist` échoue = build
#   cassé : on ne peut pas déployer une image sans front par inadvertance.
#
# STRATÉGIE MIGRATIONS + SEED :
#   db:migrate et db:seed sont IDEMPOTENTS (migrate.ts trace dans
#   schema_migrations ; seed.ts fait INSERT ... ON CONFLICT (email) DO
#   NOTHING). Ils sont donc exécutés à CHAQUE boot (CMD) — redémarrages et
#   redeploys restent idempotents, aucune étape manuelle.
#   Les scripts npm `db:*` passent par tsx (devDependency, absent de l'image
#   finale) → on invoque directement les JS compilés dans dist/db/.
# ============================================================================

# --- Étape 1 : builder (deps complètes + compilation TypeScript) ------------
FROM node:22-slim AS builder
WORKDIR /build

# Cache friendly : package-lock d'abord (npm ci), puis sources.
COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# --- Étape 2 : runtime — dépendances PROD uniquement ------------------------
FROM node:22-slim AS runtime

ENV NODE_ENV=production
WORKDIR /app/server

# Dépendances production uniquement (pas de tsx / typescript dans l'image).
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Code compilé (stage builder), migrations SQL et build front dev.
COPY --from=builder /build/dist ./dist
COPY migrations ./migrations
COPY web-dist /app/web/dist

# Entrypoint de validation des secrets
COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

# Utilisateur non-privilégié + points d'écriture uploads.
# NOTE Railway (docs « Volumes » → Permissions) : les volumes sont montés en
# root → écrire sur /data depuis un uid non-root échoue. La variable de
# service RAILWAY_RUN_UID=0 (posée au déploiement, cf. docs/deploiement.md)
# fait tourner le process en root POUR L'ACCÈS AU VOLUME ; hors Railway
# (docker local, autres cibles) l'utilisateur `revends` ci-dessous opère.
RUN groupadd --system --gid 10001 revends \
 && useradd --system --uid 10001 --gid revends --home /app --no-create-home revends \
 && mkdir -p /data/products \
 && chown -R revends:revends /app /data

USER revends

EXPOSE 4000

# Entrypoint valide les secrets, puis lance migrate → seed → API
ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["node", "dist/db/migrate.js", "&&", "node", "dist/db/seed.js", "&&", "node", "dist/index.js"]