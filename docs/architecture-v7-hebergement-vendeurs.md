# ARCHITECTURE TECHNIQUE V7 — « Hébergement des vendeurs — Abonnements & boutique dédiée »

| | |
|---|---|
| **Version** | 1.1 — **17/11/2026** |
| **Auteur** | Agent `@architecte` (Big Pickle), pour l'équipe projet ReVends |
| **Statut** | **Architecture validée — arbitrages définitifs du chef de projet intégrés** (§2.2, §4.2, §8) |
| **Source de vérité fonctionnelle** | `docs/cahier-des-charges-v7-hebergement-vendeurs.md` (45 critères `CA-V7-xxx`, validé le 17/11/2026) |
| **Conventions existantes consultées** | `docs/architecture.md` (V2→V4) · `docs/api.md` **v2.6** §1.1/§1.4/§3.2/§5 · `docs/architecture-v5.md` · `server/src/app.ts` · `server/src/routes/products.routes.ts` · `server/src/middleware/auth.ts` · `server/src/middleware/errors.ts` · `server/src/utils/errors.ts` · `server/src/db/migrate.ts` · `server/migrations/018_referrals.sql` · `web/src/App.tsx` · `web/src/lib/api.ts` · `vercel.json` · `docs/rapport-final-v6.md` |
| **Nature** | **Document additif** : il s'ajoute aux architectures V1→V6 sans les amender. Aucune ligne de code, aucun test, aucun déploiement réalisé dans cette mission. |
| **Périmètre cible** | Web (React + Vite) + API (Express + TypeScript + PostgreSQL). **Aucune cible mobile native en V7** (cohérent V1→V6, cahier §2.2). |

> **Règle d'or de cette architecture** : *tout est ajouté, rien n'est modifié dans l'existant.* **Zéro objet existant modifié, y compris les types/enums.** Un vendeur au quota boutique atteint continue de créer et de vendre des articles dans le catalogue. Le statut d'une annonce de boutique est **dérivé en lecture** de `products.status` ; la table de liaison ne contient aucun `status`.

---

## 1. Vue d'ensemble et principes additifs

### 1.1 Reformulation du problème

V7 doit ajouter, sans toucher au parcours de vente existant, (a) un **forfait d'hébergement** choisi par le vendeur et activé manuellement par l'admin, (b) une **boutique publique** `/boutique/:slug` avec un **quota d'annonces dédié**, et (c) un **espace abonné privé** `/mon-abonnement`. Le quota ne s'applique **qu'à la vitrine**, jamais au catalogue : c'est le garde-fou central (CA-V7-003/004/031/033/038).

### 1.2 Principes directeurs (non négociables)

| # | Principe | Conséquence technique directe |
|---|---|---|
| P1 | **Additivité stricte du schéma** | 3 nouvelles tables uniquement. Aucune colonne ajoutée à une table préexistante, aucun type/enum existant modifié : `notification_type` reste inchangé, la valeur `product.contact` est réutilisée (CA-V7-001, arbitrage chef de projet §8). |
| P2 | **Aucun handler existant modifié** | `POST /api/products`, catalogue, fiche, commandes, checkout, paiement, payouts, notifications existants : 0 ligne modifiée. Nouveaux routeurs dédiés, montés additivement dans `app.ts`. |
| P3 | **Statut dérivé, jamais stocké sur la liaison** | `storefront_listings` = `(product_id, subscription_id, created_at, withdrawn_at)` uniquement. Aucun `status`, aucun trigger sur `products`, aucun compteur dénormalisé, aucun cron, aucun reset mensuel (CA-V7-031/036/037/038). |
| P4 | **Contrôle de quota en un seul point** | Uniquement dans `POST /api/storefront/listings`. Aucun autre point d'entrée ne consulte le quota (CA-V7-038). |
| P5 | **Séparation des préoccupations** | Abonnement / listing boutique / catalogue sont trois flux indépendants. Une vente modifie `products.status` via le pipeline existant ; la boutique le **lit**. |
| P6 | **Prix et quotas en base** | Les 3 paliers sont seedés dans la migration `019`. Aucun tarif codé en dur dans le front (CA-V7-010). |
| P7 | **Pas de paiement, pas de nouveau rôle** | Aucun checkout abonnement, webhook ou cron. `user`/`admin` uniquement ; `requireAuth` / `requireAdmin` réutilisés (CA-V7-002/014/052). |
| P8 | **Confidentialité par construction** | Le sérialiseur public de la boutique n'expose que `displayName` + `memberSince` (année, `users.created_at`) depuis le fix du 17/11/2026. Jamais `phone`, `email`, `whatsapp`, `tel:`, `mailto:` (CA-V7-026/046). |
| P9 | **Indépendance du parrainage** | Aucune lecture/écriture de `referred_by`, `ambassador_until`, `vitrine_until`, `referral_qualifications` (CA-V7-054). |
| P10 | **Simplicité** | SQL brut via le pool `pg` existant, zod pour la validation, aucun ORM, aucune nouvelle librairie, aucun workspace npm. |

### 1.3 Stack — réutilisation stricte de l'existant (aucune nouvelle librairie)

Vérifié sur `server/package.json` et `web/package.json` au 17/11/2026. Aucune API GitHub/SDK externe nouvelle n'est introduite : le skill `docs-officielles` n'est donc pas nécessaire (consigne : « sinon réutilise strictement l'existant »).

| Couche | Choix réellement présent dans le dépôt | Usage V7 |
|---|---|---|
| Backend | Express **5.2.1**, TypeScript **7.0.2**, Node ≥ 22.12 | Nouveaux routeurs `Router()` ; erreurs async propagées automatiquement (Express 5). |
| BDD | PostgreSQL via `pg` **8.23.0**, SQL brut, pool unique `db/pool.ts` | 3 tables + index ; requêtes paramétrées ; `SELECT … FOR UPDATE` pour la concurrence du quota. |
| Validation | zod **4.6.5** (serveur) | Nouveaux schémas dans un fichier **dédié** `utils/storefront-validation.ts` (aucune édition de `utils/validation.ts`). |
| Auth / RBAC | `express-session` + `requireAuth` / `requireUser` / `requireAdmin` existants | Réutilisés tels quels, sans nouveau rôle. |
| Sécurité | helmet 8.3, CSRF double soumission, `rateLimit` (Redis/mémoire), CORS liste blanche | Appliqués automatiquement aux nouvelles routes ; un nouveau **scope** de limiteur pour le contact. |
| Front | React **19.3**, Vite **7.3.6**, react-router **7.18**, Tailwind **4.3.3**, TanStack Query **5.103**, zod 3.25 | Nouvelles vues/pages/components ; helpers dans `lib/storefront.ts`. |
| Déploiement | Vercel serverless (entrée Express), `RUN_MIGRATIONS=false` en prod | Migration manuelle obligatoire **avant** le code (§8). |

> **Note de cohérence documentaire** : `docs/architecture.md` (V2) cite `server/src/db/migrations/`. Le dépôt réel utilise **`server/migrations/`** (018 incluse). Toute référence V7 pointe vers le chemin réel `server/migrations/`. Le fichier V7 s'appellera **`019_storefront.sql`** (successeur lexicographique de `018_referrals.sql`, §8.3).

### 1.4 Vue d'ensemble des flux

```
[ Vendeur ]  POST /api/subscriptions {planId, slug}
                  │  (requireAuth)
                  ▼
        seller_subscriptions (PENDING) ──slug réservé au vendeur──┐
                  │                                     │
        [ Admin ] POST /api/admin/subscriptions/:id/activate
                  │  (requireAdmin, transaction)
                  ▼  set started_at/ends_at/activated_by/at
        seller_subscriptions (ACTIVE) ──30 j glissants──┤
                  │                                      │
    ┌─────────────┴──────────────┐                        │
    ▼                            ▼                        │
POST /api/storefront/      GET /api/storefront/:slug     │
listings {productId}       (public, 200 / 404)           │
    │  COMPTE (jointure)         │  SELECT … status=ACTIVE│
    │  products.status           │  AND ends_at > now()   │
    ▼                            ▼                        │
storefront_listings ──────► Boutique publique  ◄──────────┘
(withdrawn_at, pas de status)   + POST …/:slug/contact
                                      │
                                      ▼
                          notifications (type product.contact existant,
                          titre boutique + expéditeur) → 201 { ok, notificationId }

    [ Catalogue / vente ] ── pipeline EXISTANT inchangé ──► products.status = SOLD
                                                            │
                                      quota recalculé en lecture (9/10) ✅
                                      AUCUNE écriture V7 dans ce pipeline ❌
```

**Synchronisation web/mobile** : il n'y a pas de mobile natif en V7. Les endpoints étant REST et agnostiques (cookie HTTP-only same-origin, pas de CORS pour le web), une future app RN pourra les consommer tels quels ; aucun travail d'adaptation n'est fait ici.

---

## 2. Modélisation des données — 3 nouvelles tables (DDL PostgreSQL complète)

### 2.0 Garantie d'additivité — vérification avant écriture

- **0 colonne ajoutée à une table existante.** Aucun `ALTER TABLE ... ADD COLUMN`, aucun `ALTER TABLE ... DROP COLUMN`, aucun `ALTER TABLE ... ALTER COLUMN` dans `019_storefront.sql`.
- **0 modification de `users`, `products`, `orders`, `notifications`, `referral_qualifications`.**
- **0 trigger sur `products`** (`grep -rn 'CREATE TRIGGER' server/migrations/019_storefront.sql` → vide).
- **0 objet existant modifié, y compris les types/enums** : `notification_type` est strictement inchangé. La notification de contact boutique réutilise la valeur existante `product.contact` (V4/N14, conservée en base en V5 — CA-V5-099) avec un titre qui précise la boutique et l'expéditeur (§2.4, §4.2(6)). Décision définitive du chef de projet : R-V7-A3 clos (§8).
- Les 3 tables portent un préfixe cohérent et n'utilisent aucun nom de contrainte déjà présent dans `middleware/errors.ts` (sauf ajout de mapping volontaire, §5.1).

### 2.1 Table 1 — `subscription_plans` (référentiel des forfaits)

```sql
-- ============================================================================
-- 019_storefront.sql — V7 HÉBERGEMENT DES VENDEURS (PostgreSQL 15+)
-- Prérequis : 001 → 018 appliqués. Exécuté par migrate.ts dans BEGIN/COMMIT.
-- ADDITIF : aucune colonne ajoutée à une table existante, aucun type/enum existant modifié.
-- ============================================================================

-- ---------- 1. RÉFÉRENTIEL DES FORFAITS ----------
CREATE TABLE IF NOT EXISTS subscription_plans (
    id            BIGSERIAL PRIMARY KEY,
    name          VARCHAR(40) NOT NULL UNIQUE,           -- 'Découverte' | 'Boutique' | 'Atelier'
    price_fcfa    INTEGER     NOT NULL CHECK (price_fcfa > 0),   -- entier FCFA, jamais 0 (CA-V7-010)
    quota         INTEGER     NOT NULL CHECK (quota > 0),        -- annonces de BOUTIQUE simultanées
    duration_days SMALLINT    NOT NULL DEFAULT 30 CHECK (duration_days = 30), -- 30 j glissants (PO-V7-03)
    active        BOOLEAN     NOT NULL DEFAULT TRUE,              -- désactivation future sans CRUD
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE  subscription_plans IS 'Forfaits d''hébergement V7 — prix/quota en base, jamais en dur dans le front';
COMMENT ON COLUMN subscription_plans.quota IS 'Nombre d''annonces de boutique actives simultanées (PENDING|AVAILABLE|RESERVED), pas le nombre de produits du catalogue';

-- Seed définitif (validé utilisateur le 17/11/2026, PO-V7-01/02). IDs explicites
-- pour stabilité des FK, idempotent (rejouable après rollback partiel).
INSERT INTO subscription_plans (id, name, price_fcfa, quota, duration_days, active) VALUES
    (1, 'Découverte', 2000,  10, 30, TRUE),
    (2, 'Boutique',   5000,  30, 30, TRUE),
    (3, 'Atelier',   10000, 100, 30, TRUE)
ON CONFLICT (id) DO NOTHING;
SELECT setval(pg_get_serial_sequence('subscription_plans', 'id'),
              GREATEST((SELECT MAX(id) FROM subscription_plans), 1), true);
```

**Contraintes clés** : `name UNIQUE`, `price_fcfa > 0` (entier), `quota > 0`, `duration_days = 30` figé en base, `active` par défaut `TRUE`.

### 2.2 Table 2 — `seller_subscriptions` (abonnements)

```sql
-- ---------- 2. ENUM DE STATUT (nouveau type, aucun existing modifié) ----------
CREATE TYPE subscription_status AS ENUM ('PENDING', 'ACTIVE', 'EXPIRED', 'CANCELLED');

-- ---------- 3. ABONNEMENTS VENDEUR ----------
CREATE TABLE IF NOT EXISTS seller_subscriptions (
    id            BIGSERIAL PRIMARY KEY,
    seller_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plan_id       BIGINT NOT NULL REFERENCES subscription_plans(id) ON DELETE RESTRICT,
    status        subscription_status NOT NULL DEFAULT 'PENDING',
    slug          VARCHAR(40) NOT NULL,                  -- normalisé, format checké (§2.5)
    supersedes_id BIGINT REFERENCES seller_subscriptions(id) ON DELETE SET NULL, -- changement de forfait uniquement : cible l'ACTIVE du connecté (§2.2, §3.3)
    started_at    TIMESTAMPTZ,                           -- = activated_at, début effectif
    ends_at       TIMESTAMPTZ,                           -- = activated_at + 30 jours
    activated_by  BIGINT REFERENCES users(id) ON DELETE SET NULL, -- admin ayant activé (traçabilité)
    activated_at  TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_subscription_slug_format
        CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' AND char_length(slug) BETWEEN 3 AND 40),
    -- Un PENDING n'a AUCUNE date d'activation ; un ACTIVE/EXPIRED/CANCELLED en a une.
    CONSTRAINT chk_activation_pair CHECK (
        (status = 'PENDING') = (activated_at IS NULL AND activated_by IS NULL
                                AND started_at IS NULL AND ends_at IS NULL)
    ),
    -- Une fenêtre active est toujours bornée et postérieure à son début.
    CONSTRAINT chk_active_window CHECK (
        status <> 'ACTIVE' OR (started_at IS NOT NULL AND ends_at IS NOT NULL AND ends_at > started_at)
    ),
    -- supersedes_id ne peut pas pointer vers soi-même.
    CONSTRAINT chk_supersedes_not_self CHECK (supersedes_id IS NULL OR supersedes_id <> id)
);

-- Un seul ACTIVE par vendeur (CA-V7-011/015) — unicité partielle.
CREATE UNIQUE INDEX IF NOT EXISTS uq_one_active_subscription_per_seller
    ON seller_subscriptions (seller_id) WHERE status = 'ACTIVE';

-- Un slug public ne résout que vers UNE boutique ACTIVE (filet DB, CA-V7-020/024).
-- La réservation « à vie » est attachée au VENDEUR (tous statuts, cross-sellers),
-- indépendamment de supersedes_id. Elle est vérifiée dans le service (point
-- d'écriture unique, §2.5) : changement de forfait ET re-souscription après
-- EXPIRED/CANCELLED réutilisent SON slug. D'où l'index PARTIEL.
CREATE UNIQUE INDEX IF NOT EXISTS uq_active_subscription_slug
    ON seller_subscriptions (slug) WHERE status = 'ACTIVE';

CREATE INDEX IF NOT EXISTS idx_seller_subscriptions_seller
    ON seller_subscriptions (seller_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_seller_subscriptions_pending
    ON seller_subscriptions (created_at) WHERE status = 'PENDING';   -- file admin (CA-V7-051)

COMMENT ON COLUMN seller_subscriptions.supersedes_id IS
    'Changement de forfait uniquement : cible l''abonnement ACTIVE du vendeur connecté. NULL pour une souscription initiale ou une re-souscription après EXPIRED/CANCELLED (slug récupéré par réservation par vendeur, indépendamment de ce champ)';
```

**Contraintes clés** : FK `seller_id → users`, FK `plan_id → subscription_plans`, enum 4 états, `slug` formaté (3–40, regex stricte), **unicité partielle `(seller_id) WHERE ACTIVE`**, **unicité partielle `(slug) WHERE ACTIVE`**, `chk_activation_pair`, `chk_active_window`, traçabilité `activated_by/activated_at`, `supersedes_id` (arbitrage approuvé : `ACTIVE` uniquement, §2.2 / §3.3).

#### Arbitrage chef de projet — `supersedes_id` approuvé (R-V7-A1 clos)

Les critères CA-V7-011 et CA-V7-015 semblent contradictoires :

- **CA-V7-011** : l'activation d'un 2ᵉ abonnement du même vendeur → `409 SUBSCRIPTION_ALREADY_ACTIVE` ;
- **CA-V7-015** : un vendeur `ACTIVE` demande `Atelier` → nouvel abonnement `PENDING`, puis son activation **réussit** et l'ancien passe `CANCELLED`.

**Décision définitive du chef de projet (17/11/2026)** : `supersedes_id` est **approuvé**, mais **uniquement pour un changement de forfait** : il cible l'abonnement `ACTIVE` du vendeur connecté. Il s'agit d'une colonne d'une **nouvelle table** (`seller_subscriptions`), donc conforme à l'interdiction d'ajouter une colonne à une table existante. `POST /api/subscriptions` accepte un `supersedesId` optionnel ; le service vérifie qu'il appartient au connecté **et qu'il est `ACTIVE`** (sinon `404 NOT_FOUND` si autre vendeur, `400 INVALID_SUPERSEDES` si statut autre que `ACTIVE`). Le slug est alors copié depuis cette cible `ACTIVE`. À l'activation :

- `supersedesId` renseigné → changement de forfait : `CANCELLED` du prédécesseur + réattach de ses listings actifs, activation réussie (CA-V7-015) ;
- `supersedesId` absent et aucun `ACTIVE` → souscription initiale **ou re-souscription après `EXPIRED`/`CANCELLED`** : nouvelle ligne fraîche, **aucun lien vers l'ancienne ligne** ; le slug du vendeur est récupéré automatiquement par la réservation par vendeur (§2.5), **indépendamment de `supersedes_id`** ;
- `supersedesId` absent et un `ACTIVE` existe déjà → `409 SUBSCRIPTION_ALREADY_ACTIVE` à l'activation (CA-V7-011).

Sans ce champ, aucun mécanisme ne permettrait de distinguer changement de forfait et 2ᵉ demande indépendante pendant un `ACTIVE`. L'arbitrage est clos : aucun plan B n'est requis, le passage à `@backend` n'est plus différé.

### 2.3 Table 3 — `storefront_listings` (annonces de boutique)

```sql
-- ---------- 4. ANNONCES DE BOUTIQUE (SANS COLONNE status) ----------
CREATE TABLE IF NOT EXISTS storefront_listings (
    id              BIGSERIAL PRIMARY KEY,
    product_id      BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    subscription_id BIGINT NOT NULL REFERENCES seller_subscriptions(id) ON DELETE CASCADE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    withdrawn_at    TIMESTAMPTZ                       -- NULL = listing actif ; non NULL = retiré
    -- ❌ AUCUNE colonne status : le statut est dérivé de products.status par jointure.
);

-- Un produit n'est actif que dans UNE seule boutique à la fois (unicité active).
CREATE UNIQUE INDEX IF NOT EXISTS uq_storefront_active_product
    ON storefront_listings (product_id) WHERE withdrawn_at IS NULL;

-- Index de comptage du quota (CA-V7-031) et d'affichage public (CA-V7-025).
CREATE INDEX IF NOT EXISTS idx_storefront_listings_subscription_active
    ON storefront_listings (subscription_id, created_at) WHERE withdrawn_at IS NULL;

COMMENT ON TABLE storefront_listings IS
    'Liaison catalogue ↔ boutique. Le statut affiché est TOUJOURS dérivé de products.status (PENDING|AVAILABLE|RESERVED). Aucun trigger, aucun compteur, aucun cron.';

-- ---------- 5. NOTIFICATION DE CONTACT BOUTIQUE (ZÉRO NOUVEAU TYPE) ----------
-- La valeur 'product.contact' existe déjà dans notification_type (V4/N14),
-- et reste en base après V5 (CA-V5-099). Aucune évolution de type ici :
-- la route V7 réutilise cette valeur avec un titre boutique + expéditeur.
-- Aucune union TypeScript partagée n'est à étendre (§5.1).
```

**Contraintes clés** : FK `product_id → products`, FK `subscription_id → seller_subscriptions`, `withdrawn_at` nullable = seul marqueur de retrait, **unicité active `(product_id) WHERE withdrawn_at IS NULL`**, index de comptage. **Aucune colonne `status`** (vérifiable par `information_schema.columns`, CA-V7-001/031).

### 2.4 Notification boutique — réutilisation de `product.contact`

**Décision définitive du chef de projet : le type `notification_type` n'est pas modifié.** La valeur `product.contact` existe déjà (DDL 008, V4-Accueil, N14) et est conservée en base après V5 (CA-V5-099) : elle est donc réutilisée telle quelle par la route de contact boutique. Seul le `title` porte le contexte V7, par exemple :

> `Nouveau message depuis la boutique « mode-dakar » — De : Aïcha M.`

Le corps reste `De : <displayName>< — <email>>\n\n<message>` (§4.2(6)). Aucune valeur d'enum créée, aucun handler existant modifié, aucune union TypeScript partagée étendue : **0 objet existant modifié, y compris les types/enums**. **R-V7-A3 est clos** (§8).

### 2.5 Normalisation et réservation du slug (règle unique, serveur)

`server/src/utils/storefront.ts` (nouveau) centralise :

| Élément | Règle |
|---|---|
| Normalisation | `trim().toLowerCase()` → espaces (`\s`) → `-` → puis **regex stricte** `^[a-z0-9]+(?:-[a-z0-9]+)*$` (3–40). Aucun caractère hors classe n'est silencieusement transformé : `république`, `mode_dakar`, `x--y` sont **rejetés** (CA-V7-020/022). Le front applique la même normalisation pour l'aperçu, sans autorité. |
| Format accepté | `^[a-z0-9]+(?:-[a-z0-9]+)*$`, longueur **3–40**. Rejette `a`, `ab`, `--x`, `x--y`, `mode_dakar`, `mode.dakar`, `république`, `a/b`, 41 caractères (CA-V7-022). |
| Mots réservés (20) | `admin, api, boutique, catalogue, vendre, mes-articles, mon-abonnement, parrainage, panier, profil, login, register, search, static, assets, health, www, help, contact, legal` → `400 SLUG_RESERVED` (CA-V7-021). Liste figée dans le fichier, **PO-V7-06 ouvert** (§9). |
| Unicité cross-sellers | Dans la **seule** fonction d'écriture : `SELECT seller_id FROM seller_subscriptions WHERE slug = $1 ORDER BY created_at LIMIT 1`. Si trouvé et `seller_id <> current` → `409 SLUG_TAKEN`, quel que soit le statut trouvé (y compris `EXPIRED`/`CANCELLED`) → slug réservé **à vie au vendeur** (CA-V7-020). Si `seller_id = current` → autorisé : changement de forfait **ou** re-souscription. |
| Récupération auto du slug | Si le vendeur n'a plus d'`ACTIVE` et possède déjà un slug (`EXPIRED`/`CANCELLED` compris), le service **remplace** le `slug` reçu par le premier slug possédé par ce vendeur (`ORDER BY created_at ASC LIMIT 1`). Aucun `supersedesId` n'est requis ni autorisé vers une ligne `EXPIRED`/`CANCELLED` : la réservation par vendeur est **indépendante de `supersedes_id`** (décision 17/11/2026). |
| Filet DB | `uq_active_subscription_slug` garantit qu'une boutique publique ne peut jamais résoudre vers deux abonnements `ACTIVE` concurrents. Violation 23505 → mapping `SLUG_TAKEN` (§5.1). |

> La normalisation est faite **côté serveur** (autorité), pas seulement dans le zod front : `Mode Dakar` et `mode-dakar` sont la même clé (CA-V7-020).

### 2.6 Contraintes et index — récapitulatif

| Table | Contraintes | Index |
|---|---|---|
| `subscription_plans` | PK, `name UNIQUE`, `price_fcfa > 0`, `quota > 0`, `duration_days = 30`, `active` | UNIQUE implicite sur `name` |
| `seller_subscriptions` | PK, FK `seller_id`, FK `plan_id`, FK `supersedes_id`, enum 4 états, `chk_subscription_slug_format`, `chk_activation_pair`, `chk_active_window`, `chk_supersedes_not_self` | `uq_one_active_subscription_per_seller` (partiel), `uq_active_subscription_slug` (partiel), `idx_seller_subscriptions_seller`, `idx_seller_subscriptions_pending` (partiel) |
| `storefront_listings` | PK, FK `product_id`, FK `subscription_id`, **aucun `status`** | `uq_storefront_active_product` (partiel), `idx_storefront_listings_subscription_active` (partiel) |

---

## 3. Machine à états de l'abonnement

### 3.1 Diagramme

```
                    ┌──────────────────────────────────────────────┐
                    │  POST /api/subscriptions (vendeur)           │
                    │  {planId, slug, supersedesId?}               │
                    └───────────────────┬──────────────────────────┘
                                        │ (création)
                                        ▼
                                    ┌─────────┐
                     ┌──────────────│ PENDING │◄─────────────┐
                     │              └────┬────┘              │
                     │                   │ activation ADMIN   │ re-souscription SANS
                     │                   │ (manuelle)         │ supersedesId
                     │                   ▼                    │ (EXPIRED/CANCELLED → PENDING,
                     │                                        │  slug récupéré automatiquement)
                     │              ┌─────────┐               │
                     │              │ ACTIVE  │─── now() ≥ ───┼──► ┌─────────┐
                     │              └────┬────┘   ends_at     │    │ EXPIRED │
                     │                   │   (LAZY en lecture) └───► └────┬────┘
                     │ activation d'un   │                              │
                     │ plan change       │                              │
                     │ (auto, même txn)  ▼                              │
                     │         ┌───────────┐                            │
                     └────────►│ CANCELLED │◄───────────────────────────┘
                               └───────────┘   (hist. conservé)
```

### 3.2 Transitions légales

| De | Vers | Qui / déclencheur | Effets (dans la même transaction) |
|---|---|---|---|
| ∅ | `PENDING` | Vendeur (`requireAuth`), `POST /api/subscriptions` | Validation slug (§2.5), `INSERT` sans aucune date d'activation ; `supersedes_id = NULL` (souscription initiale). |
| `PENDING` | `ACTIVE` | **Admin uniquement**, `POST /api/admin/subscriptions/:id/activate` | (1) matérialisation paresseuse des `ACTIVE` expirés du vendeur ; (2) si `supersedes_id` (forcément un `ACTIVE` du même vendeur) → `CANCELLED` du prédécesseur + réattach de ses listings actifs ; sinon garde `409 SUBSCRIPTION_ALREADY_ACTIVE` ; (3) `started_at = now()`, `ends_at = now() + 30 days`, `activated_by`, `activated_at`, `status = ACTIVE`. |
| `ACTIVE` | `EXPIRED` | **Aucun écrivain dédié** — matérialisation **paresseuse en lecture**, sans cron | `UPDATE seller_subscriptions SET status='EXPIRED' WHERE id=$1 AND status='ACTIVE' AND ends_at <= now()` (idempotent, conditionnel). Déclenchée par `GET /api/subscriptions/me`, `GET /api/storefront/:slug` (après le SELECT public) et avant toute activation. Les listings sont **conservés** (aucun `DELETE`, aucun `withdrawn_at`). |
| `ACTIVE` | `CANCELLED` | Admin, automatiquement lors de l'activation d'un plan change | `UPDATE ... SET status='CANCELLED' WHERE id = supersedes_id AND seller_id = $seller AND status='ACTIVE'` ; réattach des listings. |
| `EXPIRED` | `PENDING` | Vendeur, re-souscription **sans `supersedesId`** | Nouvelle ligne **fraîche** ; `supersedes_id = NULL`, aucun lien vers l'ancienne ligne ; le slug est récupéré automatiquement depuis la réservation par vendeur (§2.5). |
| `CANCELLED` | `PENDING` | Vendeur, re-souscription **sans `supersedesId`** | Idem : nouvelle ligne fraîche, `supersedes_id = NULL`, slug récupéré automatiquement. |

**Transitions interdites** (aucune route ne les expose) : `PENDING → ACTIVE` par un `user` (403 CA-V7-013), `PENDING → EXPIRED`, `EXPIRED → ACTIVE` direct, `CANCELLED → ACTIVE` direct, écriture de `status` depuis un payload client (CA-V7-014), **`supersedesId` ciblant une ligne `EXPIRED`/`CANCELLED`/`PENDING` ou appartenant à un autre vendeur** (`400 INVALID_SUPERSEDES` / `404 NOT_FOUND`, décision 17/11/2026). Aucun trigger SQL sur `seller_subscriptions` n'est ajouté : la matrice est appliquée dans le service, et l'unicité partielle est le filet DB.

### 3.3 Changement de forfait et continuité des listings (CA-V7-015, arbitrage R-V7-A1 clos)

**Rappel de contrat (décision 17/11/2026)** : `supersedes_id` ne désigne que l'`ACTIVE` du connecté. Une re-souscription depuis `EXPIRED`/`CANCELLED` ne pose **pas** ce champ et récupère son slug réservé (§2.5). Le réattach ci-dessous ne s'applique donc **qu'au changement de forfait**.

Quand le nouvel abonnement est activé, les listings **actifs** de l'abonnement remplacé sont réattachés au nouvel `subscription_id` :

```sql
UPDATE storefront_listings
   SET subscription_id = $new_subscription_id
 WHERE subscription_id = $old_subscription_id
   AND withdrawn_at IS NULL;
```

Raison : le quota est compté par `subscription_id`. Sans ce réattach, la boutique perdrait ses annonces au changement de forfait alors que le slug, lui, reste identique. Les listings `withdrawn_at IS NOT NULL` restent sur l'ancien abonnement (historique). Cette écriture est **dans la nouvelle route admin**, jamais dans le pipeline de commande/paiement.

### 3.4 Expiration paresseuse — pourquoi ce choix

- **Pas de cron** : le cahier l'interdit explicitement (§4.2, CA-V7-036), et l'environnement est serverless Vercel (un cron dans le process Express n'est pas fiable en serverless).
- **Pas de dérivation pure sans matérialisation** : l'index `uq_one_active_subscription_per_seller` exige qu'une seule ligne porte réellement `ACTIVE`. Si une ligne expirée restait `ACTIVE` en base indéfiniment, une ré-souscription **sans `supersedesId`** entrerait en conflit 23505 à l'activation. La matérialisation conditionnelle à la lecture, avant toute activation, résout ce point.
- **Lecture publique non divulgatrice** : la requête de boutique filtre directement `s.status='ACTIVE' AND s.ends_at > now()` ; une ligne expirée non encore matérialisée répond déjà `404`. La matérialisation n'est qu'une opportunité de mise à jour, jamais une condition de réponse.

> Comparaison : c'est le même pattern que l'expiration paresseuse des réservations décrite dans `docs/architecture.md` §5.2 — mais **sans la partie cron**, conformément à V7.

### 3.5 Quota — comptage exact par jointure (CA-V7-031/037)

Requête **unique de référence** (à copier telle quelle dans `storefront.repository.ts`) :

```sql
SELECT COUNT(*)::int AS used
  FROM storefront_listings l
  JOIN products p ON p.id = l.product_id
 WHERE l.subscription_id = $1
   AND l.withdrawn_at IS NULL
   AND p.status IN ('PENDING', 'AVAILABLE', 'RESERVED')
   AND p.deleted_at IS NULL;
```

Propriétés vérifiables :

- `p.deleted_at` existe déjà (migration `009_soft_delete_perf.sql`) — aucune colonne nouvelle.
- `SOLD` et `REJECTED` **libèrent une place par dérivation en lecture**, sans aucune écriture V7 : c'est le pipeline existant qui pose `products.status = SOLD` (CA-V7-037).
- Le retrait libère une place via `withdrawn_at`, **sans écrire de statut** (CA-V7-034).
- **Aucun reset mensuel** : aucune colonne `reset_at`, aucun job (CA-V7-036).
- Concurrence : la transaction d'ajout commence par `SELECT id FROM seller_subscriptions WHERE id=$1 FOR UPDATE` pour sérialiser les ajouts d'un même abonnement, puis `COUNT` + `INSERT` dans la même transaction. Le dépassement → `409 STOREFRONT_QUOTA_EXCEEDED`. Aucune contrainte DB de quota n'est possible (jointure cross-table) : ce verrou applicatif est le mécanisme retenu.

### 3.6 Règle de non-divulgation — 404 identique (CA-V7-024)

Une seule requête, un seul `notFound` :

```sql
SELECT s.id, s.slug, u.display_name
  FROM seller_subscriptions s
  JOIN users u ON u.id = s.seller_id
 WHERE s.slug = $1
   AND s.status = 'ACTIVE'
   AND s.ends_at > now();
```

Aucune ligne → `404 { error: { code: 'NOT_FOUND', message: 'Boutique introuvable' } }`. Ce payload est **strictement identique** pour : slug inconnu, abonnement `PENDING`, `EXPIRED`, `CANCELLED`, ou vendeur non abonné. Aucune requête séparée « le slug existe-t-il ? », aucun message différencié, aucun `currentStatus` exposé (contrairement au 409 de transition V3). La route de contact réutilise exactement le même garde-fou.

---

## 4. Nouvelles routes API uniquement

Convention héritée de `docs/api.md` §1.1 : JSON, `camelCase`, statuts/enums `UPPER_SNAKE_CASE`, montants entiers FCFA, dates ISO 8601 UTC, erreurs `{ error: { code, message, details? } }`, cookie HTTP-only, CSRF double soumission automatique sur toute méthode mutante. Aucune route existante n'est modifiée.

### 4.1 Carte des 8 nouvelles routes

| # | Méthode & chemin | Auth | Succès | Description |
|---|---|---|---|---|
| 1 | `POST /api/subscriptions` | `requireAuth` | `201` | Souscription / changement de forfait → `PENDING` |
| 2 | `GET /api/subscriptions/me` | `requireAuth` | `200` | État, forfaits, quota, listings de mon abonnement |
| 3 | `POST /api/storefront/listings` | `requireAuth` + `ACTIVE` | `201` | Ajout d'une annonce à la boutique (**seul point de contrôle du quota**) |
| 4 | `DELETE /api/storefront/listings/:id` | `requireAuth` (owner) | `200` | Retrait boutique-scopé (`withdrawn_at`) |
| 5 | `GET /api/storefront/:slug` | **public** | `200` / `404` | Boutique publique |
| 6 | `POST /api/storefront/:slug/contact` | `requireAuth` | `201` | Formulaire interne boutique-scopé |
| 7 | `GET /api/admin/subscriptions` | `requireAdmin` | `200` | File `PENDING` + historique (paginé) |
| 8 | `POST /api/admin/subscriptions/:id/activate` | `requireAdmin` | `200` | Activation manuelle (transaction) |

> Ordre de déclaration dans `storefront.routes.ts` : `/listings` (POST) et `/listings/:id` (DELETE) **avant** `/:slug` (GET) et `/:slug/contact` (POST) — même réflexe que `products.routes.ts` (`/locations`, `/suggestions` avant `/:identifier`). Les verbes diffèrent déjà, mais l'ordre explicite évite toute capture future.

### 4.2 Détail des contrats

#### (1) `POST /api/subscriptions` — souscription

**Corps** : `{ "planId": 1, "slug": "Mode Dakar", "supersedesId": null }`
- `planId` : entier, doit référencer un plan `active = TRUE` (sinon `404 PLAN_NOT_FOUND`).
- `slug` : string 3–40, normalisé serveur (§2.5). **En re-souscription sans `supersedesId`, le service remplace cette valeur par le slug réservé au vendeur** (le champ peut être omis).
- `supersedesId` : entier optionnel, **uniquement pour un changement de forfait**. S'il est fourni, il doit cibler l'abonnement `ACTIVE` du connecté : autre vendeur → `404 NOT_FOUND` ; cible inexistante, `PENDING`, `EXPIRED` ou `CANCELLED` → `400 INVALID_SUPERSEDES`. Le slug est alors **copié depuis cette cible `ACTIVE`**. **Décision définitive (17/11/2026)** : `NULL` pour une souscription initiale **et** pour une re-souscription après `EXPIRED`/`CANCELLED` (nouvelle ligne fraîche, slug récupéré par réservation, §2.5) ; absent avec un `ACTIVE` déjà présent → `409 SUBSCRIPTION_ALREADY_ACTIVE` à l'activation (CA-V7-011/015).

**Réponse `201`** :
```json
{ "subscription": { "id": 41, "planId": 1, "slug": "mode-dakar", "status": "PENDING",
                    "supersedesId": null, "createdAt": "2026-11-17T10:15:00.000Z" } }
```

**Erreurs** : `401 UNAUTHENTICATED` · `400 VALIDATION_ERROR` (details `slug` / `planId`) · `400 INVALID_SUPERSEDES` (cible pas `ACTIVE` du connecté) · `400 SLUG_RESERVED` · `404 NOT_FOUND` (supersedes d'autrui) · `404 PLAN_NOT_FOUND` · `409 SLUG_TAKEN` · `409 SUBSCRIPTION_ALREADY_ACTIVE` n'est **pas** renvoyé ici (la souscription crée toujours un `PENDING` ; le 409 est à l'activation, CA-V7-011).

> **Décision mineure retenue** : `requireAuth` et non `requireUser`, par cohérence avec `routes/referrals.routes.ts` (un admin a un profil et peut donc souscrire) ; aucun rôle nouveau, aucun `users.role` écrit. Un admin appelant cette route n'est donc **pas** rejeté (pas de `403 FORBIDDEN` ici). Ce choix ne modifie aucun RBAC existant et reste conforme à CA-V7-002/052 ; aucune confirmation supplémentaire requise.

#### (2) `GET /api/subscriptions/me` — consultation

**Réponse `200`** (abonnement en cours) :
```json
{
  "subscription": { "id": 41, "status": "ACTIVE", "slug": "mode-dakar",
                    "plan": { "id": 1, "name": "Découverte", "priceFcfa": 2000,
                              "quota": 10, "durationDays": 30 },
                    "startedAt": "2026-11-17T…", "endsAt": "2026-12-17T…",
                    "daysRemaining": 30, "activatedBy": 7 },
  "usage": { "used": 3, "quota": 10, "remaining": 7 },
  "listings": [ { "id": 12, "productId": 88, "title": "Veste…", "price": 12000,
                  "effectiveStatus": "AVAILABLE", "createdAt": "…" } ],
  "plans": [ { "id": 1, "name": "Découverte", "priceFcfa": 2000, "quota": 10, "durationDays": 30 }, … ]
}
```
Sans abonnement : `subscription: null`, `usage: null`, `listings: []`, `plans: [3 paliers]`.
Abonnement `EXPIRED` : `status: "EXPIRED"`, `message` clair « Votre abonnement a expiré le … . Vos annonces de boutique sont conservées ; souscrivez à nouveau sans indication de remplacement pour rouvrir votre vitrine : votre slug vous est réservé et sera récupéré automatiquement. » (CA-V7-016, décision 17/11/2026).

`effectiveStatus` est **dérivé de `products.status` par jointure** (jamais stocké). Les prix viennent de `subscription_plans` (aucun tarif en dur).

**Erreurs** : `401 UNAUTHENTICATED` · `500 INTERNAL_ERROR`.

#### (3) `POST /api/storefront/listings` — ajout à la boutique

**Corps** : `{ "productId": 88 }` (entier > 0).

**Gardes dans l'ordre** (transaction) :
1. `requireAuth` (401).
2. Résolution de l'abonnement `ACTIVE` non expiré du vendeur → sinon `403 SUBSCRIPTION_REQUIRED` (CA-V7-012/030/039).
3. `SELECT … FROM products WHERE id=$1 FOR UPDATE` (ou lecture + garde) : produit inexistant → `404 PRODUCT_NOT_FOUND` ; `owner_id <> seller_id` → **`403 NOT_PRODUCT_OWNER`**. **Arbitrage chef de projet** : le cahier CA-V7-030 prévaut sur la convention §1.4 ; cette exception explicite sera documentée dans `api.md` v2.7 (demandeur authentifié, produit déjà connu via le catalogue).
4. Verrou `SELECT id FROM seller_subscriptions WHERE id=$1 FOR UPDATE`.
5. Comptage (§3.5) ; si `used >= plan.quota` → `409 STOREFRONT_QUOTA_EXCEEDED` avec message explicite :
   « Quota de votre forfait atteint (10/10). Retirez une annonce de votre boutique ou changez de forfait. » (CA-V7-032).
6. `INSERT storefront_listings (product_id, subscription_id) VALUES ($1,$2)` (unicité active → 23505 `STOREFRONT_ALREADY_LISTED`).

**Réponse `201`** : `{ "listing": { "id": 12, "productId": 88, "createdAt": "…" } }`.

**Erreurs** : `401 UNAUTHENTICATED` · `403 SUBSCRIPTION_REQUIRED` · `403 NOT_PRODUCT_OWNER` · `404 PRODUCT_NOT_FOUND` · `409 STOREFRONT_QUOTA_EXCEEDED` · `409 STOREFRONT_ALREADY_LISTED` · `400 VALIDATION_ERROR`.

> Le produit refusé par la boutique reste **normalement visible et vendable** dans le catalogue ; aucun appel à ce routeur n'est fait depuis `POST /api/products` (CA-V7-033/038).

#### (4) `DELETE /api/storefront/listings/:id` — retrait

**Effet** : `UPDATE storefront_listings SET withdrawn_at = now() WHERE id=$1 AND withdrawn_at IS NULL AND subscription_id IN (SELECT id FROM seller_subscriptions WHERE seller_id=$seller)`. Idempotent (si déjà retiré → `200`). **Aucune écriture sur `products`**, aucune annulation de commande (CA-V7-034).

**Réponse `200`** : `{ "ok": true }`.
**Erreurs** : `401 UNAUTHENTICATED` · `404 NOT_FOUND` (listing inexistant ou d'autrui — politique §1.4 : 404, pas 403, ici).

#### (5) `GET /api/storefront/:slug` — boutique publique

**Réponse `200`** :
```json
{
  "storefront": { "slug": "mode-dakar", "displayName": "Aïcha M.", "memberSince": 2024 },
  "items": [ { "id": 88, "name": "Veste…", "price": 12000,
               "primaryPhotoUrl": "…", "effectiveStatus": "AVAILABLE" } ],
  "page": 1, "perPage": 12, "total": 3, "totalPages": 1
}
```
- Uniquement les listings non retirés dont `products.status ∈ ('PENDING','AVAILABLE','RESERVED')` et `deleted_at IS NULL`.
- `per_page` 1..48, défaut 12 (convention §1.5). Liste vide → `200 items: []`.
- `storefront.displayName` = `users.display_name` ; `memberSince` = année d'inscription (`users.created_at`) — les seuls champs publics de la boutique. **Aucun `phone`/`email`/`whatsapp`/`tel:`/`mailto:`** (CA-V7-026).
- Réutilise `serializePublicProduct`-like (champs publics uniquement) ; un nouveau `serializeStorefront*` dédié est créé dans `utils/storefront-serializers.ts` (aucune édition de `utils/serializers.ts`).

**Erreurs** : `404 NOT_FOUND` / « Boutique introuvable » (identique dans tous les cas de non-divulgation, §3.6) · `400 VALIDATION_ERROR` (pagination hors bornes) · `500 INTERNAL_ERROR`. Aucune session requise.

#### (6) `POST /api/storefront/:slug/contact` — contact boutique

**Corps** : `{ "message": "Bonjour…", "email": "acheteur@example.com" }`
- `message` : 10–2000 caractères trimmés (zod).
- `email` : optionnel, format e-mail, ≤ 254, minuscules — **coordonnée du demandeur**, visible du vendeur uniquement.

**Gardes** : même requête de non-divulgation que (5) (404 identique si `PENDING`/`EXPIRED`/inconnu) ; `requireAuth` ; si `seller_id = session.userId` → `400 CONTACT_SELF` (CA-V7-048).

**Effet** (une transaction) : `INSERT notifications (user_id = seller_id, type='product.contact', title='Nouveau message depuis la boutique « mode-dakar » — De : <displayName>', message='De : <displayName>< — <email>>\n\n<message>') RETURNING id`. La valeur d'enum existante est réutilisée (§2.4) ; le titre précise la boutique **et** l'expéditeur. Aucune donnée d'un autre vendeur transmise, aucun numéro de téléphone (CA-V7-045/046).

**Réponse `201`** : `{ "ok": true, "notificationId": 401 }`.
**Erreurs** : `401 UNAUTHENTICATED` · `400 VALIDATION_ERROR` (details `message`/`email`) · `400 CONTACT_SELF` · `404 NOT_FOUND` (boutique indisponible) · `429 RATE_LIMITED` (scope `storefront-contact`) · `500 INTERNAL_ERROR`.

> Ce formulaire est **strictement boutique-scopé** : il n'ajoute aucun bouton/libellé/`mailto:`/`tel:` sur `/catalogue/:slug` (CA-V7-047). La route historique `POST /api/products/:id/contact` documentée en api.md v2.6 §3.x **n'est ni modifiée ni réactivée** par V7 (cf. risque R-V7-A4).

#### (7) `GET /api/admin/subscriptions` — file admin

**Query** : `?status=PENDING` (défaut `PENDING`), `page`, `per_page` (1..48, défaut 12).
**Réponse `200`** : enveloppe paginée §1.5 ; chaque élément = `{ id, sellerId, sellerDisplayName, planName, priceFcfa, quota, slug, status, createdAt, activatedAt?, activatedBy? }`.
**Erreurs** : `401 UNAUTHENTICATED` · `403 FORBIDDEN` · `400 VALIDATION_ERROR`. Route montée sous `/api/admin` → limiteur admin existant (60/min, `skipAdmin`).

#### (8) `POST /api/admin/subscriptions/:id/activate` — activation manuelle

**Corps** : `{}`.
**Effets** : séquence exacte décrite en §3.2 (matérialisation expiry → cancellation/reattach si `supersedes_id` cible un `ACTIVE` du même vendeur → garde 409 sinon → activation tracée). Une seule transaction.
**Réponse `200`** : `{ "subscription": { "id": 41, "status": "ACTIVE", "slug": "mode-dakar", "startedAt": "…", "endsAt": "…", "activatedBy": 7, "activatedAt": "…" } }`.
**Erreurs** : `401 UNAUTHENTICATED` · `403 FORBIDDEN` (user) · `404 NOT_FOUND` (id inconnu) · `409 INVALID_STATUS` (cible pas `PENDING`) · `409 SUBSCRIPTION_ALREADY_ACTIVE` (2ᵉ abonnement indépendant, CA-V7-011 ; mapping 23505 de `uq_one_active_subscription_per_seller` inclus) · `500 INTERNAL_ERROR`.

**Traçabilité** : `activated_by = currentUser(res).id`, `activated_at = now()` (CA-V7-013/051). Aucun webhook, cron ou payload client ne peut poser ces champs (CA-V7-014).

### 4.3 Codes d'erreur nouveaux (à documenter dans `docs/api.md` v2.7 par `@backend`, CA-V7-063)

`SLUG_TAKEN` (déjà utilisé pour `products.slug`, réutilisé) · `SLUG_RESERVED` · `SUBSCRIPTION_REQUIRED` · `SUBSCRIPTION_ALREADY_ACTIVE` · `INVALID_SUPERSEDES` (cible pas l'`ACTIVE` du connecté) · `STOREFRONT_QUOTA_EXCEEDED` · `STOREFRONT_ALREADY_LISTED` · `NOT_PRODUCT_OWNER` · `CONTACT_SELF` (déjà documenté pour le contact produit, réutilisé) · `PLAN_NOT_FOUND` · `INVALID_STATUS` · `NOT_FOUND` (boutique). Tous avec un `message` français affichable tel quel dans un Toast (§1.1).

> **Exception §1.4 à documenter en v2.7** (arbitrage chef de projet) : sur `POST /api/storefront/listings`, un produit d'autrui donne `403 NOT_PRODUCT_OWNER` et non `404`. La non-divulgation reste la règle pour les boutiques (§3.6) ; ici le demandeur est authentifié et le produit lui est déjà connu via le catalogue.

---

## 5. Structure des fichiers à créer

### 5.1 Côté serveur (`server/`)

| Fichier | Rôle | Pattern réutilisé |
|---|---|---|
| `migrations/019_storefront.sql` | DDL des 3 tables + seed 3 forfaits ; aucun type/enum existant modifié | Style `018_referrals.sql`, `IF NOT EXISTS`, contraintes nommées, commentaires |
| `src/routes/subscriptions.routes.ts` | Routes (1) et (2) | `referrals.routes.ts` (Router + `requireAuth` + `currentUser`) |
| `src/routes/storefront.routes.ts` | Routes (3) (4) (5) (6), ordre littéral avant `/:slug` | `products.routes.ts` (`/locations`, `/suggestions` avant `/:identifier`) |
| `src/routes/admin-subscriptions.routes.ts` | Routes (7) (8), `requireAdmin` au niveau du router | `admin.routes.ts` |
| `src/services/subscriptions.service.ts` | Création, consultation, expiration paresseuse, activation | `services/referral.service.ts`, `services/expiry.service.ts` |
| `src/services/storefront.service.ts` | Ajout/retrait listing, quota, boutique publique, contact | `services/products.service.ts` |
| `src/repositories/subscription-plans.repository.ts` | Lecture des 3 forfaits | `repositories/categories.repository.ts` |
| `src/repositories/subscriptions.repository.ts` | CRUD abonnements, requêtes d'activation | `repositories/admin.repository.ts` |
| `src/repositories/storefront.repository.ts` | **Requête de comptage exacte (§3.5)**, listings, boutique publique | `repositories/cart.repository.ts` |
| `src/utils/storefront.ts` | Normalisation slug, regex, 20 mots réservés, constantes de quota/message, constante locale du type `product.contact` (aucune union éditée) | `utils/slugify.ts` |
| `src/utils/storefront-validation.ts` | Schémas zod (`planId`, `slug`, `supersedesId`, `productId`, `message`, `email`, pagination) ; la règle « cible `ACTIVE` du connecté » est appliquée dans le service (§2.2) | `utils/validation.ts` (fichier existant **non édité**) |
| `src/utils/storefront-serializers.ts` | `serializeStorefrontPublic`, `serializeMySubscription` (champs publics seulement) | `utils/serializers.ts` (fichier existant **non édité**) |

**Éditions additives minimales dans des fichiers existants** (aucune ligne de handler modifiée) :

| Fichier | Ajout | Pourquoi |
|---|---|---|
| `src/app.ts` | 3 lignes `app.use()` : `/api/subscriptions`, `/api/storefront`, `/api/admin/subscriptions` ; + 1 `rateLimit({ scope: 'storefront-contact', windowMs: 600_000, max: 10 })` sur la route de contact | Montage des nouveaux routeurs ; anti-spam (api.md §8 recommandation). Aucun middleware existant retiré. |
| `src/middleware/errors.ts` | 3 entrées dans `UNIQUE_CONSTRAINT_CODES` : `uq_active_subscription_slug → SLUG_TAKEN`, `uq_one_active_subscription_per_seller → SUBSCRIPTION_ALREADY_ACTIVE`, `uq_storefront_active_product → STOREFRONT_ALREADY_LISTED` | Filet DB (même technique que `uq_one_active_order_per_product` en V3). Aucune entrée existante modifiée. |

> **Aucune extension d'union `NotificationType`** : la valeur existante `product.contact` est utilisée via une constante locale typée dans le nouveau `src/utils/storefront.ts` (type importé en lecture seule). Le dépôt existant `insertNotification` reste appelé tel quel, dans la même transaction. Aucun fichier de notification existant n'est édité.

> Aucune modification de `products.service.ts`, `orders.service.ts`, `admin.service.ts`, `routes/products.routes.ts`, `db/pool.ts`, `middleware/auth.ts`, `repositories/notifications.repository.ts`. Vérifiable par `git diff` (CA-V7-005/038).

### 5.2 Côté web (`web/src`)

| Fichier | Rôle |
|---|---|
| `views/StorefrontView.tsx` | Page publique `/boutique/:slug` (responsive 375 px, clavier, `aria-label`, `alt`) |
| `pages/MySubscriptionPage.tsx` | Espace privé `/mon-abonnement` : état, forfaits, quota, gestion listings, message d'expiration |
| `pages/admin/AdminSubscriptionsPage.tsx` | File `PENDING` + activation + historique `/admin/abonnements` |
| `components/storefront/PlanPicker.tsx` | Choix des 3 paliers (prix/quota **reçus de l'API**, jamais codés en dur) |
| `components/storefront/SubscriptionStatusPanel.tsx` | Badge `PENDING`/`ACTIVE`/`EXPIRED`/`CANCELLED`, `aria-live`, jours restants |
| `components/storefront/ListingManager.tsx` | Ajout (sélection produit) / retrait des annonces de boutique + jauge de quota |
| `components/storefront/ContactForm.tsx` | Formulaire 10–2000 chars + e-mail optionnel, toast de succès — **uniquement rendu dans la boutique** |
| `components/storefront/StorefrontProductCard.tsx` | Carte annonce boutique (réutilise `components/site/SiteCard.tsx` + `ResilientImg`) |
| `lib/storefront.ts` | Helpers typés (`getMySubscription`, `subscribe`, `addListing`, `withdrawListing`, `getStorefront`, `contactStorefront`, `listPendingSubscriptions`, `activateSubscription`) via le wrapper existant `lib/api.ts` (CSRF + `credentials: 'include'`) |
| `lib/storefront.types.ts` | Types TS V7 (aucune édition de `lib/types.ts`) |
| `App.tsx` | **3 lignes de routes ajoutées** : `/boutique/:slug` (public, dans `SiteShell`), `/mon-abonnement` (`<RequireUser>`), `/admin/abonnements` (`<RequireAdmin>`) |
| `lib/menus.ts` / `components/layout/Navbar.tsx` | **1 lien ajouté** « Mon abonnement » dans le menu utilisateur. Le point d'entrée « Vendre » reste **inchangé et non conditionné** (CA-V7-004). |

Aucune nouvelle librairie front ; TanStack Query est utilisé pour l'invalidation après mutation (ajout/retrait/activation), comme le reste de l'app.

---

## 6. Sécurité

| Axe | Mesure V7 | Critère |
|---|---|---|
| **Ownership** | Product owner vérifié à l'ajout (`products.owner_id = seller_id`) → `403 NOT_PRODUCT_OWNER`. Listing ownership vérifié au retrait via jointure `subscription.seller_id`. Abonnement toujours résolu depuis `currentUser(res).id`, jamais depuis un paramètre de corps. | CA-V7-030/034 |
| **RBAC** | `requireAuth` (seller) et `requireAdmin` (admin) réutilisés ; aucun `role` nouveau, aucune écriture de `users.role`, aucune élévation. Un `user` sur route admin → `403` API et redirection front sans page 403 (convention ARB-V5-02). | CA-V7-002/013/050/052 |
| **Slug** | Normalisation + regex + longueur + 20 mots réservés **côté serveur** (autorité) ; échappement automatique React ; pas d'interpolation SQL (tout paramétré via `pool.query`). Aucun `/`, `.`, `_`, accent. | CA-V7-020/021/022 |
| **Non-divulgation** | 404 unique pour slug inconnu / `PENDING` / `EXPIRED` ; ressource d'autrui → 404. **Exception assumée** : produit d'autrui sur `POST /api/storefront/listings` → `403 NOT_PRODUCT_OWNER` (CA-V7-030, api.md v2.7 §1.4). Aucun `currentStatus` dans les 404. | CA-V7-024/030 |
| **Coordonnées privées** | Sérialiseur public V7 = `displayName` + `memberSince`. Aucun `phone`, `whatsapp`, `email`, `tel:`, `mailto:` dans le HTML/JSON de `/boutique/:slug` ni dans la notification (seule l'adresse **du demandeur** y figure, à destination du vendeur). Absent de `/catalogue/:slug`. | CA-V7-026/046/047 |
| **Injection / XSS** | Requêtes paramétrées ; zod sur toutes les entrées ; React échappe le contenu ; `message` du contact stocké tel quel en base mais rendu comme texte (jamais `dangerouslySetInnerHTML`). | CA-V7-045 |
| **Paiement / fraude** | Aucune route de paiement d'abonnement, aucun webhook, aucun champ bancaire. `status='ACTIVE'` ignoré si envoyé par le client (le service ne lit que `planId`, `slug`, `supersedesId`). | CA-V7-014 |
| **Rate limit** | Global 300/min déjà monté sur `/api` ; admin 60/min déjà monté sur `/api/admin` ; nouveau scope `storefront-contact` 10/10 min sur la route de contact (middleware existant, clé Redis `rl:storefront-contact:<ip>`). Bypass `NODE_ENV=test` conservé. | api.md §8, CA-V7-045 |
| **CSRF / cookie** | Double soumission existante automatique sur POST/DELETE sous `/api` ; cookie `httpOnly`, `SameSite=Lax`, `Secure` en prod, same-origin Vercel → zéro CORS nouveau. | §1.1, app.ts |
| **Parrainage / Vitrine** | Aucun accès à `referred_by`, `ambassador_until`, `vitrine_until`, `referral_qualifications`. Le badge et la priorité Vitrine restent au tri existant. | CA-V7-054 |
| **Commission** | Aucun tarif d'abonnement dans le calcul de commande ; `COMMISSION_RATE` et la commission 10 % restent la source de vérité du pipeline. | CA-V7-006 |

---

## 7. Déploiement — ordre, feature flag, rollback

### 7.1 Constat de production (vérifié)

- `vercel.json` : framework `express`, build web, rewrites SPA. L'entrée serverless **n'appelle pas `migrate()`** : `docs/rapport-final-v6.md:168` confirme **`RUN_MIGRATIONS=false` en prod**, migrations appliquées **manuellement** (sauvegarde + audit).
- `migrate.ts` lit `config.migrationsDir` (`server/migrations/`) et `schema_migrations`, une transaction par fichier, verrou advisory. Il fonctionne en local / runner trusted via `npm run db:migrate`.

### 7.2 Ordre d'exécution (impératif)

1. **Sauvegarde PostgreSQL de production** (comme pour 014 en V6).
2. **Appliquer `019_storefront.sql` manuellement** via un runner trusted (`RUN_MIGRATIONS=true npm run db:migrate` ou `psql` dans la même transaction), **avant** tout déploiement de code V7.
3. **Vérifier** : `information_schema.columns` identique pour les tables existantes + exactement 3 nouvelles tables + `SELECT * FROM subscription_plans` = 3 lignes (2000/10, 5000/30, 10000/100) + enum `subscription_status` à 4 valeurs + `notification_type` inchangé (la valeur `product.contact` était déjà présente).
4. **Déployer le code** (web + API) — `vercel build --prebuilt --prod` puis `vercel deploy --prebuilt --prod` (procédure `scripts/deploy-vercel.sh` validée en V6).
5. **Health check** `GET /api/health` + smoke test : `GET /api/storefront/<slug-inexistant>` → 404 identique ; activation d'un compte test → boutique 200.
6. **Recette** CA-V7-001 → 064 par `@tester` (grille §9 du cahier).

> Si le code est déployé **avant** la migration, toute route V7 renverrait `500` (table absente) — d'où l'ordre ci-dessus. Le feature flag ci-dessous permet de désamorcer ce risque.

### 7.3 Feature flag (recommandé, non bloquant)

Ajouter `FEATURE_STOREFRONT` dans `config.ts` (zod `enum(['true','false']).default('false')` en prod, `'true'` en dev/test) :

- **API** : les 3 `app.use('/api/subscriptions'…)`, `/api/storefront`, `/api/admin/subscriptions` ne sont montés **que** si le flag est `true`. Sinon, ils répondent `404 NOT_FOUND` via le `notFoundHandler` existant — aucun comportement existant n'est touché.
- **Web** : les 3 routes et le lien « Mon abonnement » ne sont rendus que si `import.meta.env.VITE_FEATURE_STOREFRONT === 'true'` (défaut `false` en prod).
- **Rollback immédiat** = repasser le flag à `false` + redéployer : V7 disparaît sans toucher à la base ni aux cahiers antérieurs (plan B R-V7-02 du cahier).

### 7.4 Rollback

| Niveau | Action | Impact sur l'existant |
|---|---|---|
| Code | Flag `false` ou redéploiement du commit précédent | **Aucun** — aucun handler existant modifié |
| Données | Optionnel : `DROP TABLE IF EXISTS storefront_listings, seller_subscriptions, subscription_plans; DROP TYPE IF EXISTS subscription_status;`. **Aucune valeur d'enum à retirer** : `notification_type` n'a jamais été modifié ; `product.contact` reste la valeur existante réutilisée par V7. Retirer la ligne `019_storefront.sql` de `schema_migrations` uniquement si on rejoue la migration. | **Aucun objet existant modifié, y compris les types/enums** ; aucune donnée produit/commande/parrainage affectée |
| Documents | Ne **jamais** modifier les cahiers/architectures V1→V6 ni `docs/api.md` v2.6 (sauf ajout v2.7 par `@backend`, CA-V7-063) | Traçabilité préservée |

> Aucun cron ajouté : `jobs/run.ts` et `jobs/expire-reservations.ts` restent inchangés. La matérialisation paresseuse suffit (§3.4).

---

## 8. Matrice de risques (propriétaires, actions, plans B)

Format `gestion-risques` : impact × probabilité, action, plan B. Statut au 17/11/2026.

| ID | Risque | Niveau | Action (propriétaire) | Plan B / attendu |
|---|---|---|---|---|
| **R-V7-A1** | CA-V7-011 vs CA-V7-015 sur l'activation d'un 2ᵉ abonnement | ✅ **Clos — arbitrages chef de projet 17/11/2026** | `supersedes_id` **approuvé** (§2.2, §3.3) : colonne d'une **nouvelle table**, cible **uniquement l'`ACTIVE` du connecté** pour un changement de forfait ; re-souscription après `EXPIRED`/`CANCELLED` **sans champ**, slug récupéré par réservation par vendeur (indépendante de `supersedes_id`). | Aucun plan B : décision exécutoire pour `@backend` |
| **R-V7-A2** | CA-V7-030 demande **403** pour un produit d'autrui ; api.md §1.4 demande **404** | ✅ **Clos — arbitrage chef de projet 17/11/2026** | Le **cahier prévaut** : `403 NOT_PRODUCT_OWNER` sur `POST /api/storefront/listings`. `api.md` **v2.7 documentera l'exception explicite à §1.4** (demandeur authentifié, produit connu via le catalogue) ; `@api-designer` + `@backend`. | Aucun repli 404 : exception assumée et tracée |
| **R-V7-A3** | Risque d'évolution d'un type existant pour la notification de contact | ✅ **Clos — arbitrage chef de projet 17/11/2026** | **Interdiction de modifier `notification_type`** : réutilisation de `product.contact` (V4/N14, conservé en V5 — CA-V5-099), titre boutique + expéditeur (§2.4, §4.2(6)). **0 objet existant modifié, y compris les types/enums.** | Aucun : la valeur existante suffit ; aucun nouveau type, aucune union à étendre |
| **R-V7-A4** | `POST /api/products/:id/contact` est documenté en api.md v2.6 mais **non implémenté** dans `server/src` (vérifié) ; risque de le réactiver par erreur | ⚠️ Important | V7 contact = route **dédiée** `/api/storefront/:slug/contact` ; CA-V7-047 en test de non-régression ; `@backend` + `@tester` | Retirer F8 (formulaire) ; conserver la vitrine seule (plan B R-V7-04 du cahier) |
| **R-V7-A5** | Concurrence : 2 ajouts simultanés au dernier slot → dépassement de quota | ⚠️ Important | `SELECT … FOR UPDATE` sur l'abonnement + `COUNT` + `INSERT` dans la même transaction (§3.5) ; `@backend` | Aucun : la sérialisation par ligne est suffisante au volume MVP |
| **R-V7-A6** | Expiration non matérialisée → conflit 23505 sur `uq_one_active_subscription_per_seller` à la ré-souscription **sans `supersedesId`** | ⚠️ Important | Matérialisation paresseuse avant toute activation + filtre `ends_at > now()` en lecture (§3.4) ; `@backend` | Mapping 23505 → `SUBSCRIPTION_ALREADY_ACTIVE` (déjà prévu) |
| **R-V7-A7** | Migration appliquée **après** le code en prod → 500 sur les routes V7 | 🔴 Critique | Ordre strict §7.2 + feature flag §7.3 ; `@deploy-ops` | Flag `false` immédiat, appliquer 019, réactiver |
| **R-V7-A8** | Fuite de quota dans `POST /api/products` → régression CA-V5-069/070 | 🔴 Critique | CA-V7-003/004/033/038 exécutés avant chaque merge ; `@tester` + `@backend` | Flag off + rollback ; 0 test V5 amendé |
| **R-V7-A9** | Slug non normalisé → collision / injection de chemin | ⚠️ Important | Regex stricte + mots réservés + échappement React (§2.5) ; `@backend` | Rejet 400 serveur avant toute écriture |
| **R-V7-A10** | Goulot d'activation admin (file `PENDING`) | ⚠️ Important | Écran admin filtré + notification admin à la souscription (hors V7 strict ? voir PO-V7-08) ; `@frontend`/`@backend` | SLA annoncé ; traitement par lot — **attend : PO-V7-08** |
| **R-V7-A11** | Liste des 20 mots réservés non définitive | ℹ️ Mineur | Liste §2.5 figée dans `utils/storefront.ts` — **attend : PO-V7-06** | Ajout de mots = 1 ligne, sans migration |
| **R-V7-A12** | Incohérence géo Sénégal vs Côte d'Ivoire | ℹ️ Mineur | Aucun impact fonctionnel ; conserver les docs antérieurs inchangés — **attend : PO-V7-07** | Aucun |
| **R-V7-A13** | Accessibilité / responsive des 3 nouvelles pages | ℹ️ Mineur | CA-V7-027/061/062/064 dès le développement ; `@frontend` | Correctifs ciblés sans toucher aux pages existantes |

**Risques ouverts** : R-V7-A10/11/12 (PO) uniquement. Les trois arbitrages initiaux sont **clos** par décision définitive du chef de projet (17/11/2026) ; l'implémentation n'est plus différée. Les autres risques sont atténués par un critère de recette.

**Mapping vers les critères imposés** : R-V7-A1 → CA-V7-011/015 · R-V7-A2 → CA-V7-030 (+ api.md v2.7 §1.4) · R-V7-A3 → CA-V7-045/046 + CA-V5-099 · R-V7-A8 → CA-V7-003/004/033/038 · R-V7-A7 → CA-V7-001 (schéma) · R-V7-A9 → CA-V7-020/021/022 · R-V7-A4 → CA-V7-045/047 · R-V7-A5/6 → CA-V7-031/036/037 · R-V7-A10 → CA-V7-051.

---

## 9. Vérification explicite de non-contradiction avec les critères verrous

| Critère | Exigence | Comment ce design la respecte | Verdict |
|---|---|---|---|
| **CA-V7-001** | Aucune colonne ajoutée aux tables existantes ; 3 nouvelles tables seulement | §2 : 3 `CREATE TABLE`, 0 colonne ajoutée à une table préexistante, 0 mutation de type/enum existant. `notification_type` inchangé (réutilisation de `product.contact`, §2.4). `information_schema.columns` identique pour `users/products/orders/notifications/referral_qualifications`. | ✅ (sans réserve) |
| **CA-V7-002** | Aucun changement de rôle | `requireAuth`/`requireAdmin` réutilisés ; enum `user_role` non touché ; 0 écriture de `users.role`. | ✅ |
| **CA-V7-003** | Non-abonné : 10 → 201, 11ᵉ après `SOLD` → 201 | `POST /api/products` non modifié (0 ligne) ; aucun quota lu dans ce handler ; le quota est dans `POST /api/storefront/listings` uniquement. | ✅ |
| **CA-V7-004** | Bouton « Vendre » jamais conditionné | Aucun composant de vente modifié ; le lien ajouté est « Mon abonnement », pas « Vendre » ; aucun `status`/abonnement lu par le point d'entrée de vente. | ✅ |
| **CA-V7-031** | Quota = annonces actives, dérivé de `products.status` par jointure | Requête exacte §3.5 ; `storefront_listings` sans `status` ; `deleted_at IS NULL` ; `PENDING\|AVAILABLE\|RESERVED`. | ✅ |
| **CA-V7-033** | Annonce refusée par la boutique reste vendable dans le catalogue | Le 409 de quota n'écrit rien ; `products` et le pipeline de commande restent intacts ; aucun tarif d'abonnement dans le calcul de commission. | ✅ |
| **CA-V7-037** | Une vente libère une place par lecture, sans toucher au pipeline | `SOLD` posé par l'existant ; le `COUNT` joint le statut ; `grep` sur `*order*`/`*payment*`/`*checkout*` → 0 occurrence V7 ; 0 trigger sur `products`. | ✅ |
| **CA-V7-038** | Aucune logique de quota / écriture V7 hors nouvelle route | `grep -rn "quota\|STOREFRONT_QUOTA\|subscription_id" server/src` ne touche que `routes/storefront*`, `services/storefront*`, `repositories/storefront*`, `services/subscriptions*`, `routes/admin-subscriptions*`, `app.ts` (montage) — **jamais** products/orders/checkout/payment. | ✅ |
| **CA-V7-054** | Parrainage et Vitrine préservés bit à bit | Aucune requête n'écrit/ne lit `referred_by`, `ambassador_until`, `vitrine_until`, `referral_qualifications` ; 0 colonne ajoutée à `users`. | ✅ |

**Conclusion** : aucun critère verrou n'est contredit. Les points de friction initiaux sont **clos par arbitrage définitif du chef de projet** (17/11/2026) : `supersedes_id` approuvé **pour le seul changement de forfait vers l'`ACTIVE` du connecté** (CA-V7-011/015), `403 NOT_PRODUCT_OWNER` retenu (CA-V7-030), `product.contact` réutilisé sans évolution de type (CA-V7-045/046). La re-souscription après `EXPIRED`/`CANCELLED` est une ligne fraîche sans `supersedesId`, avec récupération automatique du slug réservé au vendeur. **Zéro objet existant modifié, y compris les types/enums.**

**Contrôles additionnels sur les 45 critères** : CA-V7-011/015 → `supersedesId` **uniquement vers l'`ACTIVE` du connecté** ; re-souscription `EXPIRED`/`CANCELLED` sans champ, slug récupéré par réservation par vendeur indépendante de `supersedes_id` (§2.2, §2.5, §3.2, §3.3, §4.2(1)) · CA-V7-030 → 403 assumé et documenté en api.md v2.7 §1.4 (§4.2(3), §6) · CA-V7-045/046/047/048 → contact strictement boutique-scopé, notification `product.contact`, titre boutique + expéditeur, aucun canal sur `/catalogue/:slug` (§4.2(6)) · CA-V7-063 → contrat v2.7 par `@backend`. Les 45 critères restent applicables sans amendement.

---

## 10. Définition de Done — verdict binaire (portée : ce document)

> La recette d'implémentation (45 critères) reste à exécuter par `@tester` après livraison du code. Le verdict ci-dessous porte **uniquement sur le livrable architectural** demandé : un document, aucun code.

| # | Exigence de la mission | État | Preuve |
|---|---|---|---|
| 1 | Un seul fichier du livrable, aucun autre chemin touché | ✅ | `revends/docs/architecture-v7-hebergement-vendeurs.md` ; preuve : `cd "/home/dioufidriss/Documents/Default Project/revends" && git diff --name-only` → `docs/architecture-v7-hebergement-vendeurs.md` (un seul fichier modifié par cette mission) |
| 2 | Vue d'ensemble et principes additifs | ✅ | §1 (P1→P10, flux) |
| 3 | 3 nouvelles tables avec DDL PostgreSQL complète, types, contraintes, index, 0 colonne existante | ✅ | §2 (2.1, 2.2, 2.3, 2.6) |
| 4 | Machine à états : transitions, acteurs, unicité partielle, changement de forfait, expiration paresseuse sans cron, slug réservé | ✅ | §3 (3.1→3.4), §2.5 |
| 5 | Liste des **nouvelles routes uniquement**, verbes/chemins/statuts/codes d'erreur cohérents §1.1 | ✅ | §4 (8 routes, format `{ error: { code, message } }`) |
| 6 | Structure des fichiers serveur + web, patterns existants réutilisés | ✅ | §5 |
| 7 | Requête exacte de comptage par jointure + règle 404 identique | ✅ | §3.5, §3.6 |
| 8 | Sécurité (ownership, RBAC, slug, échappement, coordonnées, rate limit) | ✅ | §6 |
| 9 | Déploiement : ordre migration vs code, feature flag, rollback | ✅ | §7 |
| 10 | Matrice de risques + mapping CA-V7-xxx + vérification des 9 critères verrous | ✅ | §8, §9 |
| 11 | Skills appliqués (plan-le-first, gestion-risques, auto-revue, definition-done) ; docs-officielles non requis (0 nouvelle librairie) | ✅ | §1.3, §8, présent document relu en §9 |
| 12 | Aucun code, test ou déploiement lancé | ✅ | Mission lecture seule + écriture de ce seul fichier Markdown |

### Auto-revue (une ligne, skill `auto-revue`)

> Auto-revue : 3 incohérences de spécification détectées puis **tranchées définitivement par le chef de projet** (CA-V7-011/015 → `supersedes_id` approuvé ; CA-V7-030 vs api.md §1.4 → 403 assumé ; notification → `product.contact` réutilisé, type inchangé), **1 précision de contrat intégrée** (`supersedesId` = `ACTIVE` uniquement ; re-souscription sans champ + slug réservé au vendeur), 1 chemin de migration corrigé (`server/migrations/` et non `server/src/db/migrations/`), 1 collision de route évitée (`/listings` déclaré avant `/:slug`). Vérification finale : plus aucune occurrence de l'ancien nom de valeur de notification, de mutation de type, ni de point en attente issu des arbitrages.

### VERDICT

**DONE — architecture complète, additive et actionnable.** Verdict binaire sur le document : **✅ DONE**.

**Aucune réserve.** Les trois arbitrages initiaux sont **clos** par décision définitive du chef de projet (17/11/2026) et intégrés ci-dessus. Le passage à `@backend` est **autorisé** ; aucun cahier antérieur n'est modifié.

---

## Annexe A — Références croisées rapides

| Sujet | Référence |
|---|---|
| Cahier source (45 critères) | `docs/cahier-des-charges-v7-hebergement-vendeurs.md` §2.2, §4.2, §6.1→6.8, §8, §10 |
| Conventions d'erreur / pagination / non-divulgation | `docs/api.md` v2.6 §1.1, §1.4, §1.5 |
| Contact produit existant (non réactivé) | `docs/api.md` v2.6 §3.x — `POST /api/products/:id/contact` (lignes 965-1024) |
| Dernière migration appliquée | `server/migrations/018_referrals.sql` → V7 = `019_storefront.sql` |
| Expiration paresseuse (pattern V2, sans cron ici) | `docs/architecture.md` §5.2 |
| Migration manuelle en prod | `docs/rapport-final-v6.md:168` (`RUN_MIGRATIONS=false`) |
| Non-régression V5 | `docs/cahier-des-charges-v5.md:399` (CA-V5-069), `:400` (CA-V5-070), `:620` (CA-V5-150), `:498` (CA-V5-101) |
| Arbitrages définitifs du chef de projet (17/11/2026) | §2.2, §2.5 et §3.3 (`supersedes_id` = `ACTIVE` uniquement ; re-souscription sans champ, slug réservé au vendeur) · §4.2(3)/§4.3/§6 (403 `NOT_PRODUCT_OWNER`) · §2.4/§4.2(6) (`product.contact`) · §8 (R-V7-A1/A2/A3 clos) |
| Type de notification réutilisé | `notification_type = 'product.contact'` (V4/N14, conservé en base en V5 — CA-V5-099) ; aucun type/enum modifié |
