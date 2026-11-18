import type { DbClient } from '../db/pool.js';
import { withTransaction } from '../utils/db.js';
import { conflict, notFound } from '../utils/errors.js';
import { ACTIVE_ORDER_STATUSES_SQL } from '../repositories/products.repository.js';
import { insertAdminAction } from '../repositories/admin.repository.js';

// ---------------------------------------------------------------------------
// V8.1 — « Contrôle boutique » — suppression par le PROPRIÉTAIRE.
//
// DELETE /api/me/products/:id (requireAuth, owner-only) :
//  • au moins une commande ACTIVE (statut hors ACTIVE_ORDER_STATUSES_SQL,
//    constante réutilisée telle quelle) → 409 PRODUCT_ORDER_ACTIVE + message
//    humain ;
//  • sinon, suppression DÉFINITIVE (hard delete) — uniquement si AUCUNE
//    commande ne référence l'article (query orders WHERE product_id = $1
//    vide), afin de préserver la contrainte FK NO ACTION orders.product_id ;
//  • sinon soft-delete (deleted_at = now()) ;
//  • trace `admin_actions` (action 'product.owner_delete', actor = vendeur,
//    targetType 'product') DANS la transaction.
// Aucun accès orders/payments/checkout au-delà de la LECTURE de statut ;
// aucune PII journalisée.
// ---------------------------------------------------------------------------

export type OwnerDeleteOutcome = 'deleted' | 'soft_deleted';

interface OwnerProductLockRow {
  id: number;
  name: string;
  owner_id: number;
}

/**
 * Supprime (définitivement ou logiquement) l'article `productId` appartenant
 * à `ownerId`. Ressource inexistante OU d'autrui → 404 PRODUCT_NOT_FOUND.
 */
export async function deleteOwnerProduct(ownerId: number, productId: number): Promise<OwnerDeleteOutcome> {
  return withTransaction(async (client: DbClient): Promise<OwnerDeleteOutcome> => {
    const { rows } = await client.query<OwnerProductLockRow>(
      'SELECT id, name, owner_id FROM products WHERE id = $1 FOR UPDATE',
      [productId],
    );
    const product = rows[0];
    // Non divulguée : inexistant, déjà supprimé, ou d'autrui → 404.
    if (!product || product.owner_id !== ownerId) {
      throw notFound('PRODUCT_NOT_FOUND', 'Article introuvable');
    }

    // Commande ACTIVE = statut hors (COMPLETED, CANCELLED, PAYMENT_FAILED) — même règle que productHasActiveOrder.
    const { rowCount: activeCount } = await client.query<{ one: number }>(
      `SELECT 1 AS one FROM orders
        WHERE product_id = $1 AND status NOT IN ${ACTIVE_ORDER_STATUSES_SQL}
        LIMIT 1`,
      [productId],
    );
    if ((activeCount ?? 0) > 0) {
      throw conflict(
        'PRODUCT_ORDER_ACTIVE',
        "Cet article est lié à une commande en cours : suppression impossible. Réessayez une fois la commande terminée ou annulée.",
      );
    }

    // Hard delete SEULEMENT si aucune commande ne référence l'article (FK orders.product_id NO ACTION).
    const { rowCount: anyCount } = await client.query<{ one: number }>(
      'SELECT 1 AS one FROM orders WHERE product_id = $1 LIMIT 1',
      [productId],
    );

    let outcome: OwnerDeleteOutcome;
    if ((anyCount ?? 0) === 0) {
      await client.query('DELETE FROM products WHERE id = $1', [productId]);
      outcome = 'deleted';
    } else {
      await client.query('UPDATE products SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL', [productId]);
      outcome = 'soft_deleted';
    }

    await insertAdminAction(client, {
      adminId: ownerId, // actor = vendeur (admin_actions.admin_id = FK users, pas de rôle exigé)
      action: 'product.owner_delete',
      targetType: 'product',
      targetId: product.id,
      description: `Article supprimé par son propriétaire — ${product.name} (${outcome === 'deleted' ? 'définitif' : 'masqué : commandes liées'})`,
    });
    return outcome;
  });
}
