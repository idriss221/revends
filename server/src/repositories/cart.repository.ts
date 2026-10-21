import { pool, type Queryable } from '../db/pool.js';
import type { ProductRow, ImageRow } from '../utils/serializers.js';
import { PRODUCT_SELECT } from './products.repository.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CartLineRow {
  id: number;
  user_id: number;
  product_id: number;
  qty: number;
  created_at: Date | string;
  updated_at: Date | string;
}

export interface CartLineWithProduct extends CartLineRow {
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

export interface CartLineWithImage extends CartLineWithProduct {
  primary_image: ImageRow | null;
}

// ---------------------------------------------------------------------------
// Requêtes
// ---------------------------------------------------------------------------

const CART_SELECT = `
  SELECT c.id, c.user_id, c.product_id, c.qty, c.created_at, c.updated_at,
         p.id, p.owner_id, u.display_name AS owner_display_name, p.name, p.slug, p.description, p.condition, p.price, p.old_price, p.view_count,
         p.location, p.status, p.rejection_reason, p.approved_at, p.approved_by, p.brand, p.model, p.age_years,
         p.defects, p.accessories, p.notes, p.reserved_until, p.created_at, p.updated_at,
         c_cat.id AS category_id, c_cat.name AS category_name, c_cat.slug AS category_slug,
         sc.id AS subcategory_id, sc.name AS subcategory_name, sc.slug AS subcategory_slug
  FROM cart c
  JOIN products p ON p.id = c.product_id
  JOIN users u ON u.id = p.owner_id
  JOIN categories sc ON sc.id = p.category_id
  LEFT JOIN categories c_cat ON c_cat.id = sc.parent_id
  WHERE c.user_id = $1 AND p.deleted_at IS NULL
`;

export async function getCartLines(userId: number, q: Queryable = pool): Promise<CartLineWithProduct[]> {
  // `WHERE c.user_id = $1` : le paramètre `userId` est INDISPENSABLE, sinon
  // PostgreSQL rejette la requête (`there is no parameter $1` → 500).
  // On passe par `q` (et non le pool global) pour honorer le `Queryable` injecté
  // (transactions, tests).
  const { rows } = await q.query<CartLineWithProduct>(
    `${CART_SELECT} ORDER BY c.created_at DESC, c.id`,
    [userId],
  );
  return rows;
}

export async function getCartLinesWithImages(userId: number, q: Queryable = pool): Promise<CartLineWithImage[]> {
  const lines = await getCartLines(userId, q);
  if (lines.length === 0) return [];

  const productIds = lines.map((l) => l.product_id);
  const { rows: images } = await q.query<ImageRow>(
    `SELECT DISTINCT ON (product_id) id, product_id, path, is_primary, position
       FROM product_images
      WHERE product_id = ANY($1::bigint[]) AND is_primary = TRUE
      ORDER BY product_id, position, id`,
    [productIds],
  );
  const imageMap = new Map(images.map((img) => [img.product_id, img]));

  return lines.map((line) => ({
    ...line,
    primary_image: imageMap.get(line.product_id) ?? null,
  }));
}

export interface UpsertCartInput {
  userId: number;
  productId: number;
  qty: number;
}

export async function upsertCartLine(
  client: Queryable,
  input: UpsertCartInput,
): Promise<CartLineRow> {
  const { rows } = await client.query<CartLineRow>(
    `INSERT INTO cart (user_id, product_id, qty)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, product_id) DO UPDATE SET
       qty = LEAST(cart.qty + EXCLUDED.qty, 9),
       updated_at = now()
     RETURNING id, user_id, product_id, qty, created_at, updated_at`,
    [input.userId, input.productId, input.qty],
  );
  return rows[0]!;
}

export async function setCartQty(
  client: Queryable,
  userId: number,
  productId: number,
  qty: number,
): Promise<CartLineRow | null> {
  if (qty <= 0) {
    await client.query('DELETE FROM cart WHERE user_id = $1 AND product_id = $2', [userId, productId]);
    return null;
  }
  const { rows } = await client.query<CartLineRow>(
    `UPDATE cart SET qty = $3, updated_at = now()
     WHERE user_id = $1 AND product_id = $2
     RETURNING id, user_id, product_id, qty, created_at, updated_at`,
    [userId, productId, qty],
  );
  return rows[0] ?? null;
}

export async function removeCartLine(
  client: Queryable,
  userId: number,
  productId: number,
): Promise<void> {
  await client.query('DELETE FROM cart WHERE user_id = $1 AND product_id = $2', [userId, productId]);
}

export async function clearCart(
  client: Queryable,
  userId: number,
): Promise<void> {
  await client.query('DELETE FROM cart WHERE user_id = $1', [userId]);
}
