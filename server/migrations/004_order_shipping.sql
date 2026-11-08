-- ============================================================
-- ReVends — 004_order_shipping.sql  (PostgreSQL 15+)
-- PANIER multi-produits & livraison : coordonnées de livraison
-- (privées acheteur/admin — jamais en vue vendeur) + note acheteur.
-- Source : docs/api panier (checkout), CA-BUY-PANIER.
-- Prérequis : 001..003 appliqués.
--
-- Idempotent : ADD COLUMN IF NOT EXISTS / DROP CONSTRAINT IF EXISTS avant ADD
-- (PostgreSQL ne permet pas ADD CONSTRAINT IF NOT EXISTS).
-- ============================================================

ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS shipping_name    VARCHAR(120),
    ADD COLUMN IF NOT EXISTS shipping_phone   VARCHAR(30),
    ADD COLUMN IF NOT EXISTS shipping_city    VARCHAR(120),
    ADD COLUMN IF NOT EXISTS shipping_address VARCHAR(255),
    ADD COLUMN IF NOT EXISTS buyer_note       VARCHAR(500);

-- Longueurs maximales (miroir de la validation serveur, défense en profondeur).
-- Idempotence : DROP IF EXISTS puis ADD (PG ne supporte pas ADD CONSTRAINT IF NOT EXISTS).
ALTER TABLE orders DROP CONSTRAINT IF EXISTS chk_shipping_name_len;
ALTER TABLE orders ADD CONSTRAINT chk_shipping_name_len
    CHECK (shipping_name IS NULL OR char_length(shipping_name) BETWEEN 1 AND 120);
ALTER TABLE orders DROP CONSTRAINT IF EXISTS chk_shipping_phone_len;
ALTER TABLE orders ADD CONSTRAINT chk_shipping_phone_len
    CHECK (shipping_phone IS NULL OR char_length(shipping_phone) BETWEEN 8 AND 30);
ALTER TABLE orders DROP CONSTRAINT IF EXISTS chk_shipping_city_len;
ALTER TABLE orders ADD CONSTRAINT chk_shipping_city_len
    CHECK (shipping_city IS NULL OR char_length(shipping_city) BETWEEN 1 AND 120);
ALTER TABLE orders DROP CONSTRAINT IF EXISTS chk_shipping_address_len;
ALTER TABLE orders ADD CONSTRAINT chk_shipping_address_len
    CHECK (shipping_address IS NULL OR char_length(shipping_address) BETWEEN 1 AND 255);
ALTER TABLE orders DROP CONSTRAINT IF EXISTS chk_buyer_note_len;
ALTER TABLE orders ADD CONSTRAINT chk_buyer_note_len
    CHECK (buyer_note IS NULL OR char_length(buyer_note) BETWEEN 1 AND 500);