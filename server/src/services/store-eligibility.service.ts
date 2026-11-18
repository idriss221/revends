import { pool, type Queryable } from '../db/pool.js';

/**
 * V8-D2 / PO-V8-01 retenu — Éligibilité à la publication directe, DÉRIVÉE en
 * lecture, jamais stockée.
 *
 * Double verrou : (1) abonnement `ACTIVE` + `ends_at > now()` (borne à
 * l'instant T) ; (2) numéro `+221 7XXXXXXXX` (format strict Sénégal,
 * `016_phone_strict_9_chiffres.sql`).
 *
 * Double usage :
 *  - `getStoreEligibility(sellerId)` : lecture simple, mise en cache 30 s
 *    (bornée, jamais utilisée dans un chemin transactionnel d'écriture) ;
 *  - `getStoreEligibility(sellerId, client)` : lecture dans la transaction
 *    (AUCUN cache — utilisée par `createProduct`, P4/P11).
 */

export interface StoreEligibility {
  eligible: boolean;
  subscriptionId: number | null;
}

const CACHE_TTL_MS = 30_000;
const CACHE_MAX_ENTRIES = 500;
const cache = new Map<number, { at: number; value: StoreEligibility }>();

/** Vide le cache — réservé aux tests (isolation). */
export function clearEligibilityCache(): void {
  cache.clear();
}

export async function getStoreEligibility(sellerId: number, q?: Queryable): Promise<StoreEligibility> {
  if (q) return queryEligibility(q, sellerId);
  const cached = cache.get(sellerId);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.value;
  const value = await queryEligibility(pool, sellerId);
  if (cache.size >= CACHE_MAX_ENTRIES) cache.clear();
  cache.set(sellerId, { at: Date.now(), value });
  return value;
}

async function queryEligibility(q: Queryable, sellerId: number): Promise<StoreEligibility> {
  const { rows } = await q.query<{ id: number }>(
    `SELECT s.id AS id
       FROM seller_subscriptions s
       JOIN users u ON u.id = s.seller_id
      WHERE s.seller_id = $1
        AND s.status = 'ACTIVE'
        AND s.ends_at > now()
        AND u.phone ~ '^\\+2217[0-9]{8}$'
      LIMIT 1`,
    [sellerId],
  );
  const row = rows[0];
  return row ? { eligible: true, subscriptionId: row.id } : { eligible: false, subscriptionId: null };
}
