import { Router, type Request, type Response } from 'express';
import { currentUser, requireAdmin } from '../middleware/auth.js';
import {
  adminHistoryQuerySchema,
  adminOrdersQuerySchema,
  adminProductsQuerySchema,
  adminUsersQuerySchema,
  cancelOrderSchema,
  confirmPaymentSchema,
  idParamSchema,
  markProductReceivedSchema,
  patchCategorySchema,
  rejectSchema,
  sellerPayoutSchema,
  startDeliverySchema,
} from '../utils/validation.js';
import {
  approveProduct,
  cancelOrder,
  confirmPayment,
  deleteProductAsAdmin,
  getStats,
  listAdminHistory,
  listAdminOrders,
  listAdminProducts,
  listAdminUsers,
  markDelivered,
  markProductReceived,
  markShipped,
  rejectProduct,
  sellerPayout,
  startDelivery,
} from '../services/admin.service.js';
import { getAdminOrderDetail } from '../services/orders.service.js';
import { listAllCategories, patchCategory } from '../services/categories.service.js';
import { normalizeAdminListParams } from '../utils/normalize.js';
import { gone } from '../utils/errors.js';

export const adminRouter = Router();

adminRouter.use(requireAdmin);

// GET /api/admin/stats — 4 compteurs (CA-ADM01)
adminRouter.get('/stats', async (_req: Request, res: Response) => {
  res.json(await getStats());
});

// GET /api/admin/categories — arbre complet (actives + inactives)
adminRouter.get('/categories', async (_req: Request, res: Response) => {
  res.json(await listAllCategories());
});

// PATCH /api/admin/categories/:id — renomme / toggle actif (CA-ADM06)
adminRouter.patch('/categories/:id', async (req: Request, res: Response) => {
  const { id } = idParamSchema.parse(req.params);
  const body = patchCategorySchema.parse(req.body);
  res.json({ category: await patchCategory(currentUser(res).id, id, body) });
});

// GET /api/admin/products — file de modération / suivi
adminRouter.get('/products', async (req: Request, res: Response) => {
  const query = adminProductsQuerySchema.parse(normalizeAdminListParams(req.query as Record<string, unknown>));
  res.json(await listAdminProducts(query));
});

// POST /api/admin/products/:id/approve — PENDING → AVAILABLE + N2
adminRouter.post('/products/:id/approve', async (req: Request, res: Response) => {
  const { id } = idParamSchema.parse(req.params);
  res.json(await approveProduct(currentUser(res).id, id));
});

// POST /api/admin/products/:id/reject — PENDING → REJECTED + N2b
adminRouter.post('/products/:id/reject', async (req: Request, res: Response) => {
  const { id } = idParamSchema.parse(req.params);
  const { reason } = rejectSchema.parse(req.body);
  res.json(await rejectProduct(currentUser(res).id, id, reason));
});

// DELETE /api/admin/products/:id — suppression LOGIQUE (C4, D7, CA-V5-056)
// 204 sans corps. `requireAdmin` est déjà appliqué par `adminRouter.use(...)`
// dans app.ts → D9 : ne pas le réappliquer ici.
// 404 produit inexistant · 404→204 idempotent si déjà supprimé · 409 si commande
// en cours. La notification `article_deleted` est écrite DANS la transaction ; le
// mail de suppression partira après commit, best-effort (PO-V5-14).
adminRouter.delete('/products/:id', async (req: Request, res: Response) => {
  const { id } = idParamSchema.parse(req.params);
  await deleteProductAsAdmin(currentUser(res).id, id);
  res.status(204).send();
});

// GET /api/admin/orders — liste toutes commandes (filtre status + payout)
adminRouter.get('/orders', async (req: Request, res: Response) => {
  const query = adminOrdersQuerySchema.parse(normalizeAdminListParams(req.query as Record<string, unknown>));
  res.json(await listAdminOrders(query));
});

// GET /api/admin/orders/:id — détail complet (AdminUser + ProductAdmin + events[])
adminRouter.get('/orders/:id', async (req: Request, res: Response) => {
  const { id } = idParamSchema.parse(req.params);
  res.json(await getAdminOrderDetail(id));
});

// POST /api/admin/orders/:id/confirm-payment — PAYMENT_PENDING → PAID → PRODUCT_WAITING + N4/N9
adminRouter.post('/orders/:id/confirm-payment', async (req: Request, res: Response) => {
  const { id } = idParamSchema.parse(req.params);
  const input = confirmPaymentSchema.parse(req.body);
  res.json(await confirmPayment(currentUser(res).id, id, input));
});

// POST /api/admin/orders/:id/mark-product-received — PRODUCT_WAITING → PRODUCT_RECEIVED → PREPARING
adminRouter.post('/orders/:id/mark-product-received', async (req: Request, res: Response) => {
  const { id } = idParamSchema.parse(req.params);
  const body = markProductReceivedSchema.parse(req.body);
  res.json(await markProductReceived(currentUser(res).id, id, body.note));
});

// POST /api/admin/orders/:id/mark-shipped — PREPARING → SHIPPED (prête/expédiée)
adminRouter.post('/orders/:id/mark-shipped', async (req: Request, res: Response) => {
  const { id } = idParamSchema.parse(req.params);
  res.json(await markShipped(currentUser(res).id, id));
});

// POST /api/admin/orders/:id/start-delivery — SHIPPED → IN_DELIVERY (transporteur + n° de suivi)
adminRouter.post('/orders/:id/start-delivery', async (req: Request, res: Response) => {
  const { id } = idParamSchema.parse(req.params);
  const body = startDeliverySchema.parse(req.body);
  res.json(await startDelivery(currentUser(res).id, id, body));
});

// POST /api/admin/orders/:id/mark-delivered — IN_DELIVERY → DELIVERED → COMPLETED + N12/N13
adminRouter.post('/orders/:id/mark-delivered', async (req: Request, res: Response) => {
  const { id } = idParamSchema.parse(req.params);
  res.json(await markDelivered(currentUser(res).id, id));
});

// POST /api/admin/orders/:id/cancel — PAYMENT_PENDING → CANCELLED (note obligatoire)
adminRouter.post('/orders/:id/cancel', async (req: Request, res: Response) => {
  const { id } = idParamSchema.parse(req.params);
  const { note } = cancelOrderSchema.parse(req.body);
  res.json(await cancelOrder(currentUser(res).id, id, note));
});

// POST /api/admin/orders/:id/seller-payout — paie le vendeur (CHG-5, précondition CA-ORD07-05)
adminRouter.post('/orders/:id/seller-payout', async (req: Request, res: Response) => {
  const { id } = idParamSchema.parse(req.params);
  const input = sellerPayoutSchema.parse(req.body);
  res.json(await sellerPayout(currentUser(res).id, id, input));
});

// POST /api/admin/orders/:id/pay-seller — RENOMMÉE en seller-payout (rétrocompatibilité coupée en V3)
adminRouter.post('/orders/:id/pay-seller', async (_req: Request, _res: Response) => {
  throw gone('ROUTE_DEPRECATED', 'Route renommée : POST /api/admin/orders/:id/seller-payout');
});

// GET /api/admin/users — lecture seule (CA-ADM05)
adminRouter.get('/users', async (req: Request, res: Response) => {
  const query = adminUsersQuerySchema.parse(normalizeAdminListParams(req.query as Record<string, unknown>));
  res.json(await listAdminUsers(query));
});

// GET /api/admin/history — admin_actions (CA-ADM07)
adminRouter.get('/history', async (req: Request, res: Response) => {
  const query = adminHistoryQuerySchema.parse(normalizeAdminListParams(req.query as Record<string, unknown>));
  res.json(await listAdminHistory(query));
});
