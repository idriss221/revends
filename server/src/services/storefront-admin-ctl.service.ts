import { type Queryable } from '../db/pool.js';
import { withTransaction } from '../utils/db.js';
import { badRequest, conflict, notFound } from '../utils/errors.js';
import { sendSubscriptionRefusedMail } from './subscription-notifications.service.js';

// ---------------------------------------------------------------------------
// V8.1 — « Contrôle boutique » — gouvernance admin des abonnements.
//
// Deux actions, toutes deux réversible (deactivate) ou définitive (delete) :
//  1. deactivateSubscription : ACTIVE → CANCELLED, AUCUNE écriture produits /
//     listings — le vendeur peut re-souscrire et retrouver sa boutique (slug
//     réservé à vie). Badges/boost disparaissent d'eux-mêmes (dérivés en
//     lecture de `status = 'ACTIVE'`).
//  2. deleteSubscription : CANCELLED + `deleted_at = now()` sur TOUS les
//     articles du vendeur (owner_id = seller_id) + suppression DÉFINITIVE des
//     lignes `storefront_listings` du vendeur (toutes ses souscriptions).
//
// AUCUN admin.service.ts touché ; AUCUNE écriture sur orders/payments/
// payouts/checkout/rating/commission ; AUCUNE donnée PII journalisée.
// Trace `admin_actions` (`subscription.deactivate` / `subscription.delete`,
// target_type = 'subscription', target_id = subscription.id) DANS la
// transaction — même pattern que `insertAdminAction` (jamais l'helper
// existant : son type union `targetType` n'accepte pas 'subscription').
// ---------------------------------------------------------------------------

interface SubscriptionCtlRow {
  id: number;
  seller_id: number;
  status: 'PENDING' | 'ACTIVE' | 'EXPIRED' | 'CANCELLED';
  slug: string;
}

/** Vue de réponse commune aux deux routes (jamais de PII vendeur). */
/** Réaction admin au refus d’un paiement (Demands → CANCELLED avec motif, notification vendeur best-effort). */
export interface RejectSubscriptionOutcome {
  subscription: Record<string, unknown>;
  mailAfterCommit: { userId: number; planName: string; subscriptionId: number; reason: string };
}

export function serializeSubscriptionCtl(row: SubscriptionCtlRow): Record<string, unknown> {
  return {
    subscription: {
      id: row.id,
      status: row.status,
      slug: row.slug,
      merchantActive: row.status === 'ACTIVE',
    },
  };
}

/** Trace `admin_actions` — target_type 'subscription' (hors union de l'helper existant). */
async function insertSubscriptionAdminAction(
  client: Queryable,
  record: { adminId: number; action: 'subscription.deactivate' | 'subscription.delete'; subscriptionId: number; description: string },
): Promise<void> {
  await client.query(
    `INSERT INTO admin_actions (admin_id, action, target_type, target_id, description)
     VALUES ($1, $2, 'subscription', $3, $4)`,
    [record.adminId, record.action, record.subscriptionId, record.description],
  );
}

const SELECT_FOR_UPDATE = `SELECT id, seller_id, status, slug FROM seller_subscriptions WHERE id = $1 FOR UPDATE`;

/** POST /api/admin/subscriptions/:id/deactivate — ACTIVE → CANCELLED (réversible). */
export async function deactivateSubscription(adminId: number, subscriptionId: number) {
  return withTransaction(async (client) => {
    const { rows } = await client.query<SubscriptionCtlRow>(SELECT_FOR_UPDATE, [subscriptionId]);
    const target = rows[0];
    // Non divulgée : inexistante OU non ACTIVE → 404 identique (choix contrat).
    if (!target) throw notFound('NOT_FOUND', 'Abonnement introuvable');
    if (target.status !== 'ACTIVE') throw notFound('NOT_FOUND', 'Abonnement introuvable');

    const { rows: updated } = await client.query<SubscriptionCtlRow>(
      `UPDATE seller_subscriptions SET status = 'CANCELLED'
        WHERE id = $1 AND status = 'ACTIVE'
        RETURNING id, seller_id, status, slug`,
      [target.id],
    );
    const subscription = updated[0];
    if (!subscription) throw notFound('NOT_FOUND', 'Abonnement introuvable'); // course : devenu non-ACTIVE entre-temps

    await insertSubscriptionAdminAction(client, {
      adminId,
      action: 'subscription.deactivate',
      subscriptionId: subscription.id,
      description: `Abonnement désactivé — slug ${subscription.slug} (vendeur #${subscription.seller_id})`,
    });
    return serializeSubscriptionCtl(subscription);
  });
}

/**
 * POST /api/admin/subscriptions/:id/delete — définitif (IRRÉVERSIBLE) :
 * subscription → CANCELLED · soft-delete de TOUS les articles du vendeur
 * (owner_id = seller_id) · suppression définitive des listings du vendeur.
 * Précondition : l'abonnement existe (404 sinon) — tout statut accepté (un
 * PENDING orphelin peut aussi être « définitivement » clos par ce chemin).
 */
export async function deleteSubscription(adminId: number, subscriptionId: number) {
  return withTransaction(async (client) => {
    const { rows } = await client.query<SubscriptionCtlRow>(SELECT_FOR_UPDATE, [subscriptionId]);
    const target = rows[0];
    if (!target) throw notFound('NOT_FOUND', 'Abonnement introuvable');

    const { rows: updated } = await client.query<SubscriptionCtlRow>(
      `UPDATE seller_subscriptions SET status = 'CANCELLED'
        WHERE id = $1
        RETURNING id, seller_id, status, slug`,
      [target.id],
    );
    const subscription = updated[0]!;

    // Soft-delete de TOUS les articles vivants du vendeur (historique commands préservé).
    await client.query(
      `UPDATE products SET deleted_at = now() WHERE owner_id = $1 AND deleted_at IS NULL`,
      [subscription.seller_id],
    );
    // Suppression DÉFINITIVE des listings du vendeur (toutes souscriptions confondues).
    await client.query(
      `DELETE FROM storefront_listings
        WHERE subscription_id IN (SELECT id FROM seller_subscriptions WHERE seller_id = $1)`,
      [subscription.seller_id],
    );

    await insertSubscriptionAdminAction(client, {
      adminId,
      action: 'subscription.delete',
      subscriptionId: subscription.id,
      description: `Abonnement supprimé définitivement — slug ${subscription.slug} (vendeur #${subscription.seller_id})`,
    });
    return serializeSubscriptionCtl(subscription);
  });
}

/** POST /api/admin/subscriptions/:id/reject — PENDING → CANCELLED + e-mail vendeur (motif). */
export async function rejectSubscription(adminId: number, subscriptionId: number, reason: string): Promise<RejectSubscriptionOutcome> {
  const trimmed = reason.trim();
  if (trimmed.length < 10) {
    throw badRequest('VALIDATION_ERROR', 'Le motif doit contenir au moins 10 caractères', [
      { field: 'reason', message: 'Au moins 10 caractères' },
    ]);
  }
  return withTransaction(async (client) => {
    const { rows } = await client.query<SubscriptionCtlRow>(SELECT_FOR_UPDATE, [subscriptionId]);
    const target = rows[0];
    if (!target) throw notFound('NOT_FOUND', 'Abonnement introuvable');
    if (target.status !== 'PENDING') {
      throw conflict('INVALID_STATUS', "Seul un abonnement en attente peut être refusé (celui-ci est déjà actif/expiré/annulé).");
    }
    const { rows: updated } = await client.query<SubscriptionCtlRow>(
      `UPDATE seller_subscriptions SET status = 'CANCELLED'
        WHERE id = $1 AND status = 'PENDING'
        RETURNING id, seller_id, status, slug`,
      [target.id],
    );
    const subscription = updated[0];
    if (!subscription) throw notFound('NOT_FOUND', 'Abonnement introuvable'); // course : devenu non-PENDING entre-temps

    await client.query(
      `INSERT INTO admin_actions (admin_id, action, target_type, target_id, description)
       VALUES ($1, 'subscription.refused', 'subscription', $2, $3)`,
      [adminId, subscription.id, `Abonnement refusé — slug ${subscription.slug} — motif : ${trimmed.slice(0, 2000)}`],
    );

    // Plan name pour le mail (lecture dans la transaction).
    const planRows = await client.query<{ name: string }>(
      'SELECT p.name FROM subscription_plans p JOIN seller_subscriptions s ON s.plan_id = p.id WHERE s.id = $1',
      [subscription.id],
    );
    const planName = planRows.rows[0]?.name ?? 'Hébergement Boutique';

    return {
      subscription: serializeSubscriptionCtl(subscription),
      mailAfterCommit: { userId: subscription.seller_id, planName, subscriptionId: subscription.id, reason: trimmed },
    } as RejectSubscriptionOutcome;
  });
}
