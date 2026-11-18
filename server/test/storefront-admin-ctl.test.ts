/**
 * V8.1 — « Contrôle boutique ».
 *
 * Couvre côté serveur :
 *   déactivation admin (ACTIVE → CANCELLED, réversible : 200 / 403 non-admin /
 *   404 inexistant / 404 non-ACTIVE, trace admin_actions, articles & listings
 *   CONSERVÉS, badge dérivé disparu) · suppression définitive admin (forfait
 *   d'un autre vendeur : CANCELLED + articles soft-deleted + listings
 *   supprimés, boutique 404, catalogue vide, trace) · suppression article par
 *   le propriétaire (204 hard delete sans commande · ligne DB disparue ·
 *   409 PRODUCT_ORDER_ACTIVE avec commande active · 204 soft-delete si
 *   commandes liées terminées · non-propriétaire 404 · anonyme 401 · fiche/
 *   catalogue/boutique/listing introuvables après suppression · trace).
 *
 * Aucun pipeline commande/paiement/checkout/rating/commission n'est touché ;
 * les assertions sur orders sont en lecture seule (statut forcé via SQL).
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  bootTestServer,
  registerUser,
  loginAdmin,
  createProduct,
  createApprovedProduct,
  createOrder,
  dbQuery,
  errorCode,
} from './helpers.js';
import type { ServerHandle, TestUser } from './helpers.js';
import { storeBadge } from '../src/utils/storefront-badges.js';
import { clearSentMails, recentSentMails } from '../src/mail/mailer.js';

let server: ServerHandle;
let admin: Awaited<ReturnType<typeof loginAdmin>>;

async function activateFor(user: TestUser, planId: number, slug: string): Promise<number> {
  const res = await user.client.post('/api/subscriptions', {
    planId,
    slug,
    paymentMethod: 'wave',
    paymentReference: 'WAVE-TEST-0000001',
  });
  assert.equal(res.status, 201, `subscribe → ${res.status} ${JSON.stringify(res.body)}`);
  const subId = (res.body as any).subscription.id as number;
  const act = await admin.post(`/api/admin/subscriptions/${subId}/activate`, {});
  assert.equal(act.status, 200, `activate → ${act.status} ${JSON.stringify(act.body)}`);
  return subId;
}

async function addListing(user: TestUser, productId: number): Promise<void> {
  const res = await user.client.post('/api/storefront/listings', { productId });
  assert.equal(res.status, 201, `listing → ${res.status} ${JSON.stringify(res.body)}`);
}

before(async () => {
  server = await bootTestServer();
  admin = await loginAdmin(server);
});

after(async () => {
  await server?.close();
});

// ---------------------------------------------------------------------------
// 1. POST /api/admin/subscriptions/:id/deactivate — ACTIVE → CANCELLED (réversible)
// ---------------------------------------------------------------------------

describe('V8.1 — deactivate (admin) : ACTIVE → CANCELLED, réversible', () => {
  it('admin → 200, subscription CANCELLED + merchantActive=false, trace, articles/listings CONSERVÉS', async () => {
    const seller = await registerUser(server, 'ctldeact');
    const subId = await activateFor(seller, 1, 'Ctl Deact Un');
    const { id: productId } = await createApprovedProduct(seller.client, admin, { name: 'CtlDeact Article Un' });
    await addListing(seller, productId);

    const res = await admin.post(`/api/admin/subscriptions/${subId}/deactivate`, {});
    assert.equal(res.status, 200, `deactivate → ${res.status} ${JSON.stringify(res.body)}`);
    const sub = (res.body as any).subscription;
    assert.equal(sub.id, subId);
    assert.equal(sub.status, 'CANCELLED');
    assert.equal(sub.merchantActive, false);

    // Trace admin_actions
    const trace = await dbQuery<{ action: string; target_type: string }>(
      `SELECT action, target_type FROM admin_actions WHERE target_id = $1 AND action = 'subscription.deactivate'`,
      [subId],
    );
    assert.equal(trace.length, 1);
    assert.equal(trace[0]!.target_type, 'subscription');

    // Réversible : article et listing CONSERVÉS (pas de soft-delete, pas de DELETE)
    const products = await dbQuery<{ deleted_at: string | null }>(
      'SELECT deleted_at FROM products WHERE id = $1',
      [productId],
    );
    assert.equal(products[0]!.deleted_at, null, 'deactivate ne doit PAS soft-delete les articles');
    const listings = await dbQuery<{ count: string }>(
      'SELECT COUNT(*)::int AS count FROM storefront_listings WHERE product_id = $1',
      [productId],
    );
    assert.equal(Number(listings[0]!.count), 1, 'deactivate ne doit PAS supprimer les listings');
  });

  it('non-admin (user) → 403 FORBIDDEN', async () => {
    const seller = await registerUser(server, 'ctldeact403');
    const subId = await activateFor(seller, 1, 'Ctl Deact Deux');
    const user = await registerUser(server, 'ctldeact403u');
    const res = await user.client.post(`/api/admin/subscriptions/${subId}/deactivate`, {});
    assert.equal(res.status, 403);
    assert.equal(errorCode(res.body), 'FORBIDDEN');
  });

  it('subscription inexistante → 404 NOT_FOUND', async () => {
    const res = await admin.post('/api/admin/subscriptions/99999999/deactivate', {});
    assert.equal(res.status, 404);
    assert.equal(errorCode(res.body), 'NOT_FOUND');
  });

  it('subscription non ACTIVE (PENDING) → 404 ; re-deactivate (CANCELLED) → 404', async () => {
    const seller = await registerUser(server, 'ctldeact404');
    const sub = await seller.client.post('/api/subscriptions', {
      planId: 1,
      slug: 'Ctl Deact Trois',
      paymentMethod: 'wave',
      paymentReference: 'WAVE-TEST-0000002',
    });
    const subId = (sub.body as any).subscription.id as number;
    const pending = await admin.post(`/api/admin/subscriptions/${subId}/deactivate`, {});
    assert.equal(pending.status, 404, 'PENDING → 404 attendu');

    const seller2 = await registerUser(server, 'ctldeact404b');
    const activeId = await activateFor(seller2, 1, 'Ctl Deact Quatre');
    const first = await admin.post(`/api/admin/subscriptions/${activeId}/deactivate`, {});
    assert.equal(first.status, 200);
    const second = await admin.post(`/api/admin/subscriptions/${activeId}/deactivate`, {});
    assert.equal(second.status, 404, 'déjà CANCELLED → 404 attendu');
  });
});

// ---------------------------------------------------------------------------
// 2. POST /api/admin/subscriptions/:id/delete — DÉFINITIF
// ---------------------------------------------------------------------------

describe('V8.1 — delete (admin) : définitif', () => {
  it('forfait d’un autre vendeur → 200 : CANCELLED + articles soft-deleted + listings supprimés + trace', async () => {
    const other = await registerUser(server, 'ctldel-other');
    const subId = await activateFor(other, 1, 'Ctl Del Cinq');
    const { id: productId } = await createApprovedProduct(other.client, admin, { name: 'CtlDel Article Cinq' });
    await addListing(other, productId);

    // L’admin n’est PAS le vendeur : le forfait cible est celui d’un autre.
    const res = await admin.post(`/api/admin/subscriptions/${subId}/delete`, {});
    assert.equal(res.status, 200, `delete → ${res.status} ${JSON.stringify(res.body)}`);
    const sub = (res.body as any).subscription;
    assert.equal(sub.id, subId);
    assert.equal(sub.status, 'CANCELLED');
    assert.equal(sub.merchantActive, false);

    const products = await dbQuery<{ deleted_at: string | null }>(
      'SELECT deleted_at FROM products WHERE id = $1',
      [productId],
    );
    assert.ok(products[0]!.deleted_at, 'tous les articles du vendeur doivent être soft-deleted');

    const listings = await dbQuery<{ count: string }>(
      'SELECT COUNT(*)::int AS count FROM storefront_listings WHERE subscription_id = $1',
      [subId],
    );
    assert.equal(Number(listings[0]!.count), 0, 'les listings du vendeur doivent être supprimés');

    const trace = await dbQuery<{ action: string; target_type: string }>(
      `SELECT action, target_type FROM admin_actions WHERE target_id = $1 AND action = 'subscription.delete'`,
      [subId],
    );
    assert.equal(trace.length, 1);
    assert.equal(trace[0]!.target_type, 'subscription');
  });

  it('subscription inexistante → 404', async () => {
    const res = await admin.post('/api/admin/subscriptions/99999999/delete', {});
    assert.equal(res.status, 404);
    assert.equal(errorCode(res.body), 'NOT_FOUND');
  });

  it('non-admin (user) → 403 FORBIDDEN', async () => {
    const other = await registerUser(server, 'ctldel403');
    const subId = await activateFor(other, 1, 'Ctl Del Six');
    const user = await registerUser(server, 'ctldel403u');
    const res = await user.client.post(`/api/admin/subscriptions/${subId}/delete`, {});
    assert.equal(res.status, 403);
  });

  it('supprimée définitivement : boutique 404 + catalogue vide', async () => {
    const seller = await registerUser(server, 'ctldelshop');
    const token = `ctldel${Date.now()}`;
    const subId = await activateFor(seller, 1, 'Ctl Del Sept');
    const { id: productId, slug } = await createApprovedProduct(seller.client, admin, { name: `${token} article` });
    await addListing(seller, productId);

    const beforeShop = await registerUser(server, 'ctldelpeek');
    assert.equal((await beforeShop.client.get('/api/storefront/ctl-del-sept')).status, 200);

    const res = await admin.post(`/api/admin/subscriptions/${subId}/delete`, {});
    assert.equal(res.status, 200);

    const shop = await beforeShop.client.get('/api/storefront/ctl-del-sept');
    assert.equal(shop.status, 404, 'boutique supprimée → 404 attendu');

    const catalog = await beforeShop.client.get(`/api/products?q=${token}`);
    assert.equal(catalog.status, 200);
    assert.equal(((catalog.body as any).items as unknown[]).length, 0, 'catalogue vide après delete définitif');

    const fiche = await beforeShop.client.get(`/api/products/${slug}`);
    assert.equal(fiche.status, 404, 'fiche introuvable après soft-delete');
  });
});

// ---------------------------------------------------------------------------
// 3. DELETE /api/me/products/:id — propriétaire
// ---------------------------------------------------------------------------

describe('V8.1 — DELETE /api/me/products/:id (propriétaire)', () => {
  it('sans commande → 204 et ligne DB réellement supprimée (hard delete)', async () => {
    const seller = await registerUser(server, 'ctlowner1');
    const { id: productId } = await createApprovedProduct(seller.client, admin, { name: 'CtlOwner Article Un' });

    const res = await seller.client.request(`/api/me/products/${productId}`, 'DELETE');
    assert.equal(res.status, 204, `delete → ${res.status}`);

    const rows = await dbQuery<{ count: string }>('SELECT COUNT(*)::int AS count FROM products WHERE id = $1', [productId]);
    assert.equal(Number(rows[0]!.count), 0, 'la ligne products doit être supprimée');

    const trace = await dbQuery<{ action: string }>(
      `SELECT action FROM admin_actions WHERE target_id = $1 AND action = 'product.owner_delete'`,
      [productId],
    );
    assert.equal(trace.length, 1);
  });

  it('avec une commande ACTIVE (PAYMENT_PENDING) → 409 PRODUCT_ORDER_ACTIVE', async () => {
    const seller = await registerUser(server, 'ctlowner2');
    const buyer = await registerUser(server, 'ctlowner2b');
    const { id: productId } = await createApprovedProduct(seller.client, admin, { name: 'CtlOwner Article Deux' });
    const order = await createOrder(buyer.client, productId);
    assert.equal(order.status, 201, `order → ${order.status}`);

    const res = await seller.client.request(`/api/me/products/${productId}`, 'DELETE');
    assert.equal(res.status, 409, `delete → ${res.status} ${JSON.stringify(res.body)}`);
    assert.equal(errorCode(res.body), 'PRODUCT_ORDER_ACTIVE');

    const rows = await dbQuery<{ count: string }>('SELECT COUNT(*)::int AS count FROM products WHERE id = $1', [productId]);
    assert.equal(Number(rows[0]!.count), 1, 'le produit doit toujours exister après un 409');
  });

  it('commandes liées toutes TERMINÉES → 204 via soft-delete (deleted_at posé, ligne conservée)', async () => {
    const seller = await registerUser(server, 'ctlowner3');
    const buyer = await registerUser(server, 'ctlowner3b');
    const { id: productId } = await createApprovedProduct(seller.client, admin, { name: 'CtlOwner Article Trois' });
    const order = await createOrder(buyer.client, productId);
    assert.equal(order.status, 201);
    // Force la commande en CANCELLED (hors ACTIVE_ORDER_STATUSES_SQL) — matrice 007.
    await dbQuery(`UPDATE orders SET status = 'CANCELLED' WHERE product_id = $1`, [productId]);

    const res = await seller.client.request(`/api/me/products/${productId}`, 'DELETE');
    assert.equal(res.status, 204, `delete → ${res.status}`);

    const rows = await dbQuery<{ deleted_at: string | null }>('SELECT deleted_at FROM products WHERE id = $1', [productId]);
    assert.equal(rows.length, 1, 'la ligne doit être conservée (soft-delete)');
    assert.ok(rows[0]!.deleted_at, 'deleted_at doit être posé');
  });

  it('non-propriétaire → 404 ; anonyme → 401', async () => {
    const seller = await registerUser(server, 'ctlowner4');
    const other = await registerUser(server, 'ctlowner4b');
    const { id: productId } = await createApprovedProduct(seller.client, admin, { name: 'CtlOwner Article Quatre' });

    const notOwner = await other.client.request(`/api/me/products/${productId}`, 'DELETE');
    assert.equal(notOwner.status, 404);

    const anon = await server.newClient();
    const unauth = await anon.request(`/api/me/products/${productId}`, 'DELETE');
    assert.equal(unauth.status, 401);
  });

  it('après suppression : catalogue/fiche/boutique/listing introuvables', async () => {
    const seller = await registerUser(server, 'ctlowner5');
    const token = `ctlowner${Date.now()}`;
    const subId = await activateFor(seller, 1, 'Ctl Owner Cinq');
    const { id: productId, slug } = await createApprovedProduct(seller.client, admin, { name: `${token} article disparu` });
    await addListing(seller, productId);

    const check = await registerUser(server, 'ctlowner5peek');
    assert.equal((await check.client.get(`/api/products/${slug}`)).status, 200);
    const shopBefore = await check.client.get('/api/storefront/ctl-owner-cinq');
    assert.equal(((shopBefore.body as any).items as unknown[]).length, 1, 'annonce visible avant suppression');

    const res = await seller.client.request(`/api/me/products/${productId}`, 'DELETE');
    assert.equal(res.status, 204);

    assert.equal((await check.client.get(`/api/products/${slug}`)).status, 404, 'fiche introuvable');
    const catalog = await check.client.get(`/api/products?q=${token}`);
    assert.equal(((catalog.body as any).items as unknown[]).length, 0, 'absent du catalogue');
    const shopAfter = await check.client.get('/api/storefront/ctl-owner-cinq');
    assert.equal(shopAfter.status, 200, 'la boutique existe toujours');
    assert.equal(((shopAfter.body as any).items as unknown[]).length, 0, 'listing introuvable en boutique');
    const listings = await dbQuery<{ count: string }>(
      'SELECT COUNT(*)::int AS count FROM storefront_listings WHERE product_id = $1',
      [productId],
    );
    assert.equal(Number(listings[0]!.count), 0, 'listing supprimé en base (cascade)');
    void subId;
  });
});

// ---------------------------------------------------------------------------
// 4. Badge dérivé après déactivation (boutique restent ACTIVE pour d'autres tests)
// ---------------------------------------------------------------------------

describe('V8.1 — badges après déactivation', () => {
  it('badge « boutique » visible au catalogue, puis DISPARAÎT après deactivate (dérivé, aucune écriture boost)', async () => {
    const seller = await registerUser(server, 'ctlbadge');
    const token = `ctlbadge${Date.now()}`;
    await activateFor(seller, 1, 'Ctl Badge Huit');
    await createApprovedProduct(seller.client, admin, { name: `${token} article badge` });

    const peek = await registerUser(server, 'ctlbadgepeek');
    const before = await peek.client.get(`/api/products?q=${token}`);
    const itemBefore = ((before.body as any).items as Array<{ sellerBadge?: string | null }>)[0];
    assert.equal(itemBefore?.sellerBadge, 'boutique', `badge avant → ${itemBefore?.sellerBadge}`);
    assert.equal(await storeBadge(seller.id!), 'boutique');

    // Déactivation admin → badge dérivé nul SANS écriture sur products
    const subs = await dbQuery<{ id: number }>(
      `SELECT id FROM seller_subscriptions WHERE seller_id = $1 AND status = 'ACTIVE'`,
      [seller.id!],
    );
    const res = await admin.post(`/api/admin/subscriptions/${subs[0]!.id}/deactivate`, {});
    assert.equal(res.status, 200);

    const afterRes = await peek.client.get(`/api/products?q=${token}`);
    const itemAfter = ((afterRes.body as any).items as Array<{ sellerBadge?: string | null }>)[0];
    assert.equal(itemAfter?.sellerBadge ?? null, null, 'plus de badge après déactivation');
    assert.equal(await storeBadge(seller.id!), null);
  });
});

describe('V8.2 — refus d\'une demande d\'abonnement en attente', () => {
  it('refus → CANCELLED + e-mail au vendeur avec le motif', async () => {
    const previousMailEnabled = process.env.MAIL_ENABLED;
    process.env.MAIL_ENABLED = 'true';
    clearSentMails();
    try {
    const seller = await registerUser(server, 'v8refuse');
    const res = await seller.client.post('/api/subscriptions', {
      planId: 1,
      slug: 'Refus Test Post ' + Date.now().toString(36),
      paymentMethod: 'wave',
      paymentReference: 'WAVE-REJECT-' + Date.now(),
    });
    assert.equal(res.status, 201);
    const sub = (res.body as any).subscription;

    const reject = await admin.post(`/api/admin/subscriptions/${sub.id}/reject`, {
      reason: 'Référence introuvable dans Wave — contrôle automatisé insuffisant.',
    });
    assert.equal(reject.status, 200, JSON.stringify(reject.body));
    assert.equal((reject.body as any).subscription.status, 'CANCELLED');

    // Vérifier que l'e-mail de refus a été enregistré.
    const sent = recentSentMails().filter((m) => m.event === 'subscription_refused');
    assert.equal(sent.length, 1, 'un e-mail subscription_refused doit être envoyé au vendeur');
    assert.ok((sent[0].subject || '').length > 0);
    } finally {
      process.env.MAIL_ENABLED = previousMailEnabled;
    }
  });

  it('refuser sur un abonnement déjà actif → 409 INVALID_STATUS', async () => {
    const seller = await registerUser(server, 'v8refuseact');
    const res = await seller.client.post('/api/subscriptions', {
      planId: 1,
      slug: 'Actif Refus Tst ' + Date.now().toString(36),
      paymentMethod: 'wave',
      paymentReference: 'WAVE-REJTAF-' + Date.now(),
    });
    assert.equal(res.status, 201);
    const subId = (res.body as any).subscription.id as number;
    const act = await admin.post(`/api/admin/subscriptions/${subId}/activate`, {});
    assert.equal(act.status, 200);
    const reject = await admin.post(`/api/admin/subscriptions/${subId}/reject`, {
      reason: 'Subtest interdit après activation',
    });
    assert.equal(reject.status, 409);
    assert.equal((reject.body as any).error?.code, 'INVALID_STATUS');
  });

  it('motif trop court → 400 VALIDATION_ERROR', async () => {
    const seller = await registerUser(server, 'v8shortref');
    const res = await seller.client.post('/api/subscriptions', {
      planId: 1,
      slug: 'Court Motif ' + Date.now().toString(36),
      paymentMethod: 'wave',
      paymentReference: 'WAVE-SHORTR-' + Date.now(),
    });
    assert.equal(res.status, 201);
    const subId = (res.body as any).subscription.id as number;
    const reject = await admin.post(`/api/admin/subscriptions/${subId}/reject`, { reason: 'court' });
    assert.equal(reject.status, 400);
    assert.equal((reject.body as any).error?.code, 'VALIDATION_ERROR');
  });
});
