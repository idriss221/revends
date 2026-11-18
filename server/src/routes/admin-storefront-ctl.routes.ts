import { Router } from 'express';
import { currentUser, requireAdmin } from '../middleware/auth.js';
import { z } from 'zod';
import { idParamSchema } from '../utils/storefront-validation.js';
import {
  deactivateSubscription,
  deleteSubscription,
  rejectSubscription,
} from '../services/storefront-admin-ctl.service.js';
import { sendSubscriptionRefusedMail } from '../services/subscription-notifications.service.js';

// ---------------------------------------------------------------------------
// V8.1 — « Contrôle boutique » — routeur SÉPARÉ monté sous /api/admin/subscriptions
// (admin-subscriptions.routes.ts n'est PAS édité : chemins /:id/deactivate et
// /:id/delete inexistants dans le routeur existant).
// requireAdmin au niveau du routeur : un `user` → 403 FORBIDDEN (convention).
// Aucun endpoint d'écriture utilisateur, aucune élévation de privilège.
// Corps `{}` — tout status/seller_id/updated_at envoyé est ignoré (jamais lu).
// ---------------------------------------------------------------------------

export const adminStorefrontCtlRouter = Router();

const rejectSchema = z.object({
  reason: z
    .string({ error: 'Le motif est requis' })
    .trim()
    .min(10, { error: 'Le motif doit contenir au moins 10 caractères' })
    .max(2000, { error: 'Le motif doit contenir au plus 2000 caractères' }),
});

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

/** POST /api/admin/subscriptions/:id/reject — PENDING → CANCELLED + e-mail vendeur (motif). */
adminStorefrontCtlRouter.post('/:id/reject', async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  const { reason } = rejectSchema.parse(req.body ?? {});
  const outcome = await rejectSubscription(currentUser(res).id, id, reason);
  // Mail best-effort après commit : un échec d'envoi n'inverse jamais la décision.
  await sendSubscriptionRefusedMail(outcome.mailAfterCommit.userId, outcome.mailAfterCommit.planName, outcome.mailAfterCommit.subscriptionId, outcome.mailAfterCommit.reason);
  res.json(outcome.subscription);
});
