import { query } from '../db/pool.js';
import { pool, type Queryable } from '../db/pool.js';
import type { ImageRow, ProductRow } from '../utils/serializers.js';

// ---------------------------------------------------------------------------
// Fragments SQL partagés
// ---------------------------------------------------------------------------

/** `deleted_at IS NULL` : un produit supprimé est invisible de tout l'espace public. */
export const LIVE = 'p.deleted_at IS NULL';

/** Liste de colonnes produit (préfixée) — partagée par toutes les requêtes produits. */
const PRODUCT_FIELDS = `
         p.id, p.owner_id, p.name, p.slug, p.description, p.condition, p.price, p.old_price, p.view_count,
         p.location, p.status, p.rejection_reason, p.approved_at, p.approved_by, p.brand, p.model, p.age_years,
         p.defects, p.accessories, p.notes, p.reserved_at, p.reserved_until, p.created_at, p.updated_at,
         c.id AS category_id, c.name AS category_name, c.slug AS category_slug,
         sc.id AS subcategory_id, sc.name AS subcategory_name, sc.slug AS subcategory_slug`;

const PRODUCT_FROM = `
    FROM products p
    JOIN categories sc ON sc.id = p.category_id
    JOIN categories c  ON c.id  = sc.parent_id`;

export const PRODUCT_COLUMNS = `SELECT ${PRODUCT_FIELDS} ${PRODUCT_FROM}`;

/**
 * ⚠️ `PRODUCT_SELECT` porte DÉJÀ le filtre `deleted_at IS NULL` : tout appelant
 * doit écrire `AND …` (et non `WHERE …`) pour ses conditions.
 */
export const PRODUCT_SELECT = `${PRODUCT_COLUMNS} WHERE p.deleted_at IS NULL`;

/** Variante HISTORIQUE (sans filtre `deleted_at`) réservée aux commandes (CA-V5-059). */
export const PRODUCT_SELECT_HISTORY = PRODUCT_COLUMNS;

export const ACTIVE_ORDER_STATUSES = ['COMPLETED', 'CANCELLED', 'PAYMENT_FAILED'] as const;

export const ACTIVE_ORDER_STATUSES_SQL = `(${ACTIVE_ORDER_STATUSES.map((s) => `'${s}'`).join(', ')})`;

const PRODUCT_ADMIN_FIELDS = `
         u.display_name AS o_display_name, u.name AS o_name, u.email AS o_email, u.phone AS o_phone,
         u.role AS o_role, u.created_at AS o_created_at,
         (SELECT COUNT(*)::int FROM products p2
           WHERE p2.owner_id = u.id AND p2.deleted_at IS NULL) AS o_product_count,
         EXISTS (SELECT 1 FROM orders o
                  WHERE o.product_id = p.id AND o.status NOT IN ${ACTIVE_ORDER_STATUSES_SQL}) AS has_active_order`;

const PRODUCT_ADMIN_JOINS = `
    JOIN users u ON u.id = p.owner_id`;

export const PRODUCT_SELECT_ADMIN = `SELECT ${PRODUCT_FIELDS}, ${PRODUCT_ADMIN_FIELDS} ${PRODUCT_FROM} ${PRODUCT_ADMIN_JOINS}`;

export const PRODUCT_SELECT_ADMIN_ONE = `${PRODUCT_SELECT_ADMIN} WHERE p.deleted_at IS NULL`;

export interface AdminProductRow extends ProductRow {
  has_active_order: boolean;
  o_display_name: string;
  o_name: string;
  o_email: string;
  o_phone: string;
  o_role: 'user' | 'admin';
  o_created_at: Date | string;
  o_product_count: number;
}

/**
 * Score de PERTINENCE (PO-V5-18, CA-V5-145c) — déterministe, purement local.
 * Expression volontairement SIMPLE et indexable.
 */
export const RELEVANCE_SCORE_SQL = `(
  LEAST(50.0, COALESCE(((p.old_price - p.price) * 100.0 / NULLIF(p.old_price, 0)), 0)) / 2
+ LEAST(200.0, COALESCE(p.view_count, 0)) / 200 * 30
+ GREATEST(0, 30 - EXTRACT(EPOCH FROM (now() - p.created_at)) / 86400)
)`;

const RELEVANCE_ORDER = `${RELEVANCE_SCORE_SQL} DESC, p.id`;

// ---------------------------------------------------------------------------
// Types d'entrée
// ---------------------------------------------------------------------------

export interface ProductFields {
  name: string;
  categoryId: number;
  subcategoryId: number;
  condition: string;
  price: number;
  oldPrice?: number | null;
  location: string;
  description: string;
  brand?: string | null;
  model?: string | null;
  ageYears?: number | null;
  defects?: string | null;
  accessories?: string | null;
  notes?: string | null;
}

export type CatalogSort = 'recent' | 'price_asc' | 'price_desc' | 'popular' | 'relevance';
export type CatalogSection = 'recent' | 'best_offers' | 'popular' | 'promotions' | 'new' | 'discover';
export interface CatalogFilters {
  q?: string;
  categoryId?: number;
  subcategory_id?: number;
  price_min?: number;
  price_max?: number;
  condition?: string;
  location?: string;
  brand?: string;
  sort?: CatalogSort;
  section?: CatalogSection;
  ids?: number[];
  not_in?: number[];
  page?: number;
  perPage?: number;
}

export interface OwnProductCounts {
  total: number;
  pending: number;
  available: number;
  reserved: number;
  sold: number;
  rejected: number;
}

// ---------------------------------------------------------------------------
// Images — chargement par lot
// ---------------------------------------------------------------------------

export async function loadImages(productId: number, q: Queryable = pool): Promise<ImageRow[]> {
  const { rows } = await q.query<ImageRow>(
    `SELECT id, product_id, path, is_primary, position FROM product_images WHERE product_id = $1 ORDER BY position`,
    [productId],
  );
  return rows;
}

export async function loadPrimaryImage(productId: number, q: Queryable = pool): Promise<ImageRow | null> {
  const { rows } = await q.query<ImageRow>(
    `SELECT id, product_id, path, is_primary, position FROM product_images WHERE product_id = $1 AND is_primary = TRUE LIMIT 1`,
    [productId],
  );
  return rows[0] ?? null;
}

export async function loadPrimaryImages(productIds: number[], q: Queryable = pool): Promise<Map<number, ImageRow>> {
  if (productIds.length === 0) return new Map();
  const { rows } = await q.query<ImageRow>(
    `SELECT DISTINCT ON (product_id) id, product_id, path, is_primary, position
       FROM product_images
      WHERE product_id = ANY($1::bigint[]) AND is_primary = TRUE
      ORDER BY product_id, position, id`,
    [productIds],
  );
  return new Map(rows.map((r) => [r.product_id, r]));
}

export async function loadImagesBatch(productIds: number[], q: Queryable = pool): Promise<Map<number, ImageRow[]>> {
  const byProduct = new Map<number, ImageRow[]>();
  if (productIds.length === 0) return byProduct;
  const { rows } = await q.query<ImageRow>(
    `SELECT id, product_id, path, is_primary, position
       FROM product_images
      WHERE product_id = ANY($1::bigint[])
      ORDER BY product_id, position, id`,
    [productIds],
  );
  for (const row of rows) {
    const list = byProduct.get(row.product_id);
    if (list) list.push(row);
    else byProduct.set(row.product_id, [row]);
  }
  return byProduct;
}

// ---------------------------------------------------------------------------
// Écritures produit (transaction)
// ---------------------------------------------------------------------------

/** Un slug appartient-il déjà à un produit (même supprimé : `slug` est UNIQUE) ? */
export async function slugExists(slug: string, client: Queryable): Promise<boolean> {
  const { rowCount } = await client.query('SELECT 1 FROM products WHERE slug = $1', [slug]);
  return (rowCount ?? 0) > 0;
}

export async function insertProduct(
  client: Queryable,
  ownerId: number,
  fields: ProductFields,
  slug: string,
): Promise<number> {
  const { rows } = await client.query<{ id: number }>(
    `INSERT INTO products (owner_id, category_id, name, slug, description, condition, price, old_price, location,
                           brand, model, age_years, defects, accessories, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
     RETURNING id`,
    [
      ownerId,
      fields.subcategoryId,
      fields.name,
      slug,
      fields.description,
      fields.condition,
      fields.price,
      fields.oldPrice ?? null,
      fields.location,
      fields.brand ?? null,
      fields.model ?? null,
      fields.ageYears ?? null,
      fields.defects ?? null,
      fields.accessories ?? null,
      fields.notes ?? null,
    ],
  );
  return rows[0]!.id;
}

export async function insertImage(
  client: Queryable,
  productId: number,
  path: string,
  isPrimary: boolean,
  position: number,
): Promise<void> {
  await client.query(
    'INSERT INTO product_images (product_id, path, is_primary, position) VALUES ($1, $2, $3, $4)',
    [productId, path, isPrimary, position],
  );
}

/** Verrouille le produit (owner) pour modification ; `undefined` = introuvable/supprimé. */
export async function selectProductForUpdate(
  client: Queryable,
  productId: number,
  ownerId: number,
): Promise<{ id: number; status: string } | undefined> {
  const { rows } = await client.query<{ id: number; status: string }>(
    'SELECT id, status FROM products WHERE id = $1 AND owner_id = $2 AND deleted_at IS NULL FOR UPDATE',
    [productId, ownerId],
  );
  return rows[0];
}

export async function updateProductToPending(
  client: Queryable,
  productId: number,
  fields: ProductFields,
): Promise<void> {
  await client.query(
    `UPDATE products SET
       category_id = $2, name = $3, description = $4, condition = $5, price = $6, old_price = $7, location = $8,
       brand = $9, model = $10, age_years = $11, defects = $12, accessories = $13, notes = $14,
       status = 'PENDING', rejection_reason = NULL, approved_at = NULL, approved_by = NULL
     WHERE id = $1`,
    [
      productId,
      fields.subcategoryId,
      fields.name,
      fields.description,
      fields.condition,
      fields.price,
      fields.oldPrice ?? null,
      fields.location,
      fields.brand ?? null,
      fields.model ?? null,
      fields.ageYears ?? null,
      fields.defects ?? null,
      fields.accessories ?? null,
      fields.notes ?? null,
    ],
  );
}

export async function selectImagesForUpdate(client: Queryable, productId: number): Promise<ImageRow[]> {
  const { rows } = await client.query<ImageRow>(
    'SELECT id, product_id, path, is_primary, position FROM product_images WHERE product_id = $1 ORDER BY position',
    [productId],
  );
  return rows;
}

export async function deleteImage(client: Queryable, imageId: number): Promise<void> {
  await client.query('DELETE FROM product_images WHERE id = $1', [imageId]);
}

export async function updateImagePosition(client: Queryable, imageId: number, position: number): Promise<void> {
  await client.query('UPDATE product_images SET position = $1 WHERE id = $2', [position, imageId]);
}

export async function normalizePrimaryImage(client: Queryable, productId: number): Promise<void> {
  await client.query('UPDATE product_images SET is_primary = (position = 1) WHERE product_id = $1', [productId]);
}

// ---------------------------------------------------------------------------
// Modération admin (transaction)
// ---------------------------------------------------------------------------

export async function selectProductForModerationLock(
  client: Queryable,
  productId: number,
): Promise<{ id: number; name: string; owner_id: number; status: string } | undefined> {
  const { rows } = await client.query<{ id: number; name: string; owner_id: number; status: string }>(
    'SELECT id, name, owner_id, status FROM products WHERE id = $1 AND deleted_at IS NULL FOR UPDATE',
    [productId],
  );
  return rows[0];
}

export async function markProductApproved(client: Queryable, productId: number, adminId: number): Promise<void> {
  await client.query(
    `UPDATE products SET status = 'AVAILABLE', approved_at = now(), approved_by = $1, rejection_reason = NULL WHERE id = $2`,
    [adminId, productId],
  );
}

export async function markProductRejected(client: Queryable, productId: number, reason: string): Promise<void> {
  await client.query(`UPDATE products SET status = 'REJECTED', rejection_reason = $1 WHERE id = $2`, [reason, productId]);
}

/**
 * Prolonge la réservation d'un produit SANS changer son statut (déjà RESERVED).
 * `days` = durée en JOURS (paiement à la livraison : `config.reservationDays`).
 * Même expression `make_interval` que `reserveProduct` (orders.repository).
 */
export async function updateProductReservedUntil(client: Queryable, productId: number, days: number): Promise<void> {
  await client.query(
    "UPDATE products SET reserved_until = now() + make_interval(days => $1) WHERE id = $2",
    [days, productId],
  );
}

export async function selectProductForDeleteLock(
  client: Queryable,
  productId: number,
): Promise<{ id: number; name: string; owner_id: number; deleted_at: Date | string | null } | undefined> {
  const { rows } = await client.query<{ id: number; name: string; owner_id: number; deleted_at: Date | string | null }>(
    'SELECT id, name, owner_id, deleted_at FROM products WHERE id = $1 FOR UPDATE',
    [productId],
  );
  return rows[0];
}

export async function softDeleteProduct(client: Queryable, productId: number): Promise<void> {
  await client.query('UPDATE products SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL', [productId]);
}

export async function productHasActiveOrder(client: Queryable, productId: number): Promise<boolean> {
  const { rowCount } = await client.query<{ one: number }>(
    `SELECT 1 AS one FROM orders
      WHERE product_id = $1 AND status NOT IN ${ACTIVE_ORDER_STATUSES_SQL}
      LIMIT 1`,
    [productId],
  );
  return (rowCount ?? 0) > 0;
}

// ---------------------------------------------------------------------------
// Lecture propriétaire / admin (1 produit)
// ---------------------------------------------------------------------------

export async function selectOwnerProduct(productId: number, q: Queryable = pool): Promise<ProductRow | undefined> {
  const { rows } = await q.query<ProductRow>(`${PRODUCT_SELECT} AND p.id = $1`, [productId]);
  return rows[0];
}

export async function selectAdminProductById(
  productId: number,
  opts: { includeDeleted?: boolean } = {},
  q: Queryable = pool,
): Promise<AdminProductRow | undefined> {
  const select = opts.includeDeleted ? PRODUCT_SELECT_ADMIN : PRODUCT_SELECT_ADMIN_ONE;
  const { rows } = await q.query<AdminProductRow>(`${select} AND p.id = $1`, [productId]);
  return rows[0];
}

// ---------------------------------------------------------------------------
// Catalogue public
// ---------------------------------------------------------------------------

export async function selectAvailableByIds(ids: number[], q: Queryable = pool): Promise<ProductRow[]> {
  const { rows } = await q.query<ProductRow>(
    `${PRODUCT_SELECT} AND p.status = 'AVAILABLE' AND p.id = ANY($1::bigint[])`,
    [ids],
  );
  return rows;
}

/**
 * Ligne de carte catalogue : le produit + le nom d'affichage du vendeur.
 * Nécessaire car `ProductRow` (et donc PRODUCT_SELECT, partagé par toutes les
 * requêtes) ne porte aucune colonne `users` : y greffer un JOIN casserait les
 * requêtes admin/détail qui font déjà leur propre jointure.
 */
export interface CatalogCardRow extends ProductRow {
  seller_display_name: string;
}

/** Fragment des champs carte (préfixés) — identique à PRODUCT_FIELDS + vendeur. */
const CARD_SELECT = `
  SELECT ${PRODUCT_FIELDS},
         w.display_name AS seller_display_name
    FROM products p
    JOIN categories sc ON sc.id = p.category_id
    JOIN categories c  ON c.id  = sc.parent_id
    JOIN users w       ON w.id  = p.owner_id`;

/** Compteur parallèle du catalogue (même `where`, sans le ORDER BY). */
const CARD_COUNT = `
  SELECT COUNT(*)::text AS count
    FROM products p
    JOIN categories sc ON sc.id = p.category_id
    JOIN categories c  ON c.id  = sc.parent_id
   WHERE `;

/**
 * Page de catalogue + total, en 2 requêtes lancées en parallèle sur le MÊME
 * `where`. `categoryIdIsParent` distingue un filtre parent (sous-requête) d'un
 * filtre sous-catégorie directe — décidé par le service après validation.
 */
export async function queryCatalogPage(
  filters: CatalogFilters,
  categoryIdIsParent: boolean,
  q: Queryable = pool,
): Promise<{ rows: CatalogCardRow[]; total: number }> {
  const sort = filters.sort ?? 'recent';
  const page = filters.page ?? 1;
  const perPage = filters.perPage ?? 12;

  const where: string[] = ["p.status = 'AVAILABLE'", LIVE];
  const params: unknown[] = [];

  if (filters.q) {
    params.push(`%${filters.q}%`);
    where.push(
      `(p.name ILIKE $${params.length} OR p.description ILIKE $${params.length}
        OR p.brand ILIKE $${params.length} OR p.location ILIKE $${params.length}
        OR sc.name ILIKE $${params.length} OR c.name ILIKE $${params.length})`,
    );
  }
  if (filters.categoryId) {
    params.push(filters.categoryId);
    if (categoryIdIsParent) where.push(`sc.id IN (SELECT id FROM categories WHERE parent_id = $${params.length})`);
    else where.push(`p.category_id = $${params.length}`);
  }
  if (filters.subcategory_id) {
    params.push(filters.subcategory_id);
    where.push(`p.category_id = $${params.length}`);
  }
  if (filters.price_min !== undefined) {
    params.push(filters.price_min);
    where.push(`p.price >= $${params.length}`);
  }
  if (filters.price_max !== undefined) {
    params.push(filters.price_max);
    where.push(`p.price <= $${params.length}`);
  }
  if (filters.condition) {
    params.push(filters.condition);
    where.push(`p.condition = $${params.length}`);
  }
  if (filters.location) {
    params.push(filters.location);
    where.push(`LOWER(BTRIM(p.location)) = LOWER($${params.length})`);
  }
  if (filters.brand) {
    params.push(`%${filters.brand}%`);
    where.push(`p.brand ILIKE $${params.length}`);
  }

  let orderBy = 'p.created_at DESC, p.id';
  if (filters.section === 'best_offers' || filters.section === 'promotions') {
    orderBy = '((p.old_price - p.price) * 1.0 / p.old_price) DESC, p.id';
    where.push('p.old_price IS NOT NULL AND p.old_price > p.price');
    if (filters.section === 'promotions') {
      where.push('((p.old_price - p.price) * 100.0 / p.old_price) >= 15');
    }
  } else if (filters.section === 'popular') {
    orderBy = 'p.view_count DESC, p.id';
  } else if (filters.section === 'new') {
    where.push(`p.created_at >= now() - interval '14 days'`);
  } else if (filters.section === 'discover') {
    orderBy = '((p.id + floor(extract(epoch from now()) / 86400)::bigint) % 997) ASC, p.id ASC';
  } else if (filters.section === undefined) {
    if (sort === 'popular') orderBy = 'p.view_count DESC, p.id';
    else if (sort === 'price_asc') orderBy = 'p.price ASC, p.id';
    else if (sort === 'price_desc') orderBy = 'p.price DESC, p.id';
    else if (sort === 'relevance') orderBy = RELEVANCE_ORDER;
  }

  if (filters.not_in) {
    params.push(filters.not_in);
    where.push(`p.id <> ALL($${params.length}::bigint[])`);
  }

  const whereClause = where.join(' AND ');
  const limit = perPage;
  const offset = (page - 1) * perPage;

  const [totalRes, pageRes] = await Promise.all([
    q.query<{ count: string }>(`${CARD_COUNT} ${whereClause}`, params),
    q.query<CatalogCardRow>(
      `${CARD_SELECT} WHERE p.deleted_at IS NULL AND ${whereClause} ORDER BY ${orderBy} LIMIT ${limit} OFFSET ${offset}`,
      params,
    ),
  ]);

  return { rows: pageRes.rows, total: Number(totalRes.rows[0]?.count ?? 0) };
}

export async function selectProductBySlugOrId(ident: string | number, q: Queryable = pool): Promise<ProductRow | undefined> {
  const lookup = typeof ident === 'number' ? 'p.id = $1' : 'p.slug = $1';
  const { rows } = await q.query<ProductRow>(`${PRODUCT_SELECT} AND ${lookup}`, [ident]);
  return rows[0];
}

export async function incrementViewCount(productId: number): Promise<number | undefined> {
  // 1) Charge le propriétaire (uniquement les statuts où la vue compte).
  const { rows: ownerRows } = await query<{ owner_id: number }>(
    'SELECT owner_id FROM products WHERE id = $1 AND status IN (\'AVAILABLE\', \'RESERVED\', \'SOLD\')',
    [productId],
  );
  const ownerId = ownerRows[0]?.owner_id;
  if (ownerId === undefined) return undefined;

  // 2) Incrémentation conditionnée au propriétaire (pas de course entre vendeurs).
  const { rows } = await query<{ view_count: number }>(
    `UPDATE products SET view_count = view_count + 1
     WHERE id = $1 AND owner_id = $2 AND status = 'AVAILABLE'
     RETURNING view_count`,
    [productId, ownerId],
  );
  return rows[0]?.view_count;
}

export async function countSoldByOwner(ownerId: number): Promise<number> {
  const { rows } = await query<{ count: string }>(
    "SELECT COUNT(*)::text AS count FROM products WHERE owner_id = $1 AND status = 'SOLD'",
    [ownerId],
  );
  return Number(rows[0]?.count ?? 0);
}

export async function selectSuggestions(
  like: string,
  limits: { products: number; categories: number; brands: number },
  q: Queryable = pool,
): Promise<Array<{ kind: string; data: unknown }>> {
  const { rows } = await q.query<{ kind: string; data: unknown }>(
    `SELECT 'product' AS kind, to_jsonb(t) AS data FROM (
       ${PRODUCT_SELECT} AND p.status = 'AVAILABLE' AND (p.name ILIKE $1 OR p.brand ILIKE $1)
       ORDER BY p.view_count DESC, p.id
       LIMIT ${limits.products}
     ) t
     UNION ALL
     SELECT 'category', to_jsonb(t2) AS data FROM (
       SELECT c.id, c.name, c.slug FROM categories c
        WHERE c.active AND (c.name ILIKE $1 OR c.slug ILIKE $1)
        ORDER BY (c.parent_id IS NULL) DESC, c.name ASC
        LIMIT ${limits.categories}
     ) t2
     UNION ALL
     SELECT 'brand', to_jsonb(t3) AS data FROM (
       SELECT DISTINCT BTRIM(p2.brand) AS brand FROM products p2
        WHERE p2.deleted_at IS NULL AND p2.status = 'AVAILABLE'
          AND p2.brand IS NOT NULL AND BTRIM(p2.brand) <> '' AND p2.brand ILIKE $1
        ORDER BY 1 ASC
        LIMIT ${limits.brands}
     ) t3`,
    [like],
  );
  return rows;
}

export async function selectLocations(q: Queryable = pool): Promise<string[]> {
  const { rows } = await q.query<{ location: string }>(
    `SELECT DISTINCT BTRIM(location) AS location FROM products
      WHERE status = 'AVAILABLE' AND deleted_at IS NULL AND BTRIM(location) <> ''
      ORDER BY location ASC
      LIMIT 200`,
  );
  return rows.map((r) => r.location);
}

// ---------------------------------------------------------------------------
// GET /api/me/products — pagination + compteurs en 1 requête (fenêtres)
// ---------------------------------------------------------------------------

type OwnerProductRow = ProductRow & {
  cnt_total: string;
  cnt_pending: string;
  cnt_available: string;
  cnt_reserved: string;
  cnt_sold: string;
  cnt_rejected: string;
};

/**
 * Page « Mes articles » + compteurs par statut en **UNE** requête, budget
 * constant. Les compteurs sont des agrégats de FENÊTRE (`OVER ()`) calculés
 * avant `LIMIT` : ils portent donc sur TOUS les articles du propriétaire, pas
 * seulement sur la page — indépendamment de `limit` (CA-V5-071).
 */
export async function selectOwnProductsPage(
  ownerId: number,
  opts: { limit: number; offset: number },
): Promise<OwnerProductRow[]> {
  const { rows } = await query<OwnerProductRow>(
    `SELECT ${PRODUCT_FIELDS},
            COUNT(*) OVER()::text AS cnt_total,
            COUNT(*) FILTER (WHERE p.status = 'PENDING') OVER()::text   AS cnt_pending,
            COUNT(*) FILTER (WHERE p.status = 'AVAILABLE') OVER()::text AS cnt_available,
            COUNT(*) FILTER (WHERE p.status = 'RESERVED') OVER()::text  AS cnt_reserved,
            COUNT(*) FILTER (WHERE p.status = 'SOLD') OVER()::text      AS cnt_sold,
            COUNT(*) FILTER (WHERE p.status = 'REJECTED') OVER()::text  AS cnt_rejected
       ${PRODUCT_FROM}
      WHERE p.owner_id = $1 AND p.deleted_at IS NULL
      ORDER BY p.created_at DESC, p.id DESC
      LIMIT $2 OFFSET $3`,
    [ownerId, opts.limit, opts.offset],
  );
  return rows;
}

/** Compteurs seuls — repli lorsque la page demandée est au-delà du dernier élément. */
export async function countOwnerProducts(
  ownerId: number,
): Promise<{ total: number; pending: number; available: number; reserved: number; sold: number; rejected: number }> {
  const { rows } = await query<{
    cnt_total: string;
    cnt_pending: string;
    cnt_available: string;
    cnt_reserved: string;
    cnt_sold: string;
    cnt_rejected: string;
  }>(
    `SELECT COUNT(*)::text AS cnt_total,
            COUNT(*) FILTER (WHERE status = 'PENDING')::text   AS cnt_pending,
            COUNT(*) FILTER (WHERE status = 'AVAILABLE')::text AS cnt_available,
            COUNT(*) FILTER (WHERE status = 'RESERVED')::text  AS cnt_reserved,
            COUNT(*) FILTER (WHERE status = 'SOLD')::text      AS cnt_sold,
            COUNT(*) FILTER (WHERE status = 'REJECTED')::text  AS cnt_rejected
       FROM products
      WHERE owner_id = $1 AND deleted_at IS NULL`,
    [ownerId],
  );
  const r = rows[0];
  return {
    total: Number(r?.cnt_total ?? 0),
    pending: Number(r?.cnt_pending ?? 0),
    available: Number(r?.cnt_available ?? 0),
    reserved: Number(r?.cnt_reserved ?? 0),
    sold: Number(r?.cnt_sold ?? 0),
    rejected: Number(r?.cnt_rejected ?? 0),
  };
}

export function ownerCountsFromRow(row: OwnerProductRow | undefined): OwnProductCounts {
  return {
    total: Number(row?.cnt_total ?? 0),
    pending: Number(row?.cnt_pending ?? 0),
    available: Number(row?.cnt_available ?? 0),
    reserved: Number(row?.cnt_reserved ?? 0),
    sold: Number(row?.cnt_sold ?? 0),
    rejected: Number(row?.cnt_rejected ?? 0),
  };
}

// ---------------------------------------------------------------------------
// Liste admin des produits
// ---------------------------------------------------------------------------

function adminProductsWhere(opts: { status: string; q?: string }): { whereClause: string; params: unknown[] } {
  const where: string[] = [LIVE, 'p.status = $1'];
  const params: unknown[] = [opts.status];
  if (opts.q) {
    params.push(`%${opts.q}%`);
    where.push(`p.name ILIKE $${params.length}`);
  }
  return { whereClause: where.join(' AND '), params };
}

export async function countAdminProducts(opts: { status: string; q?: string }, q: Queryable = pool): Promise<number> {
  const { whereClause, params } = adminProductsWhere(opts);
  const { rows } = await q.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM products p WHERE ${whereClause}`,
    params,
  );
  return Number(rows[0]?.count ?? 0);
}

export async function selectAdminProductsPage(
  opts: { status: string; q?: string; limit: number; offset: number },
  q: Queryable = pool,
): Promise<AdminProductRow[]> {
  const { whereClause, params } = adminProductsWhere(opts);
  const order = opts.status === 'PENDING' ? 'p.created_at ASC, p.id' : 'p.created_at DESC, p.id';
  const { rows } = await q.query<AdminProductRow>(
    `${PRODUCT_SELECT_ADMIN} WHERE ${whereClause} ORDER BY ${order} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, opts.limit, opts.offset],
  );
  return rows;
}

// ---------------------------------------------------------------------------
// Vérifications d'existence (validation avant ajout panier / favori)
// ---------------------------------------------------------------------------

/** Le produit existe-t-il (non supprimé), quel que soit son statut ? */
export async function productExists(productId: number, q: Queryable = pool): Promise<boolean> {
  const { rowCount } = await q.query(
    `SELECT 1 FROM products WHERE id = $1 AND deleted_at IS NULL LIMIT 1`,
    [productId],
  );
  return (rowCount ?? 0) > 0;
}

/** Le produit existe-t-il ET est-il achetable (AVAILABLE) ? (validation panier) */
export async function productExistsAndAvailable(productId: number, q: Queryable = pool): Promise<boolean> {
  const { rowCount } = await q.query(
    `SELECT 1 FROM products WHERE id = $1 AND deleted_at IS NULL AND status = 'AVAILABLE' LIMIT 1`,
    [productId],
  );
  return (rowCount ?? 0) > 0;
}
