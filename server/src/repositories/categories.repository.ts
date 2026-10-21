import { pool, type Queryable } from '../db/pool.js';
import { query } from '../db/pool.js';

export interface CategoryRow {
  id: number;
  parent_id: number | null;
  name: string;
  slug: string;
  active: boolean;
}

const CATEGORY_COLUMNS = 'id, parent_id, name, slug, active';

/** Catégories ACTIVES (arbre public). */
export async function selectActiveCategories(): Promise<CategoryRow[]> {
  const { rows } = await query<CategoryRow>(
    `SELECT ${CATEGORY_COLUMNS} FROM categories WHERE active = TRUE ORDER BY id`,
  );
  return rows;
}

/** Arbre complet (ADMIN) : actives ET inactives. */
export async function selectAllCategories(q: Queryable = pool): Promise<CategoryRow[]> {
  const { rows } = await q.query<CategoryRow>(`SELECT ${CATEGORY_COLUMNS} FROM categories ORDER BY id`);
  return rows;
}

export async function findCategoryById(id: number, q: Queryable = pool): Promise<CategoryRow | undefined> {
  const { rows } = await q.query<CategoryRow>(`SELECT ${CATEGORY_COLUMNS} FROM categories WHERE id = $1`, [id]);
  return rows[0];
}

/**
 * `parent_id` d'une catégorie. `undefined` = catégorie inexistante,
 * `null` = catégorie racine. Distinction nécessaire aux validations métier.
 */
export async function findParentId(id: number, q: Queryable = pool): Promise<number | null | undefined> {
  const { rows } = await q.query<{ parent_id: number | null }>('SELECT parent_id FROM categories WHERE id = $1', [id]);
  if (!rows[0]) return undefined;
  return rows[0].parent_id;
}

export async function selectChildren(parentId: number, q: Queryable = pool): Promise<CategoryRow[]> {
  const { rows } = await q.query<CategoryRow>(
    `SELECT ${CATEGORY_COLUMNS} FROM categories WHERE parent_id = $1 ORDER BY id`,
    [parentId],
  );
  return rows;
}

/** Un autre libellé identique existe-t-il au même niveau ? (unicité applicative). */
export async function nameExistsAtLevel(
  name: string,
  parentId: number | null,
  excludeId: number,
  q: Queryable = pool,
): Promise<boolean> {
  const { rowCount } = await q.query(
    `SELECT 1 FROM categories
      WHERE name = $1 AND parent_id IS NOT DISTINCT FROM $2 AND id <> $3`,
    [name, parentId, excludeId],
  );
  return (rowCount ?? 0) > 0;
}

export async function updateCategory(
  id: number,
  name: string,
  active: boolean,
  q: Queryable = pool,
): Promise<CategoryRow> {
  const { rows } = await q.query<CategoryRow>(
    `UPDATE categories SET name = $2, active = $3 WHERE id = $1 RETURNING ${CATEGORY_COLUMNS}`,
    [id, name, active],
  );
  return rows[0]!;
}

/** Couple (catégorie, sous-catégorie) retourné en bloc pour la validation d'annonce. */
export async function selectCategoriesForValidation(
  ids: [number, number],
  q: Queryable = pool,
): Promise<Array<{ id: number; parent_id: number | null; active: boolean }>> {
  const { rows } = await q.query<{ id: number; parent_id: number | null; active: boolean }>(
    'SELECT id, parent_id, active FROM categories WHERE id = ANY($1::bigint[])',
    [ids],
  );
  return rows;
}

/** Catégorie active ? (garde d'activation d'une sous-catégorie). */
export async function findCategoryActive(id: number, q: Queryable = pool): Promise<boolean> {
  const { rows } = await q.query<{ active: boolean }>('SELECT active FROM categories WHERE id = $1', [id]);
  return rows[0]?.active ?? false;
}
