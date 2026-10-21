import { query } from '../db/pool.js';
import { pool, type Queryable } from '../db/pool.js';
import type { ImageRow, OrderEventRow, OrderRow, OrderStatus, ProductRow, UserRow } from '../utils/serializers.js';
import { PRODUCT_SELECT_HISTORY } from './products.repository.js';

export interface PaymentPart {
  id: number;
  amount: number;
  method: string;
  status: string;
  reference: string | null;
  paid_at: Date | string | null;
}

export interface PayoutPart {
  id: number;
  amount: number;
  status: string;
  reference: string | null;
  paid_at: Date | string | null;
}

export interface OrderParts {
  order: OrderRow;
  product: ProductRow;
  primaryImage: ImageRow | null;
  buyer: UserRow;
  seller: UserRow;
  payment: PaymentPart;
  payout: PayoutPart | null;
  events: OrderEventRow[];
}

// ---------------------------------------------------------------------------
// Événements / détail
// ---------------------------------------------------------------------------

export async function loadOrderEvents(orderId: number, q: Queryable = pool): Promise<OrderEventRow[]> {
  const { rows } = await q.query<OrderEventRow>(
    `SELECT id, order_id, from_status, to_status, actor, note, created_at
       FROM order_events WHERE order_id = $1 ORDER BY created_at ASC, id ASC`,
    [orderId],
  );
  return rows;
}

export async function selectOrderById(orderId: number, q: Queryable = pool): Promise<OrderRow | undefined> {
  const { rows } = await q.query<OrderRow>('SELECT * FROM orders WHERE id = $1', [orderId]);
  return rows[0];
}

/** Produit en variante HISTORIQUE (sans filtre `deleted_at`) — CA-V5-059. */
export async function selectOrderProductHistory(productId: number, q: Queryable = pool): Promise<ProductRow | undefined> {
  const { rows } = await q.query<ProductRow>(`${PRODUCT_SELECT_HISTORY} WHERE p.id = $1`, [productId]);
  return rows[0];
}

export async function selectPaymentByOrderId(orderId: number, q: Queryable = pool): Promise<PaymentPart | undefined> {
  const { rows } = await q.query<PaymentPart>(
    'SELECT id, amount, method, status, reference, paid_at FROM payments WHERE order_id = $1',
    [orderId],
  );
  return rows[0];
}

export async function selectPayoutByOrderId(orderId: number, q: Queryable = pool): Promise<PayoutPart | undefined> {
  const { rows } = await q.query<PayoutPart>(
    'SELECT id, amount, status, reference, paid_at FROM seller_payouts WHERE order_id = $1',
    [orderId],
  );
  return rows[0];
}

export async function insertOrderEvent(
  client: Queryable,
  orderId: number,
  fromStatus: OrderStatus | null,
  toStatus: OrderStatus,
  actor: 'system' | 'admin' | 'user',
  note: string | null,
): Promise<void> {
  await client.query(
    'INSERT INTO order_events (order_id, from_status, to_status, actor, note) VALUES ($1, $2, $3, $4, $5)',
    [orderId, fromStatus, toStatus, actor, note],
  );
}

/** Transition atomique `status = $3` + 1 ligne d'événement (`invalidTransition` si 0 ligne). */
export async function updateOrderStatus(
  client: Queryable,
  orderId: number,
  fromStatus: OrderStatus,
  toStatus: OrderStatus,
  actor: 'system' | 'admin',
  note: string | null,
): Promise<boolean> {
  const res = await client.query('UPDATE orders SET status = $1 WHERE id = $2 AND status = $3', [toStatus, orderId, fromStatus]);
  if (res.rowCount !== 1) return false;
  await insertOrderEvent(client, orderId, fromStatus, toStatus, actor, note);
  return true;
}

// ---------------------------------------------------------------------------
// Checkout (transaction)
// ---------------------------------------------------------------------------

export interface CheckoutProduct {
  id: number;
  owner_id: number;
  status: string;
  reserved_at: Date | null;
  reserved_until: Date | null;
  price: number;
  name: string;
}

export async function lockProductForCheckout(
  client: Queryable,
  productId: number,
): Promise<CheckoutProduct | undefined> {
  const { rows } = await client.query<CheckoutProduct>(
    'SELECT id, owner_id, status, reserved_at, reserved_until, price, name FROM products WHERE id = $1 AND deleted_at IS NULL FOR UPDATE',
    [productId],
  );
  return rows[0];
}

export async function selectPendingOrderForProduct(
  client: Queryable,
  productId: number,
): Promise<{ id: number } | undefined> {
  const { rows } = await client.query<{ id: number }>(
    "SELECT id FROM orders WHERE product_id = $1 AND status IN ('CREATED', 'PAYMENT_PENDING') ORDER BY id DESC LIMIT 1",
    [productId],
  );
  return rows[0];
}

export interface InsertOrderInput {
  productId: number;
  buyerId: number;
  sellerId: number;
  amount: number;
  commission: number;
  sellerAmount: number;
  quantity: number;
  shippingName: string | null;
  shippingPhone: string | null;
  shippingCity: string | null;
  shippingAddress: string | null;
  buyerNote: string | null;
}

export async function insertOrder(
  client: Queryable,
  input: InsertOrderInput,
): Promise<{ id: number; order_number: string }> {
  const { rows } = await client.query<{ id: number; order_number: string }>(
    `INSERT INTO orders (product_id, buyer_id, seller_id, amount, commission, seller_amount, quantity, status,
                         shipping_name, shipping_phone, shipping_city, shipping_address, buyer_note)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'CREATED', $8, $9, $10, $11, $12)
     RETURNING id, order_number`,
    [
      input.productId, input.buyerId, input.sellerId, input.amount, input.commission, input.sellerAmount, input.quantity,
      input.shippingName, input.shippingPhone, input.shippingCity, input.shippingAddress, input.buyerNote,
    ],
  );
  return rows[0]!;
}

/** Les 2 événements initiaux + passage CREATED → PAYMENT_PENDING (D-V3-2/4). */
export async function createOrderInitialEvents(client: Queryable, orderId: number): Promise<void> {
  await insertOrderEvent(client, orderId, null, 'CREATED', 'system', 'Création de la commande');
  await client.query("UPDATE orders SET status = 'PAYMENT_PENDING' WHERE id = $1 AND status = 'CREATED'", [orderId]);
  await insertOrderEvent(client, orderId, 'CREATED', 'PAYMENT_PENDING', 'system', 'Paiement en attente');
}

export async function insertPendingPayment(
  client: Queryable,
  orderId: number,
  amount: number,
  method: string,
): Promise<void> {
  await client.query(
    "INSERT INTO payments (order_id, amount, method, status) VALUES ($1, $2, $3, 'PENDING')",
    [orderId, amount, method],
  );
}

/**
 * Réserve un produit pour la commande en cours.
 * `days` = durée de la réservation en JOURS.
 * - À la création de commande : 365 jours (pas d'expiration avant réception).
 * - À la réception du produit (paiement à la livraison) : 5 jours (config.reservationDays).
 * `reserved_until` sert de date d'expiration (cron + libération paresseuse).
 */
export async function reserveProduct(client: Queryable, productId: number, days: number): Promise<void> {
  await client.query(
    "UPDATE products SET status = 'RESERVED', reserved_at = now(), reserved_until = now() + make_interval(days => $1) WHERE id = $2",
    [days, productId],
  );
}

// ---------------------------------------------------------------------------
// Batch des listes (C5)
// ---------------------------------------------------------------------------

const ORDER_LIST_COLUMNS = `
  o.id, o.order_number, o.amount, o.commission, o.seller_amount, o.quantity, o.status,
  o.delivery_carrier, o.tracking_number, o.product_id, o.buyer_id, o.seller_id,
  o.shipping_name, o.shipping_phone, o.shipping_city, o.shipping_address, o.buyer_note,
  o.created_at, o.updated_at`;

export interface OrderListData {
  orders: OrderRow[];
  products: Map<number, ProductRow>;
  primaryImages: Map<number, ImageRow>;
  payments: Map<number, PaymentPart>;
  parties: Map<number, UserRow>;
}

export async function loadOrderListRows(orderIds: number[], q: Queryable = pool): Promise<OrderListData> {
  if (orderIds.length === 0) {
    return { orders: [], products: new Map(), primaryImages: new Map(), payments: new Map(), parties: new Map() };
  }

  const { rows } = await q.query<
    OrderRow & {
      product: ProductRow | null;
      primary_image: ImageRow | null;
      payment: PaymentPart | null;
      buyer_user: UserRow | null;
      seller_user: UserRow | null;
    }
  >(
    `SELECT ${ORDER_LIST_COLUMNS},
            to_jsonb(pr) AS product,
            to_jsonb(img) AS primary_image,
            to_jsonb(pm)  AS payment,
            to_jsonb(ub) AS buyer_user,
            to_jsonb(us) AS seller_user
       FROM orders o
       LEFT JOIN LATERAL (
         ${PRODUCT_SELECT_HISTORY} WHERE p.id = o.product_id
       ) pr ON TRUE
       LEFT JOIN LATERAL (
         SELECT DISTINCT ON (pi.product_id) pi.id, pi.product_id, pi.path, pi.is_primary, pi.position
           FROM product_images pi
          WHERE pi.product_id = o.product_id AND pi.is_primary = TRUE
          ORDER BY pi.product_id, pi.position, pi.id
       ) img ON TRUE
       LEFT JOIN LATERAL (SELECT * FROM users WHERE id = o.buyer_id) ub ON TRUE
       LEFT JOIN LATERAL (SELECT * FROM users WHERE id = o.seller_id) us ON TRUE
       LEFT JOIN payments pm ON pm.order_id = o.id
      WHERE o.id = ANY($1::bigint[])`,
    [orderIds],
  );

  const products = new Map<number, ProductRow>();
  const primaryImages = new Map<number, ImageRow>();
  const payments = new Map<number, PaymentPart>();
  const parties = new Map<number, UserRow>();
  const orders: OrderRow[] = [];

  for (const row of rows) {
    const { product, primary_image: primaryImage, payment, buyer_user: buyer, seller_user: seller, ...order } = row;
    orders.push(order as OrderRow);
    if (product) products.set(row.product_id, product);
    if (primaryImage) primaryImages.set(row.product_id, primaryImage);
    if (payment) payments.set(row.id, payment);
    if (buyer) parties.set(buyer.id, buyer);
    if (seller) parties.set(seller.id, seller);
  }

  return { orders, products, primaryImages, payments, parties };
}

export async function selectBuyerOrderIds(buyerId: number, q: Queryable = pool): Promise<number[]> {
  const { rows } = await query<{ id: number }>(
    'SELECT id FROM orders WHERE buyer_id = $1 ORDER BY created_at DESC, id DESC',
    [buyerId],
  );
  return rows.map((r) => r.id);
}

export async function selectSellerOrderIds(sellerId: number, q: Queryable = pool): Promise<number[]> {
  const { rows } = await query<{ id: number }>(
    'SELECT id FROM orders WHERE seller_id = $1 ORDER BY created_at DESC, id DESC',
    [sellerId],
  );
  return rows.map((r) => r.id);
}

/** Page acheteur + total en une requête (fenêtre), indépendant de `limit`. */
export async function selectBuyerOrderIdsPage(
  buyerId: number,
  opts: { limit: number; offset: number },
  q: Queryable = pool,
): Promise<{ ids: number[]; total: number }> {
  return selectOrderIdsPage('buyer_id', buyerId, opts);
}

export async function selectSellerOrderIdsPage(
  sellerId: number,
  opts: { limit: number; offset: number },
  q: Queryable = pool,
): Promise<{ ids: number[]; total: number }> {
  return selectOrderIdsPage('seller_id', sellerId, opts);
}

async function selectOrderIdsPage(
  column: 'buyer_id' | 'seller_id',
  userId: number,
  opts: { limit: number; offset: number },
): Promise<{ ids: number[]; total: number }> {
  const { rows } = await query<{ id: number; total: string }>(
    `SELECT id, COUNT(*) OVER()::text AS total
       FROM orders WHERE ${column} = $1
      ORDER BY created_at DESC, id DESC
      LIMIT $2 OFFSET $3`,
    [userId, opts.limit, opts.offset],
  );
  return { ids: rows.map((r) => r.id), total: Number(rows[0]?.total ?? 0) };
}

export async function countOrdersForUser(
  column: 'buyer_id' | 'seller_id',
  userId: number,
  q: Queryable = pool,
): Promise<number> {
  const { rows } = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM orders WHERE ${column} = $1`,
    [userId],
  );
  return Number(rows[0]?.count ?? 0);
}

export async function selectPayoutsByOrderIds(
  orderIds: number[],
  q: Queryable = pool,
): Promise<Map<number, PayoutPart>> {
  const map = new Map<number, PayoutPart>();
  if (orderIds.length === 0) return map;
  const { rows } = await q.query<PayoutPart & { order_id: number }>(
    'SELECT order_id, id, amount, status, reference, paid_at FROM seller_payouts WHERE order_id = ANY($1::bigint[])',
    [orderIds],
  );
  for (const row of rows) {
    map.set(row.order_id, {
      id: row.id,
      amount: row.amount,
      status: row.status,
      reference: row.reference,
      paid_at: row.paid_at,
    });
  }
  return map;
}

/** Commande + IDs de rôle, sans produit/parties (contrôle d'accès `getOrderForUser`). */
export async function selectOrderForUser(orderId: number, q: Queryable = pool): Promise<OrderRow | undefined> {
  const { rows } = await q.query<OrderRow>(
    `SELECT id, order_number, amount, commission, seller_amount, quantity, status, delivery_carrier, tracking_number,
            product_id, buyer_id, seller_id, created_at, updated_at
       FROM orders WHERE id = $1`,
    [orderId],
  );
  return rows[0];
}

// ---------------------------------------------------------------------------
// Expiration de réservation (partagé avec expiry.service)
// ---------------------------------------------------------------------------

export async function lockProductRow(client: Queryable, productId: number): Promise<void> {
  await client.query('SELECT 1 FROM products WHERE id = $1 AND deleted_at IS NULL FOR UPDATE', [productId]);
}

export async function selectExpiredReservations(q: Queryable = pool): Promise<Array<{ order_id: number; product_id: number }>> {
  const { rows } = await q.query<{ order_id: number; product_id: number }>(
    `SELECT o.id AS order_id, o.product_id
       FROM orders o
       JOIN products p ON p.id = o.product_id
      WHERE o.status IN ('CREATED', 'PAYMENT_PENDING')
        AND p.status = 'RESERVED'
        AND p.deleted_at IS NULL
        AND p.reserved_until < now()
      ORDER BY o.id`,
  );
  return rows;
}

export async function selectLazyExpiredOrder(productId: number, q: Queryable = pool): Promise<number | undefined> {
  const { rows } = await q.query<{ id: number }>(
    `SELECT o.id
       FROM orders o
       JOIN products p ON p.id = o.product_id
      WHERE o.product_id = $1
        AND o.status IN ('CREATED', 'PAYMENT_PENDING')
        AND p.status = 'RESERVED'
        AND p.deleted_at IS NULL
        AND p.reserved_until < now()
      ORDER BY o.id DESC
      LIMIT 1`,
    [productId],
  );
  return rows[0]?.id;
}

export async function selectExpirableOrderForRelease(
  client: Queryable,
  orderId: number,
  productId: number,
): Promise<{ id: number; buyer_id: number; seller_id: number; order_number: string; product_name: string } | undefined> {
  const { rows } = await client.query<{ id: number; buyer_id: number; seller_id: number; order_number: string; product_name: string }>(
    `SELECT o.id, o.buyer_id, o.seller_id, o.order_number, p.name AS product_name
       FROM orders o
       JOIN products p ON p.id = o.product_id
      WHERE o.id = $1 AND o.status IN ('CREATED', 'PAYMENT_PENDING')
        AND p.id = $2 AND p.status = 'RESERVED'
        AND p.deleted_at IS NULL`,
    [orderId, productId],
  );
  return rows[0];
}

export async function failOrderIfPending(client: Queryable, orderId: number): Promise<boolean> {
  const res = await client.query(
    "UPDATE orders SET status = 'PAYMENT_FAILED' WHERE id = $1 AND status IN ('CREATED', 'PAYMENT_PENDING')",
    [orderId],
  );
  return res.rowCount === 1;
}

export async function failPendingPayment(client: Queryable, orderId: number): Promise<void> {
  await client.query("UPDATE payments SET status = 'FAILED' WHERE order_id = $1 AND status = 'PENDING'", [orderId]);
}

export async function releaseReservedProduct(client: Queryable, productId: number): Promise<void> {
  await client.query(
    "UPDATE products SET status = 'AVAILABLE', reserved_at = NULL, reserved_until = NULL WHERE id = $1 AND status = 'RESERVED'",
    [productId],
  );
}

// ---------------------------------------------------------------------------
// Transitions admin (cycle de vie)
// ---------------------------------------------------------------------------

export interface OrderPaymentLock {
  id: number;
  status: string;
  order_number: string;
  amount: number;
  seller_amount: number;
  seller_id: number;
  buyer_id: number;
  product_id: number;
  product_name: string;
}

/** Verrou commande + paiement (confirm/cancel) — `FOR UPDATE OF o, pm`. */
export async function lockOrderWithPayment(client: Queryable, orderId: number): Promise<OrderPaymentLock | undefined> {
  const { rows } = await client.query<OrderPaymentLock>(
    `SELECT o.id, o.status, o.order_number, o.amount, o.seller_amount, o.seller_id, o.buyer_id, o.product_id,
            p.name AS product_name
       FROM orders o
       JOIN products p ON p.id = o.product_id
       JOIN payments pm ON pm.order_id = o.id
      WHERE o.id = $1
      FOR UPDATE OF o, pm`,
    [orderId],
  );
  return rows[0];
}

export interface OrderProductLock {
  id: number;
  status: string;
  order_number: string;
  buyer_id: number;
  seller_id: number;
  seller_amount: number;
  product_id: number;
  product_name: string;
}

/** Verrou commande + nom produit (étapes logistiques) — `FOR UPDATE OF o`. */
export async function lockOrderWithProduct(client: Queryable, orderId: number): Promise<OrderProductLock | undefined> {
  const { rows } = await client.query<OrderProductLock>(
    `SELECT o.id, o.status, o.order_number, o.buyer_id, o.seller_id, o.seller_amount, o.product_id, p.name AS product_name
       FROM orders o
       JOIN products p ON p.id = o.product_id
      WHERE o.id = $1
      FOR UPDATE OF o`,
    [orderId],
  );
  return rows[0];
}

/** Vente définitive : RESERVED → SOLD. Renvoie false si le produit n'était plus réservé. */
export async function markProductSold(client: Queryable, productId: number): Promise<boolean> {
  const res = await client.query(
    "UPDATE products SET status = 'SOLD', sold_at = now(), reserved_at = NULL, reserved_until = NULL WHERE id = $1 AND status = 'RESERVED'",
    [productId],
  );
  return res.rowCount === 1;
}

export async function updatePaymentPaid(
  client: Queryable,
  orderId: number,
  method: string,
  reference: string | null,
): Promise<void> {
  await client.query(
    `UPDATE payments SET status = 'PAID', method = $1, reference = $2, paid_at = now() WHERE order_id = $3`,
    [method, reference, orderId],
  );
}

export async function insertPayout(
  client: Queryable,
  orderId: number,
  sellerId: number,
  amount: number,
  status: string,
): Promise<void> {
  await client.query(
    `INSERT INTO seller_payouts (order_id, seller_id, amount, status) VALUES ($1, $2, $3, $4)`,
    [orderId, sellerId, amount, status],
  );
}

export async function setOrderDelivery(
  client: Queryable,
  orderId: number,
  carrier: string | null,
  trackingNumber: string | null,
): Promise<void> {
  await client.query('UPDATE orders SET delivery_carrier = $1, tracking_number = $2 WHERE id = $3', [
    carrier,
    trackingNumber,
    orderId,
  ]);
}

export async function markPayoutDue(client: Queryable, orderId: number): Promise<void> {
  await client.query("UPDATE seller_payouts SET status = 'DUE' WHERE order_id = $1 AND status = 'PENDING'", [orderId]);
}

export async function lockPayout(client: Queryable, orderId: number): Promise<{ status: string } | undefined> {
  const { rows } = await client.query<{ status: string }>(
    'SELECT status FROM seller_payouts WHERE order_id = $1 FOR UPDATE',
    [orderId],
  );
  return rows[0];
}

export async function payPayout(
  client: Queryable,
  orderId: number,
  adminId: number,
  reference: string | null,
): Promise<void> {
  await client.query(
    `UPDATE seller_payouts SET status = 'PAID', paid_at = now(), paid_by = $1, reference = $2 WHERE order_id = $3 AND status = 'DUE'`,
    [adminId, reference, orderId],
  );
}
