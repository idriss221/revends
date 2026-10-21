-- ============================================================================
-- ReVends — 012_password_reset.sql
--
-- Réinitialisation de mot de passe (parcours « mot de passe oublié »).
--
-- Deux objets :
--   1. `password_reset_tokens` — jetons de réinitialisation.
--      ⚠️ On stocke le HACHÉ du jeton (SHA-256), jamais le jeton en clair :
--      une fuite de la table ne permettrait pas de l'utiliser.
--      `used_at` rend le jeton À UNIQUE USAGE ; `expires_at` le fait expirer.
--   2. `users.password_changed_at` — invalide les sessions émises AVANT le
--      changement de mot de passe (une réinitialisation doit déconnecter
--      partout, pas seulement sur l'appareil courant).
--
-- Tables de référence : comme `users`, shard 0 est la source effective
-- (voir la dette documentée dans users.repository.ts :: findById).
-- ============================================================================

-- ⚠️ Pas de BEGIN/COMMIT ici : le migrateur (`src/db/migrate.ts`) enveloppe déjà
-- chaque fichier dans une transaction unique (BEGIN → SQL → INSERT
-- schema_migrations → COMMIT). Un BEGIN/COMMIT interne provoquerait un COMMIT
-- prématuré : le DDL serait validé avant l'enregistrement dans
-- schema_migrations (perte d'atomicité si l'INSERT échoue).

-- 1. Jetons de réinitialisation --------------------------------------------
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id         BIGSERIAL PRIMARY KEY,
  user_id    BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT         NOT NULL,        -- SHA-256 hex du jeton, jamais le jeton
  expires_at TIMESTAMPTZ  NOT NULL,
  used_at    TIMESTAMPTZ,                  -- NULL = encore valide
  created_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
  -- Un jeton ne sert qu'une fois : deux tentatives simultanées ne peuvent pas
  -- toutes les deux aboutir (l'une échouera sur cette contrainte).
  CONSTRAINT password_reset_token_hash_unique UNIQUE (token_hash)
);

-- Recherche du jeton par haché (chemin public de /auth/reset-password).
CREATE INDEX IF NOT EXISTS idx_password_reset_token_hash
  ON password_reset_tokens(token_hash);

-- « Invalider tous les jetons en cours de CET utilisateur » et purge des expirés.
CREATE INDEX IF NOT EXISTS idx_password_reset_user_created
  ON password_reset_tokens(user_id, created_at DESC);

-- 2. Horodatage du dernier changement de mot de passe ----------------------
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ;

-- DOWN
-- ---------------------------------------------------------------------------
-- ALTER TABLE users DROP COLUMN IF EXISTS password_changed_at;
-- DROP TABLE IF EXISTS password_reset_tokens;
