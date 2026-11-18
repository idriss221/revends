import { Router } from 'express';
import { currentUser, requireAuth } from '../middleware/auth.js';
import { subscribeSchema } from '../utils/storefront-validation.js';
import { badRequest } from '../utils/errors.js';
import { createSubscription, getMySubscription } from '../services/storefront.service.js';
import { getMyReportPdf, getMyStats } from '../services/storefront-reports.service.js';

// ---------------------------------------------------------------------------
// V7 — Souscriptions (routes 1 et 2 du contrat api-v7 §7.1/§7.2).
// requireAuth (et non requireUser) : un admin a un profil et peut souscrire —
// aucun rôle nouveau, aucune écriture de users.role (CA-V7-002/052).
// V8 — GET /me/stats : onglet Statistiques (V8-D7, contrat api.md v2.8).
// ---------------------------------------------------------------------------

export const subscriptionsRouter = Router();

/** POST /api/subscriptions — crée TOUJOURS un PENDING ; aucun accès abonné tant que l'admin n'active pas. */
subscriptionsRouter.post('/', requireAuth, async (req, res) => {
  const input = subscribeSchema.parse(req.body);
  const user = currentUser(res);
  res.status(201).json(await createSubscription(user.id, input));
});

/** GET /api/subscriptions/me — état, forfait, quota consommé, mes listings, les 3 paliers. */
subscriptionsRouter.get('/me', requireAuth, async (_req, res) => {
  res.json(await getMySubscription(currentUser(res).id));
});

/** GET /api/subscriptions/me/stats — vues totales, ventes 30 j, CA (seller_amount), meilleur article, panier moyen, conversion + historique ≤ 12 bilans. */
subscriptionsRouter.get('/me/stats', requireAuth, async (_req, res) => {
  res.json(await getMyStats(currentUser(res).id));
});

/** GET /api/subscriptions/me/report?period=YYYY-MM — PDF du bilan persisté de l'abonnement courant (requireAuth « me » exclusivement). 404 REPORT_NOT_AVAILABLE si aucune ligne monthly_metrics. */
subscriptionsRouter.get('/me/report', requireAuth, async (req, res) => {
  const period = typeof req.query.period === 'string' ? req.query.period : '';
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) {
    throw badRequest('INVALID_PERIOD', 'period doit être au format YYYY-MM');
  }
  const pdf = await getMyReportPdf(currentUser(res).id, period);
  res
    .set('content-type', 'application/pdf')
    .set('content-disposition', `attachment; filename="bilan-ReVendsen-${period}.pdf"`)
    .set('content-length', String(pdf.length))
    .set('cache-control', 'private, no-store')
    .send(pdf);
});
