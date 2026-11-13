import { config } from '../config.js';
import { afterCommit } from '../utils/db.js';
import { sendMail } from '../mail/mailer.js';
import { findAdminAlertRecipients, type AdminAlertRecipient } from '../repositories/users.repository.js';
import { deliverNotification } from './notification-dispatch.service.js';
import type { MailEvent, TemplateVars } from '../mail/templates.js';
import { logger } from '../utils/logger.js';

/**
 * Alertes d'administration — « quelque chose que les admins doivent savoir ».
 *
 * Deux canaux, comme le reste du projet :
 *  · **comptes admin** (`users.role = 'admin'`) : notification in-app (insérée
 *    par l'appelant, dans sa transaction) + e-mail via `notifyUser` (tracé dans
 *    `notification_deliveries`, anti-doublon par (clé, admin)) ;
 *  · **adresses supplémentaires** `ADMIN_ALERT_EMAILS` : e-mail direct. Elles
 *    n'ont pas de `user_id`, donc pas de ligne de livraison — mais elles sont
 *    dédupliquées des comptes admin pour ne jamais recevoir deux fois le même
 *    message.
 *
 * Tout part APRÈS le commit : si la création du produit ou de la commande
 * échoue, personne n'est alerté. Aucune exception ne remonte à l'action métier
 * (une panne SMTP ne doit jamais faire échouer une vente).
 */

export type AdminAlertEvent = Extract<
  MailEvent,
  'product_submitted_admin' | 'order_created_admin'
>;

export interface AdminAlertInput {
  event: AdminAlertEvent;
  /** partie stable de la clé d'idempotence, ex. `product:42` / `order:123` */
  key: string;
  vars: TemplateVars;
}

/**
 * Programme les e-mails d'alerte aux admins.
 *
 * @param input      événement + variables du gabarit
 * @param recipients admins déjà lus DANS la transaction (facultatif : relus
 *                   après commit si absent)
 */
export function alertAdmins(input: AdminAlertInput, recipients?: AdminAlertRecipient[]): void {
  afterCommit(async () => {
    let admins = recipients;
    if (!admins) {
      try {
        admins = await findAdminAlertRecipients();
      } catch (err) {
        // Base indisponible : on continue avec les adresses de configuration.
        admins = [];
        logger.warn('alerte admin : lecture des comptes admin impossible', {
          event: input.event,
          errorMessage: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // Livraison DIRECTE, pas `notifyUser` : nous sommes déjà dans un effet
    // post-commit, et l'AsyncLocalStorage de la transaction est encore actif —
    // un `afterCommit` imbriqué serait ajouté à une file déjà vidée, donc
    // jamais exécuté (bug constaté : aucune alerte reçue).
    const results = await Promise.allSettled(
      admins.map((admin) =>
        deliverNotification({
          event: input.event,
          idempotencyKey: `${input.event}:${input.key}:${admin.id}`,
          userId: admin.id,
          mail: { event: input.event, vars: input.vars },
        }),
      ),
    );
    for (const result of results) {
      if (result.status === 'rejected') {
        logger.warn('alerte admin : livraison échouée', {
          event: input.event,
          errorMessage: result.reason instanceof Error ? result.reason.message : String(result.reason),
        });
      }
    }

    // Adresses hors comptes : envoi direct (pas de user_id → pas de journal).
    const known = new Set(admins.map((a) => a.email.trim().toLowerCase()));
    const extras = config.adminAlertEmails.filter((email) => !known.has(email));
    if (extras.length === 0) return;

    // userId uniquement destiné au journal (aucune FK sur ce chemin).
    const logUserId = admins[0]?.id ?? 0;
    const extraResults = await Promise.allSettled(
      extras.map((email) => sendMail(logUserId, email, input.event, input.vars)),
    );
    for (const [i, result] of extraResults.entries()) {
      if (result.status === 'rejected') {
        logger.warn('alerte admin : envoi direct échoué', {
          event: input.event,
          recipientIndex: i,
          errorMessage: result.reason instanceof Error ? result.reason.message : String(result.reason),
        });
      }
    }
  });
}
