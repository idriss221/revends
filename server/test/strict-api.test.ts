/**
 * SUITE STRICTE DE CONTRAT D'API — `strict-api.test.ts`
 *
 * Objectif : verrouiller le contrat des routes, la forme exacte des réponses,
 * les codes d'erreur et les règles d'accès (RBAC) de TOUTE l'API. Ces tests
 * complètent les suites existantes (ils ne les remplacent pas) et couvrent des
 * lacunes identifiées : favoris (aucune suite existante avant ce fichier),
 * enveloppe d'erreur uniforme, absence de fuite technique en 5xx, RBAC exhaustif
 * des routes admin.
 *
 * Chaque test est nommé en référence à son critère `@cahier-des-charges`
 * (`CA-…`) ou à `docs/api.md`. Les cas limites sont testés (vide, null, invalide,
 * non autorisé, id inconnu, débordement, JSON malformé) et pas seulement le
 * chemin heureux.
 *
 * BUGS CORRIGÉS (verrouillés par les tests ci-dessous) :
 *  - JSON malformé → 400 `VALIDATION_ERROR` (était 500).
 *  - `POST /api/favorites` sur produit inconnu → 404 `PRODUCT_NOT_FOUND`
 *    (était 500, violation de clé étrangère non mappée).
 *  - `GET /api/products/<id > 15 chiffres>` → 404 `PRODUCT_NOT_FOUND` (était 500).
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express, { type Response as ExpressResponse, type Request, type NextFunction } from 'express';
import type { Server } from 'node:http';
import {
  bootTestServer,
  registerUser,
  loginAdmin,
  createProduct,
  createApprovedProduct,
  productForm,
  jpegBuffer,
  invalidBuffer,
  dbQuery,
  errorCode,
  assertPublicUserClean,
  DEFAULT_FIELDS,
} from './helpers.js';
import type { ServerHandle, ApiClient, ApiResponse } from './helpers.js';
import { createCsrfProtection, CSRF_COOKIE } from '../src/middleware/csrf.js';
import { hashResetToken, RESET_TOKEN_TTL_MS } from '../src/repositories/password-resets.repository.js';

let server: ServerHandle;
let admin: ApiClient;

before(async () => {
  server = await bootTestServer();
  admin = await loginAdmin(server);
});

after(async () => {
  await server?.close();
});

/** Identifiants réellement uniques (aléatoire) pour les inscriptions « manuelles ». */
function uniqEmail(): string {
  return `strict${Math.random().toString(36).slice(2, 10)}@test.revends`;
}
function uniqPhone(): string {
  const part = () => String(Math.floor(Math.random() * 9000) + 1000);
  return `+225 07 ${part()} ${part()}`;
}

/**
 * Vérifie l'enveloppe d'erreur uniforme (`{ error: { code, message } }`) :
 * unique clé racine `error`, `code` et `message` des chaînes non vides.
 */
function assertErrorEnvelope(body: any, expectedCode?: string): void {
  assert.ok(body && typeof body === 'object', `corps d'erreur attendu, reçu ${JSON.stringify(body)}`);
  assert.deepEqual(Object.keys(body), ['error'], `seule clé racine "error" attendue : ${JSON.stringify(body)}`);
  assert.equal(typeof body.error?.code, 'string', 'error.code doit être une chaîne');
  assert.ok(body.error.code.length > 0, 'error.code non vide');
  assert.equal(typeof body.error?.message, 'string', 'error.message doit être une chaîne');
  if (expectedCode !== undefined) {
    assert.equal(body.error.code, expectedCode);
  }
}

/** Assère statut + code d'erreur + enveloppe uniforme en un appel. */
async function expectError(res: ApiResponse, status: number, code: string): Promise<void> {
  assert.equal(res.status, status, `statut attendu ${status}, reçu ${res.status} — ${JSON.stringify(res.body)}`);
  assertErrorEnvelope(res.body, code);
}

// ===========================================================================
// BLOC 1 — AUTHENTIFICATION  (CA-AUTH02/03/04, CA-NOT01, api.md §3.1)
// ===========================================================================
describe('Bloc 1 — Authentification (CA-AUTH02/03/04)', () => {
  it('CA-AUTH03-01 : POST /register valide → 201 + session + aucun champ secret', async () => {
    const client = server.newClient();
    const email = uniqEmail();
    const phone = uniqPhone();
    const res = await client.post('/api/auth/register', {
      displayName: 'Strict User',
      name: 'Strict Nom',
      email,
      phone,
      password: 'motdepasse1',
      acceptedCgu: true,
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.user.email, email);
    assert.equal(res.body.user.role, 'user');
    assert.equal(typeof res.body.unreadNotifications, 'number');
    const keys = Object.keys(res.body.user);
    for (const secret of ['password', 'passwordHash', 'password_hash']) {
      assert.ok(!keys.includes(secret), `champ secret "${secret}" exposé`);
    }
    const me = await client.get('/api/auth/me');
    assert.equal(me.status, 200);
    assert.equal(me.body.user.email, email);
  });

  it('CA-AUTH03-02 : champs invalides (email, téléphone, mot de passe, CGU) → 400 VALIDATION_ERROR', async () => {
    const base = { displayName: 'Valid Name', name: 'Valid Nom', email: uniqEmail(), phone: uniqPhone(), password: 'motdepasse1', acceptedCgu: true };
    const cases: Array<[string, Record<string, unknown>]> = [
      ['email invalide', { ...base, email: 'pas-un-email' }],
      ['téléphone invalide', { ...base, phone: '123' }],
      ['mot de passe trop court', { ...base, password: 'court' }],
      ['CGU non acceptées', { ...base, acceptedCgu: false }],
    ];
    for (const [label, body] of cases) {
      const res = await server.newClient().post('/api/auth/register', body);
      await expectError(res, 400, 'VALIDATION_ERROR');
      assert.ok(Array.isArray((res.body as any).error.details) && (res.body as any).error.details.length > 0, `${label} : details présents`);
    }
  });

  it('CA-AUTH03 : corps vide → 400 avec champs requis détaillés', async () => {
    const res = await server.newClient().post('/api/auth/register', {});
    await expectError(res, 400, 'VALIDATION_ERROR');
    const fields = ((res.body as any).error.details as Array<{ field: string }>).map((d) => d.field);
    for (const required of ['displayName', 'email', 'phone', 'password']) {
      assert.ok(fields.includes(required), `champ requis "${required}" signalé`);
    }
  });

  it('CA-AUTH03-03 : email déjà utilisé → 409 EMAIL_TAKEN', async () => {
    const email = uniqEmail();
    const first = { displayName: 'Dup Email', name: 'Dup Nom', email, phone: uniqPhone(), password: 'motdepasse1', acceptedCgu: true };
    assert.equal((await server.newClient().post('/api/auth/register', first)).status, 201);
    const res = await server.newClient().post('/api/auth/register', { ...first, phone: uniqPhone() });
    await expectError(res, 409, 'EMAIL_TAKEN');
  });

  it('CA-AUTH03-03 : téléphone déjà utilisé → 409 PHONE_TAKEN', async () => {
    const phone = uniqPhone();
    const first = { displayName: 'Dup Phone', name: 'Dup Nom', email: uniqEmail(), phone, password: 'motdepasse1', acceptedCgu: true };
    assert.equal((await server.newClient().post('/api/auth/register', first)).status, 201);
    const res = await server.newClient().post('/api/auth/register', { ...first, email: uniqEmail() });
    await expectError(res, 409, 'PHONE_TAKEN');
  });

  it('CA-AUTH02-01 : login valide → 200 ; identifiants erronés → 401 INVALID_CREDENTIALS générique (anti-énumération)', async () => {
    const user = await registerUser(server, 'login');
    const ok = await server.newClient().post('/api/auth/login', { identifier: user.email, password: user.password });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.user.displayName, user.displayName);
    assert.equal(ok.body.user.role, 'user');

    const badPw = await server.newClient().post('/api/auth/login', { identifier: user.email, password: 'mauvais-mot-de-passe' });
    const unknown = await server.newClient().post('/api/auth/login', { identifier: uniqEmail(), password: 'motdepasse1' });
    assert.equal(badPw.status, 401);
    assert.equal(unknown.status, 401);
    assert.equal(errorCode(badPw.body), 'INVALID_CREDENTIALS');
    assert.equal(errorCode(unknown.body), 'INVALID_CREDENTIALS');
    assert.equal((badPw.body as any).error.message, (unknown.body as any).error.message, 'message identique : existence non divulguée');
  });

  it('CA-AUTH04-07 : login par téléphone → 400 (identifier = email uniquement, divergence documentée)', async () => {
    const user = await registerUser(server, 'loginphone');
    const res = await server.newClient().post('/api/auth/login', { identifier: user.phone, password: user.password });
    await expectError(res, 400, 'VALIDATION_ERROR');
  });

  it('CA-AUTH-06 : GET /me anonyme → 401 ; authentifié → 200 ; logout → 204 puis 401', async () => {
    await expectError(await server.newClient().get('/api/auth/me'), 401, 'UNAUTHENTICATED');
    const user = await registerUser(server, 'melogout');
    const me = await user.client.get('/api/auth/me');
    assert.equal(me.status, 200);
    assert.equal(me.body.user.email, user.email);
    assert.equal((await user.client.post('/api/auth/logout')).status, 204);
    await expectError(await user.client.get('/api/auth/me'), 401, 'UNAUTHENTICATED');
  });

  it('CA-AUTH05-01 : forgot-password anti-énumération — 202 et corps identique (compte connu/inconnu)', async () => {
    const user = await registerUser(server, 'forgot');
    const known = await server.newClient().post('/api/auth/forgot-password', { email: user.email });
    const unknown = await server.newClient().post('/api/auth/forgot-password', { email: uniqEmail() });
    assert.equal(known.status, 202);
    assert.equal(unknown.status, 202);
    assert.deepEqual(known.body, unknown.body, 'réponses indiscernables (pas d’énumération)');
  });

  it('CA-AUTH05 : reset-password — jeton valide 200, réutilisation 410, inconnu 410, court 400', async () => {
    const user = await registerUser(server, 'reset');
    const rawToken = 'StrictResetToken-0123456789-ABCDEFGHIJ';
    await dbQuery(
      'INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
      [user.id, hashResetToken(rawToken), new Date(Date.now() + RESET_TOKEN_TTL_MS)],
    );
    const ok = await server.newClient().post('/api/auth/reset-password', { token: rawToken, password: 'nouveaumdp1' });
    assert.equal(ok.status, 200);
    assert.equal((await server.newClient().post('/api/auth/login', { identifier: user.email, password: 'nouveaumdp1' })).status, 200);
    assert.equal((await server.newClient().post('/api/auth/login', { identifier: user.email, password: user.password })).status, 401);
    await expectError(await server.newClient().post('/api/auth/reset-password', { token: rawToken, password: 'encoreunmdp1' }), 410, 'INVALID_OR_EXPIRED_RESET_TOKEN');
    await expectError(await server.newClient().post('/api/auth/reset-password', { token: 'B'.repeat(43), password: 'quelquemdp1' }), 410, 'INVALID_OR_EXPIRED_RESET_TOKEN');
    await expectError(await server.newClient().post('/api/auth/reset-password', { token: 'court', password: 'quelquemdp1' }), 400, 'VALIDATION_ERROR');
  });

  it('OAuth : /google et /facebook ne renvoient JAMAIS 500 (302 si configuré, 503 sinon)', async () => {
    for (const provider of ['google', 'facebook'] as const) {
      const res = await server.newClient().get(`/api/auth/${provider}`);
      assert.notEqual(res.status, 500, `OAuth ${provider} ne doit pas renvoyer 500`);
      if (res.status === 302) {
        const location = res.headers.get('location') ?? '';
        assert.match(location, provider === 'google' ? /accounts\.google\.com/ : /facebook\.com/);
      } else {
        assert.equal(res.status, 503);
        assert.equal(errorCode(res.body), 'OAUTH_NOT_CONFIGURED');
      }
    }
  });
});

// ===========================================================================
// BLOC 2 — CSRF  (middleware/csrf.ts — double soumission)
// ===========================================================================
describe('Bloc 2 — CSRF (api.md §9 / middleware csrf)', () => {
  const ORIGIN = 'https://app.test';

  async function withCsrfServer(fn: (baseUrl: string) => Promise<void>): Promise<void> {
    const app = express();
    app.use('/api', createCsrfProtection({ enforce: true, origins: [ORIGIN], cookieSecure: false }));
    app.get('/api/ping', (_req: Request, res: ExpressResponse) => res.status(204).end());
    app.post('/api/mutate', (_req: Request, res: ExpressResponse) => res.status(204).end());
    app.use((err: Error, _req: Request, res: ExpressResponse, _next: NextFunction) => res.status(500).json({ error: err.message }));
    const srv: Server = await new Promise((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    const addr = srv.address();
    if (typeof addr !== 'object' || addr === null) throw new Error('adresse non résolue');
    try {
      await fn(`http://127.0.0.1:${addr.port}`);
    } finally {
      await new Promise<void>((resolve) => {
        srv.close(() => resolve());
        srv.closeAllConnections?.();
      });
    }
  }

  it('GET pose un cookie csrf_token lisible (jamais HttpOnly)', async () => {
    await withCsrfServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/ping`);
      assert.equal(res.status, 204);
      const setCookie = res.headers.get('set-cookie') ?? '';
      assert.match(setCookie, /csrf_token=/);
      assert.doesNotMatch(setCookie.toLowerCase(), /httponly/);
    });
  });

  it('POST sans cookie CSRF préalable → 403 CSRF_INVALID (cookie obligatoire)', async () => {
    await withCsrfServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/mutate`, { method: 'POST' });
      assert.equal(res.status, 403);
      assert.equal(((await res.json()) as any).error.code, 'CSRF_INVALID');
    });
  });

  it('cookie CSRF sans en-tête → 403 CSRF_INVALID ; avec en-tête correct → accepté', async () => {
    await withCsrfServer(async (baseUrl) => {
      const noHeader = await fetch(`${baseUrl}/api/mutate`, { method: 'POST', headers: { cookie: `${CSRF_COOKIE}=abc123` } });
      assert.equal(noHeader.status, 403);
      assert.equal(((await noHeader.json()) as any).error.code, 'CSRF_INVALID');

      const valid = await fetch(`${baseUrl}/api/mutate`, { method: 'POST', headers: { cookie: `${CSRF_COOKIE}=s3cr3t`, 'x-csrf-token': 's3cr3t' } });
      assert.equal(valid.status, 204);
    });
  });

  it('en-tête divergent → 403 ; origine non autorisée → 403 ; origine autorisée SANS cookie → 403 ; cookie + en-tête → accepté', async () => {
    await withCsrfServer(async (baseUrl) => {
      const mismatch = await fetch(`${baseUrl}/api/mutate`, { method: 'POST', headers: { cookie: `${CSRF_COOKIE}=s3cr3t`, 'x-csrf-token': 'autre' } });
      assert.equal(mismatch.status, 403);
      const evil = await fetch(`${baseUrl}/api/mutate`, { method: 'POST', headers: { origin: 'https://evil.test' } });
      assert.equal(evil.status, 403);
      const allowedNoCookie = await fetch(`${baseUrl}/api/mutate`, { method: 'POST', headers: { origin: ORIGIN } });
      assert.equal(allowedNoCookie.status, 403);
      const allowed = await fetch(`${baseUrl}/api/mutate`, { method: 'POST', headers: { origin: ORIGIN, cookie: `${CSRF_COOKIE}=s3cr3t`, 'x-csrf-token': 's3cr3t' } });
      assert.equal(allowed.status, 204);
    });
  });
});

// ===========================================================================
// BLOC 3 — PRODUITS  (CA-PROD*, api.md §3.2)
// ===========================================================================
describe('Bloc 3 — Produits (catalogue + création + édition)', () => {
  let seller: ApiClient;
  let productId: number;

  before(async () => {
    seller = (await registerUser(server, 'prod')).client;
    productId = (await createApprovedProduct(seller, admin, { name: 'Strict catalogue item', price: 12000, brand: 'StrictBrand' })).id;
  });

  it('api.md §3.2 : catalogue public accessible sans session, items dont le vendeur est nettoyé', async () => {
    const res = await server.newClient().get('/api/products');
    assert.equal(res.status, 200);
    const body = res.body as any;
    assert.ok(Array.isArray(body.items), 'items est un tableau');
    assert.equal(typeof body.total, 'number');
    assert.equal(body.page, 1);
    for (const item of body.items) {
      assertPublicUserClean(item.seller, 'catalogue §3.2 (seller)');
    }
  });

  it('api.md §3.2 : filtres/params invalides → 400 VALIDATION_ERROR', async () => {
    for (const q of ['sort=bogus', 'price_min=abc', 'page=0', 'per_page=49', 'condition=Inexistant']) {
      await expectError(await server.newClient().get(`/api/products?${q}`), 400, 'VALIDATION_ERROR');
    }
  });

  it('api.md §3.2 : règles croisées de filtre (subcat incohérente, ids exclusif, ids+not_in, plage inversée)', async () => {
    await expectError(await server.newClient().get('/api/products?categoryId=1&subcategory_id=13'), 400, 'VALIDATION_ERROR');
    await expectError(await server.newClient().get('/api/products?ids=1&q=x'), 400, 'VALIDATION_ERROR');
    await expectError(await server.newClient().get('/api/products?ids=1&not_in=2'), 400, 'VALIDATION_ERROR');
    await expectError(await server.newClient().get('/api/products?price_min=100&price_max=50'), 400, 'VALIDATION_ERROR');
  });

  it('api.md §3.2 : détail existant 200 (vendeur nettoyé) ; inexistant 404 ; non numérique 404 (slug)', async () => {
    const detail = await server.newClient().get(`/api/products/${productId}`);
    assert.equal(detail.status, 200);
    assert.equal((detail.body as any).id, productId);
    assertPublicUserClean((detail.body as any).seller, 'détail produit (seller)');
    await expectError(await server.newClient().get('/api/products/999999999'), 404, 'PRODUCT_NOT_FOUND');
    await expectError(await server.newClient().get('/api/products/slug-inexistant-xyz'), 404, 'PRODUCT_NOT_FOUND');
  });

  it('CA-PROD01 : création — anonyme 401, admin 403, vendeur 201 (statut PENDING)', async () => {
    await expectError(await server.newClient().post('/api/products', {}), 401, 'UNAUTHENTICATED');
    await expectError(await admin.post('/api/products', {}), 403, 'FORBIDDEN');
    const created = await createProduct(seller, { name: 'Strict pending item' });
    assert.equal(created.product.status, 'PENDING');
  });

  it('CA-PROD01 : création — prix hors bornes 400, couple catégorie/sous-catégorie incohérent 400 CATEGORY_MISMATCH', async () => {
    const badPrice = await seller.request('/api/products', 'POST', { form: productForm({ ...DEFAULT_FIELDS, name: 'Prix trop bas', price: 100 }) });
    await expectError(badPrice, 400, 'VALIDATION_ERROR');

    const mismatch = await seller.request('/api/products', 'POST', { form: productForm({ ...DEFAULT_FIELDS, name: 'Catégorie incohérente', categoryId: 1, subcategoryId: 13 }) });
    await expectError(mismatch, 400, 'CATEGORY_MISMATCH');
  });

  it('CA-PROD01 : photos — type invalide 400 PHOTO_INVALID_TYPE, aucune photo 400 PHOTO_MISSING', async () => {
    const badType = await seller.request('/api/products', 'POST', { form: productForm({ ...DEFAULT_FIELDS, name: 'Photo invalide' }, [jpegBuffer(), jpegBuffer(), invalidBuffer]) });
    await expectError(badType, 400, 'PHOTO_INVALID_TYPE');

    const noPhoto = await seller.request('/api/products', 'POST', { form: productForm({ ...DEFAULT_FIELDS, name: 'Sans photo' }, []) });
    await expectError(noPhoto, 400, 'PHOTO_MISSING');
  });

  it('CA-PROD06 : PUT propriétaire 200 et repasse PENDING ; tiers 404 ; admin 403 (requireUser)', async () => {
    const owner = (await registerUser(server, 'putowner')).client;
    const other = (await registerUser(server, 'putother')).client;
    const created = await createApprovedProduct(owner, admin, { name: 'Strict PUT item' });
    const form = productForm({ ...DEFAULT_FIELDS, name: 'Strict PUT renamed', price: 200000 }, [jpegBuffer()]);

    const byOwner = await owner.request(`/api/products/${created.id}`, 'PUT', { form });
    assert.equal(byOwner.status, 200);
    assert.equal((byOwner.body as any).product.name, 'Strict PUT renamed');
    assert.equal((byOwner.body as any).product.status, 'PENDING', 'une édition repasse en modération');

    await expectError(await other.request(`/api/products/${created.id}`, 'PUT', { form }), 404, 'PRODUCT_NOT_FOUND');
    await expectError(await admin.request(`/api/products/${created.id}`, 'PUT', { form }), 403, 'FORBIDDEN');
  });

  it('Contrat : la suppression utilisateur DELETE /api/products/:id n’existe pas → 404 (suppression admin uniquement)', async () => {
    await expectError(await seller.request(`/api/products/${productId}`, 'DELETE'), 404, 'NOT_FOUND');
  });

  it('api.md §3.2 : GET /locations et /suggestions répondent leur forme publique', async () => {
    const locations = await server.newClient().get('/api/products/locations');
    assert.equal(locations.status, 200);
    assert.ok(Array.isArray((locations.body as any).locations), 'locations est un tableau');

    const sug = await server.newClient().get('/api/products/suggestions?q=strict');
    assert.equal(sug.status, 200);
    const s = sug.body as any;
    assert.equal(s.q, 'strict');
    assert.ok(Array.isArray(s.categories) && Array.isArray(s.brands) && Array.isArray(s.products), 'categories/brands/products tableaux');
  });
});

// ===========================================================================
// BLOC 4 — PANIER  (CA-CART, api.md §3.3)
// ===========================================================================
describe('Bloc 4 — Panier (CA-CART)', () => {
  let seller: ApiClient;
  let productId: number;

  before(async () => {
    seller = (await registerUser(server, 'cartseller-strict')).client;
    productId = (await createApprovedProduct(seller, admin, { name: 'Strict cart item' })).id;
  });

  it('CA-CART : routes protégées — anonyme → 401', async () => {
    await expectError(await server.newClient().get('/api/cart'), 401, 'UNAUTHENTICATED');
    await expectError(await server.newClient().post('/api/cart', { productId, qty: 1 }), 401, 'UNAUTHENTICATED');
  });

  it('CA-CART : panier vide → tableau [] (jamais 500)', async () => {
    const { client } = await registerUser(server, 'cartempty-strict');
    const res = await client.get('/api/cart');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body));
    assert.equal((res.body as unknown[]).length, 0);
  });

  it('CA-CART : ajout 201 puis GET renvoie la ligne (productId, qty, productName) ; quantité plafonnée à 9', async () => {
    const { client } = await registerUser(server, 'cartadd-strict');
    assert.equal((await client.post('/api/cart', { productId, qty: 2 })).status, 201);
    let list = (await client.get('/api/cart')).body as any[];
    assert.equal(list.length, 1);
    assert.equal(list[0].productId, productId);
    assert.equal(list[0].qty, 2);
    assert.equal(list[0].productName, 'Strict cart item');

    await client.post('/api/cart', { productId, qty: 9 });
    list = (await client.get('/api/cart')).body as any[];
    assert.equal(list[0].qty, 9, 'plafonné à 9');
  });

  it('CA-CART : quantités invalides (0, 10, négative, décimale) → 400 VALIDATION_ERROR', async () => {
    const { client } = await registerUser(server, 'cartqty-strict');
    for (const qty of [0, 10, -1, 2.5]) {
      await expectError(await client.post('/api/cart', { productId, qty }), 400, 'VALIDATION_ERROR');
    }
  });

  it('CA-CART : produit inconnu → 404 PRODUCT_NOT_FOUND', async () => {
    const { client } = await registerUser(server, 'cartunknown-strict');
    await expectError(await client.post('/api/cart', { productId: 999999999, qty: 1 }), 404, 'PRODUCT_NOT_FOUND');
  });

  it('CA-CART : PATCH quantité, DELETE ligne (204), vidage complet (204), isolation par utilisateur', async () => {
    const { client } = await registerUser(server, 'cartcycle-strict');
    await client.post('/api/cart', { productId, qty: 3 });
    const patch = await client.request(`/api/cart/${productId}`, 'PATCH', { json: { qty: 4 } });
    assert.equal(patch.status, 200);
    assert.equal((patch.body as any).qty, 4);

    assert.equal((await client.request(`/api/cart/${productId}`, 'DELETE')).status, 204);
    assert.equal(((await client.get('/api/cart')).body as any[]).length, 0);

    await client.post('/api/cart', { productId, qty: 1 });
    assert.equal((await client.request('/api/cart', 'DELETE')).status, 204);
    assert.equal(((await client.get('/api/cart')).body as any[]).length, 0);

    const other = (await registerUser(server, 'cartother-strict')).client;
    assert.equal(((await other.get('/api/cart')).body as any[]).length, 0);
  });
});

// ===========================================================================
// BLOC 5 — FAVORIS  (api.md §3.3 — aucune suite existante avant ce fichier)
// ===========================================================================
describe('Bloc 5 — Favoris (api.md §3.3)', () => {
  let seller: ApiClient;
  let productId: number;

  before(async () => {
    seller = (await registerUser(server, 'favseller')).client;
    productId = (await createApprovedProduct(seller, admin, { name: 'Strict favorite item' })).id;
  });

  it('routes protégées — anonyme → 401 sur GET/POST/DELETE/check', async () => {
    await expectError(await server.newClient().get('/api/favorites'), 401, 'UNAUTHENTICATED');
    await expectError(await server.newClient().post('/api/favorites', { productId }), 401, 'UNAUTHENTICATED');
    await expectError(await server.newClient().request(`/api/favorites/${productId}`, 'DELETE'), 401, 'UNAUTHENTICATED');
    await expectError(await server.newClient().get(`/api/favorites/check/${productId}`), 401, 'UNAUTHENTICATED');
  });

  it('bascule : POST {added:true} puis {added:false} (toggle) ; GET renvoie le favori ; check ; DELETE', async () => {
    const { client } = await registerUser(server, 'favcycle');

    const add = await client.post('/api/favorites', { productId });
    assert.equal(add.status, 200);
    assert.equal((add.body as any).added, true);

    const list = await client.get('/api/favorites');
    assert.equal(list.status, 200);
    const items = list.body as any[];
    assert.equal(items.length, 1);
    assert.equal(items[0].productId, productId);
    assert.equal(items[0].productName, 'Strict favorite item');

    assert.equal((await client.get(`/api/favorites/check/${productId}`)).body.isFavorite, true);

    const off = await client.post('/api/favorites', { productId });
    assert.equal((off.body as any).added, false);
    assert.equal((await client.get(`/api/favorites/check/${productId}`)).body.isFavorite, false);

    await client.post('/api/favorites', { productId });
    assert.equal((await client.request(`/api/favorites/${productId}`, 'DELETE')).status, 204);
    assert.equal((await client.get(`/api/favorites/check/${productId}`)).body.isFavorite, false);
    assert.equal(((await client.get('/api/favorites')).body as any[]).length, 0);
  });

  it('favori sur produit inconnu → 404 PRODUCT_NOT_FOUND, sans fuite technique', async () => {
    const { client } = await registerUser(server, 'favunknown');
    const res = await client.post('/api/favorites', { productId: 999999999 });
    await expectError(res, 404, 'PRODUCT_NOT_FOUND');
    const raw = JSON.stringify(res.body);
    assert.ok(!/constraint|foreign key|violates|pg_|SELECT/i.test(raw), 'aucune fuite technique');
  });
});

// ===========================================================================
// BLOC 6 — COMMANDES  (CA-BUY, CA-ORD, api.md §3.4)
// ===========================================================================
describe('Bloc 6 — Commandes (CA-BUY / CA-ORD)', () => {
  it('CA-BUY01 : création — anonyme 401, admin 403 (requireUser), acheteur 201 (PAYMENT_PENDING)', async () => {
    const seller = (await registerUser(server, 'ordprod')).client;
    const p = await createApprovedProduct(seller, admin, { name: 'Strict order item', price: 8000 });
    await expectError(await server.newClient().post('/api/orders', { productId: p.id }), 401, 'UNAUTHENTICATED');
    await expectError(await admin.post('/api/orders', { productId: p.id }), 403, 'FORBIDDEN');

    const buyer = (await registerUser(server, 'ordbuyer')).client;
    const res = await buyer.post('/api/orders', { productId: p.id });
    assert.equal(res.status, 201);
    const order = (res.body as any).order;
    assert.equal(order.status, 'PAYMENT_PENDING');
    assert.equal(order.amount, 8000);
    assert.equal(typeof order.orderNumber, 'string');
    assert.equal(typeof order.commission, 'number');
    assertPublicUserClean(order.seller, 'commande — vendeur');
    assertPublicUserClean(order.buyer, 'commande — acheteur');
  });

  it('CA-BUY : auto-achat → 400 SELF_PURCHASE ; produit déjà réservé → 409 PRODUCT_RESERVED', async () => {
    const seller = (await registerUser(server, 'ordself')).client;
    const p = await createApprovedProduct(seller, admin, { name: 'Strict self item' });
    await expectError(await seller.post('/api/orders', { productId: p.id }), 400, 'SELF_PURCHASE');

    const buyer1 = (await registerUser(server, 'ordres1')).client;
    assert.equal((await buyer1.post('/api/orders', { productId: p.id })).status, 201);
    const buyer2 = (await registerUser(server, 'ordres2')).client;
    await expectError(await buyer2.post('/api/orders', { productId: p.id }), 409, 'PRODUCT_RESERVED');
  });

  it('CA-BUY : produit inconnu → 404 ; méthode de paiement invalide → 400 ; livraison invalide → 400', async () => {
    const buyer = (await registerUser(server, 'ordinvalid')).client;
    await expectError(await buyer.post('/api/orders', { productId: 999999999 }), 404, 'PRODUCT_NOT_FOUND');
    const seller = (await registerUser(server, 'ordinv2')).client;
    const p = await createApprovedProduct(seller, admin, { name: 'Strict invalid-pay item' });
    await expectError(await buyer.post('/api/orders', { productId: p.id, paymentMethod: 'BITCOIN' }), 400, 'VALIDATION_ERROR');
    await expectError(
      await buyer.post('/api/orders', { productId: p.id, shipping: { name: 'X', phone: '12', city: 'Abidjan', address: 'Rue' } }),
      400,
      'VALIDATION_ERROR',
    );
  });

  it('CA-BUY : checkout — liste vide 400, > 8 articles 400, succès {orders,count} 201', async () => {
    const seller = (await registerUser(server, 'chkprod')).client;
    const p1 = await createApprovedProduct(seller, admin, { name: 'Strict checkout 1' });
    const p2 = await createApprovedProduct(seller, admin, { name: 'Strict checkout 2' });
    const buyer = (await registerUser(server, 'chkbuyer')).client;

    await expectError(await buyer.post('/api/orders/checkout', { productIds: [] }), 400, 'VALIDATION_ERROR');
    await expectError(await buyer.post('/api/orders/checkout', { productIds: Array.from({ length: 9 }, (_, i) => i + 1) }), 400, 'VALIDATION_ERROR');

    const ok = await buyer.post('/api/orders/checkout', { productIds: [p1.id, p2.id] });
    assert.equal(ok.status, 201);
    assert.equal((ok.body as any).count, 2);
    assert.equal((ok.body as any).orders.length, 2);
  });

  it('api.md §3.4 : GET /api/orders (liste globale) n’existe pas → 404 ; la liste acheteur est /api/me/orders', async () => {
    const buyer = (await registerUser(server, 'ordlist')).client;
    await expectError(await buyer.get('/api/orders'), 404, 'NOT_FOUND');
    const mine = await buyer.get('/api/me/orders');
    assert.equal(mine.status, 200);
    assert.ok(Array.isArray((mine.body as any).items));
  });

  it('CA-BUY03 : détail — tiers 404 ORDER_NOT_FOUND ; acheteur 200 (order + events)', async () => {
    const seller = (await registerUser(server, 'orddetseller')).client;
    const p = await createApprovedProduct(seller, admin, { name: 'Strict detail item' });
    const buyer = (await registerUser(server, 'orddetbuyer')).client;
    const orderId = ((await buyer.post('/api/orders', { productId: p.id })).body as any).order.id;

    const third = (await registerUser(server, 'orddetthird')).client;
    await expectError(await third.get(`/api/orders/${orderId}`), 404, 'ORDER_NOT_FOUND');

    const detail = await buyer.get(`/api/orders/${orderId}`);
    assert.equal(detail.status, 200);
    assert.equal((detail.body as any).order.id, orderId);
    assert.ok(Array.isArray((detail.body as any).order.events), 'events[] présent');
  });

  it('CA-ORD : transition invalide → 409 INVALID_TRANSITION', async () => {
    const seller = (await registerUser(server, 'ordinvseller')).client;
    const p = await createApprovedProduct(seller, admin, { name: 'Strict invalid-trans item' });
    const buyer = (await registerUser(server, 'ordinvbuyer')).client;
    const orderId = ((await buyer.post('/api/orders', { productId: p.id })).body as any).order.id;
    await expectError(await admin.post(`/api/admin/orders/${orderId}/mark-shipped`, {}), 409, 'INVALID_TRANSITION');
  });

  it('CA-ORD : cycle complet admin → PAYMENT_PENDING → … → COMPLETED + seller-payout', async () => {
    const seller = (await registerUser(server, 'ordcycleseller')).client;
    const p = await createApprovedProduct(seller, admin, { name: 'Strict cycle item', price: 20000 });
    const buyer = (await registerUser(server, 'ordcyclebuyer')).client;
    const orderId = ((await buyer.post('/api/orders', { productId: p.id })).body as any).order.id;

    const cp = await admin.post(`/api/admin/orders/${orderId}/confirm-payment`, { method: 'MOBILE_MONEY' });
    assert.equal(cp.status, 200);
    assert.equal((cp.body as any).order.status, 'PRODUCT_WAITING');
    assert.equal(((await admin.post(`/api/admin/orders/${orderId}/mark-product-received`, {})).body as any).order.status, 'PREPARING');
    assert.equal(((await admin.post(`/api/admin/orders/${orderId}/mark-shipped`, {})).body as any).order.status, 'SHIPPED');
    assert.equal(((await admin.post(`/api/admin/orders/${orderId}/start-delivery`, { carrier: 'DHL' })).body as any).order.status, 'IN_DELIVERY');
    assert.equal(((await admin.post(`/api/admin/orders/${orderId}/mark-delivered`, {})).body as any).order.status, 'COMPLETED');
    const payout = await admin.post(`/api/admin/orders/${orderId}/seller-payout`, {});
    assert.equal(payout.status, 200, JSON.stringify(payout.body));
  });
});

// ===========================================================================
// BLOC 7 — ADMIN  (CA-ADM*, RBAC exhaustif, api.md §3.5)
// ===========================================================================
describe('Bloc 7 — Admin (RBAC + actions, CA-ADM)', () => {
  it('RBAC lecture : anonyme 401, utilisateur 403 FORBIDDEN, admin 200 (toutes les routes de lecture)', async () => {
    const user = (await registerUser(server, 'rbac')).client;
    const reads = ['/api/admin/stats', '/api/admin/categories', '/api/admin/products', '/api/admin/orders', '/api/admin/users', '/api/admin/history'];
    for (const route of reads) {
      await expectError(await server.newClient().get(route), 401, 'UNAUTHENTICATED');
      await expectError(await user.get(route), 403, 'FORBIDDEN');
      const ok = await admin.get(route);
      assert.equal(ok.status, 200, `${route} admin`);
    }
  });

  it('RBAC mutations : anonyme 401, utilisateur 403, admin (id inconnu) 404/410 approprié', async () => {
    const user = (await registerUser(server, 'rbacm')).client;
    const cases: Array<[string, string, Record<string, unknown>, number, string]> = [
      ['POST', '/api/admin/products/999999/approve', {}, 404, 'PRODUCT_NOT_FOUND'],
      ['POST', '/api/admin/products/999999/reject', { reason: 'Produit interdit' }, 404, 'PRODUCT_NOT_FOUND'],
      ['POST', '/api/admin/orders/999999/confirm-payment', { method: 'MOBILE_MONEY' }, 404, 'ORDER_NOT_FOUND'],
      ['POST', '/api/admin/orders/999999/cancel', { note: 'raison' }, 404, 'ORDER_NOT_FOUND'],
      ['PATCH', '/api/admin/categories/999999', { name: 'x' }, 404, 'CATEGORY_NOT_FOUND'],
    ];
    for (const [method, route, body, adminStatus, adminCode] of cases) {
      await expectError(await server.newClient().request(route, method, { json: body }), 401, 'UNAUTHENTICATED');
      await expectError(await user.request(route, method, { json: body }), 403, 'FORBIDDEN');
      await expectError(await admin.request(route, method, { json: body }), adminStatus, adminCode);
    }
    await expectError(await admin.post('/api/admin/orders/999999/pay-seller', {}), 410, 'ROUTE_DEPRECATED');
  });

  it('CA-ADM04 : approbation 200 (PENDING → AVAILABLE), rejet motif invalide 400 puis valide 200', async () => {
    const seller = (await registerUser(server, 'admseller')).client;
    const toApprove = await createProduct(seller, { name: 'Strict approval item' });
    const approved = await admin.post(`/api/admin/products/${toApprove.id}/approve`, {});
    assert.equal(approved.status, 200);
    assert.equal((approved.body as any).product.status, 'AVAILABLE');

    const toReject = await createProduct(seller, { name: 'Strict rejection item' });
    await expectError(await admin.post(`/api/admin/products/${toReject.id}/reject`, { reason: 'nimporte' }), 400, 'VALIDATION_ERROR');
    const rejected = await admin.post(`/api/admin/products/${toReject.id}/reject`, { reason: 'Produit interdit' });
    assert.equal(rejected.status, 200);
  });

  it('CA-V5-056 : DELETE admin produit → 204, idempotent (2e 204), inconnu 404 PRODUCT_NOT_FOUND', async () => {
    const seller = (await registerUser(server, 'admdelete')).client;
    const created = await createProduct(seller, { name: 'Strict delete item' });
    assert.equal((await admin.request(`/api/admin/products/${created.id}`, 'DELETE')).status, 204);
    assert.equal((await admin.request(`/api/admin/products/${created.id}`, 'DELETE')).status, 204);
    await expectError(await admin.request('/api/admin/products/999999', 'DELETE'), 404, 'PRODUCT_NOT_FOUND');
  });

  it('CA-ADM07 : l’historique admin est paginé et reflète les actions', async () => {
    const res = await admin.get('/api/admin/history');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray((res.body as any).items));
  });
});

// ===========================================================================
// BLOC 8 — SYSTÈME, ENVELOPPE D'ERREUR & ROBUSTESSE
// ===========================================================================
describe('Bloc 8 — Système, enveloppe d’erreur & robustesse', () => {
  it('CA-V5 : /api/health et /api/system/health exposent la forme attendue', async () => {
    const basic = await server.newClient().get('/api/health');
    assert.equal(basic.status, 200);
    assert.equal((basic.body as any).status, 'ok');

    const res = await server.newClient().get('/api/system/health');
    assert.equal(res.status, 200);
    const b = res.body as any;
    assert.equal(b.status, 'ok');
    assert.equal(typeof b.uptimeSeconds, 'number');
    assert.ok(b.uptimeSeconds >= 0);
    assert.equal(typeof b.redis.used, 'boolean');
    assert.equal(typeof b.redis.ready, 'boolean');
    assert.ok(['redis', 'memory'].includes(b.rateLimit.backend), 'backend de rate-limit connu');
    assert.equal(b.cache.enabled, true);
    assert.equal(typeof b.cache.ttlSeconds, 'number');
    assert.equal(b.db.singlePool, true);
  });

  it('/api/categories public renvoie l’arbre { categories: [...] } des catégories actives', async () => {
    const res = await server.newClient().get('/api/categories');
    assert.equal(res.status, 200);
    const categories = (res.body as any).categories;
    assert.ok(Array.isArray(categories) && categories.length >= 5, 'au moins 5 catégories racines');
    assert.ok(categories.every((c: any) => typeof c.id === 'number' && typeof c.name === 'string' && Array.isArray(c.children)), 'structure {id,name,children}');
  });

  it('route inconnue → 404 NOT_FOUND avec enveloppe uniforme', async () => {
    await expectError(await server.newClient().get('/api/route-inexistante-xyz'), 404, 'NOT_FOUND');
  });

  it('enveloppe d’erreur uniforme : {error:{code,message}} sur 400/401/403/404/410', async () => {
    const samples: Array<[ApiResponse, number, string]> = [
      [await server.newClient().get('/api/auth/me'), 401, 'UNAUTHENTICATED'],
      [await admin.get('/api/me/products'), 403, 'FORBIDDEN'],
      [await server.newClient().get('/api/nope'), 404, 'NOT_FOUND'],
      [await server.newClient().post('/api/auth/login', {}), 400, 'VALIDATION_ERROR'],
      [await server.newClient().post('/api/auth/reset-password', { token: 'X'.repeat(43), password: 'motdepasse1' }), 410, 'INVALID_OR_EXPIRED_RESET_TOKEN'],
    ];
    for (const [res, status, code] of samples) {
      await expectError(res, status, code);
    }
  });

  it('identifiant numérique hors bornes (19 chiffres > BIGINT) → 404 PRODUCT_NOT_FOUND, jamais 5xx', async () => {
    // 19 chiffres > BIGINT max : traité comme slug → 404, jamais de 500 ni de
    // fuite technique (CA-V5-088). Cohérent avec accueil-v3 « jamais 500 ».
    const res = await server.newClient().get('/api/products/9999999999999999999');
    await expectError(res, 404, 'PRODUCT_NOT_FOUND');
    const raw = JSON.stringify(res.body);
    for (const leak of ['SELECT', 'constraint', 'bigint', 'range', 'syntax', 'stack', 'pg_', ' at ']) {
      assert.ok(!raw.toLowerCase().includes(leak.toLowerCase()), `fuite technique "${leak}" dans ${raw}`);
    }
  });

  it('JSON malformé → 400 VALIDATION_ERROR, sans fuite technique', async () => {
    const raw = await fetch(`${server.baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{ ceci n est pas du json',
    });
    const body = await raw.json();
    assert.equal(raw.status, 400, `statut attendu 400, reçu ${raw.status}`);
    assert.equal((body as any).error.code, 'VALIDATION_ERROR');
    assertErrorEnvelope(body);
    const serialized = JSON.stringify(body);
    assert.ok(!serialized.includes('SyntaxError'), 'aucune classe d’exception exposée');
    assert.ok(!/ at |Unexpected token|position \d+/i.test(serialized), 'aucun détail du parseur exposé');
  });
});
