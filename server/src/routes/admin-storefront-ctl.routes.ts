import { Router } from 'express';
import { currentUser, requireAdmin } from '../middleware/auth.js';
import { idParamSchema } from '../utils/storefront-validation.js';
import {
  deactivateSubscription,
  deleteSubscription,
} from '../services/storefront-admin-ctl.service.js';

// ---------------------------------------------------------------------------
// V8.1 — « Contrôle boutique » — routeur SÉPARÉ monté sous /api/admin/subscriptions
// (admin-subscriptions.routes.ts n'est PAS édité : chemins /:id/deactivate et
// /:id/delete inexistants dans le routeur existant).
// requireAdmin au niveau du routeur : un `user` → 403 FORBIDDEN (convention).
// Aucun endpoint d'écriture utilisateur, aucune élévation de privilège.
// Corps `{}` — tout status/seller_id/updated_at envoyé est ignoré (jamais lu).
// ---------------------------------------------------------------------------

export const adminStorefrontCtlRouter = Router();

adminStorefrontCtlRouter.use(requireAdmin);

/** POST /api/admin/subscriptions/:id/deactivate — ACTIVE → CANCELLED (réversible). 404 si inexistant/non-ACTIVE. */
adminStorefrontCtlRouter.post('/:id/deactivate', async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  res.json(await deactivateSubscription(currentUser(res).id, id));
});

/** POST /api/admin/subscriptions/:id/delete — DÉFINITIF : CANCELLED + articles soft-deleted + listings supprimés. */
adminStorefrontCtlRouter.post('/:id/delete', async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  res.json(await deleteSubscription(currentUser(res).id, id));
});
