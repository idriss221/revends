-- ============================================================================
-- 018 — PARRAINAGE « LE CERCLE DES 10 »
-- ============================================================================
--
-- Objectif produit : un vendeur qui fait publier 10 filleuls validés reçoit le
-- badge Ambassadeur + un mois de Vitrine offerte.
--
-- Deux principes non négociables :
--  1. **Qualification à l'approbation d'un article** — pas à l'inscription :
--     un compte vide ne compte pas (anti-fraude, anti-spam) ;
--  2. **traçabilité** : une ligne `referral_qualifications` par filleul, avec
--     l'article qui a déclenché la qualification. La contrainte UNIQUE
--     (referee_id) rend le crédit idempotent : un second article approuvé ne
--     recrédite jamais le parrain.
-- ============================================================================

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS referral_code    VARCHAR(16),
  ADD COLUMN IF NOT EXISTS referred_by      BIGINT REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ambassador_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS vitrine_until    TIMESTAMPTZ;

-- Code de parrainage : court, lisible, non devinable (8 hex = 4 294 967 296
-- combinaisons). Le DEFAULT couvre les INSERT existants (inscription, OAuth)
-- sans modifier leur SQL ; le backfill couvre les comptes déjà en base.
ALTER TABLE users
  ALTER COLUMN referral_code
  SET DEFAULT ('RV' || upper(substr(md5(random()::text), 1, 8)));

UPDATE users
   SET referral_code = 'RV' || upper(substr(md5(random()::text || id::text || clock_timestamp()::text), 1, 8))
 WHERE referral_code IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_users_referral_code ON users (referral_code);
CREATE INDEX IF NOT EXISTS idx_users_referred_by ON users (referred_by) WHERE referred_by IS NOT NULL;

CREATE TABLE IF NOT EXISTS referral_qualifications (
    id           BIGSERIAL PRIMARY KEY,
    referrer_id  BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    referee_id   BIGINT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    product_id   BIGINT REFERENCES products(id) ON DELETE SET NULL,
    qualified_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_referral_not_self CHECK (referrer_id <> referee_id)
);

CREATE INDEX IF NOT EXISTS idx_referral_qualifications_referrer
    ON referral_qualifications (referrer_id, qualified_at DESC);
