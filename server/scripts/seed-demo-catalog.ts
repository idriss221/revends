import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { pool, closePool } from '../src/db/pool.js';

/**
 * Applique le catalogue de démonstration (`scripts/seed-data/*.sql`) à la base
 * unique de ReVends (pool PostgreSQL), via le même mécanisme que `migrate()`.
 *
 * Pourquoi un script et pas une migration : `migrate()` rejoue tout
 * `migrations/`, y compris dans la base de TEST remise à zéro avant chaque
 * suite. Y déposer un seed de données polluait chaque run (mesuré : +25
 * articles démo dans `revends_test`, ce qui cassait les assertions de
 * comptage du catalogue). Le seed est donc ici, explicitement invocable.
 *
 * Usage : `npm run seed:demo` — idempotent, rejouable sans risque.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SEED_DIR = path.resolve(HERE, 'seed-data');

async function seedDatabase(sql: string, file: string): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');
    console.log(`  ✓ ${file}`);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw new Error(`Échec du seed ${file} : ${(err as Error).message}`);
  } finally {
    client.release();
  }
}

async function main(): Promise<void> {
  const files = (await readdir(SEED_DIR)).filter((f) => f.endsWith('.sql')).sort();
  if (files.length === 0) {
    console.error(`Aucun fichier .sql dans ${SEED_DIR}`);
    process.exit(1);
  }

  console.log(`[seed] ${files.length} fichier(s) à appliquer : ${files.join(', ')}`);
  try {
    for (const file of files) {
      const sql = await readFile(path.join(SEED_DIR, file), 'utf8');
      await seedDatabase(sql, file);
    }
    console.log('[seed] catalogue de démonstration en place.');
  } finally {
    await closePool().catch(() => undefined);
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
