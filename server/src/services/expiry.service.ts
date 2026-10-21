import { withTransaction } from '../utils/db.js';
import type { DbClient } from '../db/pool.js';
import { config } from '../config.js';
import { insertNotification } from './notifications.service.js';
import { queueMail } from '../mail/queue.js';
import {
  failOrderIfPending,
  failPendingPayment,
  insertOrderEvent,
  lockProductRow,
  releaseReservedProduct,
  selectExpirableOrderForRelease,
  selectExpiredReservations,
  selectLazyExpiredOrder,
} from '../repositories/orders.repository.js';

/**
 * Libellé de la durée de réservation pour les journaux/événements.
 * S'adapte à `config.reservationDays` (ex. « 5 jours », « 1 jour », « 12 heures »).
 */
function reservationDurationLabel(): string {
  const d = config.reservationDays;
  if (d >= 1) return `${d} jour${d > 1 ? 's' : ''}`;
  return `${d * 24} heure${d * 24 > 1 ? 's' : ''}`;
}

/**
 * Routine de libération d'une réservation expirée (D3, architecture §5.2).
 * À exécuter DANS une transaction ouverte. Sécurité anti-course :
 * - la commande doit être encore CREATED/PAYMENT_PENDING
 * - le produit doit être encore RESERVED
 * → une confirmation admin déjà appliquée est prioritaire, jamais écrasée
 *   (le `WHERE status IN (...)` lève la course avant toute écriture, D-V3-6).
 * La libération écrit l'event `(PAYMENT_PENDING → PAYMENT_FAILED, system)`
 * dans la même transaction (1 changement de statut = 1 ligne, CA-ORD06).
 */
export async function releaseExpiredReservation(
  client: DbClient,
  orderId: number,
  productId: number,
): Promise<boolean> {
  const order = await selectExpirableOrderForRelease(client, orderId, productId);
  if (!order) return false;

  const failed = await failOrderIfPending(client, orderId);
  if (!failed) return false; // course perdue (statut changé entretemps)

  await insertOrderEvent(client, orderId, 'PAYMENT_PENDING', 'PAYMENT_FAILED', 'system', `Réservation expirée (${config.reservationDays} jours après réception)`);
  await releaseReservedProduct(client, productId);
  await failPendingPayment(client, orderId);
  await insertNotification(
    client,
    order.buyer_id,
    'reservation_expired',
    `Votre commande ${order.order_number} a expiré`,
    order.product_name,
  );
  // ⚠️ PO-V5-14 : 2 envois (acheteur + vendeur), mais AUCUNE notification
  // in-app supplémentaire pour le vendeur (CA-V5-010) — `insertNotification`
  // ci-dessus reste le SEUL appel de ce type dans cette fonction.
  const orderNumber = order.order_number;
  const productName = order.product_name;
  queueMail(order.buyer_id, 'reservation_expired_buyer', {
    productName,
    orderNumber,
    linkPath: '/mes-commandes',
  });
  queueMail(order.seller_id, 'reservation_expired_seller', {
    productName,
    linkPath: '/mes-articles',
  });
  return true;
}

/**
 * Tâche planifiée / job manuel : expire TOUTES les réservations expirées.
 * Une transaction par commande (architecture §5.2).
 * Retourne le nombre de commandes libérées.
 */
export async function expireExpiredReservations(): Promise<number> {
  const rows = await selectExpiredReservations();
  let released = 0;
  for (const row of rows) {
    const ok = await withTransaction(async (client) => {
      await lockProductRow(client, row.product_id);
      return releaseExpiredReservation(client, row.order_id, row.product_id);
    });
    if (ok) released++;
  }
  return released;
}

/**
 * Vérification paresseuse (D3) : libère la réservation du produit SI elle est
 * réellement expirée (reserved_until < now()). Jamais une réservation valide.
 * Appelée avant de répondre une fiche produit (CA-CAT03-04).
 */
export async function lazyReleaseForProduct(productId: number): Promise<void> {
  const orderId = await selectLazyExpiredOrder(productId);
  if (orderId === undefined) return;
  await withTransaction(async (client) => {
    await lockProductRow(client, productId);
    await releaseExpiredReservation(client, orderId, productId);
  });
}
