import { query } from '../db/pool.js';
import { pool, type Queryable } from '../db/pool.js';
import type { ProductRow, ImageRow } from '../utils/serializers.js';
import { PRODUCT_SELECT } from './products.repository.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FavoriteRow {
  id: number;
  user_id: number;
  product_id: number;
  created_at: Date | string;
}

export interface FavoriteWithProduct extends FavoriteRow {
  // Produit joint
  id: number;
  owner_id: number;
  owner_display_name: string;
  name: string;
  slug: string;
  description: string;
  condition: string;
  price: number;
  old_price: number | null;
  view_count: number;
  location: string;
  status: string;
  rejection_reason: string | null;
  approved_at: Date | string | null;
  approved_by: number | null;
  brand: string | null;
  model: string | null;
  age_years: number | null;
  defects: string | null;
  accessories: string | null;
  notes: string | null;
  reserved_until: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
  category_id: number;
  category_name: string;
  category_slug: string;
  subcategory_id: number;
  subcategory_name: string;
  subcategory_slug: string;
}

export interface FavoriteWithImage extends FavoriteWithProduct {
  primary_image: ImageRow | null;
}

// ---------------------------------------------------------------------------
// Requêtes
// ---------------------------------------------------------------------------

const FAVORITES_SELECT = `
  SELECT f.id, f.user_id, f.product_id, f.created_at,
         p.id, p.owner_id, u.display_name AS owner_display_name, p.name, p.slug, p.description, p.condition, p.price, p.old_price, p.view_count,
         p.location, p.status, p.rejection_reason, p.approved_at, p.approved_by, p.brand, p.model, p.age_years,
         p.defects, p.accessories, p.notes, p.reserved_until, p.created_at, p.updated_at,
         c_cat.id AS category_id, c_cat.name AS category_name, c_cat.slug AS category_slug,
         sc.id AS subcategory_id, sc.name AS subcategory_name, sc.slug AS subcategory_slug
  FROM favorites f
  JOIN products p ON p.id = f.product_id
  JOIN users u ON u.id = p.owner_id
  JOIN categories sc ON sc.id = p.category_id
  LEFT JOIN categories c_cat ON c_cat.id = sc.parent_id
  WHERE f.user_id = $1 AND p.deleted_at IS NULL
`;

export async function getFavorites(userId: number, q: Queryable = pool): Promise<FavoriteWithProduct[]> {
  const { rows } = await query<FavoriteWithProduct>(
    `${FAVORITES_SELECT} ORDER BY f.created_at DESC, f.id`,
    [userId],
  );
  return rows;
}

export async function getFavoritesWithImages(userId: number, q: Queryable = pool): Promise<FavoriteWithImage[]> {
  const favorites = await getFavorites(userId, q);
  if (favorites.length === 0) return [];

  const productIds = favorites.map((f) => f.product_id);
  const { rows: images } = await q.query<ImageRow>(
    `SELECT DISTINCT ON (product_id) id, product_id, path, is_primary, position
       FROM product_images
      WHERE product_id = ANY($1::bigint[]) AND is_primary = TRUE
      ORDER BY product_id, position, id`,
    [productIds],
  );
  const imageMap = new Map(images.map((img) => [img.product_id, img]));

  return favorites.map((fav) => ({
    ...fav,
    primary_image: imageMap.get(fav.product_id) ?? null,
  }));
}

export async function toggleFavorite(
  client: Queryable,
  userId: number,
  productId: number,
): Promise<{ added: boolean }> {
  // Tentative d'insertion
  const res = await client.query(
    `INSERT INTO favorites (user_id, product_id)
     VALUES ($1, $2)
     ON CONFLICT (user_id, product_id) DO NOTHING
     RETURNING id`,
    [userId, productId],
  );

  if ((res.rowCount ?? 0) > 0) {
    return { added: true };
  }

  // Si conflit, on supprime (toggle off)
  await client.query('DELETE FROM favorites WHERE user_id = $1 AND product_id = $2', [userId, productId]);
  return { added: false };
}

export async function removeFavorite(
  client: Queryable,
  userId: number,
  productId: number,
): Promise<void> {
  await client.query('DELETE FROM favorites WHERE user_id = $1 AND product_id = $2', [userId, productId]);
}

export async function isFavorite(userId: number, productId: number, q: Queryable = pool): Promise<boolean> {
  const { rowCount } = await query(
    'SELECT 1 FROM favorites WHERE user_id = $1 AND product_id = $2 LIMIT 1',
    [userId, productId],
  );
  return (rowCount ?? 0) > 0;
}