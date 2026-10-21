import { Router } from 'express';
import { currentUser, requireAuth } from '../middleware/auth.js';
import { favToggleSchema, productIdParamSchema } from '../utils/validation.js';
import {
  getFavorites,
  isFavoriteService,
  removeFromFavorites,
  toggleFavoriteService,
} from '../services/favorites.service.js';

export const favoritesRouter = Router();

favoritesRouter.use(requireAuth);

// GET /api/favorites — récupérer les favoris
favoritesRouter.get('/', async (req, res) => {
  const user = currentUser(res);
  res.json(await getFavorites(user.id));
});

// POST /api/favorites — basculer un produit en favori (ajoute/retire)
favoritesRouter.post('/', async (req, res) => {
  const user = currentUser(res);
  const { productId } = favToggleSchema.parse(req.body);
  const result = await toggleFavoriteService(user.id, productId);
  res.json(result);
});

// DELETE /api/favorites/:productId — retirer un produit des favoris
favoritesRouter.delete('/:productId', async (req, res) => {
  const user = currentUser(res);
  const { productId } = productIdParamSchema.parse(req.params);
  await removeFromFavorites(user.id, productId);
  res.status(204).send();
});

// GET /api/favorites/check/:productId — vérifier si un produit est en favori
favoritesRouter.get('/check/:productId', async (req, res) => {
  const user = currentUser(res);
  const { productId } = productIdParamSchema.parse(req.params);
  const isFav = await isFavoriteService(user.id, productId);
  res.json({ isFavorite: isFav });
});