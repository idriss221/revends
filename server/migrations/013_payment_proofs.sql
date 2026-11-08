-- ============================================================
-- ReVends — 013_payment_proofs.sql  (PostgreSQL 15+)
-- Preuve de paiement + journal d'idempotence des notifications.
--
-- RÈGLE ABSOLUE : une commande non payée n'est PAS valide. Une preuve reçue
-- n'est qu'une PIÈCE soumise ; seul un admin peut l'approuver, ce qui déclenche
-- la validation du paiement et les notifications vendeur.
-- ============================================================

-- ---------- Statut d'une preuve ----------
DO $$ BEGIN
  CREATE TYPE payment_proof_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------- PREUVES DE PAIEMENT ----------
CREATE TABLE IF NOT EXISTS payment_proofs (
    id               BIGSERIAL PRIMARY KEY,
    order_id         BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    submitted_by     BIGINT NOT NULL REFERENCES users(id),
    file_url         TEXT NOT NULL,
    note             TEXT,
    status           payment_proof_status NOT NULL DEFAULT 'PENDING',
    reviewed_by      BIGINT REFERENCES users(id),
    reviewed_at      TIMESTAMPTZ,
    rejection_reason TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_proof_review CHECK (
        status = 'PENDING' OR (reviewed_at IS NOT NULL AND reviewed_by IS NOT NULL)
    )
);
CREATE INDEX IF NOT EXISTS idx_payment_proofs_order
    ON payment_proofs(order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_proofs_pending
    ON payment_proofs(created_at ASC) WHERE status = 'PENDING';

DROP TRIGGER IF EXISTS trg_payment_proofs_updated ON payment_proofs;
CREATE TRIGGER trg_payment_proofs_updated
    BEFORE UPDATE ON payment_proofs
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------- Types de notifications (in-app) ----------
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'payment_proof_submitted';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'payment_proof_approved';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'payment_proof_rejected';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'payment_instructions';

-- ---------- JOURNAL DE LIVRAISON (anti-doublons e-mail / WhatsApp) ----------
-- Une ligne par (clé d'idempotence, canal). La clé est construite par le
-- service (`<event>:<entité>:<userId>`), donc rejouer une requête ne renvoie
-- JAMAIS un second message.
CREATE TABLE IF NOT EXISTS notification_deliveries (
    id              BIGSERIAL PRIMARY KEY,
    idempotency_key VARCHAR(200) NOT NULL,
    channel         VARCHAR(10) NOT NULL CHECK (channel IN ('email', 'whatsapp')),
    user_id         BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    event           VARCHAR(80) NOT NULL,
    status          VARCHAR(10) NOT NULL DEFAULT 'PENDING'
                    CHECK (status IN ('PENDING', 'SENT', 'FAILED', 'SKIPPED')),
    attempts        INTEGER NOT NULL DEFAULT 0,
    last_error      TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    sent_at         TIMESTAMPTZ,
    CONSTRAINT uq_notification_delivery UNIQUE (idempotency_key, channel)
);
CREATE INDEX IF NOT EXISTS idx_notification_deliveries_retry
    ON notification_deliveries(status, attempts) WHERE status IN ('PENDING', 'FAILED');

DROP TRIGGER IF EXISTS trg_notification_deliveries_updated ON notification_deliveries;
CREATE TRIGGER trg_notification_deliveries_updated
    BEFORE UPDATE ON notification_deliveries
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
