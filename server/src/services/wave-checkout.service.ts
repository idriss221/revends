import { createHmac } from 'node:crypto';
import { config } from '../config.js';
import { pool } from '../db/pool.js';
import { AppError, conflict, notFound } from '../utils/errors.js';
import {
  setWaveIntentSession,
  upsertWaveIntent,
} from '../repositories/wave-events.repository.js';
import { createWaveClient, type WaveClient } from './wave-client.service.js';

interface OwnedSubscriptionRow {
  id: number;
  seller_id: number;
  status: string;
  payment_method: string | null;
  price_fcfa: number;
}

export interface WaveCheckoutSessionResult {
  waveLaunchUrl: string;
  sessionId: string;
}

const WAVE_DISABLED_MESSAGE = 'Le paiement automatique Wave est désactivé. Le paiement manuel reste disponible.';

export function buildWaveClientReference(subscriptionId: number): string {
  const suffix = createHmac('sha256', config.sessionSecret)
    .update(`wave-ref:${subscriptionId}`)
    .digest('hex')
    .slice(0, 8);
  return `wave-sub-${subscriptionId}-${suffix}`;
}

async function findOwnedSubscription(
  sellerId: number,
  subscriptionId: number,
): Promise<OwnedSubscriptionRow | undefined> {
  const { rows } = await pool.query<OwnedSubscriptionRow>(
    `SELECT s.id, s.seller_id, s.status, s.payment_method, pl.price_fcfa
       FROM seller_subscriptions s
       JOIN subscription_plans pl ON pl.id = s.plan_id
      WHERE s.id = $1 AND s.seller_id = $2`,
    [subscriptionId, sellerId],
  );
  return rows[0];
}

export async function createWaveCheckoutSession(
  sellerId: number,
  subscriptionId: number,
  client?: WaveClient,
): Promise<WaveCheckoutSessionResult> {
  const subscription = await findOwnedSubscription(sellerId, subscriptionId);
  if (!subscription) {
    throw notFound('WAVE_SUBSCRIPTION_NOT_FOUND', 'Abonnement introuvable');
  }
  if (subscription.status !== 'PENDING') {
    throw conflict('WAVE_SUBSCRIPTION_NOT_PENDING', "Cette demande n'est pas en attente de paiement");
  }
  if (subscription.payment_method !== 'wave') {
    throw conflict('WAVE_PAYMENT_METHOD_MISMATCH', 'Cette demande utilise un autre moyen de paiement');
  }
  if (!config.wave.enabled) {
    throw new AppError(503, 'WAVE_DISABLED', WAVE_DISABLED_MESSAGE);
  }

  const amount = String(subscription.price_fcfa);
  const clientReference = buildWaveClientReference(subscriptionId);
  const intent = await upsertWaveIntent({
    subscriptionId,
    sellerId,
    clientReference,
    amountFcfa: subscription.price_fcfa,
  });

  const waveClient =
    client ??
    createWaveClient({
      baseUrl: config.wave.apiBaseUrl,
      apiKey: config.wave.apiKey ?? '',
    });

  const session = await waveClient.createCheckoutSession({
    amount,
    currency: 'XOF',
    success_url: `${config.siteUrl}/paiement-wave/succes`,
    error_url: `${config.siteUrl}/paiement-wave/echec`,
    client_reference: clientReference,
  });

  await setWaveIntentSession(intent.id, session.sessionId);
  return { waveLaunchUrl: session.waveLaunchUrl, sessionId: session.sessionId };
}
