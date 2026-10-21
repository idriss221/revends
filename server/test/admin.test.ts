/**
 * ADMIN — dashboard stats (CA-ADM01), modération produits (CA-ADM02), liste
 * commandes/filtres (CA-ADM03/04), utilisateurs (CA-ADM05), catégories
 * (CA-ADM06), historique des actions (CA-ADM07). RG : jamais de password_hash.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  bootTestServer, registerUser, loginAdmin, createApprovedProduct, createProduct,
  createOrder, dbQuery,
} from './helpers.js';
import type { ServerHandle, ApiClient } from './helpers.js';

let server: ServerHandle;
let admin: ApiClient;
let seller: ApiClient;

before(async () => {
  server = await bootTestServer();
  admin = await loginAdmin(server);
  seller = (await registerUser(server, 'sell')).client;
});

after(async () => {
  await server?.close();
});

describe('CA-ADM01 — dashboard stats', () => {
  it('compteurs cohérents après création de données', async () => {
    await createProduct(seller); // PENDING
    const res = await admin.get('/api/admin/stats');
    assert.equal(res.status, 200);
    const s = res.body as any;
    assert.equal(typeof s.users, 'number');
    assert.equal(typeof s.pendingProducts, 'number');
    assert.equal(typeof s.activeOrders, 'number');
    assert.equal(typeof s.pendingPayouts, 'number');
    // V4 : nouveaux compteurs « à payer » + répartition orders par statut (rétrocompat).
    assert.equal(typeof s.payoutsDue, 'number');
    assert.equal(typeof s.payoutsDueAmount, 'number');
    assert.equal(typeof s.orders, 'object');
    for (const k of ['paymentPending', 'productWaiting', 'productReceived', 'preparing', 'shipped', 'inDelivery', 'delivered', 'completed']) {
      assert.equal(typeof s.orders[k], 'number', `stats.orders.${k} présent`);
    }
    assert.ok(s.users >= 1, 'au moins le vendeur');
    assert.ok(s.pendingProducts >= 1, 'au moins un produit en attente');
  });

  it('une commande livrée alimente payoutsDue + payoutsDueAmount ; SHIPPED/COMPLETED comptés', async () => {
    const buyer = (await registerUser(server, 'astat')).client;
    const p = await createApprovedProduct(seller, admin, { name: 'Stats livraison', price: 200_000 });
    const { body } = await createOrder(buyer, p.id);
    await admin.request(`/api/admin/orders/${body.order.id}/confirm-payment`, 'POST', { json: { method: 'CASH' } });
    await admin.request(`/api/admin/orders/${body.order.id}/mark-product-received`, 'POST', { json: {} });
    await admin.request(`/api/admin/orders/${body.order.id}/mark-shipped`, 'POST', { json: {} });

    const mid = (await admin.get('/api/admin/stats')).body as any;
    assert.ok(mid.orders.shipped >= 1, 'la commande SHIPPED est comptée dans orders.shipped');
    assert.equal(mid.payoutsDue, 0, 'aucun DUE avant livraison');

    await admin.request(`/api/admin/orders/${body.order.id}/start-delivery`, 'POST', { json: {} });
    await admin.request(`/api/admin/orders/${body.order.id}/mark-delivered`, 'POST', { json: {} });
    const after = (await admin.get('/api/admin/stats')).body as any;
    assert.ok(after.payoutsDue >= 1, 'payout DUE compté (CA-ADM04-01 V4)');
    assert.ok(after.payoutsDueAmount >= 180_000, 'somme des seller_amount DUE (200 000 − 10 %)');
    assert.ok(after.orders.completed >= 1, 'la commande COMPLETED est comptée pour le dashboard');
    assert.equal(after.orders.shipped, 0, 'plus aucune commande SHIPPED après livraison');
  });
});

describe('CA-ADM02 — file de modération', () => {
  it('GET /api/admin/products?status=PENDING → items + propriétaire (AdminUser)', async () => {
    const res = await admin.get('/api/admin/products?status=PENDING');
    const b = res.body as any;
    assert.ok(Array.isArray(b.items) && b.items.length >= 1);
    const item = b.items[0];
    assert.equal(item.status, 'PENDING');
    assert.ok(item.owner.displayName);
    assert.ok(item.owner.email, 'admin voit l’email du propriétaire');
    assert.ok(!('passwordHash' in item.owner) && !('password_hash' in item.owner));
  });

  it('filtre status=REJECTED vide au départ puis remplit après un refus', async () => {
    const empty = (await admin.get('/api/admin/products?status=REJECTED')).body as any;
    assert.equal(empty.total, 0);
    const p = await createProduct(seller, { name: 'Spam à refuser' });
    await admin.request(`/api/admin/products/${p.id}/reject`, 'POST', { json: { reason: 'Produit interdit' } });
    const filled = (await admin.get('/api/admin/products?status=REJECTED')).body as any;
    assert.equal(filled.total, 1);
  });
});

describe('CA-ADM03/04 — commandes et paiements vendeurs', () => {
  it('liste admin : la commande créée apparaît (PAYMENT_PENDING) avec montants', async () => {
    const buyer = (await registerUser(server, 'abuy')).client;
    const p = await createApprovedProduct(seller, admin, { name: 'Ordre 1' });
    await createOrder(buyer, p.id);

    const list = (await admin.get('/api/admin/orders?status=PAYMENT_PENDING')).body as any;
    assert.ok(list.items.length >= 1);
    const item = list.items[0];
    assert.equal(item.status, 'PAYMENT_PENDING');
    assert.equal(item.amount, p.product.price);
    assert.equal(typeof item.orderNumber, 'string');
  });

  it('le paiement vendeur PENDING alimente le compteur pendingPayouts et le filtre payout=pending', async () => {
    const buyer = (await registerUser(server, 'abuy2')).client;
    const p = await createApprovedProduct(seller, admin, { name: 'Ordre 2' });
    const { body } = await createOrder(buyer, p.id);
    await admin.request(`/api/admin/orders/${body.order.id}/confirm-payment`, 'POST', { json: { method: 'CASH' } });

    const stats = (await admin.get('/api/admin/stats')).body as any;
    assert.ok(stats.pendingPayouts >= 1, 'payout PENDING compté (CA-ADM04-01)');

    const payoutFilter = (await admin.get(`/api/admin/orders?payout=pending&perPage=48`)).body as any;
    const items = payoutFilter.items as any[];
    assert.ok(items.some((o: any) => o.id === body.order.id), 'la commande au payout PENDING est visible via le filtre (CHG-10)');
  });
});

describe('CA-ADM05 — utilisateurs (lecture seule)', () => {
  it('liste admin : champs complets sauf mot de passe', async () => {
    const res = await admin.get('/api/admin/users');
    const b = res.body as any;
    assert.ok(b.items.length >= 1);
    const u = b.items[0];
    assert.ok(u.displayName && u.email && u.phone && u.memberSince);
    assert.equal(typeof u.productCount, 'number');
    assert.ok(!('passwordHash' in u) && !('password_hash' in u));
  });
});

describe('CA-ADM06 — catégories', () => {
  it('PATCH renomme une sous-catégorie sans toucher au slug', async () => {
    const res = await admin.request('/api/admin/categories/13', 'PATCH', { json: { name: 'Téléphones & tablettes Premium' } });
    assert.equal(res.status, 200);
    const category = (res.body as any).category;
    assert.equal(category.name, 'Téléphones & tablettes Premium');
    assert.equal(category.slug, 'electronique-telephones');
  });

  it('PATCH bascule active → la catégorie disparaît du PUBLIC puis revient', async () => {
    await admin.request('/api/admin/categories/13', 'PATCH', { json: { active: false } });
    const pub = ((await server.newClient().get('/api/categories')).body as any).categories;
    const electronique = pub.find((c: any) => c.id === 3);
    assert.ok(!electronique.children.some((s: any) => s.id === 13), 'masquée du public');

    await admin.request('/api/admin/categories/13', 'PATCH', { json: { active: true } });
    const pub2 = ((await server.newClient().get('/api/categories')).body as any).categories;
    assert.ok(pub2.find((c: any) => c.id === 3).children.some((s: any) => s.id === 13));
  });

  it('rollback (409 CATEGORY_NAME_TAKEN) → AUCUNE trace admin_actions écrite dans la transaction', async () => {
    const countTraces = () =>
      dbQuery<{ n: number }>(
        "SELECT COUNT(*)::int AS n FROM admin_actions WHERE action = 'category.update' AND target_type = 'category' AND target_id = $1",
        [13],
      );
    const before = await countTraces();

    // « Ordinateurs » (14) est une sœur de « Téléphones & tablettes » (13) :
    // le contrôle d'unicité lève DANS la transaction, APRÈS
    // `findCategoryById` mais AVANT (ou avec) `insertAdminAction`.
    const res = await admin.request('/api/admin/categories/13', 'PATCH', { json: { name: 'Ordinateurs' } });
    assert.equal(res.status, 409);
    assert.equal((res.body as any).error.code, 'CATEGORY_NAME_TAKEN');

    const after = await countTraces();
    assert.equal(after[0]!.n, before[0]!.n, 'le rollback ne doit laisser aucune trace');
  });

  it('PATCH sans champ → 400 VALIDATION_ERROR', async () => {
    const res = await admin.request('/api/admin/categories/13', 'PATCH', { json: {} });
    assert.equal(res.status, 400);
  });

  it('chaque PATCH écrit EXACTEMENT UNE trace admin_actions category.update, visible dans l\'historique (CA-ADM07)', async () => {
    const countTraces = () =>
      dbQuery<{ n: number }>(
        "SELECT COUNT(*)::int AS n FROM admin_actions WHERE action = 'category.update' AND target_type = 'category' AND target_id = $1",
        [13],
      );
    const before = await countTraces();

    const res = await admin.request('/api/admin/categories/13', 'PATCH', { json: { name: 'Téléphones & tablettes Traçés' } });
    assert.equal(res.status, 200);

    const after = await countTraces();
    assert.equal(after[0]!.n, before[0]!.n + 1, 'exactement une nouvelle trace pour ce PATCH');

    const history = await admin.get('/api/admin/history?action=category.update');
    assert.equal(history.status, 200);
    const items = (history.body as any).items as any[];
    const hit = items.find((a) => a.action === 'category.update' && a.targetType === 'category' && a.targetId === 13);
    assert.ok(hit, 'retrouvable via GET /api/admin/history?action=category.update');
    assert.ok(hit.description.includes('renommée'), 'description lisible (avant → après)');
  });
});

describe('Alias contractuels des listes admin (api.md §1.5 — per_page / target_type)', () => {
  it('?per_page=1 renvoie 1 item et perPage=1 (alias → perPage)', async () => {
    const res = await admin.get('/api/admin/history?per_page=1');
    assert.equal(res.status, 200);
    const b = res.body as any;
    assert.equal(b.items.length, 1);
    assert.equal(b.perPage, 1);
  });

  it('?per_page=999 → 400 VALIDATION_ERROR (borne max 48 préservée)', async () => {
    const res = await admin.get('/api/admin/history?per_page=999');
    assert.equal(res.status, 400);
  });

  it('?target_type=product accepté sur /history (alias → targetType)', async () => {
    const res = await admin.get('/api/admin/history?target_type=product&per_page=48');
    assert.equal(res.status, 200);
    const items = (res.body as any).items as any[];
    assert.ok(items.length >= 1, 'au moins une action product existante');
    assert.ok(items.every((h) => h.targetType === 'product'), 'filtre appliqué');
  });

  it('l\'alias per_page fonctionne aussi sur /products, /orders et /users', async () => {
    for (const path of [
      '/api/admin/products?status=PENDING&per_page=1',
      '/api/admin/orders?per_page=1',
      '/api/admin/users?per_page=1',
    ]) {
      const res = await admin.get(path);
      assert.equal(res.status, 200, path);
      assert.equal((res.body as any).perPage, 1, path);
      assert.ok(((res.body as any).items as any[]).length <= 1, path);
    }
  });
});

describe('CA-ADM07 — historique des actions', () => {
  it('approbation + refus tracés dans admin_actions', async () => {
    const okP = await createProduct(seller, { name: 'Tracé approuvé' });
    const koP = await createProduct(seller, { name: 'Tracé refusé' });
    await admin.request(`/api/admin/products/${okP.id}/approve`, 'POST', { json: {} });
    await admin.request(`/api/admin/products/${koP.id}/reject`, 'POST', { json: { reason: 'Informations incomplètes' } });

    const hist = (await admin.get('/api/admin/history?perPage=48')).body as any;
    const actions = hist.items.map((h: any) => h.action);
    assert.ok(actions.includes('product.approved'));
    assert.ok(actions.includes('product.rejected'));
    assert.ok(hist.items.every((h: any) => h.admin?.displayName && h.admin?.email), 'chaque ligne trace l’admin (CA-ADM07)');

    const filter = (await admin.get('/api/admin/history?action=product.rejected')).body as any;
    assert.ok(filter.items.every((h: any) => h.action === 'product.rejected'));
  });
});

describe('Gardes d’accès (T04)', () => {
  it('user sur routes admin → 403 FORBIDDEN', async () => {
    for (const path of ['/api/admin/stats', '/api/admin/products?status=PENDING', '/api/admin/users', '/api/admin/history']) {
      const res = await seller.get(path);
      assert.equal(res.status, 403, path);
    }
  });

  it('admin sur routes USER → 403 FORBIDDEN', async () => {
    const res = await admin.get('/api/me/products');
    assert.equal(res.status, 403);
  });
});