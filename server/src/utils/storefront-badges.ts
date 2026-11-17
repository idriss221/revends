import { pool, type Queryable } from '../db/pool.js';

/**
 * V8-D3 — Badges de palier, dérivés en lecture, JAMAIS stockés (CA-V8-023).
 *
 * Règle unique : `status='ACTIVE' AND ends_at > now()` sur l'abonnement du
 * vendeur, quel que soit le palier — révocation paresseuse à l'échéance,
 * sans job ni écriture (CA-V8-021/024/031).
 *
 * Deux usages :
 *  - `storeBadge(sellerId)` : lecture unitaire (fiche produit, tests) ;
 *  - fragments SQL (`BADGE_LATERAL_JOIN`, `BADGE_CASE_SQL`, `BADGE_RANK_SQL`)
 *    composables dans les requêtes catalogue / fiche / boutique — jamais de N+1
 *    (même pattern que le `EXISTS(vitrine)`).
 */

export type StorefrontBadge = 'boutique' | 'verifiee' | 'pro' | null;

/** Fragment de jointure (à ajouter dans le FROM …) — corrélé sur `p.owner_id`. */
export const BADGE_LATERAL_JOIN = `
  LEFT JOIN LATERAL (
    SELECT sp.name AS plan_name
      FROM seller_subscriptions s
      JOIN subscription_plans sp ON sp.id = s.plan_id
     WHERE s.seller_id = p.owner_id AND s.status = 'ACTIVE' AND s.ends_at > now()
     LIMIT 1
  ) badge ON true`;

/** Colonne ajoutée au SELECT : `pro | verifiee | boutique | NULL`. */
export const BADGE_CASE_SQL = `CASE badge.plan_name
       WHEN 'Atelier'    THEN 'pro'
       WHEN 'Boutique'   THEN 'verifiee'
       WHEN 'Découverte' THEN 'boutique'
       ELSE NULL END AS seller_badge`;

/**
 * Ordre du tri PAR DÉFAUT (V8-D4) : Atelier (1) → Boutique (2) → Découverte
 * (3) → Vitrine → le reste. `ELSE 4` laisse la place au rang Vitrine
 * (EXISTS vitrine) composé par l'appelant — les non-payants retombent à 4.
 */
export const BADGE_RANK_SQL = `CASE badge.plan_name
       WHEN 'Atelier'    THEN 1
       WHEN 'Boutique'   THEN 2
       WHEN 'Découverte' THEN 3
       ELSE 4 END`;

/**
 * Badge d'UN vendeur (fiche produit). Retourne `null` si aucun ACTIVE valide.
 * Dans `createProduct`, la décision passe par `selectActiveEligibleSubscription`
 * (lecture dans la transaction), pas par cette fonction.
 */
export async function storeBadge(sellerId: number, q: Queryable = pool): Promise<StorefrontBadge> {
  const { rows } = await q.query<{ name: string }>(
    `SELECT sp.name
       FROM seller_subscriptions s
       JOIN subscription_plans sp ON sp.id = s.plan_id
      WHERE s.seller_id = $1 AND s.status = 'ACTIVE' AND s.ends_at > now()
      LIMIT 1`,
    [sellerId],
  );
  return badgeFromPlanName(rows[0]?.name);
}

/** Mapping palier → badge (source unique, partagée par la lecture SQL et les tests). */
export function badgeFromPlanName(name: string | null | undefined): StorefrontBadge {
  if (name === 'Atelier') return 'pro';
  if (name === 'Boutique') return 'verifiee';
  if (name === 'Découverte') return 'boutique';
  return null;
}
