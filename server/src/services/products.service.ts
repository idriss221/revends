import path from 'node:path';
import type { DbClient } from '../db/pool.js';
import { withTransaction } from '../utils/db.js';
import { badRequest, conflict, notFound } from '../utils/errors.js';
import { slugify } from '../utils/slugify.js';
import { MAX_PHOTOS, MIN_PHOTOS, sniffImageMime } from '../middleware/upload.js';
import { removePhoto, storePhoto } from './photo-storage.js';
import { lazyReleaseForProduct } from './expiry.service.js';
import { insertNotification } from './notifications.service.js';
import {
  serializeAdminUser,
  serializeOwnerProduct,
  serializeProductAdmin,
  serializeProductCard,
  serializeProductDetail,
  serializePublicUser,
  type ImageRow,
  type ProductRow,
  type UserRow,
} from '../utils/serializers.js';
import type { Express } from 'express';
import {
  countOwnerProducts,
  deleteImage,
  insertImage,
  insertProduct,
  loadImages as repoLoadImages,
  loadImagesBatch as repoLoadImagesBatch,
  loadPrimaryImage as repoLoadPrimaryImage,
  loadPrimaryImages as repoLoadPrimaryImages,
  normalizePrimaryImage,
  ownerCountsFromRow,
  queryCatalogPage,
  selectAdminProductById,
  selectAvailableByIds,
  selectImagesForUpdate,
  selectLocations,
  selectOwnerProduct,
  selectProductBySlugOrId,
  selectProductForUpdate,
  selectOwnProductsPage,
  selectSuggestions,
  slugExists,
  updateImagePosition,
  updateProductToPending,
  incrementViewCount,
  countSoldByOwner,
  type AdminProductRow,
  type CatalogFilters,
  type ProductFields,
} from '../repositories/products.repository.js';
import { findParentId, selectCategoriesForValidation } from '../repositories/categories.repository.js';
import { findAdminUserById, findById as findUserById } from '../repositories/users.repository.js';

// ---------------------------------------------------------------------------
// Ré-exports de compatibilité (constantes SQL + batchs d'images + types)
// ---------------------------------------------------------------------------

export {
  ACTIVE_ORDER_STATUSES,
  ACTIVE_ORDER_STATUSES_SQL,
  LIVE,
  PRODUCT_SELECT,
  PRODUCT_SELECT_ADMIN,
  PRODUCT_SELECT_ADMIN_ONE,
  PRODUCT_SELECT_HISTORY,
  RELEVANCE_SCORE_SQL,
} from '../repositories/products.repository.js';
export type {
  AdminProductRow,
  CatalogFilters,
  CatalogSort,
  ProductFields,
} from '../repositories/products.repository.js';

export const loadImages = repoLoadImages;
export const loadPrimaryImage = repoLoadPrimaryImage;
export const loadPrimaryImages = repoLoadPrimaryImages;
export const loadImagesBatch = repoLoadImagesBatch;

// ---------------------------------------------------------------------------
// Types d'entrée
// ---------------------------------------------------------------------------

export interface PhotoOps {
  removePhotoIds: number[];
  photoOrder: number[];
  newFiles: Express.Multer.File[];
}

export interface MeListOptions {
  page: number;
  limit: number;
}

// ---------------------------------------------------------------------------
// Écriture des fichiers photo (I/O disque — hors repository)
// ---------------------------------------------------------------------------

/** Écrit un buffer photo sur disque ; retourne le chemin public "uploads/products/<fichier>". */
async function writePhotoFile(file: Express.Multer.File): Promise<string> {
  const mime = sniffImageMime(file.buffer);
  if (!mime) throw badRequest('PHOTO_INVALID_TYPE', 'Formats acceptés : JPEG, PNG, WebP');
  return storePhoto(file.buffer, mime);
}

/** Contrôle du MIME réel (§9.6) : MAGIC BYTES, pas le header déclaré. */
function assertValidPhotos(files: Express.Multer.File[]): void {
  for (const file of files) {
    if (!sniffImageMime(file.buffer)) {
      throw badRequest('PHOTO_INVALID_TYPE', 'Formats acceptés : JPEG, PNG, WebP');
    }
  }
}

async function cleanupWritten(written: string[]): Promise<void> {
  for (const f of written) await removePhoto(f);
}

// ---------------------------------------------------------------------------
// Helpers d'accès (métier : lèvent 404)
// ---------------------------------------------------------------------------

/** Slug unique : base slugifiée, suffixe -2, -3… en cas de collision. */
async function uniqueSlug(client: DbClient, name: string): Promise<string> {
  const base = slugify(name);
  let slug = base;
  for (let n = 2; ; n++) {
    if (!(await slugExists(slug, client))) return slug;
    slug = `${base}-${n}`;
  }
}

/** Valide que (categoryId, subcategoryId) est un couple parent/sous-catégorie actif (§7.9). */
async function validateCategory(client: DbClient, categoryId: number, subcategoryId: number): Promise<void> {
  const rows = await selectCategoriesForValidation([categoryId, subcategoryId], client);
  const byId = new Map(rows.map((r) => [r.id, r]));
  const cat = byId.get(categoryId);
  const sub = byId.get(subcategoryId);

  if (!cat || cat.parent_id !== null) throw badRequest('CATEGORY_MISMATCH', 'Catégorie inconnue');
  if (!sub || sub.parent_id !== categoryId) throw badRequest('CATEGORY_MISMATCH', 'Sous-catégorie invalide');
  if (!cat.active || !sub.active) throw badRequest('CATEGORY_INACTIVE', "Cette catégorie n'est plus disponible");
}

export async function loadUser(id: number, q?: Parameters<typeof findUserById>[1]): Promise<UserRow> {
  const user = await findUserById(id, q);
  if (!user) throw notFound('USER_NOT_FOUND', 'Utilisateur introuvable');
  return user;
}

/** AdminUser avec compteurs productCount/orderCount pour les vues admin (§3). */
export async function loadAdminUser(id: number, opts?: { includeOrderCount?: boolean }): Promise<UserRow> {
  const user = await findAdminUserById(id, opts ?? {});
  if (!user) throw notFound('USER_NOT_FOUND', 'Utilisateur introuvable');
  return user;
}

// ---------------------------------------------------------------------------
// POST /api/products — création (transaction, slug, photos, N1)
// ---------------------------------------------------------------------------

export async function createProduct(
  ownerId: number,
  fields: ProductFields,
  files: Express.Multer.File[],
): Promise<Record<string, unknown>> {
  if (files.length < MIN_PHOTOS) throw badRequest('PHOTO_MISSING', `Ajoutez au moins ${MIN_PHOTOS} photos`);
  assertValidPhotos(files);

  const written: string[] = [];
  const productId = await withTransaction(async (client) => {
    await validateCategory(client, fields.categoryId, fields.subcategoryId);
    const slug = await uniqueSlug(client, fields.name);

    const id = await insertProduct(client, ownerId, fields, slug);

    // Photos : 1re reçue = principale (position 1), suivantes 2..n
    for (let i = 0; i < files.length; i++) {
      const fp = await writePhotoFile(files[i]!);
      written.push(fp);
      await insertImage(client, id, fp, i === 0, i + 1);
    }

    // N1 — Notification vendeur dans la MÊME transaction
    await insertNotification(client, ownerId, 'article_submitted', 'Article soumis', fields.name);
    return id;
  }).catch(async (err) => {
    await cleanupWritten(written);
    throw err;
  });

  return { product: await buildOwnerProduct(productId) };
}

// ---------------------------------------------------------------------------
// Lecture pour le propriétaire et les vues admin
// ---------------------------------------------------------------------------

export async function buildOwnerProduct(productId: number): Promise<Record<string, unknown>> {
  const product = await selectOwnerProduct(productId);
  if (!product) throw notFound('PRODUCT_NOT_FOUND', 'Article introuvable');
  return serializeOwnerProduct(product, await loadImages(productId));
}

export async function buildAdminProduct(productId: number): Promise<Record<string, unknown>> {
  const product = await selectAdminProductById(productId);
  if (!product) throw notFound('PRODUCT_NOT_FOUND', 'Article introuvable');
  return serializeAdminProductRow(product, await loadImages(productId));
}

/** Fiche produit admin HISTORIQUE (produit supprimé logiquement, CA-V5-059). */
export async function buildAdminProductHistory(productId: number): Promise<Record<string, unknown>> {
  const product = await selectAdminProductById(productId, { includeDeleted: true });
  if (!product) throw notFound('PRODUCT_NOT_FOUND', 'Article introuvable');
  return serializeAdminProductRow(product, await loadImages(productId));
}

export function serializeAdminProductRow(product: AdminProductRow, images: ImageRow[]): Record<string, unknown> {
  const owner = serializeAdminUser({
    id: product.owner_id,
    display_name: product.o_display_name,
    name: product.o_name,
    email: product.o_email,
    phone: product.o_phone,
    role: product.o_role,
    created_at: product.o_created_at,
    product_count: product.o_product_count,
  });
  return serializeProductAdmin(product, images, owner, product.has_active_order);
}

// ---------------------------------------------------------------------------
// Catalogue public et fiche publique
// ---------------------------------------------------------------------------

/**
 * Catalogue public (GET /api/products). La construction du `WHERE`/`ORDER BY`
 * vit dans le repository ; le service ne fait que la validation métier et la
 * sérialisation.
 */
export async function getCatalog(filters: CatalogFilters): Promise<Record<string, unknown>> {
  const page = filters.page ?? 1;
  const perPage = filters.perPage ?? 12;

  // ── Mode ids (§12 pt 4) : liste EXACTE, ordre préservé, indisponibles ignorés.
  if (filters.ids) {
    const [rows, images] = await Promise.all([selectAvailableByIds(filters.ids), loadPrimaryImages(filters.ids)]);
    const byId = new Map(rows.map((p) => [p.id, p]));
    const items: Record<string, unknown>[] = [];
    const seen = new Set<number>();
    for (const id of filters.ids) {
      if (seen.has(id)) continue; // doublon dans la liste : première occurrence conservée
      seen.add(id);
      const product = byId.get(id);
      if (product) items.push(serializeProductCard(product, images.get(product.id) ?? null));
    }
    return { items, page: 1, perPage: items.length, total: items.length, totalPages: items.length > 0 ? 1 : 0 };
  }

  let categoryIdIsParent = false;
  if (filters.categoryId !== undefined) {
    const parentId = await findParentId(filters.categoryId);
    if (parentId === undefined) throw badRequest('CATEGORY_NOT_FOUND', 'Catégorie inconnue');
    categoryIdIsParent = parentId === null;
  }
  if (filters.subcategory_id !== undefined && filters.categoryId !== undefined) {
    const subParent = await findParentId(filters.subcategory_id);
    if (subParent === undefined || subParent !== filters.categoryId) {
      throw badRequest('VALIDATION_ERROR', 'Données invalides', [
        {
          field: 'subcategory_id',
          code: 'CATEGORY_MISMATCH',
          message: 'La sous-catégorie choisie n’appartient pas à la catégorie',
        },
      ]);
    }
  }

  const { rows, total } = await queryCatalogPage(filters, categoryIdIsParent);
  const images = await loadPrimaryImages(rows.map((p) => p.id));
  const items = rows.map((product) => serializeProductCard(product, images.get(product.id) ?? null));

  return {
    items,
    page,
    perPage,
    total,
    totalPages: total === 0 ? 0 : Math.ceil(total / perPage),
  };
}

export async function getPublicProduct(ident: string | number): Promise<Record<string, unknown>> {
  let product = await selectProductBySlugOrId(ident);
  if (!product) throw notFound('PRODUCT_NOT_FOUND', 'Article introuvable');
  if (product.status === 'PENDING' || product.status === 'REJECTED') {
    throw notFound('PRODUCT_NOT_FOUND', 'Article introuvable'); // masqué (CA-CAT03-04)
  }

  // Libération paresseuse : réservation expirée → remettre AVAILABLE avant de répondre (D3)
  if (product.status === 'RESERVED') {
    await lazyReleaseForProduct(product.id);
    const fresh = await selectProductBySlugOrId(product.id);
    if (fresh) product = { ...product, ...fresh };
  }

  // RG-PROD-3 : incrément +1 à CHAQUE consultation publique — valeur post-incrément.
  const viewCount = await incrementViewCount(product.id).catch(() => undefined);
  if (viewCount !== undefined) product.view_count = viewCount;

  const seller = await loadUser(product.owner_id);
  const sales = await countSoldByOwner(product.owner_id);
  const sellerView = serializePublicUser({ ...seller, sales }, { sales: true });
  return serializeProductDetail(product, await loadImages(product.id), sellerView);
}

// ---------------------------------------------------------------------------
// GET /api/products/suggestions
// ---------------------------------------------------------------------------

export const SUGGESTION_LIMITS = { products: 6, categories: 2, brands: 2 } as const;
export const SUGGESTION_MAX_TOTAL = 10;

export async function getSuggestions(q: string): Promise<Record<string, unknown>> {
  const rows = await selectSuggestions(`%${q}%`, SUGGESTION_LIMITS);

  const products = rows.filter((r) => r.kind === 'product').map((r) => r.data as ProductRow);
  const images = await loadPrimaryImages(products.map((p) => p.id));

  return {
    q,
    categories: rows
      .filter((r) => r.kind === 'category')
      .map((r) => r.data as { id: number; name: string; slug: string }),
    brands: rows.filter((r) => r.kind === 'brand').map((r) => (r.data as { brand: string }).brand),
    products: products.map((p) => serializeProductCard(p, images.get(p.id) ?? null)),
  };
}

// ---------------------------------------------------------------------------
// GET /api/products/locations
// ---------------------------------------------------------------------------

export async function listLocations(): Promise<{ locations: string[] }> {
  return { locations: await selectLocations() };
}

// ---------------------------------------------------------------------------
// GET /api/me/products — articles du connecté + compteurs (paginé)
// ---------------------------------------------------------------------------

export interface OwnProductsResult {
  items: Record<string, unknown>[];
  counts: {
    total: number;
    pending: number;
    available: number;
    reserved: number;
    sold: number;
    rejected: number;
  };
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/**
 * « Mes articles » + compteurs par statut : **2 requêtes** quelle que soit la
 * taille du compte (C5/CA-V5-071). La page et les compteurs viennent d'UNE
 * requête (agrégats de fenêtre `OVER()`), puis 1 batch d'images.
 */
export async function listOwnProducts(ownerId: number, opts: MeListOptions = { page: 1, limit: 12 }): Promise<OwnProductsResult> {
  const offset = (opts.page - 1) * opts.limit;
  const rows = await selectOwnProductsPage(ownerId, { limit: opts.limit, offset });

  // Page vide au-delà du dernier élément : les compteurs de fenêtre sont absents.
  const counts =
    rows.length === 0 && offset > 0 ? await countOwnerProducts(ownerId) : ownerCountsFromRow(rows[0]);

  const images = await loadImagesBatch(rows.map((r) => r.id));
  return {
    items: rows.map((p) => serializeOwnerProduct(p, images.get(p.id) ?? [])),
    counts,
    page: opts.page,
    limit: opts.limit,
    total: counts.total,
    totalPages: Math.max(1, Math.ceil(counts.total / opts.limit)),
  };
}

// ---------------------------------------------------------------------------
// PUT /api/products/:id — D9 : retour PENDING (sauf déjà PENDING), photos 1..4
// ---------------------------------------------------------------------------

export async function updateProduct(
  ownerId: number,
  productId: number,
  fields: ProductFields,
  photoOps: PhotoOps,
): Promise<Record<string, unknown>> {
  const written: string[] = [];
  await withTransaction(async (client) => {
    const product = await selectProductForUpdate(client, productId, ownerId);
    if (!product) throw notFound('PRODUCT_NOT_FOUND', 'Article introuvable');
    if (product.status === 'RESERVED' || product.status === 'SOLD') {
      throw conflict('PRODUCT_NOT_MODIFIABLE', 'Un article réservé ou vendu ne peut pas être modifié');
    }

    await validateCategory(client, fields.categoryId, fields.subcategoryId);
    await updateProductToPending(client, productId, fields);
    await applyPhotoChanges(client, productId, photoOps, written);
  }).catch(async (err) => {
    await cleanupWritten(written);
    throw err;
  });

  return { product: await buildOwnerProduct(productId) };
}

/**
 * Applique remove_photo_ids / photo_order / nouvelles photos.
 * Garantie : de 1 à 4 photos en sortie ; position 1 = photo principale.
 */
async function applyPhotoChanges(client: DbClient, productId: number, ops: PhotoOps, written: string[]): Promise<void> {
  assertValidPhotos(ops.newFiles);
  const rows = await selectImagesForUpdate(client, productId);
  const existing = new Map(rows.map((r) => [r.id, r]));

  for (const id of [...ops.removePhotoIds, ...ops.photoOrder]) {
    if (!existing.has(id)) throw badRequest('PHOTO_ORDER_INVALID', 'Certaines photos ne font pas partie de cet article');
  }

  const orderedIds: number[] = [];
  for (const id of ops.photoOrder) orderedIds.push(id);
  for (const r of rows) {
    if (!ops.removePhotoIds.includes(r.id) && !ops.photoOrder.includes(r.id)) orderedIds.push(r.id);
  }

  const totalAfter = orderedIds.length + ops.newFiles.length;
  if (totalAfter < MIN_PHOTOS) throw badRequest('PHOTO_MISSING', `Ajoutez au moins ${MIN_PHOTOS} photos`);
  if (totalAfter > MAX_PHOTOS) throw badRequest('PHOTO_LIMIT', `Maximum ${MAX_PHOTOS} photos par article`);

  const removedPaths: string[] = [];
  for (const id of ops.removePhotoIds) {
    const row = existing.get(id);
    if (row) {
      await deleteImage(client, id);
      removedPaths.push(row.path);
    }
  }

  for (let i = 0; i < orderedIds.length; i++) {
    await updateImagePosition(client, orderedIds[i]!, i + 1);
  }

  for (let i = 0; i < ops.newFiles.length; i++) {
    const fp = await writePhotoFile(ops.newFiles[i]!);
    written.push(fp);
    await insertImage(client, productId, fp, false, orderedIds.length + i + 1);
  }

  await normalizePrimaryImage(client, productId);

  for (const p of removedPaths) {
    void removePhoto(p);
  }
}
