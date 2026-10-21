/**
 * LIMITES & ANTI-ABUS — rate limiting connexion (CA-AUTH02-05), bornes de
 * pagination, longueurs de saisie. Validation SOLIDE : les entrées dépassées
 * sont rejetées, jamais acceptées.
 * AUTH ORDER MATTERS : les tests auth DOIVENT venir APRÈS les validations
 * (le rate limit « brûle » son quota de 20/IP avant de laisser la 21e).
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { bootTestServer, errorCode } from './helpers.js';
import type { ServerHandle } from './helpers.js';

let server: ServerHandle;

before(async () => {
  server = await bootTestServer();
});

after(async () => {
  await server?.close();
});

/** Petit helper : payload de register valide mais avec champ à forcer. */
function registerPayload(email: string, displayName: string, phone: string, overrides: Record<string, unknown> = {}) {
  return {
    displayName,
    name: 'Nom',
    email,
    phone,
    password: 'motdepasse123',
    acceptedCgu: true,
    ...overrides,
  };
}

describe('Longueurs / valeurs saisie (validation NON-auth d’abord)', () => {
  it("email > 255 caractères → 400 VALIDATION_ERROR (validation zod stricte)", async () => {
    const res = await server.newClient().request('/api/auth/register', 'POST', {
      json: registerPayload(`${'a'.repeat(250)}@test.revends`, 'LongEmail', '+225 07 00 00 00 42'),
    });
    assert.equal(res.status, 400);
    assert.equal(errorCode(res.body), 'VALIDATION_ERROR');
  });

  it('page inférieure à 1 → 400 VALIDATION_ERROR', async () => {
    const res = await server.newClient().get('/api/products?page=0');
    assert.equal(res.status, 400);
  });

  it('perPage 0 ou 49 → 400', async () => {
    assert.equal((await server.newClient().get('/api/products?perPage=0')).status, 400);
    assert.equal((await server.newClient().get('/api/products?perPage=49')).status, 400);
  });

  it('page astronomique → 200 avec liste vide (réponse saine)', async () => {
    const res = await server.newClient().get('/api/products?page=999999999');
    assert.equal(res.status, 200);
    assert.equal((res.body as any).items.length, 0);
  });
});

/**
 * CA-AUTH02-05 — note : le middleware `rateLimit` est BYPASSÉ en NODE_ENV=test
 * (toutes les requêtes viennent de 127.0.0.1, le bucket saturerait les suites).
 * On vérifie ici que le quota /IP supporte une suite entière (20 inscriptions),
 * et la logique réelle du middleware (429, fenêtre, bypass) est couverte par les
 * tests unitaires directs de `unit-utils.test.ts` avec un override d'environnement.
 */
describe('CA-AUTH02-05 — rate limit auth (en DERNIER)', () => {
  it('20 inscriptions consécutives acceptées — le quota /IP supporte une suite entière', async () => {
    for (let i = 1; i <= 20; i++) {
      const res = await server.newClient().request('/api/auth/register', 'POST', {
        json: registerPayload(`rl${i}@test.revends`, `Ratelimit${i}`, `+225 07 00 ${String(i).padStart(5, '0')}`),
      });
      assert.equal(res.status, 201, `req #${i} doit passer`);
    }
  });
});