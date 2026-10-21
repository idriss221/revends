-- ============================================================
-- ReVends — 001_init.sql  (PostgreSQL 15+)
-- Source : docs/architecture.md §4 (DDL de référence)
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;   -- recherche ILIKE %mot% (D12)

-- ---------- ENUMS ----------
CREATE TYPE user_role          AS ENUM ('user', 'admin');
CREATE TYPE product_condition  AS ENUM ('Neuf', 'Très bon état', 'Bon état', 'Correct', 'À réparer');
CREATE TYPE product_status     AS ENUM ('PENDING', 'AVAILABLE', 'RESERVED', 'SOLD', 'REJECTED');  -- D4
CREATE TYPE order_status       AS ENUM ('WAITING_PAYMENT', 'PAYMENT_FAILED',
                                        'WAITING_SELLER_PAYMENT', 'SELLER_PAID',
                                        'COMPLETED', 'CANCELLED');                                  -- D5
CREATE TYPE payment_status     AS ENUM ('PENDING', 'PAID', 'FAILED');
CREATE TYPE payment_method     AS ENUM ('MOBILE_MONEY', 'CASH', 'BANK_TRANSFER', 'OTHER');         -- D1
CREATE TYPE payout_status      AS ENUM ('PENDING', 'PAID');
CREATE TYPE notification_type  AS ENUM ('article_submitted', 'article_approved', 'article_rejected',
                                        'order_created', 'payment_confirmed', 'article_reserved',
                                        'reservation_expired', 'seller_paid', 'article_sold');      -- N1..N8

-- ---------- USERS ----------
CREATE TABLE users (
    id            BIGSERIAL PRIMARY KEY,
    display_name  VARCHAR(50)  NOT NULL CHECK (char_length(display_name) BETWEEN 2 AND 50),  -- D2, pseudo public
    name          VARCHAR(100) NOT NULL,      -- nom complet, PRIVÉ
    email         VARCHAR(255) NOT NULL UNIQUE,
    phone         VARCHAR(30)  NOT NULL UNIQUE CHECK (phone ~ '^\+?[0-9 ]{8,20}$'),
    password_hash TEXT         NOT NULL,      -- bcryptjs, CA-AUTH01-03
    role          user_role    NOT NULL DEFAULT 'user',
    accepted_cgu  BOOLEAN      NOT NULL DEFAULT FALSE,  -- CA-AUTH01-01 (bloquant à l'inscription)
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- ---------- CATEGORIES (D7, hiérarchique, 2 niveaux) ----------
CREATE TABLE categories (
    id         BIGSERIAL PRIMARY KEY,
    parent_id  BIGINT REFERENCES categories(id) ON DELETE RESTRICT,  -- NULL = catégorie, sin. sous-catégorie
    name       VARCHAR(100) NOT NULL,
    slug       VARCHAR(120) NOT NULL UNIQUE,
    active     BOOLEAN      NOT NULL DEFAULT TRUE,                   -- CA-ADM06
    created_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT categories_no_self_parent CHECK (parent_id <> id)
);
CREATE INDEX idx_categories_parent ON categories(parent_id) WHERE parent_id IS NOT NULL;

-- Max 2 niveaux (pas de sous-sous-catégorie) : trigger
CREATE OR REPLACE FUNCTION enforce_category_depth() RETURNS trigger AS $$
BEGIN
    IF NEW.parent_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM categories WHERE id = NEW.parent_id AND parent_id IS NOT NULL
    ) THEN
        RAISE EXCEPTION 'categories: max depth 2 (sous-catégorie seulement)';
    END IF;
    RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER trg_categories_depth BEFORE INSERT OR UPDATE ON categories
    FOR EACH ROW EXECUTE FUNCTION enforce_category_depth();

-- ---------- PRODUCTS ----------
CREATE TABLE products (
    id              BIGSERIAL PRIMARY KEY,
    owner_id        BIGINT NOT NULL REFERENCES users(id),
    category_id     BIGINT NOT NULL REFERENCES categories(id),       -- sous-catégorie (validée serveur)
    name            VARCHAR(120) NOT NULL CHECK (char_length(name) BETWEEN 3 AND 120),  -- CA-SELL01-01
    slug            VARCHAR(140) NOT NULL UNIQUE,
    description     TEXT   NOT NULL CHECK (char_length(description) BETWEEN 10 AND 2000),
    condition       product_condition NOT NULL,
    price           INTEGER NOT NULL CHECK (price BETWEEN 500 AND 10000000),  -- RG-PROD-1, entier FCFA
    location        VARCHAR(100) NOT NULL CHECK (char_length(location) BETWEEN 3 AND 100),
    status          product_status NOT NULL DEFAULT 'PENDING',       -- D4
    rejection_reason VARCHAR(255),                                   -- obligatoire si REJECTED (RG-REFUS, liste fermée)
    approved_at     TIMESTAMPTZ,
    approved_by     BIGINT REFERENCES users(id),
    brand           VARCHAR(100),                                    -- D8
    model           VARCHAR(100),                                    -- D8
    age_years       INTEGER CHECK (age_years IS NULL OR age_years BETWEEN 0 AND 100),  -- D8
    defects         TEXT,                                            -- D8
    accessories     TEXT,                                            -- D8
    notes           TEXT,                                            -- D8
    reserved_at     TIMESTAMPTZ,                                     -- D3
    reserved_until  TIMESTAMPTZ,                                     -- D3 : now() + interval '15 minutes'
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_rejection_reason CHECK (status <> 'REJECTED' OR rejection_reason IS NOT NULL),
    CONSTRAINT chk_approval_pair    CHECK ((approved_at IS NULL) = (approved_by IS NULL)),
    CONSTRAINT chk_reserved_pair    CHECK ((status = 'RESERVED') = (reserved_at IS NOT NULL AND reserved_until IS NOT NULL))
);
CREATE INDEX idx_products_owner     ON products(owner_id);
CREATE INDEX idx_products_category  ON products(category_id);
CREATE INDEX idx_products_catalog   ON products(created_at DESC, id) WHERE status = 'AVAILABLE';
CREATE INDEX idx_products_price_asc ON products(price ASC, id)      WHERE status = 'AVAILABLE';
CREATE INDEX idx_products_price_desc ON products(price DESC, id)    WHERE status = 'AVAILABLE';
CREATE INDEX idx_products_moderation ON products(created_at ASC)    WHERE status IN ('PENDING', 'REJECTED');
CREATE INDEX idx_products_name_trgm ON products USING gin (name gin_trgm_ops);   -- D12

-- ---------- PRODUCT_IMAGES (RG-MEDIA-1 : 1 à 4 photos) ----------
CREATE TABLE product_images (
    id         BIGSERIAL PRIMARY KEY,
    product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    path       TEXT   NOT NULL,             -- "uploads/products/<uuid>.<ext>" (nom aléatoire)
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    position   SMALLINT NOT NULL CHECK (position BETWEEN 1 AND 4),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_product_position UNIQUE (product_id, position)
);
CREATE UNIQUE INDEX uq_one_primary_per_product ON product_images(product_id) WHERE is_primary;  -- 1 seule photo principale

-- ---------- ORDERS ----------
CREATE SEQUENCE orders_number_seq;   -- D11 : trigger avant insertion
CREATE TABLE orders (
    id             BIGSERIAL PRIMARY KEY,
    order_number   VARCHAR(20) NOT NULL UNIQUE,   -- 'CMD-%06d' (D11), rempli par trigger
    product_id     BIGINT NOT NULL REFERENCES products(id),
    buyer_id       BIGINT NOT NULL REFERENCES users(id),
    seller_id      BIGINT NOT NULL REFERENCES users(id),   -- fingerprint du vendeur au moment de la commande (§8)
    amount         INTEGER NOT NULL CHECK (amount > 0),    -- = prix au moment de la vente (§8)
    commission     INTEGER NOT NULL CHECK (commission >= 0),   -- floor(price*0.10), §7.3
    seller_amount  INTEGER NOT NULL CHECK (seller_amount >= 0), -- price - commission (§7.3)
    status         order_status NOT NULL DEFAULT 'WAITING_PAYMENT',
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_amount_consistency CHECK (amount = commission + seller_amount)
);
CREATE INDEX idx_orders_buyer  ON orders(buyer_id);
CREATE INDEX idx_orders_seller ON orders(seller_id);
CREATE INDEX idx_orders_created ON orders(created_at DESC);
CREATE INDEX idx_orders_payouts ON orders(created_at ASC) WHERE status = 'WAITING_SELLER_PAYMENT';
-- CLÉ un produit RESERVED a exactement UNE commande WAITING_PAYMENT active (§8, CA-BUY01-03)
CREATE UNIQUE INDEX uq_one_active_order_per_product ON orders(product_id) WHERE status = 'WAITING_PAYMENT';

CREATE OR REPLACE FUNCTION set_order_number() RETURNS trigger AS $$
BEGIN
    NEW.order_number := 'CMD-' || lpad(nextval('orders_number_seq')::text, 6, '0');
    RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER trg_orders_number BEFORE INSERT ON orders
    FOR EACH ROW EXECUTE FUNCTION set_order_number();

-- ---------- PAYMENTS (D1, D6) ----------
CREATE TABLE payments (
    id         BIGSERIAL PRIMARY KEY,
    order_id   BIGINT NOT NULL UNIQUE REFERENCES orders(id),   -- 1 paiement par commande
    amount     INTEGER NOT NULL CHECK (amount > 0),
    method     payment_method NOT NULL,
    status     payment_status NOT NULL DEFAULT 'PENDING',
    paid_at    TIMESTAMPTZ,                 -- renseigné quand status = PAID
    reference  VARCHAR(255),                -- référence fournie par l'admin (D1)
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- SELLER_PAYOUTS (CA-ADM04) ----------
CREATE TABLE seller_payouts (
    id         BIGSERIAL PRIMARY KEY,
    order_id   BIGINT NOT NULL UNIQUE REFERENCES orders(id),
    seller_id  BIGINT NOT NULL REFERENCES users(id),
    amount     INTEGER NOT NULL CHECK (amount > 0),      -- = orders.seller_amount
    status     payout_status NOT NULL DEFAULT 'PENDING',
    paid_at    TIMESTAMPTZ,
    reference  VARCHAR(255),
    paid_by    BIGINT REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_payout_paid CHECK (status <> 'PAID' OR (paid_at IS NOT NULL AND paid_by IS NOT NULL))
);

-- ---------- ADMIN_ACTIONS (V1 §27, §7.8) ----------
CREATE TABLE admin_actions (
    id          BIGSERIAL PRIMARY KEY,
    admin_id    BIGINT NOT NULL REFERENCES users(id),
    action      VARCHAR(50) NOT NULL,       -- 'product.approved' | 'product.rejected' | 'payment.confirmed' | 'seller.paid'
    target_type VARCHAR(20) NOT NULL,       -- 'product' | 'order'
    target_id   BIGINT NOT NULL,
    description TEXT NOT NULL,              -- ex. « Vendeur payé — CMD-000125 — 225 000 FCFA »
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_admin_actions_created ON admin_actions(created_at DESC);

-- ---------- NOTIFICATIONS (V1 §29, §10) ----------
CREATE TABLE notifications (
    id         BIGSERIAL PRIMARY KEY,
    user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type       notification_type NOT NULL,
    title      VARCHAR(255) NOT NULL,
    message    TEXT NOT NULL,
    read_at    TIMESTAMPTZ,                 -- NULL = non lue (CA-NOT01-01)
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_notifications_user ON notifications(user_id, created_at DESC);

-- ---------- SESSIONS (connect-pg-simple, §9.4) ----------
CREATE TABLE "session" (
    sid    varchar NOT NULL COLLATE "default",
    sess   json NOT NULL,
    expire timestamp(6) NOT NULL,
    CONSTRAINT session_pkey PRIMARY KEY (sid) NOT DEFERRABLE INITIALLY IMMEDIATE
);
CREATE INDEX idx_session_expire ON "session" (expire);

-- ---------- updated_at générique ----------
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER trg_users_updated      BEFORE UPDATE ON users           FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_categories_updated BEFORE UPDATE ON categories      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_products_updated   BEFORE UPDATE ON products        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_orders_updated     BEFORE UPDATE ON orders          FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_payments_updated   BEFORE UPDATE ON payments        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_payouts_updated    BEFORE UPDATE ON seller_payouts  FOR EACH ROW EXECUTE FUNCTION set_updated_at();