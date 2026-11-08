-- ============================================================
-- ReVends — 006_order_shipped.sql  (PostgreSQL 15+)
-- ÉVOLUTION : étape « SHIPPED » (Prête/Expédiée) + payout « DUE » (À payer).
-- Source : décision produit « part sur les recommandations » + contrat api.md §3.6.
-- Prérequis : 001..005 appliqués.
--
-- Exécution : migrate.ts enveloppe CHAQUE fichier dans BEGIN/COMMIT.
--   ⚠️ ALTER TYPE ... ADD VALUE est autorisé en transaction depuis PG12,
--      MAIS la valeur ajoutée n'est pas utilisable avant le COMMIT
--      (même contrainte que le 003). → Ce fichier ne réutilise AUCUNE
--      des nouvelles valeurs ; le cycle (trigger, index) est recréé dans
--      007_order_shipped_cycle.sql, appliqué APRÈS ce COMMIT.
-- ============================================================

ALTER TYPE order_status      ADD VALUE IF NOT EXISTS 'SHIPPED' AFTER 'PREPARING';
ALTER TYPE payout_status     ADD VALUE IF NOT EXISTS 'DUE'     AFTER 'PENDING';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'order_shipped';