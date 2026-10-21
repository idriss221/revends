/**
 * CYCLE DE COMMANDE V3 (DDL 003 + api.md §3.6) — chaîne positive complète,
 * transitions invalides rejetées (409 INVALID_TRANSITION + currentStatus),
 * annulation pré-paiement, seller-payout sans event, vues admin/acheteur/vendeur.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  bootTestServer, registerUser, loginAdmin, createApprovedProduct, createOrder,
  errorCode, dbQuery, assertPublicUserClean,
} from './helpers.js';
import type { ServerHandle, ApiClient } from './helpers.js';

let server: ServerHandle;
let admin: ApiClient;
let seller: ApiClient;
let buyer: ApiClient;

before(async () => {
  server = await bootTestServer();
  admin = await loginAdmin(server);
  seller = (await registerUser(server, 'v3s')).client;
  buyer = (await registerUser(server, 'v3b')).client;
});

after(async () => {
  await server?.close();
});

/** Produit + commande fraîche réservée (PAYMENT_PENDING). */
async function freshOrder(name = 'Article V3') {
  const product = await createApprovedProduct(seller, admin, { name, price: 200_000 });
  const { body } = await createOrder(buyer, product.id, 'MOBILE_MONEY');
  return { product, order: body.order };
}

/** Passe la commande jusqu'au statut PAID (2 events) via l'endpoint admin. */
async function paidOrder(name = 'Article pour email') {
  const buyerAccount = await registerUser(server, 'mailbuy');
  const buyer = buyerAccount.client;
  const product = await createApprovedProduct(seller, admin, { name });
  const { status, body } = await createOrder(buyer, product.id);
  assert.equal(status, 201, `commande refusée : ${JSON.stringify(body)}`);
  const res = await admin.request(`/api/admin/orders/${body.order.id}/confirm-payment`, 'POST', {
    json: { method: 'MOBILE_MONEY' },
  });
  assert.equal(res.status, 200, `paiement refusé : ${JSON.stringify(res.body)}`);
  return { buyer, buyerAccount, product, order: body.order };
}

/**
 * Avance la commande jusqu'à `target` via les endpoints admin RÉELS, dans
 * l'ordre exact du cycle : après `confirm-payment` la commande est en
 * PRODUCT_WAITING ; `mark-shipped` exige PREPARING, donc `mark-product-received`
 * est obligatoire. Sauter une étape donne un 409 légitime, pas un bug du mailer.
 */
async function advanceTo(orderId: number, target: 'SHIPPED' | 'DELIVERED'): Promise<void> {
  const received = await admin.request(`/api/admin/orders/${orderId}/mark-product-received`, 'POST', {
    json: { note: 'Reçu par l\'atelier' },
  });
  assert.equal(received.status, 200, `mark-product-received : ${JSON.stringify(received.body)}`);

  const shipped = await admin.request(`/api/admin/orders/${orderId}/mark-shipped`, 'POST', { json: {} });
  assert.equal(shipped.status, 200, `mark-shipped : ${JSON.stringify(shipped.body)}`);

  if (target === 'SHIPPED') return;

  const started = await admin.request(`/api/admin/orders/${orderId}/start-delivery`, 'POST', {
    json: { carrier: 'Test' },
  });
  assert.equal(started.status, 200, `start-delivery : ${JSON.stringify(started.body)}`);

  const delivered = await admin.request(`/api/admin/orders/${orderId}/mark-delivered`, 'POST', { json: {} });
  assert.equal(delivered.status, 200, `mark-delivered : ${JSON.stringify(delivered.body)}`);
}

const transitionCodes = (res: any) => ({ status: res.status, code: errorCode(res.body), current: (res.body as any).error?.currentStatus });

describe('Chaîne positive V3+V4 : achat → confirm → reçu → prête → livraison → livré → payé', () => {
  it('la chaîne complète déroule 10 statuts et 10 events (1 changement = 1 ligne)', async () => {
    const { order } = await freshOrder('GoPro Hero');
    assert.equal(order.status, 'PAYMENT_PENDING');

    // 1. confirm-payment → PRODUCT_WAITING (2 events)
    const c = (await admin.post(`/api/admin/orders/${order.id}/confirm-payment`, { method: 'CASH', reference: 'REF-V3' })).body as any;
    assert.equal(c.order.status, 'PRODUCT_WAITING');

    // 2. mark-product-received → PREPARING (2 events)
    const r = (await admin.post(`/api/admin/orders/${order.id}/mark-product-received`, { note: 'Produit conforme' })).body as any;
    assert.equal(r.order.status, 'PREPARING');
    assert.equal(r.order.events.at(-2).note, 'Produit conforme', 'la note admin est portée par l’event PRODUCT_WAITING→PRODUCT_RECEIVED');

    // 2bis. mark-shipped → SHIPPED « Prête/Expédiée » (1 event, V4)
    const s = (await admin.post(`/api/admin/orders/${order.id}/mark-shipped`)).body as any;
    assert.equal(s.order.status, 'SHIPPED');
    assert.equal(s.order.events.at(-1).fromStatus, 'PREPARING');
    assert.equal(s.order.events.at(-1).toStatus, 'SHIPPED');
    assert.equal(s.order.events.at(-1).actor, 'admin');

    // 3. start-delivery → IN_DELIVERY (1 event) + transporteur/suivi persistés
    const d = (await admin.post(`/api/admin/orders/${order.id}/start-delivery`, { carrier: 'DHL', trackingNumber: 'TRK-001' })).body as any;
    assert.equal(d.order.status, 'IN_DELIVERY');
    assert.equal(d.order.deliveryCarrier, 'DHL');
    assert.equal(d.order.trackingNumber, 'TRK-001');

    // 4. mark-delivered → COMPLETED (2 events) + payout PENDING → DUE (V4)
    const v = (await admin.post(`/api/admin/orders/${order.id}/mark-delivered`)).body as any;
    assert.equal(v.order.status, 'COMPLETED');
    assert.equal(v.order.events.length, 10, '10 events du cycle (payout non concerné)');
    assert.equal(v.order.events.at(-1).toStatus, 'COMPLETED');
    assert.equal(v.order.events.at(-1).actor, 'system');
    assert.equal(v.order.payout.status, 'DUE', 'payout « À payer » dès la livraison (V4)');

    // 5. seller-payout : payout DUE → PAID, statut & events INCHANGÉS
    const p = (await admin.post(`/api/admin/orders/${order.id}/seller-payout`, { reference: 'PAY-V3' })).body as any;
    assert.equal(p.order.status, 'COMPLETED');
    assert.equal(p.order.payout.status, 'PAID');
    assert.equal(p.order.events.length, 10, 'aucun event ajouté par seller-payout (CHG-5)');

    // 6. notifications de toute la chaîne (acheteur N4/N10/N11bis/N11/N12, vendeur N9/N13/N6/N8)
    const buyerTypes = ((await buyer.get('/api/me/notifications')).body as any).items.map((n: any) => n.type);
    for (const t of ['payment_confirmed', 'order_product_received', 'order_shipped', 'order_in_delivery', 'order_delivered']) {
      assert.ok(buyerTypes.includes(t), `acheteur notifié ${t}`);
    }
    const sellerTypes = ((await seller.get('/api/me/notifications')).body as any).items.map((n: any) => n.type);
    for (const t of ['order_product_waiting', 'order_completed', 'seller_paid', 'article_sold']) {
      assert.ok(sellerTypes.includes(t), `vendeur notifié ${t}`);
    }
  });
});

describe('Transitions invalides → 409 INVALID_TRANSITION + currentStatus', () => {
  it('mark-product-received depuis un statut invalide (ex. COMPLETED)', async () => {
    // On mène une commande jusqu'à COMPLETED (paiement confirmé + livraison)
    const { buyerAccount, order } = await paidOrder('Article complet');
    await advanceTo(order.id, 'DELIVERED'); // → COMPLETED (system)
    // Puis on tente mark-product-received → doit échouer (déjà livré)
    const res = await admin.post(`/api/admin/orders/${order.id}/mark-product-received`, {});
    assert.equal(errorCode(res.body), 'INVALID_TRANSITION');
    assert.equal((res.body as any).error.currentStatus, 'COMPLETED');
  });

  it('mark-shipped hors PREPARING', async () => {
    const { order } = await freshOrder('Sigma FP');
    const res = await admin.post(`/api/admin/orders/${order.id}/mark-shipped`);
    assert.equal(errorCode(res.body), 'INVALID_TRANSITION');
    assert.equal((res.body as any).error.currentStatus, 'PAYMENT_PENDING');
  });

  it('start-delivery hors SHIPPED (PREPARING insuffisant depuis V4)', async () => {
    const { order } = await freshOrder('Sony A7');
    await admin.post(`/api/admin/orders/${order.id}/confirm-payment`, { method: 'CASH' });
    await admin.post(`/api/admin/orders/${order.id}/mark-product-received`, {});
    // À PREPARING le départ n'est PAS encore autorisé : il faut d'abord mark-shipped.
    const res = await admin.post(`/api/admin/orders/${order.id}/start-delivery`, { carrier: 'DHL' });
    assert.equal(errorCode(res.body), 'INVALID_TRANSITION');
    assert.equal((res.body as any).error.currentStatus, 'PREPARING');
  });

  it('start-delivery hors SHIPPED (commande fraîche)', async () => {
    const { order } = await freshOrder('Sony A7 II');
    const res = await admin.post(`/api/admin/orders/${order.id}/start-delivery`, { carrier: 'DHL' });
    assert.equal(errorCode(res.body), 'INVALID_TRANSITION');
    assert.equal((res.body as any).error.currentStatus, 'PAYMENT_PENDING');
  });

  it('mark-delivered hors IN_DELIVERY', async () => {
    const { order } = await freshOrder('DJI Mini');
    await admin.post(`/api/admin/orders/${order.id}/confirm-payment`, { method: 'CASH' });
    const res = await admin.post(`/api/admin/orders/${order.id}/mark-delivered`);
    assert.equal(errorCode(res.body), 'INVALID_TRANSITION');
    assert.equal((res.body as any).error.currentStatus, 'PRODUCT_WAITING');
  });

  it('confirm-payment hors PAYMENT_PENDING (déjà CANCELLED)', async () => {
    const { order } = await freshOrder('Nike Air');
    await admin.post(`/api/admin/orders/${order.id}/cancel`, { note: 'Duplicate' });
    const res = await admin.post(`/api/admin/orders/${order.id}/confirm-payment`, { method: 'CASH' });
    assert.equal(errorCode(res.body), 'INVALID_TRANSITION');
    assert.equal((res.body as any).error.currentStatus, 'CANCELLED');
  });
});

describe('Annulation pré-paiement (CA-ORD08)', () => {
  it('cancel : note obligatoire, CANCELLED, paiement FAILED, produit AVAILABLE, AUCUNE notification', async () => {
    const { product, order } = await freshOrder('JBL Flip');
    const buyerNotificationsBefore = ((await buyer.get('/api/me/notifications')).body as any).items.length;

    const res = await admin.post(`/api/admin/orders/${order.id}/cancel`, { note: 'Délai trop long — acheteur décommandé' });
    assert.equal(res.status, 200);
    const o = (res.body as any).order;
    assert.equal(o.status, 'CANCELLED');
    assert.equal(o.events.at(-1).note, 'Délai trop long — acheteur décommandé');

    const pay = await dbQuery<{ status: string }>('SELECT status FROM payments WHERE order_id = $1', [order.id]);
    assert.equal(pay[0].status, 'FAILED');
    const prod = await dbQuery<{ status: string; reserved_until: string | null }>('SELECT status, reserved_until FROM products WHERE id = $1', [product.id]);
    assert.equal(prod[0].status, 'AVAILABLE');
    assert.equal(prod[0].reserved_until, null);

    const after = (await buyer.get('/api/me/notifications')).body as any;
    assert.equal(after.items.length, buyerNotificationsBefore, 'annulation = aucune notification (DDL 003 §7.2)');

    // l’article est de nouveau achetable
    const reBuyer = (await registerUser(server, 'v3c')).client;
    const rebuy = await createOrder(reBuyer, product.id);
    assert.equal(rebuy.status, 201);
  });

  it('cancel sans note → 400 VALIDATION_ERROR', async () => {
    const { order } = await freshOrder('Casio G-Shock');
    const res = await admin.post(`/api/admin/orders/${order.id}/cancel`, {});
    assert.equal(res.status, 400);
    assert.equal(errorCode(res.body), 'VALIDATION_ERROR');
  });

  it('cancel d’une commande déjà confirmée → 409 INVALID_TRANSITION', async () => {
    const { order } = await freshOrder('Rolleiflex');
    await admin.post(`/api/admin/orders/${order.id}/confirm-payment`, { method: 'CASH' });
    const res = await admin.post(`/api/admin/orders/${order.id}/cancel`, { note: 'Erreur' });
    assert.equal(errorCode(res.body), 'INVALID_TRANSITION');
  });
});

describe('Vues par rôle sur GET /api/orders/:id', () => {
  it('admin : détail admin complet (name/phone + events) via la route publique', async () => {
    const { order } = await freshOrder('Kindle Paperwhite');
    const res = await admin.get(`/api/orders/${order.id}`);
    assert.equal(res.status, 200);
    const o = (res.body as any).order;
    assert.ok(o.buyer.name && o.buyer.email, 'vue admin : coordonnées acheteur');
    assert.ok(Array.isArray(o.events) && o.events.length >= 2);
    assert.ok(o.payout === null || o.payout.status?.length, 'payout exposé (admin)');
  });

  it('vendeur : payment SANS reference, deliveryCarrier/trackingNumber visibles, events[]', async () => {
    const { order } = await freshOrder('HP Envy');
    await admin.post(`/api/admin/orders/${order.id}/confirm-payment`, { method: 'CASH', reference: 'REF-SECRETE' });
    const res = await seller.get(`/api/orders/${order.id}`);
    const o = (res.body as any).order;
    assert.equal(o.role, 'seller');
    assert.ok(!('reference' in o.payment), 'le vendeur ne voit PAS la référence du paiement acheteur');
    assert.equal(o.payment.status, 'PAID');
    assert.equal(o.deliveryCarrier, null);
    assert.ok(o.events.length >= 4);
  });

  it('acheteur : vue liste /api/me/orders SANS events/role/buyer mais AVEC delivery', async () => {
    const { order } = await freshOrder('Samsung Tab');
    const list = (await buyer.get('/api/me/orders')).body as any;
    const item = list.items.find((o: any) => o.id === order.id);
    assert.ok(item, 'commande dans l’historique acheteur');
    assert.ok(!('events' in item) && !('role' in item) && !('buyer' in item), 'liste = résumé sans events/role/buyer');
    assert.ok('deliveryCarrier' in item && 'trackingNumber' in item, 'liste expose deliveryCarrier/trackingNumber');
    assert.ok(!('amount' in item.payment), 'liste : payment sans amount');
  });
});

describe('Intégrité événementielle en base', () => {
  it('chaque ligne order_events respecte la matrice (actor system/admin, from→to cohérents)', async () => {
    const { order } = await freshOrder('Oppo Reno');
    await admin.post(`/api/admin/orders/${order.id}/confirm-payment`, { method: 'CASH' });
    await admin.post(`/api/admin/orders/${order.id}/mark-product-received`, {});
    await admin.post(`/api/admin/orders/${order.id}/mark-shipped`);
    await admin.post(`/api/admin/orders/${order.id}/start-delivery`, {});
    await admin.post(`/api/admin/orders/${order.id}/mark-delivered`);

    const events = await dbQuery<{ from_status: string | null; to_status: string; actor: string }>(
      'SELECT from_status, to_status, actor FROM order_events WHERE order_id = $1 ORDER BY id', [order.id],
    );
    assert.deepEqual(
      events.map((e) => [e.from_status, e.to_status]),
      [
        [null, 'CREATED'],
        ['CREATED', 'PAYMENT_PENDING'],
        ['PAYMENT_PENDING', 'PAID'],
        ['PAID', 'PRODUCT_WAITING'],
        ['PRODUCT_WAITING', 'PRODUCT_RECEIVED'],
        ['PRODUCT_RECEIVED', 'PREPARING'],
        ['PREPARING', 'SHIPPED'],
        ['SHIPPED', 'IN_DELIVERY'],
        ['IN_DELIVERY', 'DELIVERED'],
        ['DELIVERED', 'COMPLETED'],
      ],
      'la timeline retrace exactement le cycle V3+V4',
    );
    assert.ok(events.filter((e) => e.actor === 'system').length >= 4);
  });
});

describe('Mes ventes — GET /api/me/sales (vue seller, D2)', () => {
  it('le vendeur liste ses ventes : résumé seller sans buyer coordonnées ni réf. paiement', async () => {
    const { order } = await freshOrder('Samsung S24');
    const list = (await seller.get('/api/me/sales')).body as any;
    assert.ok(Array.isArray(list.items), 'réponse items[]');
    const item = list.items.find((o: any) => o.id === order.id);
    assert.ok(item, 'la vente est visible par son vendeur');
    assert.equal(item.status, 'PAYMENT_PENDING');
    assert.ok(!('events' in item) && !('role' in item) && !('seller' in item), 'liste = résumé seller sans events/role/seller');
    assert.ok(!('reference' in item.payment), 'la réf. de paiement NE traverse PAS vers le vendeur (D2)');
    assert.ok(item.buyer && item.buyer.id > 0, 'buyer exposé en vue publique (id sain)');
    assertPublicUserClean(item.buyer, 'buyer de /api/me/sales');
    assert.ok(item.product.name, 'produit présent');
  });

  it("l'acheteur ne voit PAS ses achats dans /api/me/sales (liste vide ou filtrée)", async () => {
    const list = (await buyer.get('/api/me/sales')).body as any;
    assert.ok(Array.isArray(list.items));
    assert.equal(list.items.length, 0, 'aucune commande d’achat ne remonte comme vente');
  });
});