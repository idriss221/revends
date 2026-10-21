import { query } from '../db/pool.js';
import { pool, type Queryable } from '../db/pool.js';
import type { NotificationRow } from '../utils/serializers.js';

export type NotificationType =
  | 'article_submitted'
  | 'article_approved'
  | 'article_rejected'
  | 'order_created'
  | 'payment_confirmed'
  | 'article_reserved'
  | 'reservation_expired'
  | 'seller_paid'
  | 'article_sold'
  // V3 — cycle logistique (N9..N13, api.md §5 — DDL 003 section 5)
  | 'order_product_waiting'
  | 'order_product_received'
  | 'order_preparing'
  | 'order_in_delivery'
  | 'order_delivered'
  | 'order_completed'
  // V4 — étape SHIPPED (Prête/Expédiée, DDL 006).
  | 'order_shipped'
  // V5 — suppression administrative d'un article (C4, migration 009).
  | 'article_deleted';

const NOTIFICATION_COLUMNS = 'id, type, title, message, read_at, created_at';

/**
 * Insertion d'une notification DANS la transaction en cours (api.md §5 :
 * aucune notification orpheline — même txn que l'événement). Retourne l'id créé.
 */
export async function insertNotification(
  client: Queryable,
  userId: number,
  type: NotificationType,
  title: string,
  message: string,
): Promise<number> {
  const { rows } = await client.query<{ id: number }>(
    'INSERT INTO notifications (user_id, type, title, message) VALUES ($1, $2, $3, $4) RETURNING id',
    [userId, type, title, message],
  );
  return rows[0]!.id;
}

export async function countUnread(userId: number, q: Queryable = pool): Promise<number> {
  const { rows } = await query<{ count: string }>(
    'SELECT COUNT(*)::text AS count FROM notifications WHERE user_id = $1 AND read_at IS NULL',
    [userId],
  );
  return Number(rows[0]?.count ?? 0);
}

export async function countForUser(
  userId: number,
  unreadOnly: boolean,
  q: Queryable = pool,
): Promise<number> {
  const unreadWhere = unreadOnly ? ' AND read_at IS NULL' : '';
  const { rows } = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM notifications WHERE user_id = $1${unreadWhere}`,
    [userId],
  );
  return Number(rows[0]?.count ?? 0);
}

export async function selectNotificationPage(
  userId: number,
  opts: { limit: number; offset: number; unreadOnly: boolean },
  q: Queryable = pool,
): Promise<NotificationRow[]> {
  const unreadWhere = opts.unreadOnly ? ' AND read_at IS NULL' : '';
  const { rows } = await query<NotificationRow>(
    `SELECT ${NOTIFICATION_COLUMNS}
       FROM notifications n
      WHERE n.user_id = $1${unreadWhere}
      ORDER BY n.created_at DESC, n.id DESC
      LIMIT $2 OFFSET $3`,
    [userId, opts.limit, opts.offset],
  );
  return rows;
}

/** Marque lue (idempotent). `undefined` si la notification n'appartient pas à l'utilisateur. */
export async function markRead(
  userId: number,
  notificationId: number,
  q: Queryable = pool,
): Promise<NotificationRow | undefined> {
  const { rows } = await query<NotificationRow>(
    `UPDATE notifications SET read_at = COALESCE(read_at, now())
       WHERE user_id = $1 AND id = $2
     RETURNING ${NOTIFICATION_COLUMNS}`,
    [userId, notificationId],
  );
  return rows[0];
}

export async function markAllRead(userId: number, q: Queryable = pool): Promise<number> {
  const { rowCount } = await query(
    'UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL',
    [userId],
  );
  return rowCount ?? 0;
}
