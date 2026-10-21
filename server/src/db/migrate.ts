import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { config } from '../config.js';
import { pool } from './pool.js';
import { logger, describeError } from '../utils/logger.js';

/**
 * Exécute les fichiers .sql de `config.migrationsDir` dans l'ordre
 * lexicographique, une seule fois chacun (table schema_migrations).
 *
 * Architecture mono-Postgres : migrations sur le pool unique. Un verrou
 * consultatif PostgreSQL (`pg_advisory_lock`) empêche plusieurs instances
 * de migrer en même temps.
 */
export async function migrate(): Promise<string[]> {
  if (!config.runMigrations) {
    logger.info('migration ignorée', { reason: 'RUN_MIGRATIONS=false' });
    return [];
  }
  return migrateDatabase();
}

async function migrateDatabase(): Promise<string[]> {
  const lockKey = 123456789; // hashtext('revends:migrate') simplifié
  const lockClient = await pool.connect();
  let locked = false;

  try {
    const res = await lockClient.query<{ locked: boolean }>(
      'SELECT pg_try_advisory_lock($1) AS locked',
      [lockKey],
    );
    locked = res.rows[0]?.locked === true;
    if (!locked) {
      logger.info('verrou de migration déjà détenu, attente…');
      await lockClient.query('SELECT pg_advisory_lock($1)', [lockKey]);
      locked = true;
    }

    await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      filename VARCHAR(255) PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);

    const files = (await readdir(config.migrationsDir))
      .filter((f) => f.endsWith('.sql'))
      .sort();

    const { rows } = await pool.query<{ filename: string }>(
      'SELECT filename FROM schema_migrations',
    );
    const done = new Set(rows.map((r) => r.filename));

    const applied: string[] = [];
    for (const file of files) {
      if (done.has(file)) continue;
      const sql = await readFile(path.join(config.migrationsDir, file), 'utf8');
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw new Error(`Échec de la migration ${file} : ${(err as Error).message}`);
      } finally {
        client.release();
      }
      applied.push(file);
      logger.info('migration appliquée', { file });
    }
    return applied;
  } finally {
    if (locked) {
      await lockClient
        .query('SELECT pg_advisory_unlock($1)', [lockKey])
        .catch((e) => {
          logger.error('libération du verrou de migration échouée', { errorMessage: (e as Error).message });
        });
    }
    lockClient.release();
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  migrate()
    .then((applied) => {
      if (applied.length === 0) logger.info('aucune nouvelle migration à appliquer');
      else logger.info('migrations appliquées', { count: applied.length });
      process.exit(0);
    })
    .catch((err) => {
      logger.error('migration échouée', describeError(err));
      process.exit(1);
    });
}
