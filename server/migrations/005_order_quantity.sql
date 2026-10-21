-- ============================================================
-- ReVends — 005_order_quantity.sql  (PostgreSQL 15+)
-- PANIER +/− (backend) : quantité par produit portée par la commande.
-- Source : exigence produit « panier avec +/− ».
-- Prérequis : 001..004 appliqués.
--
-- La quantité s'applique à UNE commande (1 ligne orders par produit,
-- uq_one_active_order_per_product inchangée) : le montant et la commission
-- sont calculés côté service sur price * quantity.
--
-- Idempotent : ADD COLUMN IF NOT EXISTS + DROP CONSTRAINT IF EXISTS avant
-- ADD (PostgreSQL ne permet pas ADD CONSTRAINT IF NOT EXISTS).
-- ============================================================

ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS quantity INTEGER NOT NULL DEFAULT 1;

-- Garde-fou BDD (miroir de la validation serveur 1..9, défense en profondeur).
ALTER TABLE orders DROP CONSTRAINT IF EXISTS chk_order_quantity_range;
ALTER TABLE orders ADD CONSTRAINT chk_order_quantity_range
    CHECK (quantity BETWEEN 1 AND 9);