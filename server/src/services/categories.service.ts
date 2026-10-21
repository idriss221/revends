import { getOrSet, cacheDel } from '../cache/redis.js';
import { config } from '../config.js';
import { withTransaction } from '../utils/db.js';
import { conflict, notFound } from '../utils/errors.js';
import { insertAdminAction } from '../repositories/admin.repository.js';
import {
  findCategoryActive,
  findCategoryById,
  nameExistsAtLevel,
  selectActiveCategories,
  selectAllCategories,
  selectChildren,
  updateCategory,
  type CategoryRow,
} from '../repositories/categories.repository.js';

export type { CategoryRow } from '../repositories/categories.repository.js';

/** Arbre des catégories pour le public — uniquement parents et enfants ACTIFS (D7, CA-CAT01-04). */
export async function listPublicCategories(): Promise<Record<string, unknown>> {
  return getOrSet('categories:public', config.redis.cacheTtlSeconds, async () => {
    const rows = await selectActiveCategories();
    const parents = rows.filter((r) => r.parent_id === null);
    return {
      categories: parents.map((p) => ({
        id: p.id,
        name: p.name,
        slug: p.slug,
        children: rows
          .filter((r) => r.parent_id === p.id)
          .map((c) => ({ id: c.id, name: c.name, slug: c.slug, active: true })),
      })),
    };
  });
}

/** Arbre complet (ADMIN) — actives ET inactives (CA-ADM06-01). */
export async function listAllCategories(): Promise<Record<string, unknown>> {
  const rows = await selectAllCategories();
  const parents = rows.filter((r) => r.parent_id === null);
  return {
    categories: parents.map((p) => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      active: p.active,
      children: rows
        .filter((r) => r.parent_id === p.id)
        .map((c) => ({ id: c.id, name: c.name, slug: c.slug, active: c.active })),
    })),
  };
}

/**
 * PATCH /api/admin/categories/:id (CA-ADM06) — renomme (slug inchangé) et/ou toggle active.
 * Pas de création/suppression en V1 (architecture §4.2).
 * La trace `admin_actions` (`category.update`) est écrite DANS la transaction,
 * comme les 10 autres écritures admin (CA-ADM07) ; le cache public n'est purgé
 * qu'après le commit.
 */
export async function patchCategory(
  adminId: number,
  categoryId: number,
  input: { name?: string; active?: boolean },
): Promise<Record<string, unknown>> {
  const row: CategoryRow = await withTransaction(async (client) => {
    const category = await findCategoryById(categoryId, client);
    if (!category) throw notFound('CATEGORY_NOT_FOUND', 'Catégorie introuvable');

    const wantsActive = input.active !== undefined ? input.active : category.active;

    if (category.parent_id !== null && wantsActive) {
      const parentActive = await findCategoryActive(category.parent_id, client);
      if (!parentActive) {
        throw conflict('PARENT_INACTIVE', "Impossible d'activer une sous-catégorie dont la catégorie parente est inactive");
      }
    }

    const newName = input.name !== undefined ? input.name.trim() : category.name;
    if (input.name !== undefined && newName !== category.name) {
      const taken = await nameExistsAtLevel(newName, category.parent_id, categoryId, client);
      if (taken) {
        throw conflict('CATEGORY_NAME_TAKEN', 'Un autre libellé identique existe déjà à ce niveau');
      }
    }

    // Désactiver une catégorie ne touche PAS aux produits déjà AVAILABLE (CA-CAT01-04).
    const updated: CategoryRow = await updateCategory(categoryId, newName, wantsActive, client);

    const changes: string[] = [];
    if (newName !== category.name) changes.push('renommée');
    if (wantsActive !== category.active) changes.push(updated.active ? 'activée' : 'désactivée');
    const namePart = newName !== category.name ? ` — ${category.name} → ${updated.name}` : '';
    const activePart = wantsActive !== category.active ? ` (active: ${category.active} → ${updated.active})` : '';
    await insertAdminAction(client, {
      adminId,
      action: 'category.update',
      targetType: 'category',
      targetId: categoryId,
      description: `Catégorie ${changes.join(' + ') || 'mise à jour'}${namePart}${activePart}`,
    });
    return updated;
  });

  await cacheDel(['categories:public']);

  const out: Record<string, unknown> = { id: row.id, name: row.name, slug: row.slug, active: row.active };
  if (row.parent_id === null) {
    const children = await selectChildren(row.id);
    out.children = children.map((c) => ({ id: c.id, name: c.name, slug: c.slug, active: c.active }));
  }
  return out;
}