import { query } from '../db/pool.js';
import { afterCommit } from '../utils/db.js';
import { findEmailById, findPhoneById } from '../repositories/users.repository.js';
import { sendMail } from '../mail/mailer.js';
import { sendWhatsAppMessage } from '../whatsapp/whatsapp.service.js';
import type { MailEvent, TemplateVars } from '../mail/templates.js';
import { logger } from '../utils/logger.js';

/**
 * Orchestrateur de notifications e-mail + WhatsApp.
 *
 * Garanties :
 *  - **indépendance des canaux** : `Promise.allSettled` — un échec WhatsApp ne
 *    bloque jamais l'e-mail (et inversement) ;
 *  - **après commit** : rien n'est envoyé si la transaction métier échoue ;
 *  - **anti-doublons** : une ligne `notification_deliveries` par
 *    (clé d'idempotence, canal). Un rejeu de requête ne renvoie pas le message ;
 *  - **retries bornés** : une livraison FAILED peut être rejouée jusqu'à 3 fois ;
 *  - **best-effort** : aucune exception ne remonte à l'action métier.
 */

export interface NotifyInput {
  /** Identifiant d'événement (journal + idempotence). */
  event: string;
  /** Clé stable construite par l'appelant (ex. `payment_confirmed:CMD-1:42`). */
  idempotencyKey: string;
  userId: number;
  mail?: { event: MailEvent; vars?: TemplateVars };
  whatsapp?: { body: string; templateParams?: string[] };
}

export interface NotifyResult {
  email: 'sent' | 'failed' | 'skipped' | 'duplicate';
  whatsapp: 'sent' | 'failed' | 'skipped' | 'duplicate';
}

const MAX_ATTEMPTS = 3;

/** Programme la notification APRÈS le commit de la transaction en cours. */
export function notifyUser(input: NotifyInput): void {
  afterCommit(async () => {
    await deliverNotification(input);
  });
}

/** Programme la même notification pour plusieurs destinataires (admins). */
export function notifyUsers(inputs: NotifyInput[]): void {
  for (const input of inputs) notifyUser(input);
}

interface DeliveryRow {
  id: number;
  status: string;
  attempts: number;
}

/**
 * Réserve une livraison. Retourne l'id si l'envoi doit avoir lieu, `null` si
 * un message identique a déjà été envoyé (doublon) ou est en cours.
 */
async function reserveDelivery(
  key: string,
  channel: 'email' | 'whatsapp',
  userId: number,
  event: string,
): Promise<number | null> {
  try {
    const inserted = await query<DeliveryRow>(
      `INSERT INTO notification_deliveries
         (idempotency_key, channel, user_id, event, status, attempts)
       VALUES ($1, $2, $3, $4, 'PENDING', 0)
       ON CONFLICT (idempotency_key, channel) DO NOTHING
       RETURNING id, status, attempts`,
      [key, channel, userId, event],
    );
    if (inserted.rows[0]) return inserted.rows[0].id;

    // Ligne existante : on ne rejoue QUE les échecs (jamais un succès).
    const existing = await query<DeliveryRow>(
      `SELECT id, status, attempts FROM notification_deliveries
        WHERE idempotency_key = $1 AND channel = $2`,
      [key, channel],
    );
    const row = existing.rows[0];
    if (!row) return null;
    if (row.status === 'SENT' || row.status === 'SKIPPED') return null;
    if (row.attempts >= MAX_ATTEMPTS) return null;

    await query(
      `UPDATE notification_deliveries
          SET status = 'PENDING', attempts = attempts + 1, updated_at = now()
        WHERE id = $1`,
      [row.id],
    );
    return row.id;
  } catch (err) {
    // Si la table n'existe pas encore (migration non appliquée), on ne bloque
    // surtout pas l'envoi : on dégrade l'anti-doublon plutôt que la notification.
    logger.warn('réservation de livraison impossible (journal indisponible)', {
      event,
      channel,
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    return -1;
  }
}

async function markDelivery(
  id: number,
  status: 'SENT' | 'FAILED' | 'SKIPPED',
  error?: string,
): Promise<void> {
  if (id <= 0) return;
  try {
    await query(
      `UPDATE notification_deliveries
          SET status = $2::text,
              last_error = $3,
              sent_at = CASE WHEN $2::text = 'SENT' THEN now() ELSE sent_at END,
              updated_at = now()
        WHERE id = $1`,
      [id, status, error ?? null],
    );
  } catch (err) {
    logger.warn('mise à jour du journal de livraison impossible', {
      id,
      errorMessage: err instanceof Error ? err.message : String(err),
    });
  }
}

async function deliverEmail(input: NotifyInput): Promise<NotifyResult['email']> {
  if (!input.mail) return 'skipped';
  const deliveryId = await reserveDelivery(input.idempotencyKey, 'email', input.userId, input.event);
  if (deliveryId === null) return 'duplicate';

  if (process.env.MAIL_ENABLED !== 'true') {
    await markDelivery(deliveryId, 'SKIPPED', 'MAIL_ENABLED=false');
    return 'skipped';
  }

  try {
    const email = await findEmailById(input.userId);
    const ok = await sendMail(input.userId, email, input.mail.event, input.mail.vars ?? {});
    await markDelivery(deliveryId, ok ? 'SENT' : 'FAILED', ok ? undefined : 'sendMail=false');
    return ok ? 'sent' : 'failed';
  } catch (err) {
    await markDelivery(deliveryId, 'FAILED', err instanceof Error ? err.message : String(err));
    return 'failed';
  }
}

async function deliverWhatsapp(input: NotifyInput): Promise<NotifyResult['whatsapp']> {
  if (!input.whatsapp) return 'skipped';
  const deliveryId = await reserveDelivery(input.idempotencyKey, 'whatsapp', input.userId, input.event);
  if (deliveryId === null) return 'duplicate';

  try {
    const phone = await findPhoneById(input.userId);
    if (!phone) {
      await markDelivery(deliveryId, 'SKIPPED', 'Aucun numéro WhatsApp');
      return 'skipped';
    }
    const result = await sendWhatsAppMessage(phone, input.whatsapp.body, {
      templateParams: input.whatsapp.templateParams,
    });
    if (result.skipped) {
      await markDelivery(deliveryId, 'SKIPPED', result.error);
      return 'skipped';
    }
    await markDelivery(deliveryId, result.ok ? 'SENT' : 'FAILED', result.ok ? undefined : result.error);
    return result.ok ? 'sent' : 'failed';
  } catch (err) {
    await markDelivery(deliveryId, 'FAILED', err instanceof Error ? err.message : String(err));
    return 'failed';
  }
}

/**
 * Livre une notification sur les deux canaux en parallèle. Ne lève jamais.
 * Exporté pour les tests (appel direct, sans transaction).
 */
export async function deliverNotification(input: NotifyInput): Promise<NotifyResult> {
  const [email, whatsapp] = await Promise.allSettled([deliverEmail(input), deliverWhatsapp(input)]);
  return {
    email: email.status === 'fulfilled' ? email.value : 'failed',
    whatsapp: whatsapp.status === 'fulfilled' ? whatsapp.value : 'failed',
  };
}

/** Messages WhatsApp standards (texte ou variables de template). */
export function whatsappOrderCreated(orderNumber: string, amountFcfa: number): string {
  return [
    `Ranga — commande ${orderNumber} enregistrée.`,
    `Montant : ${amountFcfa.toLocaleString('fr-FR')} FCFA.`,
    'Paiement en attente : envoyez votre preuve de paiement depuis votre commande.',
    'La commande ne sera confirmée qu\'après validation du paiement.',
  ].join('\n');
}

export function whatsappPaymentConfirmed(orderNumber: string, amountFcfa: number): string {
  return [
    `Ranga — paiement confirmé pour ${orderNumber}.`,
    `Montant : ${amountFcfa.toLocaleString('fr-FR')} FCFA.`,
    'Le vendeur est prévenu et prépare votre article.',
  ].join('\n');
}

export function whatsappSellerNewOrder(orderNumber: string, productName: string, amountFcfa: number): string {
  return [
    `Ranga — nouvelle commande PAYÉE : ${orderNumber}.`,
    `Article : ${productName}.`,
    `Montant vendeur : ${amountFcfa.toLocaleString('fr-FR')} FCFA.`,
    'Vous pouvez préparer l\'article. Aucune action avant validation du paiement.',
  ].join('\n');
}

export function whatsappProofReceived(orderNumber: string): string {
  return `Ranga — preuve de paiement reçue pour ${orderNumber}. Vérification en cours, la commande n'est pas encore confirmée.`;
}

export function whatsappProofRejected(orderNumber: string, reason: string): string {
  return `Ranga — preuve refusée pour ${orderNumber}. Motif : ${reason}. Renvoyez une preuve lisible depuis votre commande.`;
}
