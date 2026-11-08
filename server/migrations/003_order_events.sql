-- ============================================================
-- ReVends — 003_order_events.sql  (PostgreSQL 15+)
-- ÉVOLUTION V3 : cycle de commande à 9 étapes + journal `order_events`.
-- Source : docs/architecture.md §11 (Évolution V3).
-- Prérequis : 001_init.sql + 002_seed_categories.sql déjà appliqués.
--
-- Exécution : migrate.ts enveloppe CHAQUE fichier dans BEGIN/COMMIT.
--   ⚠️ ALTER TYPE ... ADD VALUE est autorisé en transaction depuis PG12,
--      MAIS la valeur ajoutée n'est pas utilisable avant le COMMIT.
--      Ce fichier ne réutilise aucune valeur d'enum ajoutée → sûr.
-- ============================================================

-- ============================================================
-- 1. NOUVEL ENUM order_status (11 valeurs — cycle livraison V3)
-- ============================================================
-- Stratégie sûre (pas de DROP TYPE avant d'avoir détaché la colonne) :
--   create order_status_v2 → ALTER COLUMN ... TYPE ... USING(mapping)
--   → drop ancien type → rename v2 → order_status.
-- L'ancien type est référencé par : le DEFAULT de orders.status et deux
-- index partiels. On les détache AVANT l'ALTER, sinon dépendance bloquante.

-- 1.1 Détacher les dépendances de l'ancien type
DROP INDEX IF EXISTS uq_one_active_order_per_product;   -- recréé en §3 (périmètre élargi)
DROP INDEX IF EXISTS idx_orders_payouts;                -- obsolète : orders.status ne pilote plus le payout
ALTER TABLE orders ALTER COLUMN status DROP DEFAULT;    -- le DEFAULT référence l'ancien type

-- 1.2 Nouveau type
CREATE TYPE order_status_v2 AS ENUM (
    'CREATED',           -- commande créée (état transitoire interne, journalisé)
    'PAYMENT_PENDING',   -- en attente du paiement acheteur (réservation 15 min)
    'PAID',              -- paiement acheteur confirmé (produit → SOLD)
    'PRODUCT_WAITING',   -- en attente de remise du produit à la plateforme
    'PRODUCT_RECEIVED',  -- produit reçu par la plateforme
    'PREPARING',         -- produit en préparation (contrôle / conditionnement)
    'IN_DELIVERY',       -- en cours de livraison vers l'acheteur
    'DELIVERED',         -- livré à l'acheteur
    'COMPLETED',         -- commande terminée (terminal)
    'PAYMENT_FAILED',    -- paiement non confirmé / réservation expirée (terminal)
    'CANCELLED'          -- annulée (terminal)
);

-- 1.3 Migration des données existantes (mapping V2 → V3)
--   WAITING_PAYMENT        → PAYMENT_PENDING
--   WAITING_SELLER_PAYMENT → PAID            (paiement acheteur confirmé en V2)
--   SELLER_PAID            → COMPLETED       (vendeur payé = fin de cycle V2)
--   PAYMENT_FAILED         → PAYMENT_FAILED
--   COMPLETED              → COMPLETED
--   CANCELLED              → CANCELLED
ALTER TABLE orders
    ALTER COLUMN status TYPE order_status_v2
    USING (
        CASE status::text
            WHEN 'WAITING_PAYMENT'        THEN 'PAYMENT_PENDING'
            WHEN 'WAITING_SELLER_PAYMENT' THEN 'PAID'
            WHEN 'SELLER_PAID'            THEN 'COMPLETED'
            WHEN 'PAYMENT_FAILED'         THEN 'PAYMENT_FAILED'
            WHEN 'COMPLETED'              THEN 'COMPLETED'
            WHEN 'CANCELLED'              THEN 'CANCELLED'
            ELSE 'CANCELLED'   -- filet de sécurité : valeur inconnue → terminal sûr
        END
    )::order_status_v2;

ALTER TABLE orders ALTER COLUMN status SET DEFAULT 'CREATED';

-- 1.4 Suppression de l'ancien type et reprise du nom canonique
DROP TYPE order_status;
ALTER TYPE order_status_v2 RENAME TO order_status;

-- ============================================================
-- 2. TABLE order_events — journal horodaté des changements de statut
-- ============================================================
-- Règle d'identité : 1 changement de statut = exactement 1 ligne.
-- from_status NULL = état initial (création). Toute mutation de statut
-- applicative DOIT insérer la ligne correspondante dans la même transaction.
CREATE TABLE order_events (
    id          BIGSERIAL PRIMARY KEY,
    order_id    BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    from_status order_status,                                      -- NULL = état initial
    to_status   order_status NOT NULL,
    actor       VARCHAR(10) NOT NULL CHECK (actor IN ('system', 'admin', 'user')),
    note        TEXT,                                              -- contexte libre (réf. paiement, motif…)
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_order_events_order ON order_events(order_id, created_at, id);

-- Reprise de l'historique : 1 événement « migration » par commande existante.
-- (Les commandes créées après V3 écriront leurs 2 événements initiaux en service.)
INSERT INTO order_events (order_id, from_status, to_status, actor, note, created_at)
SELECT o.id, NULL, o.status, 'system', 'Reprise historique — migration V3 (003)', o.created_at
  FROM orders o;

-- ============================================================
-- 3. Réindexation anti-double-commande + file d'opérations logistiques
-- ============================================================
-- Ensemble « actif » (produit engagé) = de CREATED à DELIVERED inclus.
-- Une commande active bloque toute re-commande du même produit.
-- COMPLETED / PAYMENT_FAILED / CANCELLED libèrent l'index — en pratique seuls
-- CREATED / PAYMENT_PENDING sont réellement rejouables, car le produit passe
-- SOLD dès PAID (donc plus jamais AVAILABLE).
CREATE UNIQUE INDEX uq_one_active_order_per_product
    ON orders(product_id)
    WHERE status IN ('CREATED', 'PAYMENT_PENDING', 'PAID', 'PRODUCT_WAITING',
                     'PRODUCT_RECEIVED', 'PREPARING', 'IN_DELIVERY', 'DELIVERED');

-- File de suivi logistique admin (remplace idx_orders_payouts, obsolète).
CREATE INDEX idx_orders_delivery ON orders(created_at ASC, id)
    WHERE status IN ('PAID', 'PRODUCT_WAITING', 'PRODUCT_RECEIVED',
                     'PREPARING', 'IN_DELIVERY', 'DELIVERED');

-- ============================================================
-- 4. Garde-fou : matrice de transitions (défense en profondeur)
-- ============================================================
-- L'application DOIT pré-vérifier la transition et répondre 409 (statut actuel)
-- avant toute mutation ; ce trigger est le filet de sécurité base (SQLSTATE P0001)
-- qui rend une transition invalide impossible même en cas de bug applicatif.
CREATE OR REPLACE FUNCTION enforce_order_status_transition() RETURNS trigger AS $$
BEGIN
    IF NEW.status = OLD.status THEN
        RETURN NEW;   -- pas un changement de statut : autorisé (ex. mise à jour d'autres colonnes)
    END IF;
    -- CANCELLED n'est atteignable qu'AVANT paiement (produit encore libérable).
    -- Après PAID le produit est SOLD : une annulation/remboursement relève d'un
    -- flux dédié hors périmètre V3 (voir architecture §11, point ouvert).
    IF NOT (
        -- Flux standard (paiement avant réception)
        (OLD.status = 'CREATED'          AND NEW.status IN ('PAYMENT_PENDING', 'PAYMENT_FAILED', 'CANCELLED')) OR
        (OLD.status = 'PAYMENT_PENDING'  AND NEW.status IN ('PAID', 'PAYMENT_FAILED', 'CANCELLED', 'PRODUCT_RECEIVED')) OR
        (OLD.status = 'PAID'             AND NEW.status = 'PRODUCT_WAITING') OR
        (OLD.status = 'PRODUCT_WAITING'  AND NEW.status = 'PRODUCT_RECEIVED') OR
        -- Flux paiement à la livraison (paiement APRÈS réception)
        (OLD.status = 'PAYMENT_PENDING'  AND NEW.status = 'PRODUCT_RECEIVED') OR
        (OLD.status = 'PRODUCT_RECEIVED' AND NEW.status IN ('PAID', 'PAYMENT_FAILED', 'CANCELLED')) OR
        (OLD.status = 'PAID'             AND NEW.status = 'PRODUCT_WAITING') OR
        -- Logistique (commun aux deux flux)
        (OLD.status = 'PRODUCT_WAITING'  AND NEW.status = 'PRODUCT_RECEIVED') OR
        (OLD.status = 'PRODUCT_RECEIVED' AND NEW.status = 'PREPARING') OR
        (OLD.status = 'PREPARING'        AND NEW.status = 'IN_DELIVERY') OR
        (OLD.status = 'IN_DELIVERY'      AND NEW.status = 'DELIVERED') OR
        (OLD.status = 'DELIVERED'        AND NEW.status = 'COMPLETED')
    ) THEN
        RAISE EXCEPTION 'Transition de commande invalide : % -> %', OLD.status, NEW.status
            USING ERRCODE = 'P0001',
                  HINT = 'Matrice des transitions : docs/architecture.md §11.';
    END IF;
    RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_orders_status_transition
    BEFORE UPDATE OF status ON orders
    FOR EACH ROW EXECUTE FUNCTION enforce_order_status_transition();

-- ============================================================
-- 5. Extension notification_type (historique livraison V3)
-- ============================================================
-- Nouvelles notifications du cycle logistique. Valeurs ajoutées en fin
-- d'enum (pas de BEFORE/AFTER → pas de ralentissement de comparaison notable).
-- ⚠️ Ajoutées ici en transaction : ne PAS les insérer dans ce même fichier.
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'order_product_waiting';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'order_product_received';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'order_preparing';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'order_in_delivery';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'order_delivered';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'order_completed';

-- ============================================================
-- 6. Colonnes manquantes du cycle V3 (ajout sur 003 non encore
--    appliqué — api.md §2.7 / §3.6, CA-ORD04-01, PO-6)
-- ============================================================
-- delivery_carrier / tracking_number : renseignées par start-delivery
-- (optionnelles, ≤ 100 caractères, visibles acheteur/vendeur/admin).
ALTER TABLE orders
    ADD COLUMN delivery_carrier VARCHAR(100),
    ADD COLUMN tracking_number  VARCHAR(100);
ALTER TABLE orders
    ADD CONSTRAINT chk_delivery_carrier_len CHECK (delivery_carrier IS NULL OR char_length(delivery_carrier) BETWEEN 1 AND 100);
ALTER TABLE orders
    ADD CONSTRAINT chk_tracking_number_len CHECK (tracking_number IS NULL OR char_length(tracking_number) BETWEEN 1 AND 100);

-- sold_at : horodatage de la vente définitive (api.md §3.6
-- confirm-payment, étape 3 — absent du DDL 001).
ALTER TABLE products ADD COLUMN sold_at TIMESTAMPTZ;
