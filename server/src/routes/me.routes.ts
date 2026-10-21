import { Router } from 'express';
import { currentUser, requireUser } from '../middleware/auth.js';
import { idParamSchema, meListQuerySchema, notificationsQuerySchema } from '../utils/validation.js';
import { normalizeMeListParams } from '../utils/normalize.js';
import { listNotifications, markAllNotificationsRead, markNotificationRead } from '../services/notifications.service.js';
import { listOwnProducts } from '../services/products.service.js';
import { listBuyerOrders, listSellerOrders } from '../services/orders.service.js';

export const meRouter = Router();

meRouter.use(requireUser);

// GET /api/me/products — paginé (alias per_page/perPage → limit)
meRouter.get('/products', async (req, res) => {
  const user = currentUser(res);
  const { page, limit } = meListQuerySchema.parse(normalizeMeListParams(req.query as Record<string, unknown>));
  res.json(await listOwnProducts(user.id, { page, limit }));
});

// GET /api/me/orders — historique d'acheteur, paginé
meRouter.get('/orders', async (req, res) => {
  const user = currentUser(res);
  const { page, limit } = meListQuerySchema.parse(normalizeMeListParams(req.query as Record<string, unknown>));
  res.json(await listBuyerOrders(user.id, { page, limit }));
});

// GET /api/me/sales — commandes où je suis vendeur (suivi de mes articles, E2), paginé
meRouter.get('/sales', async (req, res) => {
  const user = currentUser(res);
  const { page, limit } = meListQuerySchema.parse(normalizeMeListParams(req.query as Record<string, unknown>));
  res.json(await listSellerOrders(user.id, { page, limit }));
});

// GET /api/me/notifications — non lues d'abord (CA-NOT01)
meRouter.get('/notifications', async (req, res) => {
  const user = currentUser(res);
  const query = notificationsQuerySchema.parse(req.query);
  res.json(
    await listNotifications(user.id, {
      page: query.page,
      perPage: query.perPage,
      unreadOnly: query.unread_only,
    }),
  );
});

// POST /api/me/notifications/:id/read — idempotent
meRouter.post('/notifications/:id/read', async (req, res) => {
  const user = currentUser(res);
  const { id } = idParamSchema.parse(req.params);
  res.json({ notification: await markNotificationRead(user.id, id) });
});

// POST /api/me/notifications/read-all
meRouter.post('/notifications/read-all', async (_req, res) => {
  const user = currentUser(res);
  res.json({ updated: await markAllNotificationsRead(user.id) });
});