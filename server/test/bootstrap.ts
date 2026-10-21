/**
 * Bootstrap de la BDD de test : base dédiée `revends_test`, DDL FRAIS à chaque
 * fichier de test (DROP SCHEMA public CASCADE → migrations → seed admin).
 * Aucun test ne partage d'état hors de son propre run.
 *
 * ⚠️ CA-V5-127 — le `DROP SCHEMA public CASCADE` est la seule opération
 * DESTRUCTRICE de la suite. Elle est doublement protégée :
 *   1. `assertSafeToDrop()` refuse (throw) si la base visée ne porte pas le
 *      suffixe de test documenté (`_test`). Un run échoue ; il ne détruit rien.
 *   2. La base visée est `TEST_DATABASE_URL` (calculée par `test/env.ts`),
 *      jamais `config.databaseUrl` déduite d'un `.env`.
 */
import { rm, mkdir } from 'node:fs/promises';
import { Client } from 'pg';
import { config } from '../src/config.js';
import { migrate } from '../src/db/migrate.js';
import { seedAdmin } from '../src/db/seed.js';
import { TEST_DB_NAME, testDatabaseUrl, testMaintenanceUrl } from './env.js';

/** Suffixes de base de test acceptés par le garde-fou (documentés, §CA-V5-127). */
const TEST_DB_SUFFIX = /_test$/;

export { TEST_DB_NAME, testDatabaseUrl };

/** Nom de la base visée par une URL PostgreSQL (vide si l'URL est illisible). */
function databaseNameOf(url: string): string {
  try {
    return decodeURIComponent(new URL(url).pathname.replace(/^\//, ''));
  } catch {
    return '';
  }
}

/**
 * Garde-fou fail-fast : refuse tout `DROP SCHEMA` hors base de test.
 * Le message nomme la base VISÉE et la base ATTENDUE (exigence CA-V5-127 §2).
 */
export function assertSafeToDrop(url: string): string {
  const name = databaseNameOf(url);
  if (name && TEST_DB_SUFFIX.test(name)) return name;
  throw new Error(
    'BOOTSTRAP TEST REFUSÉ — aucune donnée n\'a été détruite.\n' +
      `  Base visée par le DROP SCHEMA : ${name || '(URL illisible)'} (${url})\n` +
      `  Base attendue               : ${TEST_DB_NAME} (nom terminé par « _test »)\n` +
      '  Les tests ReVends ne peuvent JAMAIS s\'exécuter sur une base de dev ou de production.\n' +
      '  Correctif : lancer la suite via `npm test` (qui pré-charge test/env.ts), ou\n' +
      '  fixer TEST_DATABASE_URL sur une base de test explicitly.',
  );
}

function maintenanceClient(): Client {
  return new Client({ connectionString: testMaintenanceUrl, connectionTimeoutMillis: 8000 });
}

/**
 * 1. PostgreSQL doit tourner (docker compose up -d dans server/).
 * 2. Crée `revends_test` si absente.
 * 3. DROP SCHEMA public CASCADE → DDL frais (base de TEST, vérifiée par le garde).
 * 4. Migrations + seed admin.
 */
export async function resetDatabaseAndSeed(): Promise<{ adminEmail: string; adminPassword: string }> {
  // Sérialisation : plusieurs `before` de suites sœurs peuvent s'exécuter en
  // parallèle (accueil-v3.test.ts en a 5 imbriqués + 1 global). Sans cette
  // file d'attente, deux resets se chevauchent et l'un échoue sur
  // « schema "public" does not exist » : le DROP de l'un tombe après le
  // DROP de l'autre, qui n'a pas encore rejoué le CREATE.
  const run = resetQueue.then(doReset, doReset);
  resetQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

/** Chaîne de sérialisation des resets (jamais rejetée : on repart à chaque fois). */
let resetQueue: Promise<unknown> = Promise.resolve();

async function doReset(): Promise<{ adminEmail: string; adminPassword: string }> {
  // Garde-fou AVANT toute connexion : c'est la seule opération destructrice.
  const target = assertSafeToDrop(testDatabaseUrl);

  const admin = maintenanceClient();
  try {
    await admin.connect();
  } catch (err) {
    throw new Error(
      `Impossible de joindre PostgreSQL (${admin.connectionParameters.host}:${admin.connectionParameters.port}). ` +
        `Démarrez la base avec : cd server && docker compose up -d --wait`,
      { cause: err },
    );
  }

  const exists = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [target]);
  if (exists.rowCount === 0) {
    await admin.query(`CREATE DATABASE ${target}`);
  }
  await admin.end();

  // Le pool de l'application a été construit sur `config.databaseUrl` : on exige
  // qu'il pointe exactement sur la même base que celle validée par le garde,
  // sinon migrations/seed partiraient ailleurs (incohérence silencieuse).
  const poolTarget = databaseNameOf(config.databaseUrl);
  if (poolTarget !== target) {
    throw new Error(
      'BOOTSTRAP TEST REFUSÉ — pool applicatif et base de test désalignés.\n' +
        `  Pool (config.databaseUrl) : ${poolTarget || '(inconnue)'} (${config.databaseUrl})\n` +
        `  Base de test attendue     : ${target}\n` +
        '  Cause probable : test/env.ts n\'a pas été évalué avant config.ts.\n' +
        '  Correctif : passer par `npm test` (pré-charge --import ./test/env.ts).',
    );
  }

  const db = new Client({ connectionString: testDatabaseUrl, connectionTimeoutMillis: 8000 });
  await db.connect();
  // IF EXISTS : rend le reset rejouable même si un run précédent a été
  // interrompu entre le DROP et le CREATE.
  await db.query('DROP SCHEMA IF EXISTS public CASCADE');
  await db.query('CREATE SCHEMA public');
  await db.end();

  // Uploads isolés, purgés à chaque run.
  await rm(config.uploadDir, { recursive: true, force: true });
  await mkdir(config.uploadDir, { recursive: true });

  const applied = await migrate();
  if (applied.length === 0) {
    throw new Error('Les migrations n ont rien appliqué — schéma non frais. Abort.');
  }
  const seeded = await seedAdmin();
  return { adminEmail: seeded.email, adminPassword: process.env.ADMIN_PASSWORD ?? '' };
}
