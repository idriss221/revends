import { pool, type Queryable } from '../db/pool.js';

// ---------------------------------------------------------------------------
// V8-D2/F1 — R2 RETENUE (§14.A clos 18/11/2026) : trace d'auto-approbation
// dans la table système `auto_approved_products` (jamais dans admin_actions).
// ---------------------------------------------------------------------------

export interface AutoApprovalInput {
  productId: number;
  sellerId: number;
  subscriptionId: number;
}

/** INSERT … ON CONFLICT DO NOTHING — exactement une ligne par produit (P11). */
export async function insertAutoApprovedProduct(client: Queryable, input: AutoApprovalInput): Promise<void> {
  await client.query(
    `INSERT INTO auto_approved_products (product_id, seller_id, subscription_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (product_id) DO NOTHING`,
    [input.productId, input.sellerId, input.subscriptionId],
  );
}

/** Garde F8 : le produit a-t-il été auto-approuvé (R2) ? */
export async function hasAutoApprovedProduct(client: Queryable, productId: number): Promise<boolean> {
  const { rowCount } = await client.query('SELECT 1 FROM auto_approved_products WHERE product_id = $1', [productId]);
  return (rowCount ?? 0) > 0;
}

/** File admin (R5) — jointure trace ⨝ products ⨝ users, tri created_at DESC. */
export async function listAutoApprovals(
  page: number,
  perPage: number,
  q: Queryable = pool,
): Promise<{
  items: Array<{
    id: number;
    productId: number;
    productName: string;
    sellerId: number;
    sellerDisplayName: string;
    createdAt: Date | string;
    subscriptionId: number;
  }>;
  total: number;
}> {
  const offset = (page - 1) * perPage;
  const { rows: countRows } = await q.query<{ total: number }>(
    'SELECT COUNT(*)::int AS total FROM auto_approved_products',
  );
  const total = countRows[0]?.total ?? 0;
  const { rows } = await q.query<{
    product_id: number;
    product_name: string;
    seller_id: number;
    seller_display_name: string;
    created_at: Date | string;
    subscription_id: number;
  }>(
    `SELECT a.product_id, p.name AS product_name, a.seller_id,
            u.display_name AS seller_display_name, a.created_at, a.subscription_id
       FROM auto_approved_products a
       JOIN products p ON p.id = a.product_id
       JOIN users u    ON u.id = a.seller_id
      ORDER BY a.created_at DESC, a.product_id DESC
      LIMIT $1 OFFSET $2`,
    [perPage, offset],
  );
  return {
    total,
    items: rows.map((row) => ({
      id: row.product_id,
      productId: row.product_id,
      productName: row.product_name,
      sellerId: row.seller_id,
      sellerDisplayName: row.seller_display_name,
      createdAt: row.created_at,
      subscriptionId: row.subscription_id,
    })),
  };
}

/** Lecture d'une ligne par productId (tests/recette). */
export async function selectAutoApproval(productId: number, q: Queryable = pool) {
  const { rows } = await q.query('SELECT * FROM auto_approved_products WHERE product_id = $1', [productId]);
  return rows[0] as { product_id: number; seller_id: number; subscription_id: number; created_at: Date | string } | undefined;
}
