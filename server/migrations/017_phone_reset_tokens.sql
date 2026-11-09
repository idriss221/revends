-- ============================================================
-- ReVends — 017_phone_reset_tokens.sql  (PostgreSQL 15+)
--
-- Réinitialisation du numéro WhatsApp : chaque destinataire de la
-- campagne reçoit un lien unique `/update-phone?token=…` valable
-- 7 jours, à usage unique. Le jeton est stocké haché (SHA-256),
-- comme `password_reset_tokens`. La page liée permet de saisir
-- le nouveau numéro (+221, 9 chiffres, 7…) qui ÉCRASE l'ancien.
-- ============================================================

CREATE TABLE IF NOT EXISTS phone_reset_tokens (
    id         BIGSERIAL PRIMARY KEY,
    user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at    TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS phone_reset_tokens_user_id_idx ON phone_reset_tokens(user_id);
CREATE INDEX IF NOT EXISTS phone_reset_tokens_hash_idx ON phone_reset_tokens(token_hash);
