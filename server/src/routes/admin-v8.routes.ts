import { Router } from 'express';
import { z } from 'zod';
import { currentUser, requireAdmin } from '../middleware/auth.js';
import {
  idParamSchema,
  normalizePaginationParams,
  storefrontPaginationSchema,
} from '../utils/storefront-validation.js';
import { listAutoApprovalsAdmin, retrogradeAutoApprovedProduct } from '../services/admin-v8.service.js';

// ---------------------------------------------------------------------------
// V8 — Gouvernance admin additionnelle. Routeur SÉPARÉ monté sous /api/admin
// AVANT adminRouter (chemins `/auto-approvals` et `/products/:id/retrograde`
// inexistants dans admin.routes.ts) — 0 édition du routeur existant.
// requireAdmin au niveau du routeur : un `user` → 403 FORBIDDEN (convention).
// ---------------------------------------------------------------------------

export const adminV8Router = Router();

adminV8Router.use(requireAdmin);

/** GET /api/admin/auto-approvals — file paginée des auto-approbations (R5). */
adminV8Router.get('/auto-approvals', async (req, res) => {
  const query = storefrontPaginationSchema.parse(
    normalizePaginationParams(req.query as Record<string, unknown>),
  );
  res.json(await listAutoApprovalsAdmin(query));
});

const retrogradeSchema = z.object({
  reason: z
    .string({ error: 'Le motif est requis' })
    .trim()
    .min(10, { error: 'Le motif doit contenir au moins 10 caractères' })
    .max(2000, { error: 'Le motif doit contenir au plus 2000 caractères' }),
});

/** POST /api/admin/products/:id/retrograde — F8 : AVAILABLE → REJECTED (garde R2). */
adminV8Router.post('/products/:id/retrograde', async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  const { reason } = retrogradeSchema.parse(req.body);
  res.json(await retrogradeAutoApprovedProduct(currentUser(res).id, id, reason));
});
