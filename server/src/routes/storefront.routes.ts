import { Router } from 'express';
import { currentUser, requireAuth } from '../middleware/auth.js';
import {
  addListingSchema,
  contactSchema,
  idParamSchema,
  normalizePaginationParams,
  storefrontPaginationSchema,
} from '../utils/storefront-validation.js';
import {
  addListingToStorefront,
  contactStorefront,
  getPublicStorefront,
  withdrawListing,
} from '../services/storefront.service.js';

// ---------------------------------------------------------------------------
// V7 — Boutique publique + annonces de boutique (routes 3, 4, 5, 6).
// Ordre de déclaration (contrat api-v7 §4) : /listings et /listings/:id AVANT
// /:slug — le chemin littéral prime, comme products.routes.ts (/locations).
// ---------------------------------------------------------------------------

export const storefrontRouter = Router();

/** POST /api/storefront/listings — SEUL point de contrôle du quota (privé, abonnement ACTIVE). */
storefrontRouter.post('/listings', requireAuth, async (req, res) => {
  const { productId } = addListingSchema.parse(req.body);
  res.status(201).json(await addListingToStorefront(currentUser(res).id, productId));
});

/** DELETE /api/storefront/listings/:id — retrait boutique-scopé, idempotent, 0 écriture sur products. */
storefrontRouter.delete('/listings/:id', requireAuth, async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  res.json(await withdrawListing(currentUser(res).id, id));
});

/** GET /api/storefront/:slug — boutique publique (aucun compte requis), 404 unique non divulgateur. */
storefrontRouter.get('/:slug', async (req, res) => {
  const pagination = storefrontPaginationSchema.parse(
    normalizePaginationParams(req.query as Record<string, unknown>),
  );
  res.setHeader('Cache-Control', 'private, no-store');
  // Slug hors format : n'ouvre aucune boutique → 404 (jamais une erreur 4xx).
  res.json(await getPublicStorefront(String(req.params.slug), pagination.page, pagination.perPage));
});

/** POST /api/storefront/:slug/contact — formulaire interne boutique-scopé (notification `product.contact`). */
storefrontRouter.post('/:slug/contact', requireAuth, async (req, res) => {
  const input = contactSchema.parse(req.body);
  const user = currentUser(res);
  const sender = { id: user.id, displayName: user.display_name };
  res.status(201).json(await contactStorefront(sender, String(req.params.slug), input));
});
