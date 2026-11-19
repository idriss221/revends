import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { currentUser, requireAdmin, requireAuth } from '../middleware/auth.js';
import { listWaveAdminEvents } from '../repositories/wave-events.repository.js';
import { createWaveCheckoutSession } from '../services/wave-checkout.service.js';

export const waveRouter = Router();

const subscriptionIdField = z.coerce
  .number({ error: 'subscriptionId doit être un entier ≥ 1' })
  .int({ error: 'subscriptionId doit être un entier ≥ 1' })
  .positive({ error: 'subscriptionId doit être un entier ≥ 1' });

const checkoutSchema = z.object({ subscriptionId: subscriptionIdField });

const adminEventsQuerySchema = z.object({
  subscriptionId: subscriptionIdField.optional(),
  page: z.coerce
    .number({ error: 'page doit être un entier ≥ 1' })
    .int({ error: 'page doit être un entier ≥ 1' })
    .min(1, { error: 'page doit être un entier ≥ 1' })
    .default(1),
  per_page: z.coerce
    .number({ error: 'per_page doit être compris entre 1 et 48' })
    .int({ error: 'per_page doit être compris entre 1 et 48' })
    .min(1, { error: 'per_page doit être compris entre 1 et 48' })
    .max(48, { error: 'per_page doit être compris entre 1 et 48' })
    .default(12),
});

waveRouter.use(requireAuth);

waveRouter.post('/checkout/sessions', async (req, res) => {
  const { subscriptionId } = checkoutSchema.parse(req.body);
  res.json(await createWaveCheckoutSession(currentUser(res).id, subscriptionId));
});

waveRouter.get('/config', (_req, res) => {
  res.json({ waveEnabled: config.wave.enabled });
});

waveRouter.get('/admin/events', requireAdmin, async (req, res) => {
  const query = adminEventsQuerySchema.parse(req.query as Record<string, unknown>);
  res.json(
    await listWaveAdminEvents({
      subscriptionId: query.subscriptionId,
      page: query.page,
      perPage: query.per_page,
    }),
  );
});
