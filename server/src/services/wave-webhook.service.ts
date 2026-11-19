import { config } from '../config.js';
import { AppError } from '../utils/errors.js';
import type { WaveEvent } from '../utils/wave-validation.js';
import {
  claimWaveEvent,
  findWaveEvent,
  findWaveIntent,
  findWaveSubscription,
  finishWaveEvent,
  isWaveSystemAdmin,
  retryWaveEvent,
  type WaveClaimRow,
  type WaveIntentRow,
} from '../repositories/wave-events.repository.js';
import { activateSubscription } from './storefront.service.js';

export interface WaveWebhookResult {
  received: true;
  duplicate?: boolean;
  ignored?: boolean;
  reason?: 'WAVE_DISABLED';
}

const COMPLETED = 'checkout.session.completed';
const PAYMENT_FAILED = 'checkout.session.payment_failed';
const TERMINAL_STATUSES = new Set(['COMPLETED', 'PAYMENT_FAILED', 'IGNORED']);

function technicalError(): AppError {
  return new AppError(503, 'INTERNAL_ERROR', 'Erreur interne du serveur');
}

async function correlateEvent(event: WaveEvent): Promise<WaveIntentRow | undefined> {
  const sessionId = event.data.id;
  const reference = event.data.client_reference ?? null;

  if (event.type === PAYMENT_FAILED) {
    return (
      (await findWaveIntent(null, sessionId)) ??
      (reference ? await findWaveIntent(reference, null) : undefined)
    );
  }
  return (
    (reference ? await findWaveIntent(reference, null) : undefined) ??
    (await findWaveIntent(null, sessionId))
  );
}

function isIgnored(
  event: WaveEvent,
  claim: WaveClaimRow,
  subscription: Awaited<ReturnType<typeof findWaveSubscription>>,
): boolean {
  if (!subscription || claim.seller_id !== subscription.seller_id) return true;
  if (event.type !== COMPLETED && event.type !== PAYMENT_FAILED) return true;
  if (subscription.status !== 'PENDING' || subscription.payment_method !== 'wave') return true;

  if (event.type === COMPLETED) {
    const amount = event.data.amount;
    if (event.data.currency !== 'XOF') return true;
    if (!amount || !/^\d+$/.test(amount) || amount !== String(subscription.price_fcfa)) return true;
  }
  return false;
}

export async function handleWaveWebhook(event: WaveEvent): Promise<WaveWebhookResult> {
  if (!config.wave.enabled) {
    return { received: true, ignored: true, reason: 'WAVE_DISABLED' };
  }
  if (!config.wave.webhookSecret) {
    throw new AppError(503, 'WAVE_MISCONFIGURED', 'Configuration Wave incomplète');
  }

  let claimedId: number | undefined;
  let activationResolved = false;

  try {
    const intent = await correlateEvent(event);
    if (!intent) {
      return { received: true, ignored: true };
    }

    let claim = await claimWaveEvent({
      eventId: event.id,
      eventType: event.type,
      sessionId: event.data.id,
      clientReference: intent.client_reference,
      subscriptionId: intent.subscription_id,
      sellerId: intent.seller_id,
      amountFcfa: intent.amount_fcfa,
    });

    if (!claim) {
      const existing = await findWaveEvent(event.id);
      if (!existing) throw technicalError();
      if (TERMINAL_STATUSES.has(existing.status)) {
        return { received: true, duplicate: true };
      }
      claim = existing;
      await retryWaveEvent(claim.id);
    }
    claimedId = claim.id;

    const subscription = await findWaveSubscription(claim.subscription_id);
    if (isIgnored(event, claim, subscription)) {
      await finishWaveEvent(claim.id, 'IGNORED', false);
      return { received: true, ignored: true };
    }
    if (!subscription) throw technicalError();

    if (event.type === PAYMENT_FAILED) {
      await finishWaveEvent(claim.id, 'PAYMENT_FAILED', false);
      return { received: true };
    }

    if (!(await isWaveSystemAdmin(config.wave.systemAdminId))) {
      await finishWaveEvent(claim.id, 'FAILED', false);
      throw technicalError();
    }

    try {
      await activateSubscription(config.wave.systemAdminId, subscription.id);
    } catch (err) {
      const code = err instanceof AppError ? err.code : undefined;
      if (code === 'INVALID_STATUS' || code === 'SUBSCRIPTION_ALREADY_ACTIVE') {
        await finishWaveEvent(claim.id, 'COMPLETED', true);
        activationResolved = true;
        return { received: true };
      }
      await finishWaveEvent(claim.id, 'FAILED', false);
      throw technicalError();
    }

    activationResolved = true;
    await finishWaveEvent(claim.id, 'COMPLETED', true);
    return { received: true };
  } catch (err) {
    if (claimedId !== undefined && !activationResolved) {
      await finishWaveEvent(claimedId, 'FAILED', false).catch(() => undefined);
    }
    throw err;
  }
}
