import pg from 'pg';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

// ---------------------------------------------------------------------------
// Pool PostgreSQL UNIQUE — source de vérité unique.
//
// L'ancienne architecture (sharding par `user.id` + réplication primaire/
// réplica) a été retirée : elle était incohérente (les écritures d'une table de
// référence n'allaient que sur le shard 0 alors que les lectures pouvaient
// router vers le shard 1 → sessions/commandes « orphelines » une fois sur deux).
// Un seul serveur PostgreSQL + un pool borné est plus simple, plus fiable et
// suffisant : la montée en charge se fait verticalement puis par répliquas de
// LECTURE le jour où le besoin est réel et mesuré (voir docs).
// ---------------------------------------------------------------------------

// Les colonnes BIGINT (OID 20) sont renvoyées en `number` et non en `string`.
// Les montants en FCFA restent dans la plage sûre de `Number` (< 2^53).
pg.types.setTypeParser(20, (value) => Number(value));

export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  max: config.pgPoolMax,
  // Ferme les connexions inactives pour ne pas saturer le serveur.
  idleTimeoutMillis: 30_000,
  // Échec rapide si la base est injoignable (plutôt qu'une requête qui pend).
  connectionTimeoutMillis: 10_000,
  // Tue côté serveur toute requête qui dépasse le budget → jamais d'endpoint
  // bloqué indéfiniment par un `seq scan` pathologique ou un verrou oublié.
  statement_timeout: config.dbStatementTimeoutMs,
  // Tue une transaction laissée ouverte (client non relâché) → évite
  // l'épuisement du pool par « idle in transaction ».
  idle_in_transaction_session_timeout: config.dbIdleTxTimeoutMs,
  // Visible dans `pg_stat_activity` pour l'observabilité.
  application_name: 'revends-api',
  ...(config.dbSsl ? { ssl: { rejectUnauthorized: false } } : {}),
});

// Une connexion de fond qui tombe (coupure réseau, redémarrage PG) ne doit pas
// faire crasher le process : on journalise et le pool en recrée une à la demande.
pool.on('error', (err) => {
  logger.error('erreur de connexion de fond PostgreSQL', { errorMessage: err.message });
});

export type DbClient = pg.PoolClient;
export type Queryable = Pick<DbClient, 'query'>;

/**
 * Exécute une requête sur le pool unique. Remplace les anciens
 * `queryShard(shard, mode, …)` / `queryByKey(key, mode, …)` : il n'y a plus de
 * shard ni de mode (un seul nœud en écriture).
 */
export function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  sql: string,
  params?: readonly unknown[],
): Promise<pg.QueryResult<T>> {
  return pool.query<T>(sql, params as unknown[] | undefined);
}

/** Ferme proprement le pool (arrêt du serveur, tests). */
export async function closePool(): Promise<void> {
  await pool.end();
}
