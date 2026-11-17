import { query } from '../db/pool.js';
import { sendMail, type MailAttachment } from '../mail/mailer.js';
import type { MailEvent, TemplateVars } from '../mail/templates.js';
import { logger } from '../utils/logger.js';
import { findEmailById } from '../repositories/users.repository.js';

// ---------------------------------------------------------------------------
// V8 — Envois transactionnels anti-doublon (notification_deliveries).
//
// Clés imposées (consigne V8) :
//  - activation      : `subscription-activated:<userId>`
//  - rappel J-3      : `subscription-expiry-reminder:<userId>:YYYY-MM`
//  - bilan mensuel   : `storefront-monthly-report:<userId>:YYYY-MM`
//
// Best-effort absolu : aucune exception ne remonte (aucun effet de bord
// métier) ; toute erreur est journalisée SANS PII.
// ---------------------------------------------------------------------------

export type DeliveryOutcome = 'sent' | 'failed' | 'duplicate';

interface AntiDuplicateInput {
  userId: number;
  idempotencyKey: string;
  event: MailEvent;
  vars: TemplateVars;
  attachments?: MailAttachment[];
}

/** Envoi e-mail réservé par notification_deliveries (anti-doublon, 1 chaîne). */
export async function sendAntiDuplicateMail(input: AntiDuplicateInput): Promise<DeliveryOutcome> {
  try {
    const inserted = await query<{ id: number }>(
      `INSERT INTO notification_deliveries (idempotency_key, channel, user_id, event, status, attempts)
       VALUES ($1, 'email', $2, $3, 'PENDING', 0)
       ON CONFLICT (idempotency_key, channel) DO NOTHING
       RETURNING id`,
      [input.idempotencyKey, input.userId, input.event],
    );
    const row = inserted.rows[0];
    if (!row) {
      logger.info('email anti-doublon ignoré', { event: input.event, userId: input.userId });
      return 'duplicate';
    }
    const email = await findEmailById(input.userId);
    const ok = await sendMail(input.userId, email, input.event, input.vars, input.attachments);
    await query(
      `UPDATE notification_deliveries
          SET status = $2::text, attempts = attempts + 1,
              sent_at = CASE WHEN $2::text = 'SENT' THEN now() ELSE sent_at END,
              updated_at = now()
        WHERE id = $1`,
      [row.id, ok ? 'SENT' : 'FAILED'],
    );
    return ok ? 'sent' : 'failed';
  } catch (err) {
    logger.error('envoi anti-doublon impossible', {
      event: input.event,
      userId: input.userId,
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    return 'failed';
  }
}

/** E-mail d'activation (§7 V8) — clé `subscription-activated:<userId>`. */
export async function sendSubscriptionActivatedMail(userId: number, planName: string): Promise<DeliveryOutcome> {
  return sendAntiDuplicateMail({
    userId,
    idempotencyKey: `subscription-activated:${userId}`,
    event: 'subscription_activated',
    vars: { planName, linkPath: '/mon-abonnement' },
  });
}

/** Rappel J-3 (§7 V8) — clé `subscription-expiry-reminder:<userId>:YYYY-MM`. */
export async function sendSubscriptionExpiryReminderMail(
  userId: number,
  planName: string,
  period: string,
): Promise<DeliveryOutcome> {
  return sendAntiDuplicateMail({
    userId,
    idempotencyKey: `subscription-expiry-reminder:${userId}:${period}`,
    event: 'subscription_expiry_reminder',
    vars: { planName, linkPath: '/mon-abonnement' },
  });
}
