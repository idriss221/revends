-- ============================================================
-- ReVends — 007_order_shipped_cycle.sql  (PostgreSQL 15+)
-- ÉVOLUTION : cycle « SHIPPED » — recrée le trigger de matrice et les
-- index partiels. Prérequis : 006 appliqué ET COMMITÉ (les valeurs
-- SHIPPED / DUE / order_shipped sont utilisables ICI, pas dans 006).
-- Source : contrat api.md §3.6 — le cycle devient
--   ... PRODUCT_RECEIVED → PREPARING → SHIPPED → IN_DELIVERY → DELIVERED → COMPLETED
--   et le payout PENDING → DUE (à la livraison) → PAID (au paiement vendeur).
--
-- CREATE OR REPLACE FUNCTION : le trigger `trg_orders_status_transition`
-- reste branché (il référence la fonction par son nom) — aucun DROP TRIGGER.
-- ============================================================

-- ============================================================
-- 1. Matrice de transitions (remplace PREPARING → IN_DELIVERY)
-- ============================================================
-- Toutes les autres transitions restent EXACTEMENT celles du DDL 003 §4 :
--   CREATED → PAYMENT_PENDING/PAYMENT_FAILED/CANCELLED
--   PAYMENT_PENDING → PAID/PAYMENT_FAILED/CANCELLED
--   PAID → PRODUCT_WAITING
--   PRODUCT_WAITING → PRODUCT_RECEIVED
--   PRODUCT_RECEIVED → PREPARING
--   PREPARING → SHIPPED            (NOUVEAU — remplace PREPARING → IN_DELIVERY)
--   SHIPPED → IN_DELIVERY         (NOUVEAU)
--   IN_DELIVERY → DELIVERED
--   DELIVERED → COMPLETED
CREATE OR REPLACE FUNCTION enforce_order_status_transition() RETURNS trigger AS $$
BEGIN
    IF NEW.status = OLD.status THEN
        RETURN NEW;   -- pas un changement de statut : autorisé (ex. mise à jour d'autres colonnes)
    END IF;
    -- CANCELLED n'est atteignable qu'AVANT paiement (produit encore libérable).
    -- Après PAID le produit est SOLD : une annulation/remboursement relève d'un
    -- flux dédié hors périmètre (voir architecture §11, point ouvert).
    IF NOT (
        (OLD.status = 'CREATED'          AND NEW.status IN ('PAYMENT_PENDING', 'PAYMENT_FAILED', 'CANCELLED')) OR
        (OLD.status = 'PAYMENT_PENDING'  AND NEW.status IN ('PAID', 'PAYMENT_FAILED', 'CANCELLED')) OR
        (OLD.status = 'PAID'             AND NEW.status = 'PRODUCT_WAITING') OR
        (OLD.status = 'PRODUCT_WAITING'  AND NEW.status = 'PRODUCT_RECEIVED') OR
        (OLD.status = 'PRODUCT_RECEIVED' AND NEW.status = 'PREPARING') OR
        (OLD.status = 'PREPARING'        AND NEW.status = 'SHIPPED') OR
        (OLD.status = 'SHIPPED'          AND NEW.status = 'IN_DELIVERY') OR
        (OLD.status = 'IN_DELIVERY'      AND NEW.status = 'DELIVERED') OR
        (OLD.status = 'DELIVERED'        AND NEW.status = 'COMPLETED')
    ) THEN
        RAISE EXCEPTION 'Transition de commande invalide : % -> %', OLD.status, NEW.status
            USING ERRCODE = 'P0001',
                  HINT = 'Matrice des transitions : docs/architecture.md §11.';
    END IF;
    RETURN NEW;
END $$ LANGUAGE plpgsql;

-- ============================================================
-- 2. Index partiels — SHIPPED rejoint les ensembles « actifs »
-- ============================================================
-- Ensemble « actif » (produit engagé) = de CREATED à DELIVERED inclus,
-- désormais AVEC SHIPPED. Une commande active bloque toute re-commande
-- du même produit ; COMPLETED / PAYMENT_FAILED / CANCELLED libèrent.
DROP INDEX IF EXISTS uq_one_active_order_per_product;
CREATE UNIQUE INDEX uq_one_active_order_per_product
    ON orders(product_id)
    WHERE status IN ('CREATED', 'PAYMENT_PENDING', 'PAID', 'PRODUCT_WAITING',
                     'PRODUCT_RECEIVED', 'PREPARING', 'SHIPPED',
                     'IN_DELIVERY', 'DELIVERED');

-- File de suivi logistique admin — SHIPPED entre dans la file des
-- commandes à livrer.
DROP INDEX IF EXISTS idx_orders_delivery;
CREATE INDEX idx_orders_delivery ON orders(created_at ASC, id)
    WHERE status IN ('PAID', 'PRODUCT_WAITING', 'PRODUCT_RECEIVED',
                     'PREPARING', 'SHIPPED', 'IN_DELIVERY', 'DELIVERED');