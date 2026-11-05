import { Router } from 'express';
import { currentUser, requireAuth, requireUser } from '../middleware/auth.js';
import { uploadPaymentProof } from '../middleware/upload.js';
import { checkoutSchema, createOrderSchema, idParamSchema, paymentProofSchema } from '../utils/validation.js';
import { checkout, createOrder, getOrderForUser } from '../services/orders.service.js';
import { submitPaymentProof } from '../services/payment-proofs.service.js';

export const ordersRouter = Router();

// POST /api/orders — achat (transaction FOR UPDATE, CA-BUY01)
ordersRouter.post('/', requireUser, async (req, res) => {
  const user = currentUser(res);
  const input = createOrderSchema.parse(req.body);
  res.status(201).json(await createOrder(user.id, input));
});

// POST /api/orders/checkout — panier multi-produits (1..8, tout-ou-rien)
ordersRouter.post('/checkout', requireUser, async (req, res) => {
  const user = currentUser(res);
  const input = checkoutSchema.parse(req.body);
  res.status(201).json(await checkout(user.id, input));
});

// GET /api/orders/:id — acheteur, vendeur OU admin (vue adaptée, §3.4) ; tiers → 404
ordersRouter.get('/:id', requireAuth, async (req, res) => {
  const user = currentUser(res);
  const { id } = idParamSchema.parse(req.params);
  res.json(await getOrderForUser(id, user));
});

// POST /api/orders/:id/payment-proof — l'acheteur soumet une capture.
// ⚠️ Une preuve N'EST PAS un paiement validé : statut inchangé (PAYMENT_PENDING),
// vendeur non notifié ; seul un admin peut approuver.
ordersRouter.post('/:id/payment-proof', requireUser, uploadPaymentProof.single('proof'), async (req, res) => {
  const user = currentUser(res);
  const { id } = idParamSchema.parse(req.params);
  const { note } = paymentProofSchema.parse((req.body ?? {}) as Record<string, unknown>);
  const file = req.file as Express.Multer.File | undefined;
  res.status(201).json(await submitPaymentProof(user.id, id, note ?? null, file));
});

// Les routes d'administration des commandes vivent dans `admin.routes.ts`
// (monté sur `/api/admin` : GET /api/admin/orders, /orders/:id, actions du cycle).
// Elles ne doivent PAS être dupliquées ici (ordersRouter est monté sur /api/orders).
