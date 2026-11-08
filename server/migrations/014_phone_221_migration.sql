-- ============================================================
-- ReVends — 014_phone_221_migration.sql  (PostgreSQL 15+)
--
-- Migration CONTRÔLÉE des anciens numéros sénégalais enregistrés par erreur
-- avec +225 (ou 00225 / 225). Règles strictes :
--   · seuls les numéros dont la partie nationale après 225 compte 9 chiffres
--     et commence par 7 (mobile Sénégal) sont candidats ;
--   · les numéros ivoiriens (10 chiffres après 225 : 07…, 05…, 01…, 25…, 27…)
--     ne sont JAMAIS touchés ;
--   · un candidat dont le +221 existe déjà n'est PAS mis à jour (anti-doublon) :
--     il est journalisé « skipped_duplicate » pour vérification manuelle ;
--   · toute modification est journalisée dans phone_migration_audit, avec
--     l'ancienne valeur : la migration est traçable et réversible à la main.
-- ============================================================

CREATE TABLE IF NOT EXISTS phone_migration_audit (
    id         BIGSERIAL PRIMARY KEY,
    user_id    BIGINT NOT NULL,
    old_phone  TEXT NOT NULL,
    new_phone  TEXT,
    action     VARCHAR(30) NOT NULL
               CHECK (action IN ('corrected', 'skipped_duplicate', 'skipped_foreign')),
    reason     TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

WITH digits AS (
    SELECT u.id,
           u.phone,
           regexp_replace(u.phone, '[^0-9]', '', 'g') AS d
      FROM users u
),
candidates AS (
    SELECT id,
           phone,
           CASE
             WHEN d LIKE '00225%' THEN substring(d FROM 6)
             WHEN d LIKE '225%'   THEN substring(d FROM 4)
             ELSE NULL
           END AS national
      FROM digits
),
senegal AS (
    SELECT id, phone, national
      FROM candidates
     WHERE national IS NOT NULL
       AND national ~ '^7[0-9]{8}$'
),
classified AS (
    SELECT s.id,
           s.phone,
           '+221' || s.national AS new_phone,
           (
             EXISTS (
               SELECT 1 FROM users other
                WHERE other.id <> s.id
                  AND regexp_replace(other.phone, '[^0-9]', '', 'g') = '221' || s.national
             )
             -- Deux lignes candidates vers le MÊME +221 (ex. `+225 77…` et
             -- `00225 77…`) violeraient l'unicité `users.phone` : on n'en
             -- corrige qu'UNE (le plus petit id), l'autre est journalisée.
             OR row_number() OVER (PARTITION BY s.national ORDER BY s.id) > 1
           ) AS duplicate
      FROM senegal s
),
logged AS (
    INSERT INTO phone_migration_audit (user_id, old_phone, new_phone, action, reason)
    SELECT id, phone, new_phone,
           CASE WHEN duplicate THEN 'skipped_duplicate' ELSE 'corrected' END,
           CASE WHEN duplicate
                THEN 'Un compte possède déjà ce numéro en +221 — aucune modification.'
                ELSE 'Numéro sénégalais (9 chiffres, mobile 7…) enregistré avec +225.'
           END
      FROM classified
    RETURNING user_id, action
)
UPDATE users u
   SET phone = c.new_phone
  FROM classified c
 WHERE u.id = c.id
   AND c.duplicate = FALSE;

-- Journal des numéros étrangers conservés (225 + 10 chiffres = Côte d'Ivoire,
-- et tout autre indicatif) : uniquement pour le rapport, aucune modification.
INSERT INTO phone_migration_audit (user_id, old_phone, new_phone, action, reason)
SELECT u.id,
       u.phone,
       u.phone,
       'skipped_foreign',
       'Indicatif étranger ou format non sénégalais : conservé tel quel.'
  FROM users u
 WHERE regexp_replace(u.phone, '[^0-9]', '', 'g') LIKE '225%'
   AND NOT (
        regexp_replace(u.phone, '[^0-9]', '', 'g') ~ '^00225(7[0-9]{8})$'
     OR regexp_replace(u.phone, '[^0-9]', '', 'g') ~ '^225(7[0-9]{8})$'
   )
   AND NOT EXISTS (
        SELECT 1 FROM phone_migration_audit a
         WHERE a.user_id = u.id AND a.old_phone = u.phone
   );
