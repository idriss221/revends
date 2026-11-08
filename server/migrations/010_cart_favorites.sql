-- ============================================================
-- ReVends — 010_cart_favorites.sql  (PostgreSQL 15+)
-- Panier (cart) et Favoris (favorites) — DDL
-- ============================================================

-- ---------- CART ----------
CREATE TABLE IF NOT EXISTS cart (
    id            BIGSERIAL PRIMARY KEY,
    user_id       BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    product_id    BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    qty           SMALLINT NOT NULL DEFAULT 1 CHECK (qty BETWEEN 1 AND 9),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_cart_user_product UNIQUE (user_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_cart_user ON cart(user_id);

-- Trigger updated_at pour cart
CREATE TRIGGER trg_cart_updated
    BEFORE UPDATE ON cart
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------- FAVORITES ----------
CREATE TABLE IF NOT EXISTS favorites (
    id            BIGSERIAL PRIMARY KEY,
    user_id       BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    product_id    BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_favorites_user_product UNIQUE (user_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_favorites_user ON favorites(user_id);

-- Note : pas de trigger updated_at sur favorites (pas de colonne updated_at)