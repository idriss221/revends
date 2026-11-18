-- ============================================================
-- ReVends — 022_refusal_pair.sql  (PostgreSQL 15+)
--
-- L'unique évolution backwards-compatible d'une contrainte existante.
-- Motif : le refus d'une demande d'activation (statut PENDING) envoie la
-- demande CANCELLED sans preuve de transaction. Le sous-jacent de la matrice
-- d'activation
--   (status = 'PENDING') = (dates d'activation toutes NULL)
-- interdit cette transition — un row CANCELLED hérite mécaniquement des
-- cottes d'activation. Le refus devient impossible et répond 500.
--
-- Remplacé par une sémantique à trois branches explicites :
--   PENDING        : dates d'activation OBLIGATOIREMENT NULL
--   CANCELLED      : dates d'activation indifférentes (oubli/refusé)
--   ACTIVE/EXPIRED : dates OBLIGATOIREMENT remplies (inchangé)
-- Aucune colonne n'est ajoutée, aucune ligne n'est réécrite (l'UPDATE d'une
-- ligne CANCELLED n'exige plus le remplissage facultatif des dates).
-- ============================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM pg_constraint c
      JOIN pg_class t ON c.conrelid = t.oid
      JOIN pg_namespace n ON t.relnamespace = n.oid
     WHERE c.conname = 'chk_activation_pair' AND n.nspname = 'public'
  ) THEN
    ALTER TABLE seller_subscriptions DROP CONSTRAINT chk_activation_pair;

    ALTER TABLE seller_subscriptions
      ADD CONSTRAINT chk_activation_pair CHECK (
        CASE
          WHEN status = 'PENDING' THEN
            activated_at IS NULL AND activated_by IS NULL AND started_at IS NULL AND ends_at IS NULL
          WHEN status = 'CANCELLED' THEN true
          ELSE
            activated_at IS NOT NULL AND activated_by IS NOT NULL
            AND started_at IS NOT NULL AND ends_at IS NOT NULL
        END
      );
  END IF;
END $$;
