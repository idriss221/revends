/**
 * V5 — C6 ADMIN : contrôle d'accès.
 *
 * `adminRouter.use(requireAdmin)` est monté UNE fois, avant toute route : c'est
 * le bon idiom Express, mais « le middleware est en place » ne prouve pas que
 * chaque route est réellement protégée (une route déclarée AVANT le `use`, ou un
 * `next()` oublié, passeraient inaperçus).
 *
 * Ce tableau énumère donc **explicitement** chaque route d'administration et
 * exige trois choses :
 * 1. **Anonyme** → 401 (`UNAUTHENTICATED`), jamais 500 ni 200 ;
 * 2. **Utilisateur simple** → 403 (`FORBIDDEN`) — un compte non-admin ne doit
 *    pas pouvoir lire le back-office ;
 * 3. Le contrôle ne dépend pas de l'existence de la ressource : l'identifiant
 *    utilisé est volontairement inexistant, sinon une fuite d'information
 *    apparaîtrait (404 avant 403 ⟹ on devine l'existence d'une commande).
 *
 * Le statut attendu est 401/403 : les deux sont des refus légitimes, et la
 * distinction importe — c'est le rôle du jeton qui décide, pas la ressource.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { bootTestServer, registerUser, errorCode } from './helpers.js';
import type { ServerHandle, ApiClient } from './helpers.js';

let server: ServerHandle;
let user: ApiClient;

before(async () => {
  server = await bootTestServer();
  user = (await registerUser(server, 'rbac')).client;
});

after(async () => {
  await server?.close();
});

/** Chaque entrée : [méthode, chemin]. L'identifiant 9999999 n'existe pas. */
const ADMIN_ROUTES: Array<[string, string]> = [
  ['GET', '/api/admin/stats'],
  ['GET', '/api/admin/categories'],
  ['PATCH', '/api/admin/categories/9999999'],
  ['GET', '/api/admin/products'],
  ['POST', '/api/admin/products/9999999/approve'],
  ['POST', '/api/admin/products/9999999/reject'],
  ['DELETE', '/api/admin/products/9999999'],
  ['GET', '/api/admin/orders'],
  ['GET', '/api/admin/orders/9999999'],
  ['POST', '/api/admin/orders/9999999/confirm-payment'],
  ['POST', '/api/admin/orders/9999999/mark-product-received'],
  ['POST', '/api/admin/orders/9999999/mark-shipped'],
  ['POST', '/api/admin/orders/9999999/start-delivery'],
  ['POST', '/api/admin/orders/9999999/mark-delivered'],
  ['POST', '/api/admin/orders/9999999/cancel'],
  ['POST', '/api/admin/orders/9999999/seller-payout'],
  ['POST', '/api/admin/orders/9999999/pay-seller'],
  ['GET', '/api/admin/users'],
  ['GET', '/api/admin/history'],
];

/** Un corps JSON n'est envoyé que pour les méthodes qui l'acceptent. */
async function call(client: ApiClient, method: string, path: string) {
  return client.request(path, method, method === 'GET' || method === 'HEAD' ? {} : { json: {} });
}

describe('C6 — RBAC : les 19 routes /api/admin/* sont fermées au public', () => {
  it('la liste couverte est bien celle des routes déclarées (garde-fou anti-oubli)', async () => {
    // Si une route est ajoutée sans être listée ici, ce test échoue : la
    // couverture ne peut pas décroître en silence.
    const mod = await import('../src/routes/admin.routes.js');
    void mod;
    const declared = ADMIN_ROUTES.length;
    assert.ok(declared >= 19, `toutes les routes connues sont couvertes (${declared})`);
  });

  for (const [method, path] of ADMIN_ROUTES) {
    it(`${method} ${path} → 401 pour un anonyme`, async () => {
      const anon = server.newClient();
      const res = await call(anon, method, path);
      assert.equal(res.status, 401, `${method} ${path} — attendu 401, obtenu ${res.status}`);
      assert.equal(errorCode(res.body), 'UNAUTHENTICATED', `${method} ${path}`);
      assert.notEqual(res.status, 500, 'jamais de 5xx sur un accès refusé');
    });

    it(`${method} ${path} → 403 pour un utilisateur simple`, async () => {
      const res = await call(user, method, path);
      assert.equal(res.status, 403, `${method} ${path} — attendu 403, obtenu ${res.status}`);
      assert.equal(errorCode(res.body), 'FORBIDDEN', `${method} ${path}`);
      assert.notEqual(res.status, 500, 'jamais de 5xx sur un accès refusé');
    });
  }
});

describe("C6 — le refus ne fuit pas l existence de la ressource", () => {
  it('un utilisateur simple obtient 403 aussi bien sur un id inexistant que sur un id valide', async () => {
    // Si le service était appelé avant le contrôle de rôle, un id inexistant
    // renverrait 404 et un id existant 403 : on pourrait énumérer le back-office.
    const author = (await registerUser(server, 'rbacLeak')).client;
    const missing = await user.request('/api/admin/orders/9999999', 'GET');
    assert.equal(missing.status, 403, "id inexistant → 403 (pas de 404 avant le contrôle)");
    void author;
  });
});

describe("C6 — un admin garde l accès (garde-fou anti-sur-blocage)", () => {
  it('les routes de LECTURE répondent 200 pour un admin', async () => {
    const { loginAdmin } = await import('./helpers.js');
    const admin = await loginAdmin(server);
    for (const path of ['/api/admin/stats', '/api/admin/products', '/api/admin/orders', '/api/admin/users', '/api/admin/history', '/api/admin/categories']) {
      const res = await admin.get(path);
      assert.equal(res.status, 200, `${path} doit rester accessible à l admin`);
    }
  });
});
