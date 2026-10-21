/**
 * ISOLATION DE LA BASE DE TEST — CA-V5-126 / CA-V5-127 (PO-V5-13)
 *
 * Objectif : prouver, par des assertions exécutables, que la suite de tests ne
 * peut JAMAIS écrire sur une base de développement ou de production.
 *
 * Trois garanties indépendantes sont vérifiées :
 *   1. `test/env.ts` ÉCRIT `DATABASE_URL` inconditionnellement (jamais un
 *      `??=` mou) → aucune base de dev ne peut « fuiter » par l'environnement.
 *   2. Le garde-fou `assertSafeToDrop` refuse tout nom de base sans suffixe
 *      « _test » (contrôle négatif : dev, prod, maintenance, URL vide).
 *   3. Au runtime, la connexion applicative pointe réellement sur `revends_test`
 *      et le pool est aligné avec la base de test validée.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { config } from '../src/config.js';
import { assertSafeToDrop, TEST_DB_NAME, testDatabaseUrl } from './bootstrap.js';
import { bootTestServer, dbQuery } from './helpers.js';
import type { ServerHandle } from './helpers.js';

const serverDir = dirname(dirname(fileURLToPath(new URL('./env.ts', import.meta.url))));

/** Nom de base d'une URL PostgreSQL (réplique locale, volontairement triviale). */
function dbNameOf(url: string): string {
  try {
    return decodeURIComponent(new URL(url).pathname.replace(/^\//, ''));
  } catch {
    return '';
  }
}

let server: ServerHandle;

before(async () => {
  server = await bootTestServer();
});

after(async () => {
  await server?.close();
});

describe('CA-V5-127 — garde-fou : aucune base non-test ne peut être détruite', () => {
  it('accepte la base de test (suffixe _test) et renvoie son nom', () => {
    assert.equal(assertSafeToDrop('postgres://u:p@127.0.0.1:5433/revends_test'), 'revends_test');
    assert.equal(assertSafeToDrop(testDatabaseUrl), TEST_DB_NAME);
  });

  it('REFUSE la base de développement, la production, la maintenance et une URL vide', () => {
    const interdits = [
      'postgres://u:p@127.0.0.1:5440/revends', // base de dev/prod
      'postgres://u:p@127.0.0.1:5440/revends_dev',
      'postgres://u:p@127.0.0.1:5432/postgres', // base de maintenance
      '', // URL illisible
    ];
    for (const url of interdits) {
      assert.throws(
        () => assertSafeToDrop(url),
        /BOOTSTRAP TEST REFUSÉ/,
        `une DROP SCHEMA sur « ${url || '(vide)'} » doit être refusée`,
      );
    }
  });
});

describe('CA-V5-126 — isolation effective de l’environnement et du pool', () => {
  it('DATABASE_URL effectif pointe sur une base de test, jamais sur la base de dev', () => {
    const effective = dbNameOf(process.env.DATABASE_URL ?? '');
    assert.equal(effective, TEST_DB_NAME, `DATABASE_URL doit viser ${TEST_DB_NAME}, vu « ${effective} »`);
  });

  it('le pool applicatif (config.databaseUrl) est aligné sur la base de test', () => {
    assert.equal(dbNameOf(config.databaseUrl), TEST_DB_NAME);
  });

  it('l’affectation inconditionnelle de test/env.ts ÉCRASE une DATABASE_URL de dev déjà posée', () => {
    // Contrôle négatif réel : on lance un process fils en injectant une URL de
    // dev dans l'environnement, puis on charge test/env.ts AVANT tout module
    // applicatif. La base finale doit rester la base de test.
    const sortie = execFileSync(
      process.execPath,
      ['--import', 'tsx', '--import', './test/env.ts', '-e', 'process.stdout.write(process.env.DATABASE_URL ?? "")'],
      {
        cwd: serverDir,
        env: { ...process.env, DATABASE_URL: 'postgres://revends:dev@127.0.0.1:5440/revends' },
        encoding: 'utf8',
      },
    ).trim();
    assert.equal(dbNameOf(sortie), TEST_DB_NAME, `base effective « ${dbNameOf(sortie)} » (URL : ${sortie})`);
    assert.notEqual(dbNameOf(sortie), 'revends', 'la base de dev ne doit jamais être héritée');
  });
});

describe('CA-V5-126 — au runtime, la session est bien sur la base de test', () => {
  it('current_database() vaut revends_test', async () => {
    const rows = await dbQuery<{ db: string }>('SELECT current_database() AS db');
    assert.equal(rows[0]?.db, TEST_DB_NAME);
  });
});
