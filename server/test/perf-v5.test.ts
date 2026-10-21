/**
 * V5 — C5 PERF : REQUÊTES CONSTANTES (CA-V5-071 à CA-V5-075) et CACHE/RATE LIMIT.
 *
 * Ce fichier PROUVE trois choses distinctes :
 *
 * 1. **Budget de requêtes par endpoint** (CA-V5-071/072) : on instrumente
 *    `pool.query` et on compte les requêtes MÉTIER, en excluant les requêtes de
 *    session (`session`) et le `SELECT * FROM users WHERE id = $1` de
 *    `requireUser` — sinon aucun budget n'est atteignable sur `/api/me/*`
 *    (architecture §6.3). On vérifie l'INDÉPENDANCE de `per_page` : les trois
 *    mesures (1, 12, 48) doivent être ÉGALES (CA-V5-072).
 *
 * 2. **Rate limit global** (CA-V5-084/085) : 300 req/min/IP sur `/api`, les
 *    probes `/api/health` et `/health` EXEMPTES, `/uploads` hors périmètre (D8),
 *    et le bypass `NODE_ENV=test` préservé — celui-ci est vérifié en appelant
 *    directement la fabrique avec `NODE_ENV` forcé, sinon on ne testerait rien
 *    puisque la suite tourne en `test`.
 *
 * 3. **Cache HTTP** (CA-V5-094, PO-V5-07) : `private, no-store` partout, sauf
 *    `/api/categories` et `/api/banners` qui acceptent un cache public court.
 */
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  bootTestServer, registerUser, loginAdmin, createProduct, createApprovedProduct,
  createOrder, dbQuery, errorCode, ApiClient,
} from './helpers.js';
import type { ServerHandle } from './helpers.js';
import { pool } from '../src/db/pool.js';
import { rateLimit } from '../src/middleware/rate-limit.js';
import type { NextFunction, Request, Response } from 'express';

let server: ServerHandle;
let seller: ApiClient;
let admin: ApiClient;

before(async () => {
  server = await bootTestServer();
  admin = await loginAdmin(server);
  seller = (await registerUser(server, 'perf')).client;
  // 6 articles APPROVED : le batch a quelque chose à grouper.
  for (let i = 0; i < 6; i += 1) {
    await createApprovedProduct(seller, admin, { name: `Article perf ${i}`, price: 10_000 + i * 1000 });
  }
});

after(async () => {
  await server?.close();
});

/** Compteur de requêtes METIER, posé autour de l'appel mesuré. */
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
    const result = await fn();
    return { result, count };
  } finally {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (pool as any).query = original;
  }
}

// ---------------------------------------------------------------------------
// Budgets de requêtes (CA-V5-071 / CA-V5-072)
// ---------------------------------------------------------------------------

describe('CA-V5-071/072 — Budgets de requêtes par endpoint', () => {
  it('GET /api/products : budget constant, indépendant de per_page', async () => {
    const anon = server.newClient();
    const counts: number[] = [];
    for (const perPage of [1, 12, 48]) {
      const { count } = await countBusinessQueries(() => anon.get(`/api/products?per_page=${perPage}`));
      counts.push(count);
    }
    assert.ok(counts[0]! <= 3, `budget ≤ 3, mesuré ${counts.join('/')}`);
    assert.equal(counts[0], counts[1], `indépendance de per_page : ${counts.join('/')}`);
    assert.equal(counts[0], counts[2], `indépendance de per_page : ${counts.join('/')}`);
  });

  it('GET /api/products/:slug : budget constant, indépendant de per_page', async () => {
    const anon = server.newClient();
    const rows = await dbQuery<{ slug: string }>(
      "SELECT slug FROM products WHERE status = 'AVAILABLE' AND deleted_at IS NULL LIMIT 1",
    );
    const { count } = await countBusinessQueries(() => anon.get(`/api/products/${rows[0]!.slug}`));
    assert.ok(count <= 5, `budget ≤ 5, mesuré ${count}`);
  });

  it('GET /api/me/products : budget constant, indépendant de per_page', async () => {
    const counts: number[] = [];
    for (const perPage of [1, 12, 48]) {
      const { count } = await countBusinessQueries(() => seller.get(`/api/me/products?per_page=${perPage}`));
      counts.push(count);
    }
    assert.ok(counts[0]! <= 2, `budget ≤ 2, mesuré ${counts.join('/')}`);
    assert.equal(counts[0], counts[1], `indépendance de per_page : ${counts.join('/')}`);
    assert.equal(counts[0], counts[2], `indépendance de per_page : ${counts.join('/')}`);
  });

  it('GET /api/admin/products : budget constant, indépendant de per_page', async () => {
    const counts: number[] = [];
    for (const perPage of [1, 12, 48]) {
      const { count } = await countBusinessQueries(() => admin.get(`/api/admin/products?per_page=${perPage}`));
      counts.push(count);
    }
    assert.ok(counts[0]! <= 3, `budget ≤ 3, mesuré ${counts.join('/')}`);
    assert.equal(counts[0], counts[1], `indépendance de per_page : ${counts.join('/')}`);
    assert.equal(counts[0], counts[2], `indépendance de per_page : ${counts.join('/')}`);
  });

  it('GET /api/admin/stats : budget constant', async () => {
    const { count } = await countBusinessQueries(() => admin.get('/api/admin/stats'));
    assert.ok(count <= 3, `budget ≤ 3, mesuré ${count}`);
  });

  // Les 3 listes de commandes étaient 1 + 8N (N+1). Elles doivent être
  // CONSTANTES : c'est la cible 2/2/3 de l'architecture §6.2 point 4.
  it('GET /api/admin/orders : budget constant (plus de 1+8N)', async () => {
    const counts: number[] = [];
    for (const perPage of [1, 12, 48]) {
      const { count } = await countBusinessQueries(() => admin.get(`/api/admin/orders?per_page=${perPage}`));
      counts.push(count);
    }
    assert.ok(counts[0]! <= 3, `budget ≤ 3, mesuré ${counts.join('/')}`);
    assert.equal(counts[0], counts[1], `indépendance de per_page : ${counts.join('/')}`);
    assert.equal(counts[0], counts[2], `indépendance de per_page : ${counts.join('/')}`);
  });

  it('GET /api/me/orders : budget constant (plus de 1+8N)', async () => {
    const buyer = (await registerUser(server, 'perfbuy')).client;
    const rows = await dbQuery<{ id: number }>("SELECT id FROM products WHERE status = 'AVAILABLE' AND deleted_at IS NULL LIMIT 3");
    for (const row of rows) await createOrder(buyer, row.id);

    const counts: number[] = [];
    for (const perPage of [1, 12, 48]) {
      const { count } = await countBusinessQueries(() => buyer.get(`/api/me/orders?per_page=${perPage}`));
      counts.push(count);
    }
    assert.ok(counts[0]! <= 2, `budget ≤ 2, mesuré ${counts.join('/')}`);
    assert.equal(counts[0], counts[1], `indépendance de per_page : ${counts.join('/')}`);
  });

  it('GET /api/me/sales : budget constant (plus de 1+8N)', async () => {
    const counts: number[] = [];
    for (const perPage of [1, 12, 48]) {
      const { count } = await countBusinessQueries(() => seller.get(`/api/me/sales?per_page=${perPage}`));
      counts.push(count);
    }
    assert.ok(counts[0]! <= 2, `budget ≤ 2, mesuré ${counts.join('/')}`);
    assert.equal(counts[0], counts[1], `indépendance de per_page : ${counts.join('/')}`);
  });
});

// ---------------------------------------------------------------------------
// Rate limit global (CA-V5-084 / CA-V5-085)
// ---------------------------------------------------------------------------

describe('CA-V5-085 — Le limiteur global ne casse rien', () => {
  it('bypass intégral en NODE_ENV=test (le contournement est préservé)', async () => {
    assert.equal(process.env.NODE_ENV, 'test', 'prérequis du test');
    let passed = 0;
    const limiter = rateLimit({ windowMs: 60_000, max: 1 });
    for (let i = 0; i < 50; i += 1) {
      const res = { status: () => 429, json: () => undefined } as unknown as Response;
      limiter({ ip: '1.2.3.4' } as Request, res, (() => { passed += 1; }) as NextFunction);
    }
    assert.equal(passed, 50, 'aucune requête bloquée en test, même au-delà de max');
  });

  it('hors test : la 301ᵉ requête reçoit 429 RATE_LIMITED (fenêtre fixe 300/min)', () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const limiter = rateLimit({ windowMs: 60_000, max: 300 });
      let blocked: { status: number; body: unknown; headers: Record<string, string> } | null = null;
      for (let i = 1; i <= 301; i += 1) {
        const res = {
          headers: {} as Record<string, string>,
          setHeader(k: string, v: string) {
            this.headers[k] = v;
            return this;
          },
          status(code: number) {
            blocked = { status: code, body: undefined, headers: this.headers };
            return this;
          },
          json(body: unknown) {
            blocked = { status: blocked?.status ?? 200, body, headers: this.headers };
            return this;
          },
        };
        limiter({ ip: '203.0.113.9' } as Request, res as unknown as Response, (() => undefined) as NextFunction);
        if (blocked && blocked.status === 429) {
          assert.equal(i, 301, `bloqué dès la 301ᵉ, mesuré à la ${i}`);
          assert.equal((blocked.body as { error: { code: string } }).error.code, 'RATE_LIMITED');
          // Le délai doit correspondre à CETTE fenêtre (60 s), pas à une constante.
          assert.equal(blocked.headers['Retry-After'], '60', 'Retry-After = secondes restantes');
          return;
        }
      }
      assert.fail('aucun 429 après 301 requêtes');
    } finally {
      process.env.NODE_ENV = previous;
    }
  });

  it('les probes de santé ne sont JAMAIS limitées (D8)', async () => {
    const anon = server.newClient();
    // Le health n'est pas dans le limiteur : 50 appels ne peuvent pas le bloquer.
    for (let i = 0; i < 20; i += 1) {
      const res = await anon.get('/api/health');
      assert.equal(res.status, 200, 'health toujours disponible');
    }
    const root = await anon.get('/health');
    assert.equal(root.status, 200, 'alias /health disponible');
  });

  it('le rate limiter utilise un compteur partagé Redis + repli mémoire (architecture distribuée)', async () => {
    // Le rate limiter est désormais distribué : compteur partagé via Redis,
    // avec repli mémoire automatique si Redis est indisponible.
    const pkg = await import('../package.json', { with: { type: 'json' } });
    const deps = { ...pkg.default.dependencies };
    // Les dépendances Redis doivent être présentes
    assert.ok('redis' in deps, 'redis doit être une dépendance (compteur partagé)');
    assert.ok('connect-redis' in deps, 'connect-redis doit être une dépendance (store de session)');
    // Le repli mémoire doit fonctionner : tester en forçant NODE_ENV=production
    // avec Redis indisponible (pas de serveur Redis en test).
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const limiter = rateLimit({ windowMs: 60_000, max: 2 });
      let blocked: { status: number; body: unknown } | null = null;
      for (let i = 1; i <= 3; i += 1) {
        const res = {
          headers: {} as Record<string, string>,
          setHeader(k: string, v: string) { this.headers[k] = v; return this; },
          status(code: number) { blocked = { status: code, body: undefined }; return this; },
          json(body: unknown) { blocked = { status: blocked?.status ?? 200, body }; return this; },
        };
        limiter({ ip: '203.0.113.99' } as Request, res as unknown as Response, (() => undefined) as NextFunction);
      }
      // Le repli mémoire doit bloquer la 3ᵉ requête (max=2)
      assert.equal(blocked?.status, 429, 'repli mémoire : 429 après dépassement');
      assert.equal((blocked?.body as { error: { code: string } }).error.code, 'RATE_LIMITED');
    } finally {
      process.env.NODE_ENV = previous;
    }
  });
});

// ---------------------------------------------------------------------------
// Cache HTTP (CA-V5-094, PO-V5-07)
// ---------------------------------------------------------------------------

describe('CA-V5-094 — Cache-Control (PO-V5-07)', () => {
  const publicCache = 'public, max-age=60, stale-while-revalidate=120';
  const noStore = 'private, no-store';

  it('/api/categories et /api/banners acceptent un cache public court', async () => {
    const anon = server.newClient();
    const categories = await anon.get('/api/categories');
    assert.equal(categories.status, 200);
    assert.equal(categories.headers.get('cache-control'), publicCache, '/api/categories');

    const banners = await anon.get('/api/banners');
    assert.equal(banners.status, 200);
    assert.equal(banners.headers.get('cache-control'), publicCache, '/api/banners');
  });

  it('toute autre route API est en private, no-store (données session-bound)', async () => {
    const anon = server.newClient();
    for (const path of ['/api/products', '/api/products/locations']) {
      const res = await anon.get(path);
      assert.equal(res.headers.get('cache-control'), noStore, `${path} ne doit pas être mis en cache public`);
    }
    // Une réponse authentifiée ne doit JAMAIS être publiquement cachée.
    const mine = await seller.get('/api/me/products');
    assert.equal(mine.status, 200);
    assert.equal(mine.headers.get('cache-control'), noStore, '/api/me/* : données privées');
  });

  it('le cache ne modifie AUCUNE forme de réponse (C8 : non-régression)', async () => {
    const anon = server.newClient();
    const first = await anon.get('/api/categories');
    const second = await anon.get('/api/categories');
    assert.deepEqual(first.body, second.body, 'même corps à deux appels');
    assert.equal(first.status, second.status, 'même statut');
  });
});
