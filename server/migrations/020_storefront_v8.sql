-- ============================================================================
-- 020_storefront_v8.sql — V8 « HÉBERGEMENT BOUTIQUE » (PostgreSQL 15+)
-- Prérequis : 001 → 019 appliqués. Exécuté par migrate.ts dans BEGIN/COMMIT
--             (ou manuellement, runbook architecture §3 — RUN_MIGRATIONS=false
--             en prod ; application MANUELLE via runner trusted).
-- ADDITIF : 2 colonnes nullable sur seller_subscriptions (périmètre V7/V8,
--           PO-V8-05 retenu 18/11/2026) ; 3 nouvelles tables (résolution
--           §14.A/B clos : R2 retenue, monthly_metrics fusionne reports+snapshots) ;
--           0 trigger, 0 ALTER TYPE, 0 valeur d'enum, 0 modification des 001→019.
-- Écart consigné (DEFIANCE) : monthly_metrics.ca_fcfa est BIGINT (et non
-- INTEGER de l'architecture DDL §2.1.3) — consigne d'exécution du 18/11/2026,
-- cohérente avec R-V8-B05 (overflow > 2,1 Mds FCFA/mois).
-- ============================================================================

-- ---------- 1. RÉFÉRENCE DE PAIEMENT (Wave | Orange Money | virement) ----------
-- V8-D8 / F5 / CA-V8-050..057 — PO-V8-05 RETENU le 18/11/2026.
-- Types EXACTS exigés : varchar(64) / varchar(32). Nullable, sans défaut,
-- aucun backfill : les lignes existantes gardent NULL (CA-V8-053/056).
ALTER TABLE seller_subscriptions
    ADD COLUMN IF NOT EXISTS payment_reference varchar(64) NULL,   -- référence saisie vendeur (Wave-2026…, OM …, VIR/…)
    ADD COLUMN IF NOT EXISTS payment_method    varchar(32) NULL
        CHECK (payment_method IN ('wave', 'orange_money', 'virement'));

COMMENT ON COLUMN seller_subscriptions.payment_reference IS
    'Référence de paiement déclarée par le vendeur à la souscription (Wave/OM/virement). Visible back-office + propriétaire uniquement. Jamais publique, jamais loggée en clair (CA-V8-052/055).';
COMMENT ON COLUMN seller_subscriptions.payment_method IS
    'wave | orange_money | virement — renseignée à la souscription, vérifiée par l''admin avant activation. NULL sur les lignes pré-V8 (legacy activable, CA-V8-053).';

-- ---------- 2. PROFIL BOUTIQUE (branding 1:1 avec le vendeur) ----------
-- V8-D5 / F4 / CA-V8-040..049 — nouveau, aucun lien avec products ni users
-- au-delà de la PK seller_id → users(id).
CREATE TABLE IF NOT EXISTS storefront_profiles (
    seller_id          BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    logo_path          TEXT NULL,                 -- URL publique Blob (ou chemin disque /uploads/storefront/…) ; NULL = défaut
    banner_path        TEXT NULL,                 -- idem ; décorative (alt="" aria-hidden)
    public_description TEXT NULL,                  -- 0–500 caractères (char_length) — rendu échappé, jamais HTML brut
    collecte_address   TEXT NULL,                  -- 10–500 caractères ; INTERNE (0 occurrence publique)
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_storefront_profile_description
        CHECK (public_description IS NULL OR char_length(public_description) <= 500),
    CONSTRAINT chk_storefront_profile_collecte
        CHECK (collecte_address IS NULL OR (char_length(collecte_address) BETWEEN 10 AND 500)),
    CONSTRAINT chk_storefront_profile_logo_scheme
        CHECK (logo_path   IS NULL OR (logo_path   ~ '^(https?://|uploads/storefront/)')),
    CONSTRAINT chk_storefront_profile_banner_scheme
        CHECK (banner_path IS NULL OR (banner_path ~ '^(https?://|uploads/storefront/)'))
);

COMMENT ON TABLE  storefront_profiles IS
    'Branding boutique V8 (1:1 vendeur). Rendu public UNIQUEMENT si abonnement ACTIVE (CA-V8-045). collecte_address : strictement interne — CA-V8-044/049.';
COMMENT ON COLUMN storefront_profiles.collecte_address IS
    'Adresse de collecte INTERNE (propriétaire + admin/logistique). Aucune surface publique, e-mail, PDF, ni log (CA-V8-044/049/075).';

-- ---------- 3. MÉTRIQUES MENSUELLES (relevés de vues + bilan du 1er) ----------
-- V8-D7 / F6 / CA-V8-060..072 — PO-V8-04 RETENU (delta de snapshots).
-- 1 ligne par (subscription_id, period). Rôles de la même ligne :
--   stade « relevé »  (dernier jour de M, 28–31 à 06:00) : views_baseline = cumul, views_sum = 0, email_status NULL
--   stade « bilan »   (1er de M+1, 06:00)                : views_sum = delta, sales_count, ca_fcfa, email_status SENT|FAILED
-- Proposition A RETENUE (§14.C clos, 18/11/2026) :
-- views_baseline / email_status / sent_at sont des colonnes pleines de la table.
CREATE TABLE IF NOT EXISTS monthly_metrics (
    subscription_id  BIGINT NOT NULL REFERENCES seller_subscriptions(id) ON DELETE CASCADE,
    period           TEXT   NOT NULL,                -- '2026-11' (YYYY-MM, UTC)
    views_sum        INTEGER NOT NULL DEFAULT 0,     -- vues DU MOIS (delta) ; 0 au stade relevé
    sales_count      INTEGER NOT NULL DEFAULT 0,     -- ventes PAID sur le mois
    ca_fcfa          BIGINT  NOT NULL DEFAULT 0,     -- CA brut FCFA (BIGINT — DEFIANCE consignée, cf. en-tête)
    views_baseline   INTEGER NOT NULL DEFAULT 0,     -- cumul view_count capturé au relevé (28–31) — INTERNE, jamais sérialisé
    email_status     TEXT   NULL CHECK (email_status IN ('SENT','FAILED')),  -- NULL = relevé seulement ; 'SENT' terminal (PO-V8-08 : pas de renvoi V8)
    sent_at          TIMESTAMPTZ NULL,               -- rempli quand email_status est posé (SENT|FAILED)
    computed_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    PRIMARY KEY (subscription_id, period),           -- = UNIQUE(subscription_id, period) — CA-V8-063
    CONSTRAINT chk_monthly_metrics_period
        CHECK (period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
    CONSTRAINT chk_monthly_metrics_nonneg
        CHECK (views_sum >= 0 AND sales_count >= 0 AND ca_fcfa >= 0 AND views_baseline >= 0)
);

COMMENT ON TABLE monthly_metrics IS
    'V8 bilan mensuel : relevés de vues (dernier jour) + ligne de bilan idempotente au 1er (CA-V8-063/070). Aucune donnée acheteur, aucune coordonnée vendeur (CA-V8-072/075).';
COMMENT ON COLUMN monthly_metrics.views_sum IS
    'Delta de view_count sur le mois (dernier relevé − relevé précédent). Premier bilan : cumul courant, libellé « vues cumulées (1er relevé) » (CA-V8-070).';
COMMENT ON COLUMN monthly_metrics.views_baseline IS
    'Cumul view_count au relevé (dernier jour de M, 00:00→06:00). INTERNE : jamais exposé par l''API/PDF/e-mail — sert uniquement au calcul du delta au bilan (CA-V8-070).';
COMMENT ON COLUMN monthly_metrics.email_status IS
    'NULL = relevé (ou bilan en cours) ; SENT | FAILED = bilan du 1er effectué. Aucune transition depuis SENT (PO-V8-08). Garantit l''idempotence (CA-V8-063/069).';

-- ---------- 4. TRAÇABILITÉ AUTO-APPROBATIONS (V8-D2/F1 — R2 RETENUE, §14.A clos) ----------
CREATE TABLE IF NOT EXISTS auto_approved_products (
    product_id      BIGINT PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
    seller_id       BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    subscription_id BIGINT NOT NULL REFERENCES seller_subscriptions(id) ON DELETE CASCADE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- 5. INDEX (minimaux, additivement) ----------
-- Consultation du bilan / Stats : historique ≤ 12 mois, tri period DESC.
CREATE INDEX IF NOT EXISTS idx_monthly_metrics_subscription_period
    ON monthly_metrics (subscription_id, period DESC);

-- File admin des auto-approbations (R2 retenue, §14.A clos)
CREATE INDEX IF NOT EXISTS idx_auto_approved_products_created
    ON auto_approved_products (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_auto_approved_products_subscription
    ON auto_approved_products (subscription_id, created_at DESC);

-- Aucun index sur les tables existantes (CA-V8-001) ; idx_seller_subscriptions_pending
-- (V7) couvre la file admin PENDING. Aucun trigger, aucun ALTER TYPE (CA-V8-002).
-- La migration est rejouable : tout est IF NOT EXISTS (ADD COLUMN, CREATE TABLE/INDEX).
