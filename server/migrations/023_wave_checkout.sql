-- ============================================================================
-- 023_wave_checkout.sql — V9 « WAVE CHECKOUT + WEBHOOKS » (PostgreSQL 15+)
-- Prérequis : migrations existantes (001→020, 022) appliquées. Exécutée par
--             migrate.ts dans BEGIN/COMMIT — migrated manuellement en prod
--             (RUN_MIGRATIONS=false, CA-V9-050/075).
-- ADDITIF : 1 table nouvelle, 4 index nouveaux. 0 colonne sur une table
--           existante, 0 trigger, 0 ALTER TYPE, 0 seed, 0 modification 001→022.
-- ============================================================================

CREATE TABLE IF NOT EXISTS wave_checkout_events (
    id               BIGSERIAL PRIMARY KEY,
    -- event_id NULL = ligne « intention » créée côté serveur au moment de la
    -- session API (avant tout webhook). Non NULL = événement Wave reçu.
    event_id         VARCHAR(255) NULL,
    -- cos-… : id de session Wave. Posé à la création (réponse API) puis
    -- retrouvé dans data.id du webhook — y compris sur payment_failed,
    -- dont le payload officiel ne porte pas toujours client_reference.
    session_id       VARCHAR(64) NULL,
    client_reference VARCHAR(255) NOT NULL,
    subscription_id  BIGINT NOT NULL REFERENCES seller_subscriptions(id) ON DELETE CASCADE,
    seller_id        BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount_fcfa      INTEGER NOT NULL CHECK (amount_fcfa > 0),
    currency         VARCHAR(3) NOT NULL DEFAULT 'XOF' CHECK (currency = 'XOF'),
    event_type       VARCHAR(64) NULL,
    status           VARCHAR(32) NOT NULL CHECK (
        status IN ('SESSION_CREATED','PROCESSING','COMPLETED',
                   'PAYMENT_FAILED','IGNORED','FAILED')
    ),
    activated        BOOLEAN NOT NULL DEFAULT false,
    received_at      TIMESTAMPTZ NULL,
    processed_at     TIMESTAMPTZ NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_wave_event_id UNIQUE (event_id),
    CONSTRAINT chk_wave_row_kind CHECK (
        (event_id IS NULL     AND status = 'SESSION_CREATED' AND event_type IS NULL)
        OR
        (event_id IS NOT NULL AND status <> 'SESSION_CREATED' AND event_type IS NOT NULL)
    )
);

-- Une seule intention vivante par souscription : stabilité de client_reference
-- et absence de session dupliquée si le vendeur clique deux fois.
CREATE UNIQUE INDEX IF NOT EXISTS uq_wave_intent_per_subscription
    ON wave_checkout_events (subscription_id) WHERE status = 'SESSION_CREATED';

-- Corrélation webhook → souscription (CA-V9-013/035) et réconciliation SQL.
CREATE INDEX IF NOT EXISTS idx_wave_events_reference
    ON wave_checkout_events (client_reference, created_at DESC);

-- Corrélation de secours pour payment_failed (payload sans client_reference).
CREATE INDEX IF NOT EXISTS idx_wave_events_session
    ON wave_checkout_events (session_id) WHERE session_id IS NOT NULL;

-- File admin : une seule requête paginée, aucun N+1.
CREATE INDEX IF NOT EXISTS idx_wave_events_admin
    ON wave_checkout_events (created_at DESC) WHERE event_id IS NOT NULL;

COMMENT ON TABLE wave_checkout_events IS
    'V9 — traçabilité des sessions API Checkout et des webhooks Wave. event_id unique = idempotence. Aucune donnée publique, aucun secret, aucune référence journalisée en clair (CA-V9-030/050/052).';
COMMENT ON COLUMN wave_checkout_events.event_id IS
    'Identifiant Wave de l''événement (EV_…). NULL pour la ligne intention créée avant webhook.';
COMMENT ON COLUMN wave_checkout_events.client_reference IS
    'Référence déterministe wave-sub-<subscriptionId>-<hmac8>, ≤255, stable par souscription. Non secrète, jamais affichée publiquement ni loggée (CA-V9-012/013/052).';
COMMENT ON COLUMN wave_checkout_events.status IS
    'SESSION_CREATED = intention locale ; PROCESSING = événement revendiqué ; COMPLETED/PAYMENT_FAILED/IGNORED = terminaux (2xx) ; FAILED = à rejouer par Wave.';
