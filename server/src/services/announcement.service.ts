import { pool } from '../db/pool.js';
import { sendMail } from '../mail/mailer.js';
import { logger } from '../utils/logger.js';

/**
 * Campagne d'annonce marketing (« vendez ce que vous n'utilisez plus »).
 *
 * Deux garanties, héritées du service de notifications :
 * - **anti-doublon** : une ligne `notification_deliveries` par
 *   (clé de campagne, utilisateur), insérée en `ON CONFLICT DO NOTHING`.
 *   Relancer le script ne renvoie donc jamais deux fois le même mail ;
 * - **traçabilité** : statut `SENT` / `FAILED` et date d'envoi en base, ce qui
 *   permet de compter les envois réels sans se fier aux logs.
 *
 * L'envoi lui-même reste best-effort (`sendMail` ne lève jamais) : un échec
 * SMTP ne casse pas la campagne, il est seulement consigné pour reprise.
 */
export interface AnnouncementResult {
  ok: boolean;
  skipped: boolean;
}

export async function sendSellAnnouncementToUser(
  userId: number,
  email: string,
  campaignKey: string,
): Promise<AnnouncementResult> {
  if (typeof email !== 'string' || email.trim().length === 0) {
    return { ok: false, skipped: false };
  }

  const idempotencyKey = `${campaignKey}:${userId}`;
  const inserted = await pool.query<{ id: string }>(
    `INSERT INTO notification_deliveries
       (idempotency_key, channel, user_id, event, status, attempts)
     VALUES ($1, 'email', $2, 'announcement_sell', 'PENDING', 0)
     ON CONFLICT (idempotency_key, channel) DO NOTHING
     RETURNING id`,
    [idempotencyKey, userId],
  );

  const row = inserted.rows[0];
  if (!row) {
    // Déjà envoyé (ou en cours) pour cette campagne : on ne renvoie pas.
    return { ok: true, skipped: true };
  }

  const ok = await sendMail(userId, email, 'announcement_sell', {});

  try {
    await pool.query(
      `UPDATE notification_deliveries
          SET status = $2::text,
              attempts = attempts + 1,
              last_error = $3,
              sent_at = CASE WHEN $2::text = 'SENT' THEN now() ELSE sent_at END,
              updated_at = now()
        WHERE id = $1`,
      [row.id, ok ? 'SENT' : 'FAILED', ok ? null : 'sendMail a retourné false'],
    );
  } catch (err) {
    // Le mail est parti (ou non) : la trace est secondaire, on ne casse pas la
    // campagne pour un incident d'écriture.
    logger.warn('annonce : mise à jour de la livraison impossible', {
      userId,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return { ok, skipped: false };
}
