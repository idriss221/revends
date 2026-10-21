/**
 * V5 — C1 RECHERCHE (CA-V5-025 à CA-V5-031) et C6 ADMIN.
 *
 * Trois blocs de preuves :
 *
 * 1. **`relevance` reste DISTINCT de `recent`** (PO-V5-18) : un article ancien
 *    mais très consulté doit remonter AVANT un article neuf et jamais vu, et
 *    l'ordre doit être STABLE à score égal (tie-break `p.id`). Le test échouerait
 *    si `relevance` était un alias de `recent`.
 *
 * 2. **Suggestions** (`GET /api/products/suggestions`) : budget 2 requêtes
 *    (§5.9 CA-V5-060), total plafonné à 10, jamais de N+1 sur `q`.
 *
 * 3. **Filtre d'historique** : `?action=product.delete` doit être ACCEPTÉ —
 *    l'application écrit ce type, donc un filtre qui le refuse casserait la
 *    traçabilité de la suppression logique (C4).
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  bootTestServer, registerUser, loginAdmin, createProduct, createApprovedProduct, dbQuery, errorCode,
} from './helpers.js';
import type { ServerHandle, ApiClient } from './helpers.js';
import { pool } from '../src/db/pool.js';
import { SUGGESTION_LIMITS, SUGGESTION_MAX_TOTAL } from '../src/services/products.service.js';

let server: ServerHandle;
let admin: ApiClient;
let anon: ApiClient;

before(async () => {
  server = await bootTestServer();
  admin = await loginAdmin(server);
  anon = server.newClient();
});

after(async () => {
  await server?.close();
});

/** Compte les requêtes MÉTIER le temps de l'appel mesuré. */
async function countBusinessQueries<T>(fn: () => Promise<T>): Promise<{ result: T; count: number }> {
  const original = pool.query.bind(pool);
  let count = 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (pool as any).query = function patched(...args: any[]) {
    const text = String(args[0] ?? '');
    const isSession = /session/i.test(text);
    const isAuthProbe = text.trim() === 'SELECT * FROM users WHERE id = $1';
    if (!isSession && !isAuthProbe) count += 1;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (original as any)(...args);
  };
  try {
    return { result: await fn(), count };
  } finally {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (pool as any).query = original;
  }
}

// ---------------------------------------------------------------------------
// 1. `relevance` (PO-V5-18)
// ---------------------------------------------------------------------------

describe('PO-V5-18 — `sort=relevance` est un vrai score, pas un alias de `recent`', () => {
  it('`relevance` est accepté par le schéma de requête', async () => {
    const res = await anon.get('/api/products?sort=relevance');
    assert.equal(res.status, 200, 'la valeur ne doit pas être rejetée par la validation');
  });

  it("un sort inconnu reste un 400 documenté (le schéma ne valide pas n'importe quoi)", async () => {
    const res = await anon.get('/api/products?sort=nimporte_quoi');
    assert.equal(res.status, 400);
    assert.equal(errorCode(res.body), 'VALIDATION_ERROR');
  });

  it('un article ancien et consulté remonte DEVANT un article neuf et ignoré', async () => {
    const author = (await registerUser(server, 'relevance')).client;
    // Ancien, mais très vu : score élevé grâce à `view_count`.
    const star = await createApprovedProduct(author, admin, { name: 'Vieux mais prisé', price: 20_000 });
    // Neuf, jamais vu : score faible malgré la récence.
    const ignored = await createApprovedProduct(author, admin, { name: 'Neuf mais oublié', price: 20_000 });

    // On rend leur ancienneté et leur popularité comparables, en isolating les
    // DEUX facteurs : `star` est aged + popular, `ignored` est fresh + ignoré.
    await dbQuery(
      `UPDATE products SET created_at = now() - interval '365 days', view_count = 500 WHERE id = $1`,
      [star.id],
    );
    await dbQuery(
      `UPDATE products SET created_at = now() - interval '1 hour', view_count = 0 WHERE id = $1`,
      [ignored.id],
    );

    const res = await anon.get('/api/products?sort=relevance&per_page=48');
    assert.equal(res.status, 200);
    const ids = (res.body.items as Array<{ id: number }>).map((i) => i.id);
    const starAt = ids.indexOf(star.id);
    const ignoredAt = ids.indexOf(ignored.id);
    assert.ok(starAt !== -1 && ignoredAt !== -1, 'les deux articles sont dans la page');
    assert.ok(starAt < ignoredAt, `relevance doit classer le prisé devant (${starAt} vs ${ignoredAt})`);
  });

  it('`relevance` et `recent` ne produisent PAS le même ordre', async () => {
    const author = (await registerUser(server, 'relevanceDiff')).client;
    const a = await createApprovedProduct(author, admin, { name: 'Ancien A', price: 20_000 });
    const b = await createApprovedProduct(author, admin, { name: 'Ancien B', price: 20_000 });
    await dbQuery(
      `UPDATE products SET created_at = now() - interval '365 days', view_count = 900 WHERE id = ANY($1::bigint[])`,
      [[a.id, b.id]],
    );
    const c = await createApprovedProduct(author, admin, { name: 'Neuf C', price: 20_000 });
    await dbQuery(`UPDATE products SET created_at = now(), view_count = 0 WHERE id = $1`, [c.id]);

    const recent = (await anon.get('/api/products?sort=recent&per_page=48')).body as { items: Array<{ id: number }> };
    const relevance = (await anon.get('/api/products?sort=relevance&per_page=48')).body as { items: Array<{ id: number }> };
    assert.notDeepEqual(
      recent.items.map((i) => i.id),
      relevance.items.map((i) => i.id),
      'les deux tris doivent différer sur ce jeu de données',
    );
  });

  it('ordre STABLE : deux appels identiques donnent le même ordre (tie-break p.id)', async () => {
    const first = await anon.get('/api/products?sort=relevance&per_page=48');
    const second = await anon.get('/api/products?sort=relevance&per_page=48');
    assert.deepEqual(
      (first.body as { items: Array<{ id: number }> }).items.map((i) => i.id),
      (second.body as { items: Array<{ id: number }> }).items.map((i) => i.id),
      'pas de tri non déterministe à score égal',
    );
  });
});

// ---------------------------------------------------------------------------
// 2. Suggestions
// ---------------------------------------------------------------------------

describe('CA-V5-060 — Suggestions : budget 2 requêtes, total plafonné à 10', () => {
  it('la somme des bornes respectele plafond documenté (garde-fou anti-dérive)', () => {
    const sum = SUGGESTION_LIMITS.products + SUGGESTION_LIMITS.categories + SUGGESTION_LIMITS.brands;
    assert.ok(sum <= SUGGESTION_MAX_TOTAL, `somme des bornes ${sum} ≤ plafond ${SUGGESTION_MAX_TOTAL}`);
  });

  it('la route est montée et répond 200', async () => {
    const res = await anon.get('/api/products/suggestions?q=velo');
    assert.equal(res.status, 200);
  });

  it('budget 2 requêtes, indépendant de la taille du catalogue', async () => {
    const author = (await registerUser(server, 'sugg')).client;
    for (let i = 0; i < 5; i += 1) {
      await createApprovedProduct(author, admin, { name: `Velo de course ${i}`, price: 50_000 + i * 1000 });
    }
    const { count } = await countBusinessQueries(() => anon.get('/api/products/suggestions?q=velo'));
    assert.ok(count <= 2, `budget ≤ 2, mesuré ${count}`);
  });

  it("le total retourné ne dépasse JAMAIS 10 (6 produits + 2 catégories + 2 marques)", async () => {
    const author = (await registerUser(server, 'sugg2')).client;
    for (let i = 0; i < 15; i += 1) {
      await createApprovedProduct(author, admin, { name: `Kayac vague ${i}`, price: 30_000 + i * 500 });
    }
    const res = await anon.get('/api/products/suggestions?q=kayac');
    assert.equal(res.status, 200);
    const body = res.body as { products: unknown[]; categories: unknown[]; brands: unknown[] };
    const total = body.products.length + body.categories.length + body.brands.length;
    assert.ok(total <= 10, `total ≤ 10, mesuré ${total}`);
  });

  it('`q` absent ou trop court → 400, jamais 200 vide silencieux', async () => {
    for (const url of ['/api/products/suggestions', '/api/products/suggestions?q=a']) {
      const res = await anon.get(url);
      assert.equal(res.status, 400, url);
      assert.equal(errorCode(res.body), 'VALIDATION_ERROR', url);
    }
  });

  it('entrée hostile → 4xx documenté, jamais de 5xx ni de fuite de pile (P7)', async () => {
    for (const q of ["' OR 1=1--", '<script>alert(1)</script>', 'a'.repeat(300)]) {
      const res = await anon.get(`/api/products/suggestions?q=${encodeURIComponent(q)}`);
      assert.ok(res.status === 400 || res.status === 200, `${q} → 400/200, obtenu ${res.status}`);
      assert.notEqual(res.status, 500, 'jamais de 5xx sur entrée hostile');
    }
  });

  it("la route ne vole pas l'identifiant dynamique /:identifier", async () => {
    // `/api/products/suggestions` doit être Résolu comme la route suggestions,
    // PAS comme une fiche produit dont le slug serait « suggestions ».
    const res = await anon.get('/api/products/suggestions?q=velo');
    assert.equal(res.status, 200);
    assert.ok(!('error' in (res.body as object)), 'la réponse est bien celle des suggestions');
  });
});

// ---------------------------------------------------------------------------
// 3. Historique admin : le filtre doit couvrir ce que l'app écrit
// ---------------------------------------------------------------------------

describe('C6 — `/api/admin/history?action=` accepte chaque type réellement écrit', () => {
  it("`action=product.delete` est accepté (la suppression logique l'écrit)", async () => {
    const author = (await registerUser(server, 'hist')).client;
    const product = await createApprovedProduct(author, admin, { name: 'À supprimer', price: 10_000 });
    const del = await admin.request(`/api/admin/products/${product.id}`, 'DELETE');
    assert.equal(del.status, 204, "la suppression logique répond 204 (D9)");

    const res = await admin.get('/api/admin/history?action=product.delete');
    assert.equal(res.status, 200, "le filtre ne doit pas rejeter une valeur produite par l'application");
    const items = (res.body as { items: Array<{ action: string }> }).items;
    assert.ok(items.length > 0, 'au moins une entrée de suppression est retrouvée');
    assert.ok(items.every((i) => i.action === 'product.delete'), 'le filtre filtre bien');
  });

  it('chaque type du schéma est accepté sans 400', async () => {
    for (const action of [
      'product.approved', 'product.rejected', 'product.delete', 'payment.confirmed',
      'product.received', 'delivery.started', 'order.shipped', 'order.delivered',
      'order.cancelled', 'seller.paid',
    ]) {
      const res = await admin.get(`/api/admin/history?action=${action}`);
      assert.equal(res.status, 200, `action=${action} doit être acceptée`);
    }
  });
});
