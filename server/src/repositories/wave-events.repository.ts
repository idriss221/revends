import { pool } from '../db/pool.js';

export type WaveEventStatus = 'PROCESSING' | 'COMPLETED' | 'PAYMENT_FAILED' | 'IGNORED' | 'FAILED';

export interface WaveIntentRow {
  id: number;
  client_reference: string;
  subscription_id: number;
  seller_id: number;
  amount_fcfa: number;
  currency: string;
}

export interface WaveClaimRow {
  id: number;
  status: WaveEventStatus;
  event_type: string;
  session_id: string | null;
  client_reference: string;
  subscription_id: number;
  seller_id: number;
  amount_fcfa: number;
  currency: string;
}

export interface WaveSubscriptionRow {
  id: number;
  seller_id: number;
  status: string;
  payment_method: string | null;
  price_fcfa: number;
}

export interface WaveAdminEvent {
  id: number;
  subscriptionId: number;
  sellerId: number;
  eventId: string | null;
  sessionId: string | null;
  eventType: string | null;
  amountFcfa: number;
  currency: string;
  status: string;
  activated: boolean;
  receivedAt: string | null;
  processedAt: string | null;
  createdAt: string;
}

export interface WaveAdminEventsPage {
  items: WaveAdminEvent[];
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
}

export async function findWaveIntent(
  clientReference: string | null | undefined,
  sessionId: string | null | undefined,
): Promise<WaveIntentRow | undefined> {
  const { rows } = await pool.query<WaveIntentRow>(
    `SELECT id, client_reference, subscription_id, seller_id, amount_fcfa, currency
       FROM wave_checkout_events
      WHERE status = 'SESSION_CREATED'
        AND ((client_reference = $1 AND $1 IS NOT NULL) OR (session_id = $2 AND $2 IS NOT NULL))
      ORDER BY CASE WHEN $1 IS NOT NULL AND client_reference = $1 THEN 0 ELSE 1 END,
               created_at DESC
      LIMIT 1`,
    [clientReference ?? null, sessionId ?? null],
  );
  return rows[0];
}

export async function upsertWaveIntent(input: {
  subscriptionId: number;
  sellerId: number;
  clientReference: string;
  amountFcfa: number;
}): Promise<WaveIntentRow> {
  const { rows } = await pool.query<WaveIntentRow>(
    `INSERT INTO wave_checkout_events
        (client_reference, subscription_id, seller_id, amount_fcfa, currency, status)
     VALUES ($1, $2, $3, $4, 'XOF', 'SESSION_CREATED')
     ON CONFLICT (subscription_id) WHERE status = 'SESSION_CREATED'
     DO UPDATE SET
        client_reference = EXCLUDED.client_reference,
        amount_fcfa = EXCLUDED.amount_fcfa,
        currency = EXCLUDED.currency,
        updated_at = now()
     RETURNING id, client_reference, subscription_id, seller_id, amount_fcfa, currency`,
    [input.clientReference, input.subscriptionId, input.sellerId, input.amountFcfa],
  );
  const row = rows[0];
  if (!row) throw new Error('upsertWaveIntent : aucune ligne retournée');
  return row;
}

export async function setWaveIntentSession(intentId: number, sessionId: string): Promise<void> {
  await pool.query(
    `UPDATE wave_checkout_events
        SET session_id = $2, updated_at = now()
      WHERE id = $1 AND status = 'SESSION_CREATED'`,
    [intentId, sessionId],
  );
}

export async function claimWaveEvent(input: {
  eventId: string;
  eventType: string;
  sessionId: string;
  clientReference: string;
  subscriptionId: number;
  sellerId: number;
  amountFcfa: number;
}): Promise<WaveClaimRow | undefined> {
  const { rows } = await pool.query<WaveClaimRow>(
    `INSERT INTO wave_checkout_events
        (event_id, session_id, client_reference, subscription_id, seller_id,
         amount_fcfa, currency, event_type, status, received_at)
     VALUES ($1, $2, $3, $4, $5, $6, 'XOF', $7, 'PROCESSING', now())
     ON CONFLICT (event_id) DO NOTHING
     RETURNING id, status, event_type, session_id, client_reference,
               subscription_id, seller_id, amount_fcfa, currency`,
    [
      input.eventId,
      input.sessionId,
      input.clientReference,
      input.subscriptionId,
      input.sellerId,
      input.amountFcfa,
      input.eventType,
    ],
  );
  return rows[0];
}

export async function findWaveEvent(eventId: string): Promise<WaveClaimRow | undefined> {
  const { rows } = await pool.query<WaveClaimRow>(
    `SELECT id, status, event_type, session_id, client_reference,
            subscription_id, seller_id, amount_fcfa, currency
       FROM wave_checkout_events
      WHERE event_id = $1`,
    [eventId],
  );
  return rows[0];
}

export async function retryWaveEvent(eventId: number): Promise<void> {
  await pool.query(
    `UPDATE wave_checkout_events
        SET status = 'PROCESSING', processed_at = NULL, updated_at = now()
      WHERE id = $1 AND status IN ('PROCESSING', 'FAILED')`,
    [eventId],
  );
}

export async function finishWaveEvent(
  eventId: number,
  status: Exclude<WaveEventStatus, 'PROCESSING'>,
  activated: boolean,
): Promise<void> {
  await pool.query(
    `UPDATE wave_checkout_events
        SET status = $2, activated = $3, processed_at = now(), updated_at = now()
      WHERE id = $1`,
    [eventId, status, activated],
  );
}

export async function findWaveSubscription(subscriptionId: number): Promise<WaveSubscriptionRow | undefined> {
  const { rows } = await pool.query<WaveSubscriptionRow>(
    `SELECT s.id, s.seller_id, s.status, s.payment_method, pl.price_fcfa
       FROM seller_subscriptions s
       JOIN subscription_plans pl ON pl.id = s.plan_id
      WHERE s.id = $1`,
    [subscriptionId],
  );
  return rows[0];
}

export async function isWaveSystemAdmin(adminId: number): Promise<boolean> {
  const { rows } = await pool.query<{ id: number }>(
    "SELECT id FROM users WHERE id = $1 AND role = 'admin'",
    [adminId],
  );
  return rows[0] !== undefined;
}

function toIso(value: Date | string | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export async function listWaveAdminEvents(input: {
  subscriptionId?: number;
  page: number;
  perPage: number;
}): Promise<WaveAdminEventsPage> {
  const filter = input.subscriptionId ?? null;
  const countResult = await pool.query<{ total: number }>(
    'SELECT count(*)::int AS total FROM wave_checkout_events WHERE $1::bigint IS NULL OR subscription_id = $1',
    [filter],
  );
  const total = countResult.rows[0]?.total ?? 0;

  const { rows } = await pool.query<{
    id: number;
    subscription_id: number;
    seller_id: number;
    event_id: string | null;
    session_id: string | null;
    event_type: string | null;
    amount_fcfa: number;
    currency: string;
    status: string;
    activated: boolean;
    received_at: Date | string | null;
    processed_at: Date | string | null;
    created_at: Date | string;
  }>(
    `SELECT id, subscription_id, seller_id, event_id, session_id, event_type,
            amount_fcfa, currency, status, activated, received_at, processed_at, created_at
       FROM wave_checkout_events
      WHERE $1::bigint IS NULL OR subscription_id = $1
      ORDER BY created_at DESC, id DESC
      LIMIT $2 OFFSET $3`,
    [filter, input.perPage, (input.page - 1) * input.perPage],
  );

  return {
    items: rows.map((row) => ({
      id: row.id,
      subscriptionId: row.subscription_id,
      sellerId: row.seller_id,
      eventId: row.event_id,
      sessionId: row.session_id,
      eventType: row.event_type,
      amountFcfa: row.amount_fcfa,
      currency: row.currency,
      status: row.status,
      activated: row.activated,
      receivedAt: toIso(row.received_at),
      processedAt: toIso(row.processed_at),
      createdAt: toIso(row.created_at)!,
    })),
    page: input.page,
    perPage: input.perPage,
    total,
    totalPages: total === 0 ? 0 : Math.ceil(total / input.perPage),
  };
}
