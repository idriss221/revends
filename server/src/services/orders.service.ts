import { pool, type DbClient, type Queryable } from '../db/pool.js';
import { withTransaction } from '../utils/db.js';
import { config } from '../config.js';
import { badRequest, conflict, invalidTransition, notFound } from '../utils/errors.js';
import { releaseExpiredReservation } from './expiry.service.js';
import { insertNotification } from './notifications.service.js';
import { queueMail } from '../mail/queue.js';
import { buildAdminProductHistory, loadAdminUser, loadPrimaryImage, loadUser } from './products.service.js';
import {
  serializeAdminOrder,
  serializeAdminUser,
  serializeBuyerOrder,
  serializeBuyerOrderSummary,
  serializeSellerOrderSummary,
  serializeOrderEvent,
  serializeOrderForParty,
  type ImageRow,
  type OrderEventRow,
  type OrderRow,
  type OrderStatus,
  type ProductRow,
  type UserRow,
} from '../utils/serializers.js';
import {
  createOrderInitialEvents,
  insertOrder,
  insertPendingPayment,
  loadOrderEvents,
  loadOrderListRows,
  lockProductForCheckout,
  reserveProduct,
  selectBuyerOrderIdsPage,
  selectOrderById,
  selectOrderForUser as repoSelectOrderForUser,
  selectOrderProductHistory,
  selectPaymentByOrderId,
  selectPayoutByOrderId,
  selectPayoutsByOrderIds,
  selectPendingOrderForProduct,
  selectSellerOrderIdsPage,
  updateOrderStatus as repoUpdateOrderStatus,
  type OrderListData,
  type OrderParts,
  type PaymentPart,
} from '../repositories/orders.repository.js';

export type { OrderParts } from '../repositories/orders.repository.js';
export { loadOrderEvents };

// ---------------------------------------------------------------------------
// Détail d'une commande
// ---------------------------------------------------------------------------

export async function loadOrderParts(orderId: number, q: Queryable = pool): Promise<OrderParts> {
  const order = await selectOrderById(orderId, q);
  if (!order) throw notFound('ORDER_NOT_FOUND', 'Commande introuvable');

  // Séquentiel volontaire : `q` peut être un client de TRANSACTION (checkout) —
  // pg interdit plusieurs requêtes en vol sur le même client. EXEMPTION
  // `deleted_at` (variante HISTORY) : un produit supprimé logiquement doit
  // rester résolvable sur une commande réelle (CA-V5-059).
  const product = await selectOrderProductHistory(order.product_id, q);
  if (!product) throw notFound('PRODUCT_NOT_FOUND', 'Article introuvable');
  const primaryImage = await loadPrimaryImage(order.product_id, q);
  const buyer = await loadUser(order.buyer_id, q);
  const seller = await loadUser(order.seller_id, q);
  const payment = await selectPaymentByOrderId(orderId, q);
  if (!payment) throw notFound('ORDER_NOT_FOUND', 'Paiement introuvable');
  const payout = await selectPayoutByOrderId(orderId, q);
  const events = await loadOrderEvents(orderId, q);

  return {
    order,
    product,
    primaryImage,
    buyer,
    seller,
    payment,
    payout: payout ?? null,
    events,
  };
}

/** Voir la règle d'identité : 1 changement de statut = 1 ligne (`invalidTransition`). */
export async function updateOrderStatus(
  client: DbClient,
  orderId: number,
  fromStatus: OrderStatus,
  toStatus: OrderStatus,
  actor: 'system' | 'admin',
  note: string | null,
): Promise<void> {
  const ok = await repoUpdateOrderStatus(client, orderId, fromStatus, toStatus, actor, note);
  if (!ok) throw invalidTransition(fromStatus);
}

// ---------------------------------------------------------------------------
// ACHAT — POST /api/orders · POST /api/orders/checkout (txn FOR UPDATE)
// ---------------------------------------------------------------------------

export interface OrderBuyerFields {
  paymentMethod: string;
  shipping?: { name: string; phone: string; city: string; address: string } | null;
  note?: string | null;
  quantity?: number;
}

export async function createOrderInTransaction(
  client: DbClient,
  buyerId: number,
  productId: number,
  opts: OrderBuyerFields,
): Promise<Record<string, unknown>> {
  const product = await lockProductForCheckout(client, productId);
  if (!product) throw notFound('PRODUCT_NOT_FOUND', 'Article introuvable');

  if (product.status === 'RESERVED' && product.reserved_until && new Date(product.reserved_until) < new Date()) {
    const pending = await selectPendingOrderForProduct(client, product.id);
    if (pending) {
      const released = await releaseExpiredReservation(client, pending.id, product.id);
      if (released) product.status = 'AVAILABLE';
    }
  }

  if (product.status !== 'AVAILABLE') throw conflict('PRODUCT_RESERVED', "Cet article vient d'être réservé");
  if (product.owner_id === buyerId) throw badRequest('SELF_PURCHASE', 'Vous ne pouvez pas acheter votre propre article');

  const quantity = opts.quantity ?? 1;
  const amount = product.price * quantity;
  const commission = Math.floor(amount * config.commissionRate);
  const sellerAmount = amount - commission;

  const order = await insertOrder(client, {
    productId: product.id,
    buyerId,
    sellerId: product.owner_id,
    amount,
    commission,
    sellerAmount,
    quantity,
    shippingName: opts.shipping?.name ?? null,
    shippingPhone: opts.shipping?.phone ?? null,
    shippingCity: opts.shipping?.city ?? null,
    shippingAddress: opts.shipping?.address ?? null,
    buyerNote: opts.note ?? null,
  });

  await createOrderInitialEvents(client, order.id);
  await insertPendingPayment(client, order.id, amount, opts.paymentMethod);
  // Réservation longue (365 j) : pas d'expiration avant réception du produit.
  // Le délai de 5 jours ne démarre qu'à la réception (markProductReceived).
  await reserveProduct(client, product.id, 365);

  await insertNotification(client, buyerId, 'order_created', `Commande ${order.order_number} enregistrée`, product.name);
  await insertNotification(client, product.owner_id, 'article_reserved', 'Votre article est réservé', product.name);

  // Confirmation envoyée à la PERSONNE CONNECTÉE qui vient de commander : on
  // passe son `id` (session), `queueMail` relit son adresse en base au moment
  // de l'envoi, après le commit. Aucune adresse n'entre par la requête
  // (CA-V5-011) — un e-mail de contact saisi dans un formulaire ne décide
  // jamais du destinataire.
  queueMail(buyerId, 'order_created_buyer', {
    orderNumber: order.order_number,
    productName: product.name,
    linkPath: '/mes-commandes',
  });

  // Le vendeur est prévenu par e-mail que son article est réservé (en plus de
  // la notification in-app `article_reserved` ci-dessus).
  queueMail(product.owner_id, 'article_reserved', {
    productName: product.name,
    linkPath: '/mes-articles',
  });

  return serializeBuyerOrder(await loadOrderParts(order.id, client));
}

export async function createOrder(
  buyerId: number,
  input: { productId: number } & OrderBuyerFields,
): Promise<Record<string, unknown>> {
  const order = await withTransaction((client) => createOrderInTransaction(client, buyerId, input.productId, input));
  return { order };
}

export async function checkout(
  buyerId: number,
  input: { productIds: number[]; quantities?: Record<string, number> } & OrderBuyerFields,
): Promise<Record<string, unknown>> {
  const quantities = normalizeQuantities(input.productIds, input.quantities);
  // ⚠️ Ordre de verrouillage DÉTERMINISTE : `createOrderInTransaction` prend un
  // `SELECT ... FOR UPDATE` par article. Deux checkouts concurrents dont les
  // paniers se recouvrent mais dans un ordre différent se bloqueraient
  // mutuellement → deadlock PostgreSQL (40P01). On verrouille donc TOUJOURS par
  // id croissant (ordre global, indépendant de l'ordre fourni par le client).
  const lockOrder = [...input.productIds].sort((a, b) => a - b);
  const orders = await withTransaction(async (client) => {
    const created: Record<string, unknown>[] = [];
    for (const productId of lockOrder) {
      created.push(
        await createOrderInTransaction(client, buyerId, productId, { ...input, quantity: quantities.get(productId) ?? 1 }),
      );
    }
    return created;
  });
  return { orders, count: orders.length };
}

/**
 * Valide/normalise les quantités du panier (RG panier : 1..9, entiers, clés
 * appartenant à `productIds`). Exporté pour être testable sans BDD/HTTP.
 */
export function normalizeQuantities(productIds: number[], quantities: Record<string, number> | undefined): Map<number, number> {
  const byId = new Map<number, number>();
  if (quantities === undefined) return byId;
  const ids = new Set(productIds);
  for (const [key, value] of Object.entries(quantities)) {
    const productId = Number(key);
    if (!Number.isInteger(productId) || !ids.has(productId)) {
      throw badRequest('INVALID_QUANTITY', `Quantité fournie pour un article absent du panier : ${key}`);
    }
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 9) {
      throw badRequest('INVALID_QUANTITY', 'La quantité doit être un entier entre 1 et 9');
    }
    byId.set(productId, value);
  }
  return byId;
}

// ---------------------------------------------------------------------------
// Listes paginées (budget 2 requêtes, indépendant de `limit`)
// ---------------------------------------------------------------------------

export interface MeOrdersResult {
  items: Record<string, unknown>[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export async function listBuyerOrders(
  buyerId: number,
  opts: { page: number; limit: number } = { page: 1, limit: 12 },
): Promise<MeOrdersResult> {
  const offset = (opts.page - 1) * opts.limit;
  const { ids, total } = await selectBuyerOrderIdsPage(buyerId, { limit: opts.limit, offset });
  const items = await serializeBuyerOrderItems(ids);
  return { items, page: opts.page, limit: opts.limit, total, totalPages: Math.ceil(total / opts.limit) };
}

export async function listSellerOrders(
  sellerId: number,
  opts: { page: number; limit: number } = { page: 1, limit: 12 },
): Promise<MeOrdersResult> {
  const offset = (opts.page - 1) * opts.limit;
  const { ids, total } = await selectSellerOrderIdsPage(sellerId, { limit: opts.limit, offset });
  const items = await serializeSellerOrderItems(ids);
  return { items, page: opts.page, limit: opts.limit, total, totalPages: Math.ceil(total / opts.limit) };
}

async function serializeBuyerOrderItems(orderIds: number[]): Promise<Record<string, unknown>[]> {
  if (orderIds.length === 0) return [];
  const { orders, products, primaryImages, payments, parties } = await loadOrderListRows(orderIds);
  const items: Record<string, unknown>[] = [];
  for (const order of orders) {
    const seller = parties.get(order.seller_id);
    if (!seller) continue;
    items.push(
      serializeBuyerOrderSummary({
        order,
        product: products.get(order.product_id)!,
        primaryImage: primaryImages.get(order.product_id) ?? null,
        buyer: seller,
        seller,
        payment: payments.get(order.id)!,
        payout: null,
        events: [],
      }),
    );
  }
  return items;
}

async function serializeSellerOrderItems(orderIds: number[]): Promise<Record<string, unknown>[]> {
  if (orderIds.length === 0) return [];
  const { orders, products, primaryImages, payments, parties } = await loadOrderListRows(orderIds);
  const items: Record<string, unknown>[] = [];
  for (const order of orders) {
    const buyer = parties.get(order.buyer_id);
    if (!buyer) continue;
    items.push(
      serializeSellerOrderSummary({
        order,
        product: products.get(order.product_id)!,
        primaryImage: primaryImages.get(order.product_id) ?? null,
        buyer,
        seller: buyer,
        payment: payments.get(order.id)!,
        payout: null,
        events: [],
      }),
    );
  }
  return items;
}

/**
 * Liste admin des commandes, en BATCH (cible 3 requêtes). Exporté ici car
 * `loadOrderListRows` est un utilitaire de commandes réutilisé par `admin.service`.
 */
export async function loadOrderListParts(
  orderIds: number[],
): Promise<
  Array<{
    order: OrderRow;
    product: ProductRow;
    primaryImage: ImageRow | null;
    buyer: UserRow;
    seller: UserRow;
    payment: PaymentPart;
    payout: OrderParts['payout'];
    events: OrderEventRow[];
  }>
> {
  if (orderIds.length === 0) return [];
  const { orders, products, primaryImages, payments, parties: users } = await loadOrderListRows(orderIds);
  const payouts = await selectPayoutsByOrderIds(orderIds);

  const parts: Array<{
    order: OrderRow;
    product: ProductRow;
    primaryImage: ImageRow | null;
    buyer: UserRow;
    seller: UserRow;
    payment: PaymentPart;
    payout: OrderParts['payout'];
    events: OrderEventRow[];
  }> = [];
  for (const order of orders) {
    const buyer = users.get(order.buyer_id);
    const seller = users.get(order.seller_id);
    if (!buyer || !seller) continue;
    parts.push({
      order,
      product: products.get(order.product_id)!,
      primaryImage: primaryImages.get(order.product_id) ?? null,
      buyer,
      seller,
      payment: payments.get(order.id)!,
      payout: payouts.get(order.id) ?? null,
      events: [],
    });
  }
  return parts;
}

export async function getAdminOrderDetail(orderId: number): Promise<Record<string, unknown>> {
  const parts = await loadOrderParts(orderId);
  const [buyer, seller] = await Promise.all([loadAdminUser(parts.buyer.id), loadAdminUser(parts.seller.id)]);
  return {
    order: serializeAdminOrder(parts, {
      buyer: serializeAdminUser(buyer),
      seller: serializeAdminUser(seller),
      product: await buildAdminProductHistory(parts.product.id),
      events: parts.events.map(serializeOrderEvent),
    }),
  };
}

export async function getOrderForUser(orderId: number, user: UserRow): Promise<Record<string, unknown>> {
  const order = await repoSelectOrderForUser(orderId);
  if (!order) throw notFound('ORDER_NOT_FOUND', 'Commande introuvable');

  if (user.role === 'admin') return getAdminOrderDetail(orderId);

  const isBuyer = order.buyer_id === user.id;
  const isSeller = order.seller_id === user.id;
  if (!isBuyer && !isSeller) throw notFound('ORDER_NOT_FOUND', 'Commande introuvable');

  const parts = await loadOrderParts(orderId);
  const role: 'buyer' | 'seller' = isBuyer ? 'buyer' : 'seller';
  return { order: serializeOrderForParty(parts, role) };
}

export type { OrderListData };
