import { Router } from 'express';
import { currentUser, requireAuth } from '../middleware/auth.js';
import { cartAddSchema, cartQtySchema, productIdParamSchema } from '../utils/validation.js';
import {
  addToCart,
  clearCartService,
  getCart,
  removeFromCart,
  setQty,
} from '../services/cart.service.js';

export const cartRouter = Router();

cartRouter.use(requireAuth);

// GET /api/cart — récupérer le panier complet
cartRouter.get('/', async (req, res) => {
  const user = currentUser(res);
  res.json(await getCart(user.id));
});

// POST /api/cart — ajouter un produit au panier (ou incrémenter la quantité)
cartRouter.post('/', async (req, res) => {
  const user = currentUser(res);
  const { productId, qty } = cartAddSchema.parse(req.body);
  const line = await addToCart(user.id, productId, qty);
  res.status(201).json(line);
});

// PATCH /api/cart/:productId — modifier la quantité d'un produit
cartRouter.patch('/:productId', async (req, res) => {
  const user = currentUser(res);
  const { productId } = productIdParamSchema.parse(req.params);
  const { qty } = cartQtySchema.parse(req.body);
  const line = await setQty(user.id, productId, qty);
  if (!line) {
    return res.status(204).send();
  }
  res.json(line);
});

// DELETE /api/cart/:productId — retirer un produit du panier
cartRouter.delete('/:productId', async (req, res) => {
  const user = currentUser(res);
  const { productId } = productIdParamSchema.parse(req.params);
  await removeFromCart(user.id, productId);
  res.status(204).send();
});

// DELETE /api/cart — vider complètement le panier
cartRouter.delete('/', async (req, res) => {
  const user = currentUser(res);
  await clearCartService(user.id);
  res.status(204).send();
});