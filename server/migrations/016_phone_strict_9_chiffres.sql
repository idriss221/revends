-- ============================================================
-- ReVends — 016_phone_strict_9_chiffres.sql  (PostgreSQL 15+)
--
-- Règles strictes Sénégal (09/11/2026) :
--   1. indicatif `+221` ;
--   2. exactement 09 chiffres après l'indicatif ;
--   3. 1er chiffre après l'indicatif = `7` (mobile) → `+2217…`.
--
-- Chiffres sensibles : on ne corrige en automatique QUE les cas
-- non ambigus, sans jamais inventer ni déformer un chiffre d'abonné :
--   · `+2210 7…` (10 chiffres après `221`, 0 de tronc) → retrait du 0
--     → `+2217…` (9 chiffres / 7), suffixe préservé ;
--   · tout le reste (longueur ≠ 9 ou 1er chiffre ≠ 7) est laissé
--     tel quel et doit être validé manuellement avec l'abonné.
-- ============================================================

INSERT INTO phone_migration_audit (user_id, old_phone, new_phone, action, reason)
SELECT id, phone, '+221' || substring(regexp_replace(phone, '[^0-9]', '', 'g') FROM 5),
       'corrected',
       'Règle stricte Sénégal : 10 chiffres dont 0 de tronc -> 9 chiffres commençant par 7 (retrait du 0, chiffres de l''abonné préservés).'
  FROM users
 WHERE length(regexp_replace(phone, '[^0-9]', '', 'g')) - 3 = 10
   AND substring(regexp_replace(phone, '[^0-9]', '', 'g') FROM 4 FOR 1) = '0'
   AND substring(regexp_replace(phone, '[^0-9]', '', 'g') FROM 5 FOR 1) = '7'
   AND NOT EXISTS (
       SELECT 1 FROM phone_migration_audit a
        WHERE a.user_id = users.id AND a.old_phone = users.phone
   );

UPDATE users
   SET phone = '+221' || substring(regexp_replace(phone, '[^0-9]', '', 'g') FROM 5)
 WHERE length(regexp_replace(phone, '[^0-9]', '', 'g')) - 3 = 10
   AND substring(regexp_replace(phone, '[^0-9]', '', 'g') FROM 4 FOR 1) = '0'
   AND substring(regexp_replace(phone, '[^0-9]', '', 'g') FROM 5 FOR 1) = '7';
