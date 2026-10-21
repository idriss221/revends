import type { DbClient } from '../db/pool.js';
import { withTransaction } from '../utils/db.js';
import { config } from '../config.js';
import { conflict, invalidTransition, notFound, orderNotAllowed } from '../utils/errors.js';
import { insertNotification } from './notifications.service.js';
import { buildAdminProduct, loadImagesBatch, serializeAdminProductRow } from './products.service.js';
import { getAdminOrderDetail, loadOrderListParts, updateOrderStatus } from './orders.service.js';
import { queueMail } from '../mail/queue.js';
import { formatFCFA, serializeAdminOrder, serializeAdminUser, serializeHistoryRow, type UserRow, type OrderStatus } from '../utils/serializers.js';
import {
  countAdminHistory,
  countAdminOrders,
  insertAdminAction,
  selectAdminHistoryPage,
  selectAdminOrderIdsPage,
  selectAdminStats,
  type AdminStats,
} from '../repositories/admin.repository.js';
import {
  lockOrderWithPayment,
  lockOrderWithProduct,
  lockPayout,
  markPayoutDue,
  markProductSold,
  payPayout,
  releaseReservedProduct,
  failPendingPayment,
  setOrderDelivery,
  updatePaymentPaid,
  insertPayout,
} from '../repositories/orders.repository.js';
import {
  countAdminProducts,
  markProductApproved,
  markProductRejected,
  productHasActiveOrder,
  selectAdminProductsPage,
  selectProductForDeleteLock,
  selectProductForModerationLock,
  softDeleteProduct,
  updateProductReservedUntil,
} from '../repositories/products.repository.js';
import { countAdminUsers, selectAdminUsersPage } from '../repositories/users.repository.js';
import { cacheDel } from '../cache/redis.js';

export type { AdminStats } from '../repositories/admin.repository.js';

/**
 * Précondition `seller-payout` — statuts de commande éligibles au paiement
 * vendeur (CA-ORD07-05, V4) : le payout n'est payable qu'une fois la commande
 * livrée : DELIVERED (transitoire) ou COMPLETED.
 */
const SELLER_PAYOUT_ELIGIBLE = ['DELIVERED', 'COMPLETED'] as const;

// ---------------------------------------------------------------------------
// GET /api/admin/stats — compteurs du dashboard (CA-ADM01)
// ---------------------------------------------------------------------------

export async function getStats(): Promise<AdminStats> {
  return selectAdminStats();
}

// ---------------------------------------------------------------------------
// Modération produits
// ---------------------------------------------------------------------------

export async function listAdminProducts(opts: { status: string; q?: string; page: number; perPage: number }) {
  const offset = (opts.page - 1) * opts.perPage;
  const [total, rows] = await Promise.all([
    countAdminProducts(opts),
    selectAdminProductsPage({ ...opts, limit: opts.perPage, offset }),
  ]);

  const images = await loadImagesBatch(rows.map((r) => r.id));
  const items = rows.map((row) => serializeAdminProductRow(row, images.get(row.id) ?? []));
  return { items, page: opts.page, perPage: opts.perPage, total, totalPages: total === 0 ? 0 : Math.ceil(total / opts.perPage) };
}

async function lockPendingProduct(client: DbClient, productId: number): Promise<{ id: number; name: string; owner_id: number; status: string }> {
  const product = await selectProductForModerationLock(client, productId);
  if (!product) throw notFound('PRODUCT_NOT_FOUND', 'Article introuvable');
  if (product.status !== 'PENDING') {
    throw conflict('PRODUCT_NOT_PENDING', "Cet article n'est plus en attente de validation");
  }
  return product;
}

export async function approveProduct(adminId: number, productId: number): Promise<Record<string, unknown>> {
  await withTransaction(async (client) => {
    const product = await lockPendingProduct(client, productId);
    await markProductApproved(client, productId, adminId);
    await insertAdminAction(client, {
      adminId,
      action: 'product.approved',
      targetType: 'product',
      targetId: productId,
      description: `Article approuvé — ${product.name}`,
    });
    await insertNotification(client, product.owner_id, 'article_approved', 'Votre article est en ligne', product.name);
    queueMail(product.owner_id, 'product_approved', { productName: product.name, linkPath: '/mes-articles' });
  });
  await cacheDel(['categories:public']);
  return { product: await buildAdminProduct(productId) };
}

export async function rejectProduct(adminId: number, productId: number, reason: string): Promise<Record<string, unknown>> {
  await withTransaction(async (client) => {
    const product = await lockPendingProduct(client, productId);
    await markProductRejected(client, productId, reason);
    await insertAdminAction(client, {
      adminId,
      action: 'product.rejected',
      targetType: 'product',
      targetId: productId,
      description: `Article refusé — ${product.name} — ${reason}`,
    });
    await insertNotification(client, product.owner_id, 'article_rejected', `Article refusé : ${reason}`, reason);
    queueMail(product.owner_id, 'product_rejected', {
      productName: product.name,
      reason,
      linkPath: '/mes-articles',
    });
  });
  await cacheDel(['categories:public']);
  return { product: await buildAdminProduct(productId) };
}

// ---------------------------------------------------------------------------
// C4 — Suppression logique d'un article par l'administration
// ---------------------------------------------------------------------------

/** Valeur `admin_actions.action` de la suppression (D3) — distincte des modérations. */
const ADMIN_ACTION_PRODUCT_DELETE = 'product.delete';

export interface ProductDeletedInfo {
  productId: number;
  productName: string;
  ownerId: number;
}

/**
 * `DELETE /api/admin/products/:id` → 204 sans corps (D7, CA-V5-056…065).
 * Idempotent : supprimer deux fois donne 204 puis 204 ; 404 réservé au produit
 * inexistant. La notification est écrite DANS la transaction (CA-V5-060), seul
 * l'envoi d'e-mail sort de la transaction (PO-V5-14).
 */
export async function deleteProductAsAdmin(adminId: number, productId: number): Promise<ProductDeletedInfo> {
  const result = await withTransaction(async (client) => {
    const product = await selectProductForDeleteLock(client, productId);
    if (!product) throw notFound('PRODUCT_NOT_FOUND', 'Article introuvable');

    if (product.deleted_at !== null) {
      return { productId: product.id, productName: product.name, ownerId: product.owner_id };
    }

    if (await productHasActiveOrder(client, productId)) {
      throw conflict('PRODUCT_HAS_ACTIVE_ORDER', 'Article lié à une commande en cours : suppression impossible');
    }

    await softDeleteProduct(client, productId);
    await insertAdminAction(client, {
      adminId,
      action: ADMIN_ACTION_PRODUCT_DELETE,
      targetType: 'product',
      targetId: productId,
      description: `Article supprimé — ${product.name}`,
    });
    await insertNotification(
      client,
      product.owner_id,
      'article_deleted',
      'Votre article a été supprimé',
      `L'article « ${product.name} » a été supprimé du catalogue par l'administration.`,
    );

    return { productId: product.id, productName: product.name, ownerId: product.owner_id };
  });
  await cacheDel(['categories:public']);
  return result;
}

// ---------------------------------------------------------------------------
// Commandes (admin)
// ---------------------------------------------------------------------------

export async function listAdminOrders(opts: { status?: string; payout?: string; page: number; perPage: number }) {
  const offset = (opts.page - 1) * opts.perPage;
  const [total, ids] = await Promise.all([
    countAdminOrders(opts),
    selectAdminOrderIdsPage({ ...opts, limit: opts.perPage, offset }),
  ]);

  const partsList = await loadOrderListParts(ids);
  const items = partsList.map((parts) => serializeAdminOrder(parts));

  return { items, page: opts.page, perPage: opts.perPage, total, totalPages: total === 0 ? 0 : Math.ceil(total / opts.perPage) };
}

// ---------------------------------------------------------------------------
// Transitions du cycle de vie (matrice Annexe A.2 — api.md §3.6)
// ---------------------------------------------------------------------------

export async function confirmPayment(adminId: number, orderId: number, input: { method: string; reference?: string }): Promise<Record<string, unknown>> {
  await withTransaction(async (client) => {
    const order = await lockOrderWithPayment(client, orderId);
    if (!order) throw notFound('ORDER_NOT_FOUND', 'Commande introuvable');
    // Accepte PAYMENT_PENDING (flux standard) OU PRODUCT_RECEIVED (paiement à la livraison)
    const fromStatus = order.status as OrderStatus;
    if (!['PAYMENT_PENDING', 'PRODUCT_RECEIVED'].includes(fromStatus)) {
      throw invalidTransition(fromStatus);
    }

    await updateOrderStatus(client, orderId, fromStatus, 'PAID', 'admin', null);
    await updateOrderStatus(client, orderId, 'PAID', 'PRODUCT_WAITING', 'system', 'Produit en attente');

    const sold = await markProductSold(client, order.product_id);
    if (!sold) throw conflict('PRODUCT_NOT_RESERVED', "Le produit n'est plus réservé — paiement annulé");
    await updatePaymentPaid(client, orderId, input.method, input.reference ?? null);
    await insertPayout(client, orderId, order.seller_id, order.seller_amount, 'PENDING');
    await insertAdminAction(client, {
      adminId,
      action: 'payment.confirmed',
      targetType: 'order',
      targetId: orderId,
      description: `Paiement acheteur confirmé — ${order.order_number} — ${formatFCFA(order.amount)} FCFA`,
    });
    await insertNotification(client, order.buyer_id, 'payment_confirmed', `Paiement confirmé pour ${order.order_number}`, order.product_name);
    await insertNotification(client, order.seller_id, 'order_product_waiting', `Produit en attente pour ${order.order_number}`, order.product_name);
    queueMail(order.buyer_id, 'payment_confirmed_buyer', {
      orderNumber: order.order_number,
      amountFcfa: order.amount,
      linkPath: `/mes-commandes/${order.id}`,
    });
    queueMail(order.seller_id, 'payment_confirmed_seller', {
      productName: order.product_name,
      amountFcfa: order.seller_amount,
      linkPath: '/mes-articles',
    });
  });
  return { order: (await getAdminOrderDetail(orderId)).order };
}

export async function markProductReceived(adminId: number, orderId: number, note?: string): Promise<Record<string, unknown>> {
  await withTransaction(async (client) => {
    const order = await lockOrderWithProduct(client, orderId);
    if (!order) throw notFound('ORDER_NOT_FOUND', 'Commande introuvable');
    // Accepte PRODUCT_WAITING (flux standard) OU PAYMENT_PENDING (paiement à la livraison)
    const fromStatus = order.status as OrderStatus;
    if (!['PRODUCT_WAITING', 'PAYMENT_PENDING'].includes(fromStatus)) {
      throw invalidTransition(fromStatus);
    }

    await updateOrderStatus(client, orderId, fromStatus, 'PRODUCT_RECEIVED', 'admin', note?.trim() ? note.trim() : null);

    // Si paiement à la livraison (PAYMENT_PENDING), on démarre le délai de 5 jours pour payer
    if (fromStatus === 'PAYMENT_PENDING') {
      await updateProductReservedUntil(client, order.product_id, config.reservationDays);
    }

    await updateOrderStatus(client, orderId, 'PRODUCT_RECEIVED', 'PREPARING', 'system', 'En préparation');
    await insertAdminAction(client, {
      adminId,
      action: 'product.received',
      targetType: 'order',
      targetId: orderId,
      description: `Produit reçu — ${order.order_number}`,
    });
    await insertNotification(client, order.buyer_id, 'order_product_received', `Produit reçu, préparation en cours pour ${order.order_number}`, order.product_name);
    queueMail(order.buyer_id, 'order_product_received', {
      productName: order.product_name,
      orderNumber: order.order_number,
      linkPath: `/mes-commandes/${order.id}`,
    });
  });
  return { order: (await getAdminOrderDetail(orderId)).order };
}

/** PREPARING → SHIPPED (« Prête/Expédiée »). */
export async function markShipped(adminId: number, orderId: number): Promise<Record<string, unknown>> {
  await withTransaction(async (client) => {
    const order = await lockOrderWithProduct(client, orderId);
    if (!order) throw notFound('ORDER_NOT_FOUND', 'Commande introuvable');
    if (order.status !== 'PREPARING') throw invalidTransition(order.status);

    await updateOrderStatus(client, orderId, 'PREPARING', 'SHIPPED', 'admin', null);
    await insertAdminAction(client, {
      adminId,
      action: 'order.shipped',
      targetType: 'order',
      targetId: orderId,
      description: `Commande prête/expédiée — ${order.order_number}`,
    });
    await insertNotification(client, order.buyer_id, 'order_shipped', `Votre colis est prêt pour ${order.order_number}`, order.product_name);
    queueMail(order.buyer_id, 'order_shipped', {
      productName: order.product_name,
      orderNumber: order.order_number,
      linkPath: `/mes-commandes/${order.id}`,
    });
  });
  return { order: (await getAdminOrderDetail(orderId)).order };
}

export async function startDelivery(
  adminId: number,
  orderId: number,
  input: { carrier?: string; trackingNumber?: string },
): Promise<Record<string, unknown>> {
  const carrier = input.carrier?.trim() || null;
  const trackingNumber = input.trackingNumber?.trim() || null;
  await withTransaction(async (client) => {
    const order = await lockOrderWithProduct(client, orderId);
    if (!order) throw notFound('ORDER_NOT_FOUND', 'Commande introuvable');
    if (order.status !== 'SHIPPED') throw invalidTransition(order.status);

    await updateOrderStatus(client, orderId, 'SHIPPED', 'IN_DELIVERY', 'admin', null);
    await setOrderDelivery(client, orderId, carrier, trackingNumber);
    await insertAdminAction(client, {
      adminId,
      action: 'delivery.started',
      targetType: 'order',
      targetId: orderId,
      description: `Livraison lancée — ${order.order_number}`,
    });
    const title = trackingNumber ? `Votre colis est en livraison, suivi : ${trackingNumber}` : 'Votre colis est en livraison';
    await insertNotification(client, order.buyer_id, 'order_in_delivery', title, order.product_name);
  });
  return { order: (await getAdminOrderDetail(orderId)).order };
}

export async function markDelivered(adminId: number, orderId: number): Promise<Record<string, unknown>> {
  await withTransaction(async (client) => {
    const order = await lockOrderWithProduct(client, orderId);
    if (!order) throw notFound('ORDER_NOT_FOUND', 'Commande introuvable');
    if (order.status !== 'IN_DELIVERY') throw invalidTransition(order.status);

    await updateOrderStatus(client, orderId, 'IN_DELIVERY', 'DELIVERED', 'admin', 'Livrée');
    await updateOrderStatus(client, orderId, 'DELIVERED', 'COMPLETED', 'system', 'Commande terminée');
    await markPayoutDue(client, orderId);
    await insertAdminAction(client, {
      adminId,
      action: 'order.delivered',
      targetType: 'order',
      targetId: orderId,
      description: `Commande livrée — ${order.order_number}`,
    });
    await insertNotification(client, order.buyer_id, 'order_delivered', `Votre commande ${order.order_number} est livrée`, order.product_name);
    await insertNotification(client, order.seller_id, 'order_completed', `Commande ${order.order_number} terminée — le paiement vendeur est disponible`, order.product_name);
    queueMail(order.buyer_id, 'order_delivered', {
      productName: order.product_name,
      orderNumber: order.order_number,
      linkPath: `/mes-commandes/${order.id}`,
    });
    queueMail(order.seller_id, 'payout_available', {
      orderNumber: order.order_number,
      amountFcfa: order.seller_amount,
      linkPath: '/mes-articles',
    });
    // Vente terminée côté acheteur (transition système DELIVERED → COMPLETED).
    queueMail(order.buyer_id, 'order_completed_buyer', {
      productName: order.product_name,
      orderNumber: order.order_number,
      linkPath: `/mes-commandes/${order.id}`,
    });
  });
  return { order: (await getAdminOrderDetail(orderId)).order };
}

export async function cancelOrder(adminId: number, orderId: number, note: string): Promise<Record<string, unknown>> {
  await withTransaction(async (client) => {
    const order = await lockOrderWithPayment(client, orderId);
    if (!order) throw notFound('ORDER_NOT_FOUND', 'Commande introuvable');
    if (order.status !== 'PAYMENT_PENDING') throw invalidTransition(order.status);

    await updateOrderStatus(client, orderId, 'PAYMENT_PENDING', 'CANCELLED', 'admin', note.trim());
    await failPendingPayment(client, orderId);
    await releaseReservedProduct(client, order.product_id);
    await insertAdminAction(client, {
      adminId,
      action: 'order.cancelled',
      targetType: 'order',
      targetId: orderId,
      description: `Commande ${order.order_number} annulée — ${note.trim()}`,
    });
    // L'acheteur est prévenu par e-mail de l'annulation (produit redevenu
    // disponible, aucun débit).
    queueMail(order.buyer_id, 'order_cancelled', {
      orderNumber: order.order_number,
      productName: order.product_name,
      linkPath: '/mes-commandes',
    });
  });
  return { order: (await getAdminOrderDetail(orderId)).order };
}

export async function sellerPayout(adminId: number, orderId: number, input: { reference?: string }): Promise<Record<string, unknown>> {
  await withTransaction(async (client) => {
    const order = await lockOrderWithProduct(client, orderId);
    if (!order) throw notFound('ORDER_NOT_FOUND', 'Commande introuvable');

    const payout = await lockPayout(client, orderId);

    // Ordre des gardes (api.md §3.6 seller-payout, V4) :
    // 1. aucun payout / déjà PAID → PAYOUT_NOT_PENDING ;
    // 2. statut commande hors {DELIVERED, COMPLETED} → ORDER_NOT_ALLOWED ;
    // 3. payout pas encore DUE → PAYOUT_NOT_PENDING (défensif).
    if (!payout || payout.status === 'PAID') {
      throw conflict('PAYOUT_NOT_PENDING', 'Paiement vendeur indisponible ou déjà effectué');
    }
    if (!SELLER_PAYOUT_ELIGIBLE.includes(order.status as (typeof SELLER_PAYOUT_ELIGIBLE)[number])) {
      throw orderNotAllowed(order.status);
    }
    if (payout.status !== 'DUE') {
      throw conflict('PAYOUT_NOT_PENDING', 'Paiement vendeur pas encore dû (livraison non confirmée)');
    }

    await payPayout(client, orderId, adminId, input.reference ?? null);
    await insertAdminAction(client, {
      adminId,
      action: 'seller.paid',
      targetType: 'order',
      targetId: orderId,
      description: `Vendeur payé — ${order.order_number} — ${formatFCFA(order.seller_amount)} FCFA`,
    });
    await insertNotification(client, order.seller_id, 'seller_paid', `Paiement reçu : ${formatFCFA(order.seller_amount)} FCFA pour ${order.order_number}`, order.product_name);
    await insertNotification(client, order.seller_id, 'article_sold', 'Votre article a été vendu', order.product_name);
    queueMail(order.seller_id, 'payout_paid', {
      orderNumber: order.order_number,
      amountFcfa: order.seller_amount,
      linkPath: '/mes-articles',
    });
  });
  return { order: (await getAdminOrderDetail(orderId)).order };
}

// ---------------------------------------------------------------------------
// Utilisateurs (lecture seule) + historique admin
// ---------------------------------------------------------------------------

export async function listAdminUsers(opts: { q?: string; page: number; perPage: number }) {
  const offset = (opts.page - 1) * opts.perPage;
  const [total, rows] = await Promise.all([
    countAdminUsers(opts.q),
    selectAdminUsersPage({ q: opts.q, limit: opts.perPage, offset }),
  ]);

  return {
    items: rows.map((r: UserRow) => serializeAdminUser(r)),
    page: opts.page,
    perPage: opts.perPage,
    total,
    totalPages: total === 0 ? 0 : Math.ceil(total / opts.perPage),
  };
}

export async function listAdminHistory(opts: { action?: string; targetType?: string; page: number; perPage: number }) {
  const offset = (opts.page - 1) * opts.perPage;
  const [total, rows] = await Promise.all([
    countAdminHistory(opts),
    selectAdminHistoryPage({ ...opts, limit: opts.perPage, offset }),
  ]);

  return {
    items: rows.map((r) => serializeHistoryRow(r)),
    page: opts.page,
    perPage: opts.perPage,
    total,
    totalPages: total === 0 ? 0 : Math.ceil(total / opts.perPage),
  };
}