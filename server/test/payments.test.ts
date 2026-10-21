/**
 * PAIEMENTS (V3) — chaîne complète admin : confirmation paiement acheteur
 * (PAYMENT_PENDING → PAID → PRODUCT_WAITING, D6/D7), activité logistique
 * (mark-product-received), paiement du vendeur (seller-payout, CHG-5),
 * états terminaux, doubles-actions rejetées (409 + currentStatus),
 * vues admin riches, RG 7.7 respecté côté acheteur/vendeur.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  bootTestServer, registerUser, loginAdmin, createApprovedProduct, createOrder,
  errorCode, dbQuery,
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

/** Crée un produit approuvé + le réserve pour un acheteur. Retourne ids. */
async function setupOrder() {
  const buyer = (await registerUser(server, 'paie')).client;
  const product = await createApprovedProduct(seller, admin, { name: 'MacBook Air', price: 750_000 });
  const { body } = await createOrder(buyer, product.id, 'BANK_TRANSFER');
  return { buyer, product, order: body.order };
}

describe('Confirmation du paiement acheteur (CA-ACHAT-ADMIN, D6/D7 — V3)', () => {
  it('admin confirme → PRODUCT_WAITING + paiement PAID + payout PENDING créé', async () => {
    const { order, buyer } = await setupOrder();
    const res = await admin.request(`/api/admin/orders/${order.id}/confirm-payment`, 'POST', {
      json: { method: 'MOBILE_MONEY', reference: 'MOOV-9876' },
    });
    assert.equal(res.status, 200);
    const adminOrder = (res.body as any).order;
    assert.equal(adminOrder.status, 'PRODUCT_WAITING');
    assert.equal(adminOrder.payment.status, 'PAID');
    assert.equal(adminOrder.payment.reference, 'MOOV-9876');
    assert.equal(adminOrder.payout.status, 'PENDING');
    assert.equal(adminOrder.payout.amount, 675_000); // 750 000 - 10 %

    // produit définitivement SOLD dès la confirmation (D5)
    const sold = await dbQuery<{ status: string; sold_at: string | null }>(
      'SELECT status, sold_at FROM products WHERE id = $1', [order.product.id as number] as any,
    );
    assert.equal(sold[0].status, 'SOLD');
    assert.ok(sold[0].sold_at, 'sold_at horodaté (V3, colonne 003 section 6)');

    const buyerView = (await buyer.get(`/api/orders/${order.id}`)).body as any;
    assert.equal(buyerView.order.status, 'PRODUCT_WAITING');
    // timeline : les 2 events initiaux + PAYMENT_PENDING→PAID + PAID→PRODUCT_WAITING
    assert.ok(buyerView.order.events.length >= 4, 'events[] retrace la confirmation');
  });

  it('confirm-payment sans method → 400 VALIDATION_ERROR', async () => {
    const { order } = await setupOrder();
    const res = await admin.request(`/api/admin/orders/${order.id}/confirm-payment`, 'POST', { json: {} });
    assert.equal(res.status, 400);
    assert.equal(errorCode(res.body), 'VALIDATION_ERROR');
  });

  it('USER (non admin) → 403 FORBIDDEN', async () => {
    const { order, buyer } = await setupOrder();
    const res = await buyer.request(`/api/admin/orders/${order.id}/confirm-payment`, 'POST', {
      json: { method: 'MOBILE_MONEY' },
    });
    assert.equal(res.status, 403);
  });

  it('double confirmation → 409 INVALID_TRANSITION + currentStatus=PRODUCT_WAITING', async () => {
    const { order } = await setupOrder();
    await admin.request(`/api/admin/orders/${order.id}/confirm-payment`, 'POST', { json: { method: 'CASH' } });
    const again = await admin.request(`/api/admin/orders/${order.id}/confirm-payment`, 'POST', { json: { method: 'CASH' } });
    assert.equal(again.status, 409);
    assert.equal(errorCode(again.body), 'INVALID_TRANSITION');
    assert.equal((again.body as any).error.currentStatus, 'PRODUCT_WAITING');
  });

  it('confirmation sur commande INEXISTANTE → 404 ORDER_NOT_FOUND', async () => {
    const res = await admin.request('/api/admin/orders/424242/confirm-payment', 'POST', { json: { method: 'CASH' } });
    assert.equal(res.status, 404);
  });
});

describe('Paiement du vendeur (seller-payout, V4 — cycle PENDING → DUE → PAID)', () => {
  it('seller-payout : payé UNIQUEMENT après livraison — PENDING avant, DUE à la livraison, PAID au paiement', async () => {
    const { order } = await setupOrder();
    await admin.request(`/api/admin/orders/${order.id}/confirm-payment`, 'POST', { json: { method: 'MOBILE_MONEY' } });
    await admin.request(`/api/admin/orders/${order.id}/mark-product-received`, 'POST', { json: {} });
    await admin.request(`/api/admin/orders/${order.id}/mark-shipped`, 'POST', { json: {} });
    await admin.request(`/api/admin/orders/${order.id}/start-delivery`, 'POST', { json: {} });

    // Avant la livraison : payout toujours PENDING, non payable.
    const before = (await admin.get(`/api/admin/orders/${order.id}`)).body as any;
    assert.equal(before.order.payout.status, 'PENDING', 'payout PENDING tant que non livré');

    // mark-delivered → payout PENDING → DUE (« À payer ») dans la même txn.
    const delivered = (await admin.request(`/api/admin/orders/${order.id}/mark-delivered`, 'POST', { json: {} })).body as any;
    assert.equal(delivered.order.status, 'COMPLETED');
    assert.equal(delivered.order.payout.status, 'DUE', 'payout « À payer » dès la livraison (V4)');
    const eventsBefore = delivered.order.events.length;

    // seller-payout : payout DUE → PAID SANS changement de statut ni event.
    const res = await admin.request(`/api/admin/orders/${order.id}/seller-payout`, 'POST', { json: { reference: 'PAY-0001' } });
    assert.equal(res.status, 200);
    const o = (res.body as any).order;
    assert.equal(o.status, 'COMPLETED'); // seller-payout ne CHANGE PAS le statut (CHG-5)
    assert.equal(o.payout.status, 'PAID');
    assert.equal(o.payout.paidAt !== null, true);
    assert.equal(o.events.length, eventsBefore, 'aucun order_events ajouté par seller-payout');

    // produit SOLD (vendu dès confirm-payment)
    const pub = await server.newClient().get(`/api/products/${o.product.slug}`);
    assert.equal((pub.body as any).status, 'SOLD');

    // notifications vendeur N6 + N8
    const sellerNotif = await seller.get('/api/me/notifications');
    const types = (sellerNotif.body as any).items.map((n: any) => n.type);
    assert.ok(types.includes('seller_paid'));
    assert.ok(types.includes('article_sold'));
  });

  it('seller-payout AVANT confirmation (aucun payout) → 409 PAYOUT_NOT_PENDING', async () => {
    const { order } = await setupOrder();
    const res = await admin.request(`/api/admin/orders/${order.id}/seller-payout`, 'POST', { json: {} });
    assert.equal(res.status, 409);
    assert.equal(errorCode(res.body), 'PAYOUT_NOT_PENDING');
  });

  it('seller-payout en PRODUCT_WAITING (payout PENDING mais commande pas livrée) → 409 ORDER_NOT_ALLOWED + currentStatus', async () => {
    const { order } = await setupOrder();
    await admin.request(`/api/admin/orders/${order.id}/confirm-payment`, 'POST', { json: { method: 'CASH' } });
    const res = await admin.request(`/api/admin/orders/${order.id}/seller-payout`, 'POST', { json: {} });
    assert.equal(res.status, 409);
    assert.equal(errorCode(res.body), 'ORDER_NOT_ALLOWED');
    assert.equal((res.body as any).error.currentStatus, 'PRODUCT_WAITING');
  });

  it('seller-payout REFUSÉ avant la livraison (PREPARING, payout encore PENDING) → 409 ORDER_NOT_ALLOWED', async () => {
    const { order } = await setupOrder();
    await admin.request(`/api/admin/orders/${order.id}/confirm-payment`, 'POST', { json: { method: 'CASH' } });
    await admin.request(`/api/admin/orders/${order.id}/mark-product-received`, 'POST', { json: {} });
    // Le cycle n'a pas quitté PREPARING : le payout n'est PAS encore exigible (V4).
    const res = await admin.request(`/api/admin/orders/${order.id}/seller-payout`, 'POST', { json: {} });
    assert.equal(res.status, 409);
    assert.equal(errorCode(res.body), 'ORDER_NOT_ALLOWED');
    assert.equal((res.body as any).error.currentStatus, 'PREPARING');
  });

  it('double seller-payout → 409 PAYOUT_NOT_PENDING (idempotence défensive)', async () => {
    const { order } = await setupOrder();
    await admin.request(`/api/admin/orders/${order.id}/confirm-payment`, 'POST', { json: { method: 'CASH' } });
    await admin.request(`/api/admin/orders/${order.id}/mark-product-received`, 'POST', { json: {} });
    await admin.request(`/api/admin/orders/${order.id}/mark-shipped`, 'POST', { json: {} });
    await admin.request(`/api/admin/orders/${order.id}/start-delivery`, 'POST', { json: {} });
    await admin.request(`/api/admin/orders/${order.id}/mark-delivered`, 'POST', { json: {} });
    await admin.request(`/api/admin/orders/${order.id}/seller-payout`, 'POST', { json: {} });
    const again = await admin.request(`/api/admin/orders/${order.id}/seller-payout`, 'POST', { json: {} });
    assert.equal(again.status, 409);
    assert.equal(errorCode(again.body), 'PAYOUT_NOT_PENDING');
  });

  it('ancienne route pay-seller → 410 ROUTE_DEPRECATED', async () => {
    const { order } = await setupOrder();
    const res = await admin.request(`/api/admin/orders/${order.id}/pay-seller`, 'POST', { json: {} });
    assert.equal(res.status, 410);
    assert.equal(errorCode(res.body), 'ROUTE_DEPRECATED');
  });
});

describe('Vue admin détail (CA-ADM-ORDERS)', () => {
  it('GET /api/admin/orders/:id expose buyer/seller COMPLETS (admin only), payout, produit, events', async () => {
    const { order } = await setupOrder();
    const res = await admin.get(`/api/admin/orders/${order.id}`);
    assert.equal(res.status, 200);
    const o = (res.body as any).order;
    assert.ok(o.buyer.name && o.buyer.phone, 'admin voit coordonnées acheteur (autorisé RG)');
    assert.ok(o.seller.name && o.seller.email, 'admin voit coordonnées vendeur');
    assert.ok(o.product.name && o.product.slug);
    assert.equal(o.payment.status, 'PENDING');
    assert.ok(Array.isArray(o.events) && o.events.length >= 2, 'détail admin = events[] inclus');
  });

  it('liste admin : filtre status=PAYMENT_PENDING + filtres payout=pending/due/paid', async () => {
    const pending = await admin.get('/api/admin/orders?status=PAYMENT_PENDING&perPage=48');
    const items = (pending.body as any).items;
    assert.ok(items.every((o: any) => o.status === 'PAYMENT_PENDING'));
    assert.ok(items.length >= 2, 'au moins 2 commandes en attente issues des tests précédents');

    // à ce stade, toutes les commandes PAYMENT_PENDING ont un payout (ou pas)…
    const payoutPending = await admin.get('/api/admin/orders?payout=pending&perPage=48');
    const pItems = (payoutPending.body as any).items as any[];
    assert.ok(Array.isArray(pItems) && pItems.length >= 1, 'au moins 1 payout PENDING (confirmé plus haut)');
    assert.ok(pItems.every((o: any) => o.payout?.status === 'PENDING'));

    // Commande livrée MAIS non payée → laisse un payout DUE en place pour le filtre due.
    const doc = await setupOrder();
    await admin.request(`/api/admin/orders/${doc.order.id}/confirm-payment`, 'POST', { json: { method: 'CASH' } });
    await admin.request(`/api/admin/orders/${doc.order.id}/mark-product-received`, 'POST', { json: {} });
    await admin.request(`/api/admin/orders/${doc.order.id}/mark-shipped`, 'POST', { json: {} });
    await admin.request(`/api/admin/orders/${doc.order.id}/start-delivery`, 'POST', { json: {} });
    await admin.request(`/api/admin/orders/${doc.order.id}/mark-delivered`, 'POST', { json: {} });

    // V4 : un payout DUE (livré à payer) et un payout PAID (réglé) remontent aussi
    // via le filtre (normalisation minuscules → enum MAJUSCULES dans listAdminOrders).
    const payoutDue = await admin.get('/api/admin/orders?payout=due&perPage=48');
    const dItems = (payoutDue.body as any).items as any[];
    assert.ok(dItems.some((o: any) => o.id === doc.order.id), 'la commande livrée non payée est visible via payout=due');
    assert.ok(dItems.every((o: any) => o.payout?.status === 'DUE'));

    const payoutPaid = await admin.get('/api/admin/orders?payout=paid&perPage=48');
    const pdItems = (payoutPaid.body as any).items as any[];
    assert.ok(pdItems.length >= 1, 'au moins 1 payout PAID (réglé plus haut)');
    assert.ok(pdItems.every((o: any) => o.payout?.status === 'PAID'));
  });

  it('admin orders : les buyer/seller exposés restent complets (aucune perte admin)', async () => {
    const list = await admin.get('/api/admin/orders');
    const items = (list.body as any).items;
    assert.ok(items.length >= 1);
    assert.ok(items[0].buyer.name, 'admin conserve name en liste');
  });
});

describe('Intégrité BDD post-paiement', () => {
  it('une commande SOLD laisse le produit vendu + AUCUNE réservation résiduelle', async () => {
    const sold = await dbQuery<{ status: string; reserved_until: string | null }>(
      `SELECT p.status, p.reserved_until FROM products p JOIN orders o ON o.product_id = p.id WHERE p.status = 'SOLD' LIMIT 1`,
    );
    assert.ok(sold.length >= 1, 'au moins un produit vendu dans ce process');
    assert.equal(sold[0].status, 'SOLD');
    assert.equal(sold[0].reserved_until, null);
  });
});