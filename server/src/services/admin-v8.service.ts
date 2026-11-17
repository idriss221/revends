import { withTransaction } from '../utils/db.js';
import { badRequest, conflict, notFound } from '../utils/errors.js';
import { insertAdminAction } from '../repositories/admin.repository.js';
import { insertNotification } from './notifications.service.js';
import { hasAutoApprovedProduct, listAutoApprovals } from '../repositories/auto-approved.repository.js';
import { buildAdminProduct } from './products.service.js';
import type { AdminSubscriptionsQuery } from './storefront.service.js';

// ---------------------------------------------------------------------------
// V8 — Gouvernance admin additionnelle (routes /api/admin/auto-approvals et
// /api/admin/products/:id/retrograde). requireAdmin au niveau du routeur.
// ---------------------------------------------------------------------------

const ADMIN_ACTION_RETROGRADED = 'product.auto_approved_retrograded';

/** F8 — Rétrogradation d'un produit auto-approuvé : AVAILABLE → REJECTED. */
export async function retrogradeAutoApprovedProduct(adminId: number, productId: number, reason: string) {
  const trimmed = reason.trim();
  if (trimmed.length < 10) {
    throw badRequest('VALIDATION_ERROR', 'Le motif doit contenir au moins 10 caractères', [
      { field: 'reason', message: 'Au moins 10 caractères' },
    ]);
  }
  await withTransaction(async (client) => {
    const { rows } = await client.query<{ id: number; status: string; owner_id: number; name: string }>(
      'SELECT id, status, owner_id, name FROM products WHERE id = $1 AND deleted_at IS NULL FOR UPDATE',
      [productId],
    );
    const product = rows[0];
    if (!product) throw notFound('NOT_FOUND', 'Article introuvable');
    if (product.status !== 'AVAILABLE') {
      throw conflict('INVALID_STATUS', "Cet article n'est pas disponible : la rétrogradation vise uniquement les articles publiés automatiquement");
    }
    // Garde R2 : le produit doit porter la trace d'auto-approbation.
    if (!(await hasAutoApprovedProduct(client, productId))) {
      throw conflict('NOT_AUTO_APPROVED', "Cet article n'a pas été publié automatiquement : utilisez la route de refus classique");
    }
    await client.query(
      `UPDATE products
          SET status = 'REJECTED', rejection_reason = $2, updated_at = now()
        WHERE id = $1`,
      [productId, trimmed],
    );
    await insertAdminAction(client, {
      adminId,
      action: ADMIN_ACTION_RETROGRADED,
      targetType: 'product',
      targetId: productId,
      description: `Rétrogradation d'une auto-approbation — ${trimmed}`,
    });
    await insertNotification(
      client,
      product.owner_id,
      'article_rejected',
      `Article refusé : ${trimmed}`,
      trimmed,
    );
  });
  return { product: await buildAdminProduct(productId) };
}

/** R5 — File des auto-approbations (contrôle qualité admin), paginée. */
export async function listAutoApprovalsAdmin(query: Pick<AdminSubscriptionsQuery, 'page' | 'perPage'>) {
  const { items, total } = await listAutoApprovals(query.page, query.perPage);
  return {
    items: items.map((item) => ({
      ...item,
      createdAt: new Date(item.createdAt).toISOString(),
    })),
    page: query.page,
    perPage: query.perPage,
    total,
    totalPages: total === 0 ? 0 : Math.ceil(total / query.perPage),
  };
}
