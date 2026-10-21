import { pool, type Queryable } from '../db/pool.js';
import { ACTIVE_ORDER_STATUSES_SQL } from './products.repository.js';

/** Compteurs du dashboard admin (CA-ADM01). */
export interface AdminStats {
  users: number;
  pendingProducts: number;
  activeOrders: number;
  pendingPayouts: number;
  /** V4 : payouts « À payer » (livrés et non encore réglés). */
  payoutsDue: number;
  /** V4 : somme des montants vendeur des payouts DUE. */
  payoutsDueAmount: number;
  /** V4 : répartition des commandes par statut. */
  orders: {
    paymentPending: number;
    productWaiting: number;
    productReceived: number;
    preparing: number;
    shipped: number;
    inDelivery: number;
    delivered: number;
    completed: number;
  };
}

export interface AdminActionRecord {
  adminId: number;
  action: string;
  /** `category` = mises à jour de catégories (`category.update`, CA-ADM06). */
  targetType: 'order' | 'product' | 'category';
  targetId: number;
  description: string;
}

/** Trace `admin_actions` — même txn que l'action (CA-ADM07). */
export async function insertAdminAction(client: Queryable, record: AdminActionRecord): Promise<void> {
  await client.query(
    `INSERT INTO admin_actions (admin_id, action, target_type, target_id, description) VALUES ($1, $2, $3, $4, $5)`,
    [record.adminId, record.action, record.targetType, record.targetId, record.description],
  );
}

/** Compteurs du dashboard : 3 requêtes indépendantes (CA-V5-091). */
export async function selectAdminStats(q: Queryable = pool): Promise<AdminStats> {
  const [entities, payouts, orderCounts] = await Promise.all([
    q.query<{ users: string; pending_products: string; active_orders: string }>(
      `SELECT
         (SELECT COUNT(*)::text FROM users WHERE role = 'user')                          AS users,
         (SELECT COUNT(*)::text FROM products
           WHERE status = 'PENDING' AND deleted_at IS NULL)                               AS pending_products,
         (SELECT COUNT(*)::text FROM orders
           WHERE status NOT IN ${ACTIVE_ORDER_STATUSES_SQL})                             AS active_orders`,
    ),
    q.query<{ pending_payouts: string; payouts_due: string; payouts_due_amount: string }>(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'PENDING')::text                        AS pending_payouts,
         COUNT(*) FILTER (WHERE status = 'DUE')::text                            AS payouts_due,
         COALESCE(SUM(amount) FILTER (WHERE status = 'DUE'), 0)::text           AS payouts_due_amount
       FROM seller_payouts`,
    ),
    q.query<{
      payment_pending: string;
      product_waiting: string;
      product_received: string;
      preparing: string;
      shipped: string;
      in_delivery: string;
      delivered: string;
      completed: string;
    }>(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'PAYMENT_PENDING')::text  AS payment_pending,
         COUNT(*) FILTER (WHERE status = 'PRODUCT_WAITING')::text  AS product_waiting,
         COUNT(*) FILTER (WHERE status = 'PRODUCT_RECEIVED')::text AS product_received,
         COUNT(*) FILTER (WHERE status = 'PREPARING')::text        AS preparing,
         COUNT(*) FILTER (WHERE status = 'SHIPPED')::text          AS shipped,
         COUNT(*) FILTER (WHERE status = 'IN_DELIVERY')::text      AS in_delivery,
         COUNT(*) FILTER (WHERE status = 'DELIVERED')::text        AS delivered,
         COUNT(*) FILTER (WHERE status = 'COMPLETED')::text        AS completed
       FROM orders`,
    ),
  ]);
  const e = entities.rows[0];
  const p = payouts.rows[0];
  const o = orderCounts.rows[0];
  return {
    users: Number(e?.users ?? 0),
    pendingProducts: Number(e?.pending_products ?? 0),
    activeOrders: Number(e?.active_orders ?? 0),
    pendingPayouts: Number(p?.pending_payouts ?? 0),
    payoutsDue: Number(p?.payouts_due ?? 0),
    payoutsDueAmount: Number(p?.payouts_due_amount ?? 0),
    orders: {
      paymentPending: Number(o?.payment_pending ?? 0),
      productWaiting: Number(o?.product_waiting ?? 0),
      productReceived: Number(o?.product_received ?? 0),
      preparing: Number(o?.preparing ?? 0),
      shipped: Number(o?.shipped ?? 0),
      inDelivery: Number(o?.in_delivery ?? 0),
      delivered: Number(o?.delivered ?? 0),
      completed: Number(o?.completed ?? 0),
    },
  };
}

// ---------------------------------------------------------------------------
// Liste admin des commandes
// ---------------------------------------------------------------------------

function adminOrdersWhere(opts: { status?: string; payout?: string }): { whereClause: string; params: unknown[] } {
  const where: string[] = [];
  const params: unknown[] = [];
  if (opts.status) {
    params.push(opts.status);
    where.push(`o.status = $${params.length}`);
  }
  if (opts.payout) {
    params.push(opts.payout.toUpperCase());
    where.push(`EXISTS (SELECT 1 FROM seller_payouts sp WHERE sp.order_id = o.id AND sp.status = $${params.length})`);
  }
  return { whereClause: where.length > 0 ? `WHERE ${where.join(' AND ')}` : '', params };
}

export async function countAdminOrders(opts: { status?: string; payout?: string }, q: Queryable = pool): Promise<number> {
  const { whereClause, params } = adminOrdersWhere(opts);
  const { rows } = await q.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM orders o ${whereClause}`,
    params,
  );
  return Number(rows[0]?.count ?? 0);
}

export async function selectAdminOrderIdsPage(
  opts: { status?: string; payout?: string; limit: number; offset: number },
  q: Queryable = pool,
): Promise<number[]> {
  const { whereClause, params } = adminOrdersWhere(opts);
  const { rows } = await q.query<{ id: number }>(
    `SELECT o.id FROM orders o ${whereClause} ORDER BY o.created_at DESC, o.id DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, opts.limit, opts.offset],
  );
  return rows.map((r) => r.id);
}

// ---------------------------------------------------------------------------
// Historique admin
// ---------------------------------------------------------------------------

function adminHistoryWhere(opts: { action?: string; targetType?: string }): { whereClause: string; params: unknown[] } {
  const where: string[] = [];
  const params: unknown[] = [];
  if (opts.action) {
    params.push(opts.action);
    where.push(`a.action = $${params.length}`);
  }
  if (opts.targetType) {
    params.push(opts.targetType);
    where.push(`a.target_type = $${params.length}`);
  }
  return { whereClause: where.length > 0 ? `WHERE ${where.join(' AND ')}` : '', params };
}

export async function countAdminHistory(
  opts: { action?: string; targetType?: string },
  q: Queryable = pool,
): Promise<number> {
  const { whereClause, params } = adminHistoryWhere(opts);
  const { rows } = await q.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM admin_actions a ${whereClause}`,
    params,
  );
  return Number(rows[0]?.count ?? 0);
}

export interface AdminHistoryRow {
  id: number;
  admin_id: number;
  admin_display_name: string;
  admin_email: string;
  action: string;
  target_type: string;
  target_id: number;
  description: string;
  created_at: Date | string;
}

export async function selectAdminHistoryPage(
  opts: { action?: string; targetType?: string; limit: number; offset: number },
  q: Queryable = pool,
): Promise<AdminHistoryRow[]> {
  const { whereClause, params } = adminHistoryWhere(opts);
  const { rows } = await q.query<AdminHistoryRow>(
    `SELECT a.id, a.admin_id, u.display_name AS admin_display_name, u.email AS admin_email,
            a.action, a.target_type, a.target_id, a.description, a.created_at
       FROM admin_actions a
       JOIN users u ON u.id = a.admin_id
       ${whereClause}
      ORDER BY a.created_at DESC, a.id DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, opts.limit, opts.offset],
  );
  return rows;
}
