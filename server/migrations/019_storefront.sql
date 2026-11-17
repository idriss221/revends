-- ============================================================================
-- 019_storefront.sql — V7 HÉBERGEMENT DES VENDEURS (PostgreSQL 15+)
-- Prérequis : 001 → 018 appliqués. Exécuté par migrate.ts dans BEGIN/COMMIT.
-- ADDITIF : aucune colonne ajoutée à une table existante, aucun type/enum
-- existant modifié (notification_type strictement inchangé — 'product.contact'
-- est réutilisée telle quelle). Aucun trigger sur products.
-- ============================================================================

-- ---------- 1. RÉFÉRENTIEL DES FORFAITS ----------
CREATE TABLE IF NOT EXISTS subscription_plans (
    id            BIGSERIAL PRIMARY KEY,
    name          VARCHAR(40) NOT NULL UNIQUE,                 -- 'Découverte' | 'Boutique' | 'Atelier'
    price_fcfa    INTEGER     NOT NULL CHECK (price_fcfa > 0), -- entier FCFA, jamais 0 (CA-V7-010)
    quota         INTEGER     NOT NULL CHECK (quota > 0),      -- annonces de BOUTIQUE simultanées
    duration_days SMALLINT    NOT NULL DEFAULT 30 CHECK (duration_days = 30), -- 30 j glissants (PO-V7-03)
    active        BOOLEAN     NOT NULL DEFAULT TRUE,           -- désactivation future sans CRUD
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

-- ---------- 2. ENUM DE STATUT (nouveau type, aucun existant modifié) ----------
CREATE TYPE subscription_status AS ENUM ('PENDING', 'ACTIVE', 'EXPIRED', 'CANCELLED');

-- ---------- 3. ABONNEMENTS VENDEUR ----------
CREATE TABLE IF NOT EXISTS seller_subscriptions (
    id            BIGSERIAL PRIMARY KEY,
    seller_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plan_id       BIGINT NOT NULL REFERENCES subscription_plans(id) ON DELETE RESTRICT,
    status        subscription_status NOT NULL DEFAULT 'PENDING',
    slug          VARCHAR(40) NOT NULL,                  -- normalisé, format checké (§ chk ci-dessous)
    supersedes_id BIGINT REFERENCES seller_subscriptions(id) ON DELETE SET NULL, -- changement de forfait uniquement : cible l'ACTIVE du connecté
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
-- d'écriture unique) : changement de forfait ET re-souscription après
-- EXPIRED/CANCELLED réutilisent SON slug. D'où l'index PARTIEL.
CREATE UNIQUE INDEX IF NOT EXISTS uq_active_subscription_slug
    ON seller_subscriptions (slug) WHERE status = 'ACTIVE';

CREATE INDEX IF NOT EXISTS idx_seller_subscriptions_seller
    ON seller_subscriptions (seller_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_seller_subscriptions_pending
    ON seller_subscriptions (created_at) WHERE status = 'PENDING';   -- file admin (CA-V7-051)

COMMENT ON COLUMN seller_subscriptions.supersedes_id IS
    'Changement de forfait uniquement : cible l''abonnement ACTIVE du vendeur connecté. NULL pour une souscription initiale ou une re-souscription après EXPIRED/CANCELLED (slug récupéré par réservation par vendeur, indépendamment de ce champ)';

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
-- La valeur 'product.contact' existe déjà dans notification_type (V4/N14, DDL 008),
-- conservée en base après V5 (CA-V5-099). Aucune évolution de type ici :
-- la route V7 réutilise cette valeur avec un titre boutique + expéditeur.
-- Aucune union TypeScript partagée n'est étendue (décision chef de projet, R-V7-A3 clos).
