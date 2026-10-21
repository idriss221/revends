import { notFound } from '../utils/errors.js';
import { serializeNotification } from '../utils/serializers.js';
import {
  countForUser,
  countUnread,
  markAllRead,
  markRead,
  selectNotificationPage,
} from '../repositories/notifications.repository.js';

// Façade publique : l'INSERT transactionnel vit dans le repository, les
// services consommateurs (orders, admin, expiry, products) n'ont pas à changer.
export { insertNotification } from '../repositories/notifications.repository.js';
export type { NotificationType } from '../repositories/notifications.repository.js';

export async function countUnreadNotifications(userId: number): Promise<number> {
  return countUnread(userId);
}

export interface NotificationListResult {
  items: Record<string, unknown>[];
  unreadCount: number;
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
}

export async function listNotifications(
  userId: number,
  opts: { page: number; perPage: number; unreadOnly: boolean },
): Promise<NotificationListResult> {
  const total = await countForUser(userId, opts.unreadOnly);
  const totalPages = Math.max(1, Math.ceil(total / opts.perPage));
  const rows = await selectNotificationPage(userId, {
    limit: opts.perPage,
    offset: (opts.page - 1) * opts.perPage,
    unreadOnly: opts.unreadOnly,
  });

  return {
    items: rows.map(serializeNotification),
    unreadCount: await countUnread(userId),
    page: opts.page,
    perPage: opts.perPage,
    total,
    totalPages,
  };
}

/** Marque lue (idempotent). Retourne la notification ou 404 si introuvable. */
export async function markNotificationRead(
  userId: number,
  notificationId: number,
): Promise<Record<string, unknown>> {
  const row = await markRead(userId, notificationId);
  if (!row) throw notFound('NOTIFICATION_NOT_FOUND', 'Notification introuvable');
  return serializeNotification(row);
}

export async function markAllNotificationsRead(userId: number): Promise<number> {
  return markAllRead(userId);
}
