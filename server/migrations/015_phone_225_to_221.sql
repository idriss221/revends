-- ============================================================
-- ReVends — 015_phone_225_to_221.sql  (PostgreSQL 15+)
--
-- Demande : « on est au Sénégal, par défaut c'est +221 pas +225 ».
-- La migration 014 n'avait converti que les numéros sénégalais
-- (9 chiffres en 7…) enregistrés avec +225 et avait conservé les
-- autres +225 en « skipped_foreign ». Cette migration convertit
-- TOUS les numéros commençant par +225 (ou 225 / 00225) en +221,
-- en conservant la partie nationale telle quelle :
--
--   +225 07 92673165  →  +2210792673165
--   +22540721715      →  +22140721715
--
-- Garanties :
--   · unicité users.phone : si le +221 proposé existe déjà, ou si
--     plusieurs lignes convergent vers le même +221, seule la
--     première (plus petit id) est corrigée, les autres sont
--     journalisées « skipped_duplicate » ;
--   · chaque modification est journalisée dans
--     phone_migration_audit (réversible à la main) ;
--   · orders.shipping_phone subit la même conversion ;
--   · les numéros locaux sans préfixe (ex. 782052754) reçoivent
--     le préfixe +221 (Sénégal, par défaut).
-- ============================================================

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
classified AS (
    SELECT c.id,
           c.phone,
           '+221' || c.national AS new_phone,
           (
             EXISTS (
               SELECT 1 FROM users other
                WHERE other.id <> c.id
                  AND other.phone = '+221' || c.national
             )
             OR row_number() OVER (PARTITION BY c.national ORDER BY c.id) > 1
           ) AS duplicate
      FROM candidates c
     WHERE c.national IS NOT NULL
),
logged AS (
    INSERT INTO phone_migration_audit (user_id, old_phone, new_phone, action, reason)
    SELECT id, phone, new_phone,
           CASE WHEN duplicate THEN 'skipped_duplicate' ELSE 'corrected' END,
           CASE WHEN duplicate
                THEN 'Un compte possède déjà ce numéro en +221 — aucune modification.'
                ELSE 'Indicatif +225 remplacé par +221 (Sénégal).'
           END
      FROM classified
    RETURNING user_id, action
)
UPDATE users u
   SET phone = c.new_phone
  FROM classified c
 WHERE u.id = c.id
   AND c.duplicate = FALSE;

-- Mêmes conversions pour les numéros de livraison des commandes.
UPDATE orders o
   SET shipping_phone = '+221' || substring(regexp_replace(o.shipping_phone, '[^0-9]', '', 'g') FROM 4)
 WHERE regexp_replace(o.shipping_phone, '[^0-9]', '', 'g') LIKE '225%'
   AND o.shipping_phone IS NOT NULL
   AND NOT EXISTS (
       SELECT 1 FROM users u2
        WHERE u2.phone = '+221' || substring(regexp_replace(o.shipping_phone, '[^0-9]', '', 'g') FROM 4)
   );

-- Numéros locaux sans préfixe : ajout du préfixe sénégalais +221.
-- (Après la conversion ci-dessus, il ne reste que ces numéros nus.)
INSERT INTO phone_migration_audit (user_id, old_phone, new_phone, action, reason)
SELECT id, phone, '+221' || phone, 'corrected',
       'Numéro local sénégalais sans indicatif : +221 ajouté (Sénégal).'
  FROM users
 WHERE phone !~ '^\+';

UPDATE users
   SET phone = '+221' || phone
 WHERE phone !~ '^\+';
