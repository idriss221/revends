/**
 * PANIER multi-produits — POST /api/orders/checkout (CA-BUY-PANIER) :
 * - checkout valide : 2 articles → 2 commandes (count=2), produits RESERVED,
 *   paiements PENDING, shipping + note acheteur persistés (vue acheteur/admin,
 *   JAMAIS en vue vendeur — RG 7.7 / D2).
 * - tout-ou-rien : un article déjà réservé dans le lot → 409 PRODUCT_RESERVED
 *   et la transaction ENTIÈRE est annulée (rollback, aucun ordre partiel).
 * - validation : tableau vide → 400 VALIDATION_ERROR.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  bootTestServer, registerUser, loginAdmin, createApprovedProduct, createOrder,
  dbQuery, errorCode,
} from './helpers.js';
import type { ServerHandle, ApiClient } from './helpers.js';

let server: ServerHandle;
let seller: ApiClient;
let admin: ApiClient;

const SHIPPING = {
  name: 'Idriss Diouf',
  phone: '+225 07 07 07 07 07',
  city: 'Abidjan, Cocody',
  address: 'Rue des Jardins, Immeuble Palmier, Appt 12',
};
const NOTE = 'Livrer de préférence en semaine';

before(async () => {
  server = await bootTestServer();
  admin = await loginAdmin(server);
  seller = (await registerUser(server, 'sell')).client;
});

after(async () => {
  await server?.close();
});

describe('POST /api/orders/checkout — panier multi-produits', () => {
  let buyer: ApiClient;
  let p1: { id: number; slug: string };
  let p2: { id: number; slug: string };

  before(async () => {
    buyer = (await registerUser(server, 'buy')).client;
    p1 = await createApprovedProduct(seller, admin, { name: 'Galaxy S24', price: 250_000 });
    p2 = await createApprovedProduct(seller, admin, { name: 'iPhone 15', price: 400_000 });
  });

  it('201 : checkout 2 articles → count=2, 2 commandes, produits RESERVED, paiements PENDING, shipping+note persistés', async () => {
    const res = await buyer.request('/api/orders/checkout', 'POST', {
      json: { productIds: [p1.id, p2.id], paymentMethod: 'MOBILE_MONEY', shipping: SHIPPING, note: NOTE },
    });
    assert.equal(res.status, 201);
    const { orders, count } = res.body as any;
    assert.equal(count, 2);
    assert.ok(Array.isArray(orders) && orders.length === 2, 'deux commandes dans la réponse');

    const orderIds: number[] = [];
    for (const order of orders) {
      orderIds.push(order.id);
      assert.equal(order.role, 'buyer');
      assert.equal(order.status, 'PAYMENT_PENDING');
      assert.equal(order.payment.status, 'PENDING');
      assert.deepEqual(order.shipping, SHIPPING, 'shipping exposé en vue acheteur');
      assert.equal(order.note, NOTE, 'note acheteur exposée en vue acheteur');
    }

    // Persistance BDD : colonnes livraison + buyer_note réellement écrites.
    const oRows = await dbQuery<{ shipping_name: string; shipping_phone: string; shipping_city: string; shipping_address: string; buyer_note: string }>(
      `SELECT shipping_name, shipping_phone, shipping_city, shipping_address, buyer_note
         FROM orders WHERE id = ANY($1::bigint[]) ORDER BY id`,
      [orderIds],
    );
    assert.equal(oRows.length, 2);
    for (const r of oRows) {
      assert.equal(r.shipping_name, SHIPPING.name);
      assert.equal(r.shipping_phone, SHIPPING.phone);
      assert.equal(r.shipping_city, SHIPPING.city);
      assert.equal(r.shipping_address, SHIPPING.address);
      assert.equal(r.buyer_note, NOTE);
    }

    // Paiements PENDING en base.
    const payRows = await dbQuery<{ status: string }>(
      'SELECT status FROM payments WHERE order_id = ANY($1::bigint[])',
      [orderIds],
    );
    assert.equal(payRows.length, 2);
    assert.ok(payRows.every((r) => r.status === 'PENDING'), 'tous les paiements PENDING');

    // Les deux produits passés RESERVED (D3).
    for (const p of [p1, p2]) {
      const prod = await server.newClient().get(`/api/products/${p.slug}`);
      assert.equal((prod.body as any).status, 'RESERVED', `${p.slug} → RESERVED`);
    }

    // Vue détail acheteur : shipping + note exposés.
    const detail = await buyer.get(`/api/orders/${orderIds[0]}`);
    assert.equal(detail.status, 200);
    const d = (detail.body as any).order;
    assert.deepEqual(d.shipping, SHIPPING);
    assert.equal(d.note, NOTE);

    // SÉCURITÉ : la vue vendeur ne fuit NI shipping NI note (RG 7.7 / D2).
    const sDetail = await seller.get(`/api/orders/${orderIds[0]}`);
    assert.equal(sDetail.status, 200);
    const so = (sDetail.body as any).order;
    assert.equal(so.shipping, undefined, 'shipping ne doit pas exister en vue vendeur');
    assert.equal(so.note, undefined, 'note acheteur ne doit pas exister en vue vendeur');
  });

  it('409 PRODUCT_RESERVED dans le lot → rollback atomique (aucune commande créée)', async () => {
    const fresh = await createApprovedProduct(seller, admin, { name: 'Laptop HP', price: 300_000 });
    const taken = await createApprovedProduct(seller, admin, { name: 'Tablette Samsung', price: 150_000 });

    // Un autre acheteur réserve `taken` AVANT le checkout.
    const other = (await registerUser(server, 'rr')).client;
    const first = await createOrder(other, taken.id);
    assert.equal(first.status, 201);

    // Le lot contient un article sain PUIS l'article déjà réservé : le premier
    // est créé dans la txn, puis l'erreur survient → TOUT doit être annulé.
    const res = await buyer.request('/api/orders/checkout', 'POST', {
      json: { productIds: [fresh.id, taken.id], paymentMethod: 'MOBILE_MONEY', shipping: SHIPPING },
    });
    assert.equal(res.status, 409);
    assert.equal(errorCode(res.body), 'PRODUCT_RESERVED');

    // Aucune commande pour le produit sain du lot (rollback).
    const freshCount = await dbQuery<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM orders WHERE product_id = $1',
      [fresh.id],
    );
    assert.equal(Number(freshCount[0]!.count), 0, "aucune commande fantôme après rollback");
    const freshRes = await server.newClient().get(`/api/products/${fresh.slug}`);
    assert.equal((freshRes.body as any).status, 'AVAILABLE', 'produit sain resté AVAILABLE');

    // La commande pré-existante de `taken` reste exactement 1 (intacte).
    const takenCount = await dbQuery<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM orders WHERE product_id = $1',
      [taken.id],
    );
    assert.equal(Number(takenCount[0]!.count), 1);
  });

  it('checkout sans produit (productIds: []) → 400 VALIDATION_ERROR', async () => {
    const res = await buyer.request('/api/orders/checkout', 'POST', {
      json: { productIds: [], paymentMethod: 'MOBILE_MONEY' },
    });
    assert.equal(res.status, 400);
    assert.equal(errorCode(res.body), 'VALIDATION_ERROR');
  });

  it('checkout sans shipping (rétro-compatibilité) → shipping null, note null', async () => {
    const bare = await createApprovedProduct(seller, admin, { name: 'Montre Casio', price: 60_000 });
    const res = await buyer.request('/api/orders/checkout', 'POST', {
      json: { productIds: [bare.id] },
    });
    assert.equal(res.status, 201);
    const order = (res.body as any).orders[0];
    assert.equal(order.shipping, null);
    assert.equal(order.note, null);
  });
});

describe('checkout avec quantités (005 — panier +/−)', () => {
  let buyer: ApiClient;

  before(async () => {
    buyer = (await registerUser(server, 'qbuy')).client;
  });

  it('201 : quantities { productId: 3 } → quantity 3, amount = prix×3, commission/seller_amount/paiement cohérents', async () => {
    const p = await createApprovedProduct(seller, admin, { name: 'Télé Qty', price: 250_000 });
    const res = await buyer.request('/api/orders/checkout', 'POST', {
      json: { productIds: [p.id], quantities: { [p.id]: 3 }, paymentMethod: 'MOBILE_MONEY' },
    });
    assert.equal(res.status, 201);
    const order = (res.body as any).orders[0];
    assert.equal(order.quantity, 3);
    assert.equal(order.amount, 750_000); // 250 000 × 3
    assert.equal(order.commission, 75_000); // floor(750 000 × 10 %)
    assert.equal(order.sellerAmount, 675_000);
    assert.equal(order.payment.amount, 750_000, 'paiement = montant de la commande (prix × quantité)');

    // Persistance BDD : quantité et montants réellement écrits.
    const rows = await dbQuery<{ quantity: number; amount: number; commission: number; seller_amount: number }>(
      'SELECT quantity, amount, commission, seller_amount FROM orders WHERE id = $1',
      [order.id],
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.quantity, 3);
    assert.equal(rows[0]!.amount, 750_000);
    assert.equal(rows[0]!.commission, 75_000);
    assert.equal(rows[0]!.seller_amount, 675_000);
    assert.equal(rows[0]!.amount, rows[0]!.commission + rows[0]!.seller_amount, 'chk_amount_consistency');
  });

  it('201 (régression) : checkout sans quantities → quantity 1 et amount = prix', async () => {
    const p = await createApprovedProduct(seller, admin, { name: 'Télé Simple', price: 300_000 });
    const res = await buyer.request('/api/orders/checkout', 'POST', {
      json: { productIds: [p.id], paymentMethod: 'MOBILE_MONEY' },
    });
    assert.equal(res.status, 201);
    const order = (res.body as any).orders[0];
    assert.equal(order.quantity, 1);
    assert.equal(order.amount, 300_000);
    assert.equal(order.commission, 30_000);
    assert.equal(order.sellerAmount, 270_000);
  });

  it('400 INVALID_QUANTITY : quantité 0', async () => {
    const p = await createApprovedProduct(seller, admin, { name: 'Télé Zero', price: 100_000 });
    const res = await buyer.request('/api/orders/checkout', 'POST', {
      json: { productIds: [p.id], quantities: { [p.id]: 0 } },
    });
    assert.equal(res.status, 400);
    assert.equal(errorCode(res.body), 'INVALID_QUANTITY');
  });

  it('400 INVALID_QUANTITY : quantité > 9', async () => {
    const p = await createApprovedProduct(seller, admin, { name: 'Télé Dix', price: 100_000 });
    const res = await buyer.request('/api/orders/checkout', 'POST', {
      json: { productIds: [p.id], quantities: { [p.id]: 10 } },
    });
    assert.equal(res.status, 400);
    assert.equal(errorCode(res.body), 'INVALID_QUANTITY');
  });

  it('400 INVALID_QUANTITY : quantité non-entière', async () => {
    const p = await createApprovedProduct(seller, admin, { name: 'Télé Demi', price: 100_000 });
    const res = await buyer.request('/api/orders/checkout', 'POST', {
      json: { productIds: [p.id], quantities: { [p.id]: 2.5 } },
    });
    assert.equal(res.status, 400);
    assert.equal(errorCode(res.body), 'INVALID_QUANTITY');
  });

  it('400 INVALID_QUANTITY : quantité pour un id absent de productIds', async () => {
    const p = await createApprovedProduct(seller, admin, { name: 'Télé Fantôme', price: 100_000 });
    const res = await buyer.request('/api/orders/checkout', 'POST', {
      json: { productIds: [p.id], quantities: { [p.id + 999]: 2 } },
    });
    assert.equal(res.status, 400);
    assert.equal(errorCode(res.body), 'INVALID_QUANTITY');
  });

  it('uq_one_active_order_per_product : 1 seule ligne orders par produit (la quantité vit sur la commande)', async () => {
    const p = await createApprovedProduct(seller, admin, { name: 'Télé Uni', price: 50_000 });
    const res = await buyer.request('/api/orders/checkout', 'POST', {
      json: { productIds: [p.id], quantities: { [p.id]: 5 } },
    });
    assert.equal(res.status, 201);
    const count = await dbQuery<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM orders WHERE product_id = $1',
      [p.id],
    );
    assert.equal(Number(count[0]!.count), 1, 'aucune ligne dupliquée malgré la quantité');
  });

  it('quantity exposée dans les vues acheteur détail, vendeur détail et admin (shipping reste privé vendeur)', async () => {
    const p = await createApprovedProduct(seller, admin, { name: 'Télé Vues', price: 200_000 });
    const res = await buyer.request('/api/orders/checkout', 'POST', {
      json: { productIds: [p.id], quantities: { [p.id]: 2 } },
    });
    assert.equal(res.status, 201);
    const orderId = (res.body as any).orders[0].id;

    const detail = await buyer.get(`/api/orders/${orderId}`);
    assert.equal((detail.body as any).order.quantity, 2, 'vue acheteur détail');

    const sDetail = await seller.get(`/api/orders/${orderId}`);
    assert.equal(sDetail.status, 200);
    const so = (sDetail.body as any).order;
    assert.equal(so.quantity, 2, 'vue vendeur détail expose quantity');
    assert.equal(so.shipping, undefined, 'shipping reste privé côté vendeur (D2 inchangée)');

    const list = (await admin.get('/api/admin/orders?status=PAYMENT_PENDING&perPage=48')).body as any;
    const adminItem = (list.items as any[]).find((o: any) => o.id === orderId);
    assert.ok(adminItem, 'commande visible en liste admin');
    assert.equal(adminItem.quantity, 2, 'vue admin expose quantity');
  });
});

describe('POST /api/orders/checkout — ordre de verrouillage déterministe (anti-deadlock)', () => {
  let lockBuyer: ApiClient;

  before(async () => {
    lockBuyer = (await registerUser(server, 'buy')).client;
  });

  it('productIds non triés → verrouillage par produit id croissant (FAIL si ordre client respecté)', async () => {
    const a = await createApprovedProduct(seller, admin, { name: 'Verrou A', price: 10_000 });
    const b = await createApprovedProduct(seller, admin, { name: 'Verrou B', price: 20_000 });
    assert.ok(a.id < b.id, 'précondition : a créé avant b');

    // On envoie volontairement l'ORDRE INVERSE (b avant a). Le service doit
    // malgré tout verrouiller par id croissant pour ne pas se bloquer
    // mutuellement avec un checkout concurrent (deadlock 40P01).
    const res = await lockBuyer.request('/api/orders/checkout', 'POST', {
      json: { productIds: [b.id, a.id], paymentMethod: 'MOBILE_MONEY' },
    });
    assert.equal(res.status, 201);

    // Preuve au niveau BDD : l'ordre de CRÉATION des commandes (id auto-incrémenté)
    // suit l'ordre des produit_id croissants, pas l'ordre du tableau client.
    const rows = await dbQuery<{ product_id: number }>(
      'SELECT product_id FROM orders WHERE product_id = ANY($1::bigint[]) ORDER BY id ASC',
      [[a.id, b.id]],
    );
    assert.deepEqual(
      rows.map((r) => r.product_id),
      [a.id, b.id],
      'les articles sont verrouillés/insérés par id produit croissant (ordre déterministe)',
    );
  });
});