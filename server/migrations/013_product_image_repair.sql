-- ============================================================================
-- 013_product_image_repair.sql — REPRIS DE LA PRODUCTION
-- ============================================================================
-- ⚠️ Ce fichier n'existait pas dans le dépôt alors qu'il était déjà appliqué
--    en production le 2026-10-31 00:58:15 (table `schema_migrations`).
--    Il est reconstitué à l'identique à partir de l'état observé en base :
--      • colonne `product_images.repair_requested_at` (timestamp with time zone,
--        NULLABLE, sans valeur par défaut) ;
--      • 21 lignes legacy (`path` relatif `uploads/…`, produits 1–7) marquées
--        à 2026-10-31 00:58:43.773804+00, soit juste après l'application.
--
--    Le runner de migrations suit les fichiers par NOM : en production ce nom
--    est déjà enregistré, la migration sera donc ignorée. Sur une base neuve,
--    elle s'applique sans effet de bord (idempotente).
--
-- Objet : signaler les photos stockées sur l'ancien disque local (chemins
-- relatifs) afin qu'un traitement puisse les recopier vers Vercel Blob.
-- Aucune donnée produit n'est supprimée ni réécrite.
-- ============================================================================

ALTER TABLE product_images
  ADD COLUMN IF NOT EXISTS repair_requested_at timestamp with time zone;

-- Marque une seule fois les chemins non absolus (legacy `uploads/…`).
-- `path NOT LIKE 'http%'` couvre les formes `uploads/…` et `/uploads/…` ;
-- les URLs Blob absolues ne sont jamais touchées.
UPDATE product_images
SET repair_requested_at = now()
WHERE repair_requested_at IS NULL
  AND path NOT LIKE 'http%';

COMMENT ON COLUMN product_images.repair_requested_at IS
  'Date de demande de réparation/recopie d''une photo legacy vers Vercel Blob. NULL = rien à faire.';
