# PLAN DE TRAVAIL — Backend distribué REVENDS

| | |
|---|---|
| **Date** | 2026-10-11 |
| **Auteur** | Chef de projet (avec @architecte) |
| **Statut** | En cours — backend codé, infra + tests à finaliser |
| **Sources** | Conversations projet, `docs/architecture-distribuee.md`, `docs/cahier-des-charges-v5.md` |

---

## 1. Périmètre

| Lieu | Rôle | Stack |
|---|---|---|
| `/home/dioufidriss/Bureau/main` | **Vues** (front statique) — design system LIGHT/DARK, loader « Cœur couture », cards, menu hamburger | HTML/CSS/JS vanilla, **aucun appel API** (vitrine) |
| `/home/dioufidriss/Documents/Default Project/revends/server` | **Logique backend** à distribuer | Express 5 + TS + pg + Redis |

- `revends/web` (React SPA) = **hors périmètre**, non servi.
- **Pas de paiement** : REVENDS = mise en relation (contacter le vendeur, pas de checkout/escrow).

---

## 2. Technologies

### 2.1 Backend (gardé — ne pas remplacer)

| Couche | Techno | Version | Rôle |
|---|---|---|---|
| Runtime | Node.js | v22 | LTS, ESM natif |
| Langage | TypeScript | ~7.0 | Type-check (`tsc --noEmit`) |
| Framework | Express | 5.2 | REST, middleware |
| BDD | PostgreSQL | 16 | Données, transactions, `FOR UPDATE` |
| Driver | pg | 8.23 | Pools, requêtes SQL brutes |
| Validation | zod | 4.6 | Schémas d'entrée |
| Sessions | express-session | 1.19 | Cookie `connect.sid`, 7 jours |
| Sécurité | helmet | 8.3 | En-têtes HTTP |
| Uploads | multer | 2.4 | Photos produits (disque) |
| Tâches | node-cron | 4.6 | Expiration réservations (1 min) |
| Mail | nodemailer | 10 | Emails transactionnels |
| Hash mdp | bcryptjs | 3.0 | Pur JS (pas de build natif) |

### 2.2 Ajouts distribués (recommandé)

| Couche | Techno | Version | Rôle |
|---|---|---|---|
| Cache/sessions/rate-limit | Redis | 7.4 | Store partagé entre instances |
| Client Redis | redis (node-redis) | 6.3 | `createClient`, `pTTL`/`pExpire` (v6 API) |
| Store session | connect-redis | 10.0 | `RedisStore` (remplace `connect-pg-simple` en distribué) |
| Load balancer | nginx | alpine | Round-robin → 3 backends |
| Sharding | pg + router custom | — | FNV-1a hash → 2 shards |
| Réplication | PostgreSQL streaming | 16 | `pg_basebackup -R`, WAL streaming |

### 2.3 Frontend (vues)

| Couche | Techno | Rôle |
|---|---|---|
| Statique | HTML/CSS/JS vanilla | Vitrine REVENDS (Bureau/main) |
| Design system | CSS custom properties | LIGHT `#FFFFFF`/`#6B1728`, DARK `#11100F`/`#8F2940` |
| Loader | SVG + CSS | « Le Cœur couture » (splash + mini-cœur) |
| Polices | Google Fonts | DM Serif Display + Manrope |

### 2.4 Infrastructure

| Couche | Techno | Rôle |
|---|---|---|
| Conteneurs | Docker 29.8 + compose v2 | Stack complète locale |
| Images | `nginx:alpine`, `postgres:16-alpine`, `redis:7.4-alpine`, `node:22-slim` | Déjà en local |
| Réseau | Docker bridge | `revends_net` (services internes) |
| Ports hôte | `8080` (LB), `5433` (PG dev) | Exposition limitée |

### 2.5 Tests & qualité

| Outil | Rôle |
|---|---|
| `node --test` + tsx | Tests unitaires/intégration (20 suites) |
| Playwright | E2E front (hors périmètre distribué) |
| `tsc --noEmit` | Type-check |
| `npm run build` | Compilation TS → dist |

---

## 3. Architecture distribuée

```
                         ┌─────────────────────────────────────┐
   navigateur ───────────►│  Nginx (LB)  :8080 (hôte)          │
   (vues Bureau/main)    │  upstream revends_api (round-robin)│
                         └──────┬──────────┬──────────┬────────┘
                                │          │          │
                        ┌───────▼──┐ ┌─────▼────┐ ┌───▼──────┐
                        │ api1:4000│ │ api2:4000│ │ api3:4000│  ← même image,
                        │ INSTANCE │ │ INSTANCE │ │ INSTANCE │    SANS ÉTAT
                        └────┬─────┘ └────┬─────┘ └────┬─────┘
                             └─────────────┼────────────┘
                                           │
                              ┌────────────▼────────────┐
                              │  Redis :6379            │
                              │  sessions + cache + RL  │
                              └────────────┬────────────┘
                                           │
                    ┌──────────────────────┴──────────────────────┐
                    │ SHARD 0                    │ SHARD 1        │
                    │ pg0-primary ──WAL──► pg0-replica            │
                    │ pg1-primary ──WAL──► pg1-replica            │
                    └─────────────────────────────────────────────┘
```

**Flux clés** :
- **Login** → session dans Redis (`revends:sess:<sid>`) → partagée entre api1/2/3 (preuve « sans état »).
- **GET /api/categories** → cache Redis (`getOrSet`, TTL 60s) + lecture replica shard 0.
- **GET /api/products** → shard router (`shardOf(user.id)`) → replica du bon shard.
- **Écritures** → primary du shard. Failover : si primary down → `pg_promote()` sur replica (si `CLUSTER_AUTO_PROMOTE=true`).

---

## 4. Plan de travail — étapes

### ✅ Étape 1 — Backend distribué (CODÉ, vérifié)

| Fichier | Statut |
|---|---|
| `src/config.ts` | ✅ Clés distribuées, defaults test-aware |
| `src/db/cluster.ts` | ✅ Shard router (FNV-1a, pools, failover, health-checks) |
| `src/db/replicate-reference.ts` | ✅ Stub no-op (V1) |
| `src/cache/redis.ts` | ✅ Client singleton, `getOrSet`, jamais d'exception |
| `src/session/store.ts` | ✅ RedisStore / repli pg |
| `src/middleware/instance-id.ts` | ✅ `X-Instance-Id` |
| `src/middleware/rate-limit.ts` | ✅ Redis Lua + repli mémoire |
| `src/db/pool.ts` | ✅ Compat (`pool = getPool(0,'primary')`) |
| `src/routes/cluster.routes.ts` | ✅ `GET /api/cluster/health` |
| `src/app.ts` | ✅ instanceId, buildSessionStore, clusterRouter |
| `src/index.ts` | ✅ connectRedis, startHealthChecks, shutdown propre |
| `src/db/migrate.ts` | ✅ Multi-shards + advisory lock + `RUN_MIGRATIONS` |
| `src/services/categories.service.ts` | ✅ Cache + replica |
| `src/services/banners.service.ts` | ✅ Cache + replica |
| `package.json` | ✅ `redis@6.3.0`, `connect-redis@10.0.0` |

**Preuves** : `tsc --noEmit` → 0 erreur · `npm run build` → OK.

### 🔲 Étape 2 — Infra Docker (À FAIRE)

| Fichier | Contenu |
|---|---|
| `server/docker-compose.distributed.yml` | lb + api1/2/3 + redis + pg0/pg1 × (primary+replica) |
| `server/nginx/nginx.conf` | upstream round-robin, `X-Upstream`, `X-Forwarded-*` |
| `server/docker/postgres/primary-init/00-replication.sh` | Rôle `replicator`, `pg_hba`, slot, `listen_addresses` |
| `server/docker/postgres/replica-init/10-basebackup.sh` | `pg_basebackup -R`, attente primary |

**⚠️** `@devops` a simulé ce livrable (rapport complet, **aucun fichier sur disque**). Je le fais moi-même.

### 🔲 Étape 3 — Test R0 (À FAIRE)

- Réécrire `test/perf-v5.test.ts` : actuellement interdit `redis` dans `package.json` → doit désormais prouver le **compteur partagé** + **repli mémoire**.

### 🔲 Étape 4 — Vérification (À FAIRE)

- `npm test` (base PG dev `revends-postgres` déjà up sur 127.0.0.1:5433).
- Montée cluster : `docker compose -f docker-compose.distributed.yml up -d --build`.
- Tests d'intégration :
  - Round-robin LB (`X-Instance-Id` alterne api1→api2→api3).
  - Session multi-instance (login api1 → authentifié api2/api3).
  - Cache Redis (`revends:cache:*`, TTL ~60).
  - Rate-limit partagé (`revends:rl:*`, 429 après 300 req).
  - Routage shard (`shardOf(key)` → bon primary).
  - Réplication (`pg_stat_replication` → `state=streaming`).
  - Failover (stop primary → `activeWrite=replica`).

### 🔲 Étape 5 — Agents vérifiables (À FAIRE)

| Agent | Livrable | Vérification lead |
|---|---|---|
| `@tester` | Tests d'intégration distribués | `npm test` + montée cluster |
| `@reviewer` | Revue code | Relire diff, vérifier cohérence |
| `@securite` | Audit sécurité | OWASP, secrets, CORS, rate-limit |

**Règle** : je vérifie chaque livrable avec de vraies commandes avant d'accepter.

### 🔲 Étape 6 — Docs (À FAIRE)

- `docs/journal.md` : entrée distribuée.
- `docs/architecture-distribuee.md` : mise à jour post-implémentation.

---

## 5. Décisions

| # | Décision | Choix |
|---|---|---|
| D1 | Test R0 (`perf-v5`) | Réécrire pour prouver le compteur partagé |
| D2 | `users` | Broadcast sur chaque shard (pas de shard par user) |
| D3 | Failover écriture | `CLUSTER_AUTO_PROMOTE=true` (démo), `false` (prod) |
| D4 | Périmètre V1 | Router + 3 chemins migrés (categories/banners/catalogue) |
| D5 | `SESSION_STORE` | `redis` (compose), `pg` (tests) |
| D6 | `DB_SHARD_COUNT` en test | Forcé à 1 (compat, pas de double migration) |
| D7 | Qui sert les vues `Bureau/main` | **(a) nginx** (recommandé) ou (b) Express — à confirmer |

---

## 6. Prochaines actions (lead)

1. **Étape 2** : écrire `docker-compose.distributed.yml` + `nginx.conf` + scripts PG.
2. **Étape 3** : réécrire `test/perf-v5.test.ts`.
3. **Étape 4** : `npm test` + montée cluster + tests d'intégration.
4. **Étape 5** : activer `@tester`, `@reviewer`, `@securite` (avec vérification).
5. **Étape 6** : mettre à jour `docs/journal.md`.

---

## 7. Risques

| # | Risque | Action |
|---|---|---|
| R0 | Test `perf-v5` interdit `redis` | Réécrire (étape 3) |
| R2 | 3 instances migrent/cron en même temps | `RUN_MIGRATIONS=false` + `DISABLE_CRON=true` sur api2/3 + advisory lock |
| R3 | Redis SPOF | `appendonly yes` + volume ; repli mémoire rate-limit |
| R4 | Failover écriture sans `pg_promote` | `CLUSTER_AUTO_PROMOTE=true` (démo) |
| R5 | Réplica avant primary prêt | `depends_on: service_healthy` + retry `pg_isready` |
| R6 | Hostname dans `primary_conninfo` | Noms de services stables (`pg0-primary`, etc.) |
