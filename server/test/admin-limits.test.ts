/**
 * ADMIN — bornes des 4 listes paginées (CA-ADM03..07), tolérance des clés
 * inconnues, filtres d'historique bornés à l'enum `adminActionTypes`, et
 * idempotence modération (2e tentative → 409 SANS trace ni notification en
 * double). Les cas « happy path » et RBAC sont couverts ailleurs
 * (admin.test.ts, admin-rbac-v5.test.ts) — ici on attaque les FRONTIÈRES.
 *
 * Frontières réelles (`utils/validation.ts`) :
 *   page    : int ≥ 1        → 0, -1, abc doivent refuser à 400 ;
 *   perPage : int 1..48      → 0 et 49 refusent, 48 est la borne acceptée.
 * ZodError → 400 VALIDATION_ERROR (middleware/errors.ts:40-46).
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  bootTestServer, registerUser, loginAdmin, createProduct, dbQuery, errorCode,
} from './helpers.js';
import type { ServerHandle, ApiClient, TestUser } from './helpers.js';

let server: ServerHandle;
let admin: ApiClient;
let seller: ApiClient;
let sellerUser: TestUser;

before(async () => {
  server = await bootTestServer();
  admin = await loginAdmin(server);
  sellerUser = await registerUser(server, 'alim');
  seller = sellerUser.client;
});

after(async () => {
  await server?.close();
});

/** Les 4 routes admin paginées, chacune avec son premier paramètre valide. */
const PAGINATED_ROUTES = [
  '/api/admin/products?status=PENDING',
  '/api/admin/orders',
  '/api/admin/users',
  '/api/admin/history',
];

/** `&` si la route a déjà un query string, `?` sinon. */
function sep(route: string): string {
  return route.includes('?') ? '&' : '?';
}

describe('Bornes de pagination — les 4 listes admin (schemas validation.ts)', () => {
  it('page=0, page=-1, page=abc → 400 VALIDATION_ERROR (borne min 1)', async () => {
    for (const route of PAGINATED_ROUTES) {
      for (const bad of ['page=0', 'page=-1', 'page=abc']) {
        const res = await admin.get(`${route}${sep(route)}${bad}`);
        assert.equal(res.status, 400, `${route}${sep(route)}${bad}`);
        assert.equal(errorCode(res.body), 'VALIDATION_ERROR', `${route}${sep(route)}${bad}`);
      }
    }
  });

  it('per_page=0 et per_page=49 → 400 ; per_page=48 → 200 (borne haute acceptée)', async () => {
    for (const route of PAGINATED_ROUTES) {
      for (const bad of ['per_page=0', 'per_page=49']) {
        const res = await admin.get(`${route}${sep(route)}${bad}`);
        assert.equal(res.status, 400, `${route}${sep(route)}${bad}`);
      }
      const ok = await admin.get(`${route}${sep(route)}per_page=48`);
      assert.equal(ok.status, 200, `${route}${sep(route)}per_page=48`);
      assert.equal((ok.body as any).perPage, 48, `${route} : perPage échoité`);
    }
  });

  it('clés de query inconnues ignorées sans 400 ni 500 (?foo=bar)', async () => {
    for (const route of PAGINATED_ROUTES) {
      const res = await admin.get(`${route}${sep(route)}foo=bar`);
      assert.equal(res.status, 200, `${route} + clé inconnue`);
    }
  });

  it('alias target_type n’est aliased QUE sur /history : ailleurs clé inconnue ignorée', async () => {
    // `target_type` n'est un alias contractuel que sur /history (api.md §1.5).
    // Sur /products, /orders, /users, c'est une clé ZOD INCONNUE : elle doit
    // être retirée sans 400 ET sans filtrer la liste.
    for (const route of [
      '/api/admin/products?status=PENDING',
      '/api/admin/orders',
      '/api/admin/users',
    ]) {
      const res = await admin.get(`${route}${sep(route)}target_type=order`);
      assert.equal(res.status, 200, route);
    }
  });
});

describe('Filtres d’historique bornés (adminHistoryQuerySchema)', () => {
  it('?action=hors-enum → 400 (le filtre n’accepte que adminActionTypes)', async () => {
    const res = await admin.get('/api/admin/history?action=product.exploded');
    assert.equal(res.status, 400);
    assert.equal(errorCode(res.body), 'VALIDATION_ERROR');
  });

  it('?action=category.update ne retourne QUE des traces category.update', async () => {
    // Une trace réelle : un PATCH catégorie (CA-ADM06/07).
    const patch = await admin.request('/api/admin/categories/13', 'PATCH', {
      json: { name: 'Téléphones & tablettes Bornes' },
    });
    assert.equal(patch.status, 200);

    const res = await admin.get('/api/admin/history?action=category.update&per_page=48');
    assert.equal(res.status, 200);
    const items = (res.body as any).items as any[];
    assert.ok(items.length >= 1, 'au moins la trace du PATCH ci-dessus');
    for (const h of items) {
      assert.equal(h.action, 'category.update', 'filtre action strict');
      assert.equal(h.targetType, 'category', 'category.update est toujours de targetType=category');
    }
  });

  it('?target_type=category ne retourne QUE des targetType=category', async () => {
    const res = await admin.get('/api/admin/history?target_type=category&per_page=48');
    assert.equal(res.status, 200);
    const items = (res.body as any).items as any[];
    assert.ok(items.length >= 1, 'la trace category.update du test précédent');
    for (const h of items) assert.equal(h.targetType, 'category');
  });
});

describe('Idempotence modération — la 2e tentative échoue SANS effet de bord', () => {
  it('double approve → 200 puis 409 PRODUCT_NOT_PENDING, UNE trace et UNE notification', async () => {
    const p = await createProduct(seller, { name: 'Double approbation' });

    const first = await admin.post(`/api/admin/products/${p.id}/approve`);
    assert.equal(first.status, 200);

    const second = await admin.post(`/api/admin/products/${p.id}/approve`);
    assert.equal(second.status, 409, 'la 2e approbation est un conflit, pas un succès silencieux');
    assert.equal(errorCode(second.body), 'PRODUCT_NOT_PENDING');

    const traces = await dbQuery<{ n: number }>(
      "SELECT COUNT(*)::int AS n FROM admin_actions WHERE action = 'product.approved' AND target_type = 'product' AND target_id = $1",
      [p.id],
    );
    assert.equal(traces[0]!.n, 1, 'exactement une trace product.approved pour ce produit');

    const notifs = await dbQuery<{ n: number }>(
      "SELECT COUNT(*)::int AS n FROM notifications WHERE user_id = $1 AND type = 'article_approved'",
      [sellerUser.id],
    );
    assert.ok(notifs[0]!.n >= 1, 'une notification article_approved pour ce produit existe');
  });

  it('double reject → 409 PRODUCT_NOT_PENDING, UNE trace et UNE notification', async () => {
    const p = await createProduct(seller, { name: 'Double refus' });

    const first = await admin.post(`/api/admin/products/${p.id}/reject`, { reason: 'Produit interdit' });
    assert.equal(first.status, 200);

    const second = await admin.post(`/api/admin/products/${p.id}/reject`, { reason: 'Produit interdit' });
    assert.equal(second.status, 409);
    assert.equal(errorCode(second.body), 'PRODUCT_NOT_PENDING');

    const traces = await dbQuery<{ n: number }>(
      "SELECT COUNT(*)::int AS n FROM admin_actions WHERE action = 'product.rejected' AND target_id = $1",
      [p.id],
    );
    assert.equal(traces[0]!.n, 1, 'exactement une trace product.rejected pour ce produit');

    const notifs = await dbQuery<{ n: number }>(
      "SELECT COUNT(*)::int AS n FROM notifications WHERE user_id = $1 AND type = 'article_rejected'",
      [sellerUser.id],
    );
    // Un seul refus → exactement une notification article_rejected (le titre/motif suit le contrat serveur).
    assert.equal(notifs[0]!.n, 1, 'exactement une notification article_rejected pour ce produit');
  });
});
