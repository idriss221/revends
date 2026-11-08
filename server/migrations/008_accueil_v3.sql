-- ============================================================
-- ReVends — 008_accueil_v3.sql  (PostgreSQL 15+)
-- Chantier « Accueil V3 » (docs/architecture-accueil-v3.md) :
--   1. products.old_price   — prix barré + % de réduction (D-ACC-2, RG-PROD-2)
--   2. products.view_count  — compteur de vues, tri « popular » (D-ACC-3, RG-PROD-3)
--   3. table banners        — carrousel d'accueil (D-ACC-1)
--   4. notification_type 'product.contact' — « Contacter le vendeur » (PO-ACC-1)
-- Prérequis : 007 appliqué ET COMMITÉ.
--
-- ⚠️ PAS DE SEED ICI (choix @architecte) : les migrations ne portent que de la
--    structure. Le seed des bannières se fait côté CODE (db/seed.ts →
--    seedBannersIfEmpty) et UNIQUEMENT si la table est vide, pour ne jamais
--    écraser la future gestion admin (PO-ACC-4). Contenu : constantes du code.
--
-- ⚠️ ALTER TYPE ... ADD VALUE est autorisé en transaction depuis PG12 ; la
--    valeur 'product.contact' ne sera utilisable qu'APRÈS commit de 008
--    (même règle que 006 pour SHIPPED) — aucun INSERT n'en dépend dans 008.
--
-- DOWN : les instructions de retour arrière sont notées en commentaire
--        à la fin de chaque bloc (§ « DOWN »).
-- ============================================================

-- ------------------------------------------------------------
-- 1. products.old_price — réduction (D-ACC-2, RG-PROD-2)
-- ------------------------------------------------------------
-- Prix affiché en barré quand old_price > price ; % de réduction calculé
-- côté front (RG-PROD-4). Nullable ; si renseigné, strictement > price
-- et <= 10 000 000 FCFA (borne du prix catalogue, RG-PROD-1).
ALTER TABLE products
    ADD COLUMN old_price INTEGER,
    ADD CONSTRAINT products_old_price_gt_price CHECK (old_price IS NULL OR old_price > price),
    ADD CONSTRAINT products_old_price_max     CHECK (old_price IS NULL OR old_price <= 10000000);

-- DOWN : ALTER TABLE products DROP CONSTRAINT products_old_price_gt_price,
--        DROP CONSTRAINT products_old_price_max, DROP COLUMN old_price;

-- ------------------------------------------------------------
-- 2. products.view_count — popularité (D-ACC-3, RG-PROD-3)
-- ------------------------------------------------------------
-- Compteur de consultations publiques d'une fiche produit (incrément +1 côté
-- serveur, jamais décrémenté). Défaut 0, jamais négatif.
ALTER TABLE products
    ADD COLUMN view_count INTEGER NOT NULL DEFAULT 0,
    ADD CONSTRAINT products_view_count_nonneg CHECK (view_count >= 0);

-- Tri « Plus populaires » (view_count DESC, id) : index partiel calqué sur les
-- index prix existants (seuls les produits AVAILABLE sortent en liste publique).
CREATE INDEX idx_products_view_count ON products(view_count DESC, id) WHERE status = 'AVAILABLE';

-- DOWN : DROP INDEX idx_products_view_count;
--        ALTER TABLE products DROP CONSTRAINT products_view_count_nonneg,
--        DROP COLUMN view_count;

-- ------------------------------------------------------------
-- 3. Table banners — carrousel d'accueil (D-ACC-1)
-- ------------------------------------------------------------
-- Bannières ACTIVE triées par position (GET /api/banners). image_path = URL
-- relative locale (« /categories/... » ou upload « /uploads/... »), NULL =
-- bannière sans image (CA-ACC-09 : dégradé de marque + texte). link_url :
-- route interne (« /search?q=... », « /category/... ») ou URL externe.
CREATE TABLE banners (
    id         BIGSERIAL PRIMARY KEY,
    title      VARCHAR(120) NOT NULL,            -- titre affiché (CA-ACC-08 : lisibilité)
    subtitle   VARCHAR(255),                     -- sous-titre optionnel
    image_path VARCHAR(255),                     -- URL relative locale (ou NULL, CA-ACC-09)
    link_url   VARCHAR(500),                     -- cible au clic (NULL = non cliquable, CA-ACC-05)
    position   SMALLINT NOT NULL,                -- ordre d'affichage (1 = premier)
    active     BOOLEAN  NOT NULL DEFAULT TRUE,   -- bannière visible uniquement si TRUE
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT banners_position_unique UNIQUE (position)
);
-- Pas d'index supplémentaire nécessaire à cette échelle (quelques dizaines de
-- lignes au plus) : la contrainte UNIQUE(position) couvre déjà l'ORDER BY du
-- GET /api/banners, et le filtre active = TRUE est un scan trivial.

-- DOWN : DROP TABLE banners;

-- ------------------------------------------------------------
-- 4. notification_type 'product.contact' (PO-ACC-1)
-- ------------------------------------------------------------
-- « Contacter le vendeur » : POST /api/products/:id/contact crée une
-- notification interne au vendeur de ce type (pas d'exposition du téléphone,
-- D2). Valeur ajoutée APRÈS 007, utilisable après COMMIT de 008.
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'product.contact';

-- DOWN : impossible de retirer une valeur d'enum PostgreSQL sans recréer le
--        type (opération lourde) — non applicable ; documenté volontairement.