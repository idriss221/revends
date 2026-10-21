> ⚠️ **SUPERSEDED — 2026-10-16 (WS2)**
>
> Le sharding (FNV-1a, cluster.ts, shardRouter.ts, répliques) a été abandonné au profit d'un **pool unique** (`server/src/db/pool.ts`). Ce document est conservé à titre historique ; la source de vérité technique est désormais `docs/architecture-v5.md` et `docs/architecture.md`.

# Architecture distribuée ReVends — backend scalable (LB → API ×3 sans état → Redis → 2 shards Postgres)

**Auteur** : @architecte · **Date** : 2026-10-11 · **Statut** : **contrats figés** — prêt pour implémentation par @backend + @devops, sans re-discussion.
**Cible** : version distribuée du backend existant (`server/`). On **garde** Express 5.2 + TypeScript + `pg` + `zod` + `multer` + `node-cron` + `nodemailer` + `helmet` + `express-session`. On **remplace uniquement** les 3 points non scalables : store de session, rate-limit, accès à la base.
**Sources** : code réel `server/src/` (lu) ; `docs/architecture-v5.md` ; `docs/api.md` §3.7/§5.5 ; `docs/cahier-des-charges-v5.md` (CA‑V5‑091, CA‑V5‑146, PO‑V5‑17) ; docs officielles consultées le 2026‑10‑11 (voir §0).

---

## 0. Versions et API vérifiées (skill `docs-officielles`) — à GELER dans `package.json`

| Paquet / techno | Version retenue | Source | Point de contrat à respecter |
|---|---|---|---|
| `express-session` | `^1.19.0` (déjà présent) | registre npm, `express-session@1.19.0` | inchangé |
| `connect-redis` | **`^10.0.0`** | registre npm `connect-redis@10.0.0` — `engines.node >=22`, `peerDependencies: redis >=5, express-session >=1` | API : `import { RedisStore } from 'connect-redis'` puis `new RedisStore({ client, prefix, ttl })`. **Types inclus** — ne PAS installer `@types/connect-redis`. |
| `redis` (node-redis) | **`^6.3.0`** | registre npm `redis@6.3.0` (deps `@redis/client@6.3.0`), `engines.node >=20` | API v6 : `createClient({ url })`, `await client.connect()`, `client.isReady`, `client.on('error', …)` **obligatoire**. Déconnexion = `client.close()` / `client.destroy()` (**`quit()`/`disconnect()` supprimés**). |
| `connect-pg-simple` | `^10.0.0` (déjà présent) | — | **conservé** comme store de repli (`SESSION_STORE=pg`). |
| PostgreSQL streaming replication | PG 16 | doc officielle `pg_basebackup` (§27.2 warm-standby) | `pg_basebackup -D <dir> -U replicator -Fp -Xs -P -R` : `-R` crée `standby.signal` **et** écrit `primary_conninfo`/`primary_slot_name` dans `postgresql.auto.conf`. Prérequis : rôle `REPLICATION`, `pg_hba.conf` autorisant la connexion `replication`, `max_wal_senders` ≥ 2, `wal_level=replica`. |
| nginx upstream | `nginx:alpine` | doc officielle `ngx_http_upstream_module` | round‑robin pondéré **par défaut** ; `max_fails` (défaut 1) + `fail_timeout` (défaut 10s) ; `least_conn`, `ip_hash`, `keepalive N` ; variables `$upstream_addr`, `$upstream_status`. |

> ⚠️ **Changement d'API à ne pas rater** : node-redis v6 a renommé/supprimé `quit()` et `disconnect()`. Tout code écrit « de mémoire » avec `client.quit()` **casse à la compilation**. Utiliser `client.destroy()` (arrêt brutal) ou `client.close()`.

---

## 1. Topologie et flux

### 1.1 Schéma (ASCII)

```
                             ┌───────────────────────────────────────────┐
   navigateur / mobile ─────▶│  Nginx (LB)   écoute :80  (hôte :8080)     │
                             │  upstream revends_api { round-robin }      │
                             │  proxy_set_header Host / X-Real-IP / XFP   │
                             └──────┬──────────────┬──────────────┬───────┘
                                    │              │              │
                          ┌─────────▼──┐   ┌───────▼───┐   ┌──────▼─────┐
                          │  api1:4000 │   │ api2:4000 │   │ api3:4000  │   ← même image,
                          │INSTANCE_ID │   │INSTANCE_ID│   │INSTANCE_ID │     SANS ÉTAT
                          │   = api1   │   │  = api2   │   │   = api3   │
                          └─────┬──────┘   └─────┬─────┘   └─────┬──────┘
                                └────────────────┼───────────────┘
                                                 │  (sessions, cache, rate-limit)
                                        ┌────────▼─────────────────────────┐
                                        │  Redis :6379  (appendonly yes)    │
                                        │  revends:sess:*   revends:cache:* │
                                        │  revends:rl:*                     │
                                        └────────┬─────────────────────────┘
                                                 │  (accès données via shard router)
             ┌───────────────────────────────────┴───────────────────────────────────┐
             │  SHARD 0  —  clé : shardOf(user.id) == 0    │  SHARD 1 — shardOf == 1     │
             │  ┌──────────────────┐   WAL stream   ┌───────┐  │  ┌──────────────┐  WAL  ┌─┐ │
             │  │ pg0-primary :5432│───────────────▶│pg0-rep│  │  │pg1-primary   │──────▶│p│ │
             │  │  ÉCRITURES       │                │ (RO)  │  │  │ ÉCRITURES    │       │g│ │
             │  └──────────────────┘                └───────┘  │  └──────────────┘       │1│ │
             │        ▲ lecture replica                     │         ▲ lecture replica │-│ │
             │        └──── (failover : lecture bascule)     │         └── (failover)    │r│ │
             └──────────────────────────────────────────────┴──────────────────────────┴─┘
```

Compose : services `lb`, `api1`, `api2`, `api3`, `redis`, `pg0-primary`, `pg0-replica`, `pg1-primary`, `pg1-replica`.

### 1.2 Flux 1 — `POST /api/auth/login` (session partagée Redis)

1. Client → `lb:80`. Nginx choisit une instance (round-robin) → `api2:4000`.
2. `app.ts` monte le store **Redis** (`connect-redis`) : l'instance lit/écrit la session dans `revends:sess:<sid>`, **jamais** en mémoire de process.
3. `auth.routes.ts` vérifie les identifiants (`users` — table *broadcast*, cf. §4.2), écrit `req.session.userId/role` → `RedisStore.set()` → `SET revends:sess:<sid> {…} EX 604800`.
4. Réponse `200` + `Set-Cookie: connect.sid=…; HttpOnly; SameSite=Lax; Secure(prod)`. Header **`X-Instance-Id: api2`** posé par le middleware (§3.5).
5. Requête suivante → `lb` → `api3`. `api3` lit la session dans Redis → **authentifié** sans re-login. C'est la preuve du « sans état ».

**Repli** : si Redis indisponible, `SESSION_STORE=pg` n'est PAS basculé automatiquement (le store est choisi au démarrage). Redis down ⇒ erreurs de session → l'instance doit renvoyer `503` ; c'est acceptable en démo (Redis est critique). Voir risque R3.

### 1.3 Flux 2 — `GET /api/products` (routage shard + lecture replica)

1. Client → `lb` → `api1`.
2. `middleware/instance-id.ts` pose `X-Instance-Id`.
3. `middleware/cache.ts` pose `Cache-Control: private, no-store` (liste de produits = réponse non cacheable globalement).
4. `products.routes.ts` → `products.service.getCatalog()`. Les lectures d'une entité liée à un utilisateur passent par `queryShard(shardOf(key), 'replica', sql, params)` → le **replica** du bon shard, sans saturer le primary.
5. Réponse `200` + `X-Instance-Id`. Pour `GET /api/categories` et `GET /api/banners` : en plus du `Cache-Control` existant, on utilise `getOrSet('cache:categories', 60, loader)` → **une seule** requête BDD pour tout le cluster pendant 60 s.

---

## 2. Contrat de variables d'environnement — FIGÉ

> Les noms sont **exacts** ; toute implémentation doit utiliser ces libellés. Les variables existantes (`NODE_ENV`, `PORT`, `DATABASE_URL`, `DB_*`, `SESSION_SECRET`, `UPLOAD_DIR`, `COMMISSION_RATE`, `RESERVATION_MINUTES`, `DISABLE_CRON`, `ADMIN_*`, `WEB_DIST`, `MIGRATIONS_DIR`, `MAIL_*`, `SITE_URL`) restent inchangées.

### 2.1 Backend (`server/`, lues par `src/config.ts`)

| Variable | Type | Défaut | Rôle / contrainte |
|---|---|---|---|
| `INSTANCE_ID` | string | `os.hostname()` | Identité de l'instance. **En compose : `api1` / `api2` / `api3`** (valeur distincte obligatoire). Exposée en en‑tête `X-Instance-Id` sur **toute** réponse. |
| `REDIS_URL` | url | `redis://localhost:6379` (dev) · `redis://redis:6379` (compose) | Connexion Redis : sessions + cache + rate-limit. |
| `REDIS_PREFIX` | string | `revends:` | Préfixe de toutes les clés. |
| `REDIS_CONNECT_TIMEOUT_MS` | int | `2000` | Timeout connexion/commande. |
| `REDIS_CACHE_TTL_SECONDS` | int | `60` | TTL par défaut du cache applicatif. |
| `CACHE_ENABLED` | `true`\|`false` | `true` | `false` ⇒ `getOrSet` devient passe-plat (debug). |
| `SESSION_STORE` | `redis`\|`pg` | `redis` | `pg` = `connect-pg-simple` (repli / tests mono-nœud). |
| `RATE_LIMIT_BACKEND` | `redis`\|`memory` | `redis` | Compteur partagé. Repli mémoire **automatique** si Redis indisponible, quel que soit le réglage. |
| `DB_SHARD_COUNT` | int ≥1 | `2` | Nombre de shards. ⚠️ **modifier cette valeur remappe toutes les clés** (cf. R1). En dev/tests : `1`. |
| `SHARD0_PRIMARY_URL` | url | `DATABASE_URL` (compat) | Primaire shard 0. |
| `SHARD0_REPLICA_URL` | url | = `SHARD0_PRIMARY_URL` | Replica shard 0 (streaming). |
| `SHARD1_PRIMARY_URL` | url | = `SHARD0_PRIMARY_URL` | Primaire shard 1 (compat mono-nœud). |
| `SHARD1_REPLICA_URL` | url | = `SHARD1_PRIMARY_URL` | Replica shard 1. |
| `CLUSTER_FAILOVER_ENABLED` | `true`\|`false` | `true` | Active le basculement automatique. |
| `CLUSTER_AUTO_PROMOTE` | `true`\|`false` | `false` | Si `true`, promeut le replica (`SELECT pg_promote()`) quand le primary tombe. ⚠️ risque de **split-brain** (R4). La démo passe à `true`. |
| `CLUSTER_HEALTHCHECK_MS` | int | `5000` | Période du health-check. |
| `CLUSTER_HEALTHCHECK_TIMEOUT_MS` | int | `2000` | Timeout d'un ping (`SELECT 1`). |
| `RUN_MIGRATIONS` | `true`\|`false` | `true` | `false` sur `api2`/`api3` : **un seul migrateur** (R2). |
| `DISABLE_CRON` | `true`\|`false` | `false` | `true` sur `api2`/`api3` : un seul scheduler (R2). |

> **Compat totale (dev/tests actuels)** : si aucune variable `SHARD*` n'est fournie, `config.cluster.nodes` retombe sur `DATABASE_URL` avec `DB_SHARD_COUNT=1` ⇒ l'application se comporte exactement comme aujourd'hui. La suite `server/test/*` reste verte **sans** Redis si `SESSION_STORE=pg` et `RATE_LIMIT_BACKEND=memory`.

### 2.2 Infra — `docker-compose.distributed.yml`

| Service | Variables |
|---|---|
| `redis` | commande `redis-server --appendonly yes` ; volume `revends_redis:/data` ; healthcheck `redis-cli ping`. |
| `pg0-primary`, `pg1-primary` | `POSTGRES_USER=revends`, `POSTGRES_PASSWORD=revends_dev_password`, `POSTGRES_DB=revends`, `POSTGRES_REPLICATION_USER=replicator`, `POSTGRES_REPLICATION_PASSWORD=replicator_password`, `PGDATA=/var/lib/postgresql/data` ; commande `postgres -c wal_level=replica -c max_wal_senders=10 -c max_replication_slots=10 -c hot_standby=on`. |
| `pg0-replica`, `pg1-replica` | idem + `PRIMARY_HOST=pg0-primary` (resp. `pg1-primary`) ; recovery via `pg_basebackup` au démarrage. |
| `api1` / `api2` / `api3` | `INSTANCE_ID=api1|api2|api3`, `REDIS_URL=redis://redis:6379`, `DB_SHARD_COUNT=2`, `SHARD0_PRIMARY_URL=postgres://revends:…@pg0-primary:5432/revends`, `SHARD0_REPLICA_URL=…@pg0-replica:5432/revends`, `SHARD1_PRIMARY_URL=…@pg1-primary:5432/revends`, `SHARD1_REPLICA_URL=…@pg1-replica:5432/revends`, `RUN_MIGRATIONS=true` (api1) / `false` (api2,api3), `DISABLE_CRON=true` (api2,api3). |
| `lb` | `nginx:alpine`, monte `server/nginx/nginx.conf`, ports `8080:80`. |

### 2.3 Nginx (`server/nginx/nginx.conf`) — contrat de configuration

```nginx
upstream revends_api {
    server api1:4000 max_fails=2 fail_timeout=5s;
    server api2:4000 max_fails=2 fail_timeout=5s;
    server api3:4000 max_fails=2 fail_timeout=5s;
    keepalive 32;                 # round-robin pondéré = méthode PAR DÉFAUT (doc nginx)
}
server {
    listen 80;
    location / {
        proxy_pass http://revends_api;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        add_header X-Upstream $upstream_addr always;   # debug LB (api1:4000,api2:4000…)
    }
}
```
> `least_conn` est une alternative valide mais **non retenue** : le round-robin par défaut rend le test de répartition **déterministe**.

---

## 3. Contrat d'interfaces des modules (signatures TypeScript exactes)

### 3.1 `server/src/db/cluster.ts` (NOUVEAU)

```ts
import type pg from 'pg';

export type ShardIndex = number;                 // 0 .. DB_SHARD_COUNT-1
export type PoolMode = 'primary' | 'replica';
export type ShardKey = string | number | bigint;

export interface ShardNode { primary: string; replica: string; }

export interface ShardState {
  shard: ShardIndex;
  primaryUp: boolean;
  replicaUp: boolean;
  /** Cible des ÉCRITURES : 'primary' normalement, 'replica' après bascule. */
  activeWrite: PoolMode;
  lastCheckAt: number;
  lastError: string | null;
}

export interface ClusterStats {
  instanceId: string;
  shardCount: number;
  failoverEnabled: boolean;
  autoPromote: boolean;
  shards: Record<ShardIndex, ShardState>;
}

/** FNV-1a 32 bits (base 0x811c9dc5, prime 0x01000193) puis modulo DB_SHARD_COUNT. */
export function fnv1a32(input: string): number;
export function shardOf(key: ShardKey): ShardIndex;

export function getPool(shard: ShardIndex, mode: PoolMode): pg.Pool;

export function queryShard<T extends pg.QueryResultRow = pg.QueryResultRow>(
  shard: ShardIndex,
  mode: PoolMode,
  text: string,
  params?: readonly unknown[],
): Promise<pg.QueryResult<T>>;

/** Raccourci : shard = shardOf(key), puis queryShard. */
export function queryByKey<T extends pg.QueryResultRow = pg.QueryResultRow>(
  key: ShardKey,
  mode: PoolMode,
  text: string,
  params?: readonly unknown[],
): Promise<pg.QueryResult<T>>;

export function startHealthChecks(): void;   // idempotent (no-op si déjà démarré)
export function stopHealthChecks(): void;
export function clusterStats(): ClusterStats;
export async function closeCluster(): Promise<void>;
```

**Comportements figés**
- `shardOf(key)` : `fnv1a32(String(key)) % config.cluster.shardCount`. Clé de shard recommandée = `user.id`. `shardOf` ne fait **aucune** I/O.
- `getPool(shard, 'primary')` renvoie le pool primaire **sauf** si `activeWrite='replica'` (bascule) auquel cas il renvoie le pool replica promu. `getPool(shard, 'replica')` renvoie le pool replica, **sauf** si le replica est down → renvoie le primary (lecture dégradée plutôt que 500).
- Un `pool.on('error', …)` est posé sur **chaque** pool (même règle que `db/pool.ts:21` : sans écouteur, le process meurt).
- `startHealthChecks()` : `setInterval(CLUSTER_HEALTHCHECK_MS)`, ping `SELECT 1` avec `CLUSTER_HEALTHCHECK_TIMEOUT_MS`; sur primary down → marque `primaryUp=false`, `activeWrite='replica'`, et si `CLUSTER_AUTO_PROMOTE` exécute `SELECT pg_promote()` sur le replica. Sur primary revenu → `activeWrite='primary'`. Timer `unref()`.

### 3.2 `server/src/db/pool.ts` (MODIFIÉ — compat)

```ts
import type pg from 'pg';
import { getPool } from './cluster.js';

// COMPAT : l'application existante (69 appels pool.query) continue de fonctionner.
// Par défaut = shard 0 / primary. Les services migrés utilisent queryShard().
export const pool: pg.Pool = getPool(0, 'primary');
export type DbClient = pg.PoolClient;
export type Queryable = Pick<DbClient, 'query'>;
```

> Aucun service existant n'a besoin d'être modifié pour que l'application démarre. La migration vers `queryShard` est **progressive** (§4.3).

### 3.3 `server/src/cache/redis.ts` (NOUVEAU)

```ts
import type { RedisClientType } from 'redis';

/** Singleton paresseux. Renvoie null si CACHE_ENABLED=false. */
export function getRedisClient(): RedisClientType | null;
export async function connectRedis(): Promise<void>;   // à appeler dans index.ts avant listen
export async function closeRedis(): Promise<void>;
export function isRedisReady(): boolean;

export async function cacheGet<T>(key: string): Promise<T | null>;
export async function cacheSet<T>(key: string, value: T, ttlSeconds?: number): Promise<void>;
export async function cacheDel(keys: string | string[]): Promise<void>;

/** Lit le cache ; si absent, exécute loader(), stocke (ttl) et renvoie.
 *  Redis indisponible OU CACHE_ENABLED=false ⇒ loader() directement (jamais d'erreur). */
export async function getOrSet<T>(
  key: string,
  ttlSeconds: number,
  loader: () => Promise<T>,
): Promise<T>;
```

- Clés : `${REDIS_PREFIX}cache:${key}`. Sérialisation JSON (`JSON.stringify`/`parse`).
- `cacheSet` : `client.set(key, json, { EX: ttlSeconds ?? REDIS_CACHE_TTL_SECONDS })`.
- **Jamais d'exception** propagée par le cache : toute erreur Redis est `console.error` + repli loader.

### 3.4 `server/src/session/store.ts` (NOUVEAU)

```ts
import type session from 'express-session';

export interface SessionStoreChoice {
  kind: 'redis' | 'pg';
  /** Store Redis prêt à l'emploi, ou undefined si kind==='pg' (app.ts construit connect-pg-simple). */
  store: session.Store | undefined;
}

export function buildSessionStore(): SessionStoreChoice;
export async function closeSessionStore(): Promise<void>;  // ferme le store Redis si kind==='redis'
```

- `kind==='redis'` ⇒ `new RedisStore({ client: getRedisClient()!, prefix: `${REDIS_PREFIX}sess:` })` (API connect-redis v10, cf. §0).
- `kind==='pg'` ⇒ `store: undefined` ; `app.ts` conserve **à l'identique** le code `connect-pg-simple` actuel (`app.ts:44-66`).
- Le cookie reste `name: 'connect.sid'`, `rolling: true`, `maxAge: 7j`, `sameSite: 'lax'`, `secure: isProduction`, `httpOnly: true`.

### 3.5 `server/src/middleware/instance-id.ts` (NOUVEAU)

```ts
import type { NextFunction, Request, Response } from 'express';

/** Pose X-Instance-Id sur TOUTE réponse (avant le rate-limit). */
export function instanceId(req: Request, res: Response, next: NextFunction): void;
```
- Implémentation : `res.setHeader('X-Instance-Id', config.instanceId); next();`.
- Monté **en premier** dans `createApp()`, avant `helmet`/`express.json`, pour que même les `429`/`503` portent l'en‑tête.

### 3.6 `server/src/middleware/rate-limit.ts` (MODIFIÉ)

```ts
import type { NextFunction, Request, Response } from 'express';

export interface RateLimitOptions {
  windowMs: number;
  max: number;
  /** Isole les compteurs entre limiteurs (ex. 'auth', 'global'). */
  scope?: string;
}
export type RateLimitMiddleware = (req: Request, res: Response, next: NextFunction) => Promise<void>;

export function rateLimit(options: RateLimitOptions): RateLimitMiddleware;

/** Dernier backend effectivement utilisé (pour tests). */
export function rateLimitBackend(): 'redis' | 'memory';
```

**Comportement figé**
- `NODE_ENV === 'test'` ⇒ **bypass total** (préservé, `rate-limit.ts:15`).
- Clé Redis : `${REDIS_PREFIX}rl:${scope ?? 'default'}:${req.ip ?? 'unknown'}`.
- Algorithme : script Lua atomique `INCR` + `PEXPIRE` au 1er incrément (`eval` node-redis v6 : `client.eval(script, { keys: [key], arguments: [String(windowMs)] })`).
- **Repli mémoire automatique** si `RATE_LIMIT_BACKEND=memory` OU Redis absent/erreur : `Map` locale, fenêtre fixe, **comportement strictement identique** à l'actuel.
- Réponse inchangée : `429` + en‑tête `Retry-After` + corps `{ error: { code: 'RATE_LIMITED', message } }`. **Ne pas changer le contrat** (test `perf-v5.test.ts`).
- Ordre de montage inchangé : auth (`scope:'auth'`, 20/10 min) **avant** global (`scope:'global'`, 300/min) ; health montés avant.

### 3.7 `server/src/routes/cluster.routes.ts` (NOUVEAU) — probe enrichie

```ts
import type { Router } from 'express';
export const clusterRouter: Router;   // GET /api/cluster/health
```
- `GET /api/cluster/health` → `200` :
  ```json
  {
    "status": "ok",
    "instanceId": "api2",
    "uptimeSeconds": 1234,
    "redis": { "used": true, "ready": true },
    "rateLimit": { "backend": "redis" },
    "cache": { "enabled": true, "ttlSeconds": 60 },
    "cluster": {
      "shardCount": 2,
      "failoverEnabled": true,
      "autoPromote": true,
      "shards": {
        "0": { "primaryUp": true, "replicaUp": true, "activeWrite": "primary" },
        "1": { "primaryUp": true, "replicaUp": true, "activeWrite": "primary" }
      }
    }
  }
  ```
- Monté **avant** le limiteur global (comme `/health`), pour ne pas être limité.

> ⚠️ **`GET /health` et `GET /api/health` NE CHANGENT PAS** : corps `200 {"status":"ok"}` maintenu (CA‑V5‑091, `app.ts:77-81`, test `perf-v5.test.ts:219-226`). L'enrichissement passe **uniquement** par (a) l'en‑tête `X-Instance-Id` ajouté partout et (b) le nouveau `GET /api/cluster/health`. Ne pas ajouter de champs au corps de `/api/health`.

### 3.8 `server/src/config.ts` (MODIFIÉ — clés ajoutées à `config`)

```ts
export const config = {
  // … existant inchangé …
  instanceId: string,
  sessionStore: 'redis' | 'pg',
  cacheEnabled: boolean,
  redis: { url: string; prefix: string; connectTimeoutMs: number; cacheTtlSeconds: number },
  rateLimit: { backend: 'redis' | 'memory' },
  cluster: {
    shardCount: number,
    failoverEnabled: boolean,
    autoPromote: boolean,
    healthcheckMs: number,
    healthcheckTimeoutMs: number,
    /** nodes[shard] = { primary, replica } — construit depuis SHARDn_*_URL, repli DATABASE_URL. */
    nodes: ShardNode[],
  },
};
```
- Ajout au `envSchema` zod : toutes les variables du §2.1, avec `.default(...)` et `.transform((v)=>v==='true')` pour les booléens (même style que `DISABLE_CRON`).
- Garde-fou production : si `DB_SHARD_COUNT > 1` et qu'une `SHARDn_*_URL` manque (et pas de `DATABASE_URL`), `process.exit(1)` avec message explicite.

### 3.9 `server/src/db/migrate.ts` (MODIFIÉ — multi-shards)

```ts
export async function migrate(): Promise<string[]>;
```
- Boucle sur `for (const shard of 0..config.cluster.shardCount-1)` et exécute les migrations contre `getPool(shard, 'primary')`.
- Prend un **verrou consultatif** PostgreSQL avant d'appliquer : `SELECT pg_advisory_lock(hashtext('revends:migrate'))` … `pg_advisory_unlock`. Idempotence conservée (`schema_migrations` déjà présent).
- Les replicas reçoivent le schéma par **WAL streaming** : aucune migration à lancer sur les replicas.

---

## 4. Stratégie de données et périmètre V1 (honnête)

### 4.1 Principe : clé de shard = `user.id`

Toutes les lignes d'un même utilisateur vivent sur `shardOf(user.id)`. Les FK **intra-utilisateur** (`products.owner_id`, `orders.buyer_id`, `notifications.user_id`, `product_images.product_id`, `payments.order_id`, `seller_payouts.order_id`) tiennent **dans le shard**.

### 4.2 Répartition des tables

| Classe | Tables | Emplacement | Justification |
|---|---|---|---|
| **Broadcast** (petites, lecture intensive, identiques sur chaque shard) | `users`, `categories`, `banners`, `admin_actions`, `schema_migrations` | Copie sur **chaque** shard. Vérité = **shard 0** (écrite là), répliquée vers shard 1 (V1 : double-écriture best-effort via `db/replicate-reference.ts`). | Rend les JOIN locaux possibles (produit→vendeur, produit→catégorie) et **conserve les FK `*→users`** partout. |
| **Shardées** par `shardOf(user.id)` | `products`, `product_images`, `orders`, `order_events`, `payments`, `seller_payouts`, `notifications`, `reservations` | Shard calculé | Volumétrie, co-localisation par utilisateur. |
| **Session** | ~~`session`~~ | **Redis** (`SESSION_STORE=redis`) | Plus de table session en Postgres (garde la table si `SESSION_STORE=pg`). |

> Décision d'architecte (à confirmer, §8-D2) : je recommande **`users` en broadcast** plutôt que shardé. Si `users` était shardé, (a) le login (recherche par email) exigerait un annuaire global `email → shard`, (b) les FK `orders.*_id → users` traverseraient les shards. Le broadcast lève ces deux problèmes pour un coût mémoire négligeable (table petite). Si le chef de projet impose `users` shardé, il faut un `user_directory` (hors périmètre V1).

### 4.3 Migration progressive du code (compat obligatoire)

1. **Étape 0** — `db/pool.ts` ré-exporte `pool = getPool(0,'primary')` : **rien ne casse**, tous les services existants compilent et fonctionnent.
2. **Étape 1** — migrer les chemins **cacheables** : `categories.service.listPublicCategories` et `banners.service.listBanners` passent par `getOrSet(...)` + `queryShard(0,'replica', …)`.
3. **Étape 2** — migrer le **catalogue** (`products.service.getCatalog`) et les lectures par identifiant vers `queryShard(shardOf(ownerId),'replica', …)`.
4. **Étape 3** — migrer les **écritures** produit/commande vers `queryShard(shard,'primary', …)`.
5. **Hors périmètre démo** : requêtes **admin globales** (`admin.service` : stats, listes traversant tous les users) → nécessitent du **scatter-gather** (fan-out sur tous les shards + fusion). Les laisser sur `pool` (shard 0) en V1 et **documenter** la dette.

### 4.4 Limitation V1 explicite (cross-shard)

Une commande lie un acheteur et un vendeur qui peuvent tomber sur **deux shards différents**. Aucune transaction atomique ne couvre 2 shards.
- V1 : la commande est écrite sur `shardOf(buyer_id)` ; les écritures concernant le vendeur (payout, notification) sont **best-effort** (tentées, erreur loggée, pas de rollback cross-shard) → **incohérence possible en cas d'échec partiel**. V2 : saga + compensation. **À assumer explicitement.**

---

## 5. Arborescence cible (chemins exacts, relatifs à `revends/`)

```
server/
├── package.json                                  MODIFIÉ  (+ "redis@^6.3.0", + "connect-redis@^10.0.0")
├── .env.example                                  MODIFIÉ  (ajoute §2.1)
├── Dockerfile                                    INCHANGÉ (image unique réutilisée par api1/2/3)
├── docker-compose.distributed.yml                NOUVEAU  (lb + api1..3 + redis + pg0/pg1 ×2)
├── nginx/
│   └── nginx.conf                                NOUVEAU
├── docker/postgres/
│   ├── primary-init/00-replication.sh            NOUVEAU  (rôle replicator + pg_hba + slots)
│   └── replica-init/10-basebackup.sh             NOUVEAU  (pg_basebackup … -R)
├── src/
│   ├── config.ts                                 MODIFIÉ  (§3.8)
│   ├── app.ts                                    MODIFIÉ  (instanceId, buildSessionStore, clusterRouter)
│   ├── index.ts                                  MODIFIÉ  (connectRedis, startHealthChecks, closeRedis, arrêt propre)
│   ├── db/
│   │   ├── cluster.ts                            NOUVEAU  (§3.1)
│   │   ├── pool.ts                               MODIFIÉ  (§3.2)
│   │   ├── migrate.ts                            MODIFIÉ  (§3.9 multi-shards + advisory lock)
│   │   └── replicate-reference.ts                NOUVEAU  (V1, best-effort : double-écriture des tables broadcast vers tous les shards — cf. §4.2)
│   ├── cache/
│   │   └── redis.ts                              NOUVEAU  (§3.3)
│   ├── session/
│   │   └── store.ts                              NOUVEAU  (§3.4)
│   ├── middleware/
│   │   ├── instance-id.ts                        NOUVEAU  (§3.5)
│   │   └── rate-limit.ts                         MODIFIÉ  (§3.6)
│   └── routes/
│       └── cluster.routes.ts                     NOUVEAU  (§3.7)
└── test/
    └── distributed.test.ts                       NOUVEAU  (à écrire par @tester — voir §6)
```

---

## 6. Vérifiabilité — commandes d'intégration exactes (pour @tester)

> L'hôte n'a **ni `nginx` ni `redis-cli`** : tous les tests passent par `docker`. Base de départ :
> `cd server && docker compose -f docker-compose.distributed.yml up -d --build` puis attendre `docker compose ps` = tous `healthy`.

### 6.1 Round-robin + identité d'instance

```bash
# 6 requêtes consécutives → l'instance change à chaque fois (cycle api1→api2→api3)
for i in $(seq 1 6); do
  curl -s -D - -o /dev/null http://localhost:8080/api/health | grep -i '^x-instance-id'
done
# Attendu : api1, api2, api3, api1, api2, api3 (dans un ordre cyclique)
# Debug du LB lui-même :
curl -s -D - -o /dev/null http://localhost:8080/api/health | grep -i '^x-upstream'
```

### 6.2 Session partagée multi-instance

```bash
# Login via le LB, on garde le cookie
curl -s -c /tmp/opencode/cj.txt -X POST http://localhost:8080/api/auth/login \
     -H 'Content-Type: application/json' -d '{"email":"admin@revends.com","password":"Admin123!"}'
# 10 requêtes authentifiées : elles tombent sur des instances différentes, toutes OK
for i in $(seq 1 10); do
  curl -s -b /tmp/opencode/cj.txt -D - -o /dev/null http://localhost:8080/api/me \
    | grep -iE '^(HTTP|x-instance-id)'
done
# La session est bien dans Redis :
docker compose -f server/docker-compose.distributed.yml exec redis redis-cli --scan --pattern 'revends:sess:*'
```

### 6.3 Cache Redis

```bash
curl -s http://localhost:8080/api/categories >/dev/null
curl -s http://localhost:8080/api/banners    >/dev/null
docker compose -f server/docker-compose.distributed.yml exec redis redis-cli --scan --pattern 'revends:cache:*'
docker compose -f server/docker-compose.distributed.yml exec redis redis-cli TTL revends:cache:categories   # ~60
docker compose -f server/docker-compose.distributed.yml exec redis redis-cli INFO stats | grep keyspace_hits
```

### 6.4 Rate-limit partagé

```bash
# 301 requêtes réparties sur les 3 instances → au moins un 429 (compteur PARTAGÉ)
bash -c 'for i in $(seq 1 301); do curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8080/api/products; done' | sort | uniq -c
docker compose -f server/docker-compose.distributed.yml exec redis redis-cli --scan --pattern 'revends:rl:*'
```

### 6.5 Routage shard

```bash
# Créer des données via l'API, puis vérifier qu'elles se répartissent sur les 2 primaires :
docker compose -f server/docker-compose.distributed.yml exec pg0-primary \
  psql -U revends -d revends -c 'SELECT count(*) FROM users'
docker compose -f server/docker-compose.distributed.yml exec pg1-primary \
  psql -U revends -d revends -c 'SELECT count(*) FROM users'
# Vérifier la réplication de chaque shard :
docker compose -f server/docker-compose.distributed.yml exec pg0-primary \
  psql -U revends -d revends -c 'SELECT state, sync_state FROM pg_stat_replication'
```

### 6.6 Failover / retour à la normale

```bash
# 1) État initial
curl -s http://localhost:8080/api/cluster/health | grep -o '"activeWrite":"[a-z]*"' | sort | uniq -c
# 2) Tuer le primary du shard 0 (CLUSTER_AUTO_PROMOTE=true dans la démo)
docker compose -f server/docker-compose.distributed.yml stop pg0-primary
sleep 12   # > CLUSTER_HEALTHCHECK_MS ×2
curl -s http://localhost:8080/api/cluster/health      # primaryUp=false, activeWrite='replica'
# 3) Les lectures/écritures restent servies :
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8080/api/products
# 4) Rétablir : l'ancien primary DOIT être re-synchronisé (voir R4)
docker compose -f server/docker-compose.distributed.yml start pg0-primary
```

### 6.7 Non-régression de la suite existante

```bash
cd server && npm test        # les 235 tests doivent rester verts
# ATTENTION : perf-v5.test.ts interdit « redis » dans package.json → ce test DOIT être réécrit (R0)
```

---

## 7. Risques + actions (skill `gestion-risques`)

| # | Risque | Impact × Probabilité | Action |
|---|---|---|---|
| **R0 🔥** | **`test/perf-v5.test.ts` vérifie l'ABSENCE des deps `redis`/`ioredis`/`cache-manager`/`node-cache`** (encodage de PO‑V5‑17 « mono-instance »). Ajouter `redis` fait **échouer** la suite existante. | Bloquant × Certain | **Réécrire** ce test (pas le supprimer en silence) : il doit désormais vérifier que le rate-limit **utilise bien un compteur partagé** et **repli mémoire** quand Redis est absent. → action @tester + validation chef de projet (§8-D1). |
| **R1 ⚠️** | `DB_SHARD_COUNT` modifié ⇒ `shardOf` remappe toutes les clés (modulo). Les données existantes se retrouvent « sur le mauvais shard ». | Élevé × Moyen | V1 : `DB_SHARD_COUNT` figé à 2, jamais modifié après des écritures. V2 : hash consistant (anneau). Documenter l'interdiction. |
| **R2 ⚠️** | **3 instances lancent `migrate` + le cron au boot** → course sur `schema_migrations` et cron exécuté 3×. | Élevé × Élevé | `RUN_MIGRATIONS=false` sur api2/api3 + `DISABLE_CRON=true` sur api2/api3 ; **et** verrou `pg_advisory_lock` dans `migrate.ts` (§3.9). |
| **R3 ⚠️** | **Redis = point unique de défaillance.** Redis tombe ⇒ sessions cassées, rate-limit en repli, cache désactivé. | Élevé × Moyen | Redis `appendonly yes` + volume (persistance). En démo, accepter le SPOF ; V2 : Redis Sentinel/Cluster. Le repli mémoire du rate-limit et le passe-plat cache limitent la casse. |
| **R4 🔥** | **Failover d'écriture impossible sans promotion** : un replica streaming est **read-only** (`hot_standby`). Basculer les écritures dessus sans `pg_promote()` ⇒ erreurs `read-only transaction`. Le retour de l'ancien primary non re-synchronisé ⇒ **split-brain**. | Bloquant × Moyen | `CLUSTER_AUTO_PROMOTE=true` (démo) exécute `pg_promote()` sur le replica. **Le retour de l'ancien primary exige une re-synchronisation** (`pg_rewind` ou re-`pg_basebackup`) — **script manuel documenté, PAS automatique en V1**. Sinon, laisser `CLUSTER_AUTO_PROMOTE=false` (failover **lecture seule** + `503` sur écriture). Décision §8-D3. |
| **R5 ⚠️** | **Ordre de démarrage** : le replica fait `pg_basebackup` **avant** que le primary accepte les connexions de réplication ⇒ échec du replica. | Moyen × Moyen | `depends_on: { pg0-primary: { condition: service_healthy } }` + healthcheck `pg_isready`. `pg_basebackup -U replicator -h pg0-primary … -R` avec `wait`/retry. |
| **R6 ⚠️** | **Hostname inscrit dans `primary_conninfo`** : `pg_basebackup -h pg0-primary` écrit `host=pg0-primary` dans `postgresql.auto.conf`. Si le nom de service change (ou DNS non résolu), la réplication casse **au prochain redémarrage**. | Moyen × Moyen | Nommer les services compose de façon stable ; après un `-R`, vérifier `postgresql.auto.conf`. **Ne jamais renommer** les services PG. |
| **R7 ⚠️** | **Sessions non migrées** : les sessions `connect-pg-simple` existantes (table `session`) ne sont pas dans Redis ⇒ tous les utilisateurs connectés doivent se re-logger au basculement. | Faible × Certain | Accepté en démo (fenêtre de bascule). Documenter. |
| **R8 INFO** | **Cache obsolète** : `getOrSet` sur categories/banners (TTL 60 s) ⇒ une modération admin peut être invisible 60 s. | Faible × Élevé | `cacheDel` explicite après `PATCH /api/admin/categories` et modif bannières (à câbler). TTL court limite l'impact. |
| **R9 INFO** | `X-Forwarded-For` : `req.ip` derrière nginx + `trust proxy=1` (déjà en prod). En dev il faut `trust proxy` sinon toutes les IP vues = celle de nginx (rate-limit faux). | Moyen × Moyen | Vérifier `app.set('trust proxy', 1)` actif aussi en compose (NODE_ENV=production). |

---

## 8. Points à trancher tôt (bloquants pour @backend)

| # | Décision | Options | Ma recommandation |
|---|---|---|---|
| **D1** | Réécriture du test « aucune dépendance Redis » (`perf-v5.test.ts`) | (a) réécrire pour prouver le compteur partagé ; (b) désactiver | **(a)** — cohérent avec l'objectif distribué ; formaliser que PO‑V5‑17 est **remplacé** par cette architecture. |
| **D2** | `users` : **broadcast** vs shardé | (a) broadcast (recommandé) ; (b) shardé + `user_directory` | **(a)** — conserve les FK, évite un annuaire. Coût : table répliquée sur 2 shards. |
| **D3** | Failover écriture : **auto-promote** ou read-only | (a) `CLUSTER_AUTO_PROMOTE=true` (démo) ; (b) `false` + `503` écriture | **(a) pour la démo** (exigence « basculer les écritures »), **(b) pour la prod**. Le retour du primary doit être **manuel** (re-basebackup). |
| **D4** | Périmètre du sharding V1 | (a) router + 3 chemins migrés (categories/banners/catalogue) ; (b) tout migrer | **(a)** — prouvable et testable ; le reste sur `pool` (shard 0). Scatter-gather admin = V2. |
| **D5** | `SESSION_STORE` par défaut | (a) `redis` ; (b) `pg` | **(a)** en compose ; les **tests locaux** gardent `pg`/`memory` pour ne pas exiger Redis. |

---

## 9. Ce que @backend et @devops implémentent sans se reparler

- **@backend** : §3.1–3.9 (modules + config), §4.3 étapes 0‑2, §6 pour auto‑vérifier, en respectant §3.6 (contrat 429 inchangé) et §3.7 (ne pas toucher `/api/health`).
- **@devops** : §2.2–2.3 (compose + nginx), `docker/postgres/*` (réplication §0/§7-R5-R6), `RUN_MIGRATIONS`/`DISABLE_CRON`/`INSTANCE_ID` par service, healthchecks, volumes.
- **@tester** : §6 + réécriture R0/D1.
