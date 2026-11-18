import { Router } from 'express';
import { currentUser, requireAuth } from '../middleware/auth.js';
import { idParamSchema } from '../utils/validation.js';
import { deleteOwnerProduct } from '../services/me-products.service.js';

// ---------------------------------------------------------------------------
// V8.1 — « Contrôle boutique » — suppression d'article par le PROPRIÉTAIRE.
// Routeur SÉPARÉ monté sous /api/me/products AVANT meRouter : le routeur
// meRouter porte requireUser au niveau routeur (un admin y serait → 403),
// tandis que ce contrat exige requireAuth (tout utilisateur authentifié peut
// supprimer SON article). meRouter n'est PAS édité ; ce routeur n'expose
// QUE la méthode DELETE /:id (GET/POST… retombent sur meRouter).
// Réponse : 204 sans corps.
// ---------------------------------------------------------------------------

export const meProductsRouter = Router();

/** DELETE /api/me/products/:id — propriétaire uniquement (404 sinon) · 409 si commande active. */
meProductsRouter.delete('/:id', requireAuth, async (req, res) => {
  const user = currentUser(res);
  const { id } = idParamSchema.parse(req.params);
  await deleteOwnerProduct(user.id, id);
  res.status(204).send();
});
