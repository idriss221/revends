/**
 * ACHAT (US-BUY, CA-BUY01) — réservation, concurrence (deux acheteurs en
 * parallèle sur le même article → UN seul gagnant), auto-achat interdit,
 * accès par rôle (0/1 tiers, buyer/seller).
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  bootTestServer, registerUser, loginAdmin, createApprovedProduct, createOrder,
  assertPublicUserClean, errorCode,
} from './helpers.js';
import type { ServerHandle, ApiClient } from './helpers.js';

let server: ServerHandle;
let seller: ApiClient;
let admin: ApiClient;

before(async () => {
  server = await bootTestServer();
  admin = await loginAdmin(server);
  seller = (await registerUser(server, 'sell')).client;
});

after(async () => {
  await server?.close();
});

describe('POST /api/orders — CA-BUY01-01/02', () => {
  let product: { id: number; slug: string };
  let buyer: ApiClient;

  before(async () => {
    product = await createApprovedProduct(seller, admin, { name: 'Samsung Galaxy' });
    buyer = (await registerUser(server, 'buy')).client;
  });

  it('201 : commande PAYMENT_PENDING exposée (CREATED est transitoire, D-V3-2)', async () => {
    const { status, body } = await createOrder(buyer, product.id);
    assert.equal(status, 201);
    const order = body.order;
    assert.equal(order.status, 'PAYMENT_PENDING');
    assert.equal(order.amount, 100_000); // prix produit
    assert.equal(order.buyer.id, (await meId(buyer)).id);
    assert.equal(typeof order.orderNumber, 'string');
    assert.ok(order.orderNumber.length >= 5);
    // Commission 10 % (config) + montant vendeur : cf. CA-ACHAT (commission)
    assert.equal(order.commission, 10_000);
    assert.equal(order.sellerAmount, 90_000);
  });

  it('201 : payload V3 complet — events[] (2 lignes initiales), deliveryCarrier/trackingNumber null, role buyer', async () => {
    const fresh = await createApprovedProduct(seller, admin, { name: 'Pixel 8' });
    const { status, body } = await createOrder(buyer, fresh.id);
    assert.equal(status, 201);
    const order = body.order;
    assert.equal(order.role, 'buyer');
    assert.equal(order.deliveryCarrier, null);
    assert.equal(order.trackingNumber, null);
    assert.ok(Array.isArray(order.events) && order.events.length === 2, '2 events initiaux (NULL→CREATED puis CREATED→PAYMENT_PENDING)');
    assert.equal(order.events[0].fromStatus, null);
    assert.equal(order.events[0].toStatus, 'CREATED');
    assert.equal(order.events[0].actor, 'system');
    assert.equal(order.events[1].fromStatus, 'CREATED');
    assert.equal(order.events[1].toStatus, 'PAYMENT_PENDING');
    assert.ok(order.reservedUntil, 'reservedUntil présent');
  });

  it('produit devient RESERVÉ : status RESERVED + réservation horodatée (D3)', async () => {
    const res = await server.newClient().get(`/api/products/${product.slug}`);
    const p = res.body as any;
    assert.equal(p.status, 'RESERVED');
    assert.ok(p.reservedUntil, 'reservedUntil présent');
  });

  it('l’article RESERVÉ disparaît du catalogue public (p. RESERVED exclu des listings)', async () => {
    const res = await server.newClient().get('/api/products');
    const body = res.body as any;
    assert.ok(!body.items.some((x: any) => x.slug === product.slug));
  });

  it('deuxième achat pendant la réservation → 409 PRODUCT_RESERVED (CA-BUY01-03)', async () => {
    const second = (await registerUser(server, 'late')).client;
    const { status, body } = await createOrder(second, product.id);
    assert.equal(status, 409);
    assert.equal(errorCode(body), 'PRODUCT_RESERVED');
  });

  it('backup : commande sur produit INEXISTANT → 404 PRODUCT_NOT_FOUND', async () => {
    const { status, body } = await createOrder(buyer, 987654321);
    assert.equal(status, 404);
    assert.equal(errorCode(body), 'PRODUCT_NOT_FOUND');
  });

  it('auto-achat (vendeur = acheteur) → 400 SELF_PURCHASE (CA-BUY01-05, T12)', async () => {
    // produit FRAIS et AVAILABLE appartenant au vendeur : la garde auto-achat
    // passe AVANT la réservation (sinon on obtiendrait un 409 de réservation).
    const own = await createApprovedProduct(seller, admin, { name: 'Mon propre bien' });
    const { status, body } = await createOrder(seller, own.id);
    assert.equal(status, 400);
    assert.equal(errorCode(body), 'SELF_PURCHASE');
    assert.match((body as any).error.message, /propre article/);
  });

  it('méthode de paiement invalide → 400 VALIDATION_ERROR', async () => {
    const res = await buyer.request('/api/orders', 'POST', { json: { productId: product.id, paymentMethod: 'BTC' } });
    assert.equal(res.status, 400);
  });

  it('POST /api/orders non authentifié → 401 UNAUTHENTICATED', async () => {
    const res = await server.newClient().request('/api/orders', 'POST', { json: { productId: product.id } });
    assert.equal(res.status, 401);
    assert.equal(errorCode(res.body), 'UNAUTHENTICATED');
  });

  async function meId(client: ApiClient): Promise<{ id: number }> {
    const me = await client.get('/api/auth/me');
    return (me.body as any).user;
  }
});

describe('Concurrence réelle — CA-BUY01-03 (race condition)', () => {
  it('deux POST parallèles sur le même article : exactement un 201 et un 409', async () => {
    const product = await createApprovedProduct(seller, admin, { name: 'iPhone 13', price: 500_000 });
    const b1 = (await registerUser(server, 'race1')).client;
    const b2 = (await registerUser(server, 'race2')).client;

    const [r1, r2] = await Promise.all([
      createOrder(b1, product.id),
      createOrder(b2, product.id),
    ]);
    const codes = [r1.status, r2.status].sort((a, b) => a - b);
    assert.deepEqual(codes, [201, 409]);

    const winner = r1.status === 201 ? r1 : r2;
    const loser = r1.status === 201 ? r2 : r1;
    assert.equal(winner.body.order.status, 'PAYMENT_PENDING');
    assert.equal(errorCode(loser.body), 'PRODUCT_RESERVED');
  });
});

describe('Droits d’accès aux commandes (CA-BUY01-04, §1.4)', () => {
  let product: { id: number; slug: string };
  let buyer: ApiClient;
  let orderId: number;

  before(async () => {
    product = await createApprovedProduct(seller, admin, { name: 'Riviera PC portable' });
    buyer = (await registerUser(server, 'vBuy')).client;
    const { body } = await createOrder(buyer, product.id);
    orderId = body.order.id;
  });

  it('l’acheteur voit SA commande : rôle buyer, montant, vendeur RG 7.7', async () => {
    const res = await buyer.get(`/api/orders/${orderId}`);
    assert.equal(res.status, 200);
    const order = (res.body as any).order;
    assert.equal(order.id, orderId);
    assert.equal(order.role, 'buyer');
    assert.equal(order.status, 'PAYMENT_PENDING');
    assert.ok(Array.isArray(order.events) && order.events.length >= 2, 'events[] accessible en vue détail');
    assertPublicUserClean(order.seller, 'seller (GET /api/orders/:id)');
  });

  it('le vendeur voit la commande avec rôle seller', async () => {
    const res = await seller.get(`/api/orders/${orderId}`);
    assert.equal(res.status, 200);
    const order = (res.body as any).order;
    assert.equal(order.role, 'seller');
    assertPublicUserClean(order.buyer, 'buyer (vue vendeur)');
  });

  it('un TIERS ne voit pas la commande → 404 ORDER_NOT_FOUND (pas de fuite)', async () => {
    const third = (await registerUser(server, 'voyeur')).client;
    const res = await third.get(`/api/orders/${orderId}`);
    assert.equal(res.status, 404);
    assert.equal(errorCode(res.body), 'ORDER_NOT_FOUND');
  });

  it('historique acheteur : /api/me/orders contient la commande', async () => {
    const res = await buyer.get('/api/me/orders');
    const items = (res.body as any).items;
    assert.ok(Array.isArray(items) && items.length >= 1);
    assert.ok(items.some((o: any) => o.id === orderId));
  });

  it('création de commande valide : notifications N3 (acheteur) + N5 (vendeur) INSÉRÉES', async () => {
    const buyerNotif = await buyer.get('/api/me/notifications');
    const types = (buyerNotif.body as any).items.map((n: any) => n.type);
    assert.ok(types.includes('order_created'), 'acheteur notifié');
    const sellerNotif = await seller.get('/api/me/notifications');
    const stypes = (sellerNotif.body as any).items.map((n: any) => n.type);
    assert.ok(stypes.includes('article_reserved'), 'vendeur notifié');
  });
});