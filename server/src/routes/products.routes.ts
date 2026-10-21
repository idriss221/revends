import { Router, type Express } from 'express';
import { MAX_PHOTOS, uploadProductPhotos } from '../middleware/upload.js';
import { currentUser, requireUser } from '../middleware/auth.js';
import {
  catalogQuerySchema,
  idParamSchema,
  photoOpsSchema,
  productFieldsSchema,
  suggestionsQuerySchema,
} from '../utils/validation.js';
import {
  createProduct,
  getCatalog,
  getPublicProduct,
  getSuggestions,
  listLocations,
  updateProduct,
} from '../services/products.service.js';
import { normalizeCatalogParams, normalizeOptionalFields } from '../utils/normalize.js';

export const productsRouter = Router();

// GET /api/products — catalogue public AVAILABLE (paginations, filtres et
// sections V4 : api.md §3.2, cahier §12)
productsRouter.get('/', async (req, res) => {
  const query = catalogQuerySchema.parse(normalizeCatalogParams(req.query as Record<string, unknown>));
  res.json(await getCatalog(query));
});

// GET /api/products/locations — localisations du commerce (filtre V4)
// Déclarée AVANT /:identifier pour ne jamais être capturée par le paramètre.
productsRouter.get('/locations', async (_req, res, next) => {
  try {
    res.json(await listLocations());
  } catch (err) {
    next(err);
  }
});

// GET /api/products/suggestions?q=… — V5/PO-V5-18 : recherche prédictive
// (catégories + marques + produits AVAILABLE), plafond global 10 résultats.
// Déclarée AVANT /:identifier : sinon « suggestions » serait résolu comme un
// slug → 404 PRODUCT_NOT_FOUND (bug d'ordre de routes, pas de validation).
productsRouter.get('/suggestions', async (req, res, next) => {
  try {
    const { q } = suggestionsQuerySchema.parse(req.query);
    res.json(await getSuggestions(q));
  } catch (err) {
    next(err);
  }
});

// GET /api/products/:identifier — fiche publique (slug OU id numérique, §3.2)
productsRouter.get('/:identifier', async (req, res) => {
  // Id numérique uniquement s'il tient dans un entier sûr (≤ 15 chiffres < 2^53).
  // Au-delà : traité comme un slug (→ 404 PRODUCT_NOT_FOUND) — jamais de
  // dépassement BIGINT (pg 22003 → 500), ni de perte de précision (SÉC-P2b/CA-V5-088).
  const raw = req.params.identifier;
  const ident = /^\d{1,15}$/.test(raw) ? Number(raw) : raw;
  const details = await getPublicProduct(ident);
  res.json(details);
});

// POST /api/products — soumission d'article (multipart, 1..4 photos, N1)
productsRouter.post('/', requireUser, uploadProductPhotos.array('photos', MAX_PHOTOS), async (req, res) => {
  const user = currentUser(res);
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  const fields = productFieldsSchema.parse(normalizeOptionalFields(req.body as Record<string, unknown>));
  res.status(201).json(await createProduct(user.id, fields, files));
});

// PUT /api/products/:id — D9 : PENDING/AVAILABLE/REJECTED → PENDING (sauf déjà PENDING)
productsRouter.put('/:id', requireUser, uploadProductPhotos.array('photos', MAX_PHOTOS), async (req, res) => {
  const user = currentUser(res);
  const { id } = idParamSchema.parse(req.params);
  const fields = productFieldsSchema.parse(normalizeOptionalFields(req.body as Record<string, unknown>));
  const photoOps = photoOpsSchema.parse(req.body as Record<string, unknown>);
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  res.json(
    await updateProduct(user.id, id, fields, {
      removePhotoIds: photoOps.removePhotoIds,
      photoOrder: photoOps.photoOrder,
      newFiles: files,
    }),
  );
});
