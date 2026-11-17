import { Router } from 'express';
import { currentUser, requireAdmin } from '../middleware/auth.js';
import {
  adminSubscriptionsQuerySchema,
  idParamSchema,
  normalizePaginationParams,
} from '../utils/storefront-validation.js';
import {
  activateSubscription,
  listAdminSubscriptions,
} from '../services/storefront.service.js';

// ---------------------------------------------------------------------------
// V7 — Gouvernance admin des abonnements (routes 7 et 8, contrat api-v7 §7.7/§7.8).
// requireAdmin au niveau du routeur : un `user` → 403 FORBIDDEN (API).
// Aucun endpoint d'écriture utilisateur, aucune élévation de privilège.
// ---------------------------------------------------------------------------

export const adminSubscriptionsRouter = Router();

adminSubscriptionsRouter.use(requireAdmin);

/** GET /api/admin/subscriptions — file PENDING (défaut) + historique, paginée. */
adminSubscriptionsRouter.get('/', async (req, res) => {
  const query = adminSubscriptionsQuerySchema.parse(
    normalizePaginationParams(req.query as Record<string, unknown>),
  );
  res.json(await listAdminSubscriptions(query));
});

/** POST /api/admin/subscriptions/:id/activate — SEUL chemin PENDING → ACTIVE (transaction, traçabilité). */
adminSubscriptionsRouter.post('/:id/activate', async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  // Corps `{}` — tout status/activated_by/activated_at envoyé est ignoré (jamais lu).
  res.json(await activateSubscription(currentUser(res).id, id));
});
