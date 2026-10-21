/**
 * EXPIRATION DES RÉSERVATIONS (D3) — job `expireExpiredReservations` + libération
 * paresseuse (fiche produit / nouvelle commande), notifications, et rejet d'une
 * confirmation de paiement sur commande expirée.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  bootTestServer, registerUser, loginAdmin, createApprovedProduct, createOrder,
  errorCode, dbQuery, ApiClient,
} from './helpers.js';
import { expireExpiredReservations } from '../src/services/expiry.service.js';
import type { ServerHandle } from './helpers.js';

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

/** Produit approuvé + commande effective → réservé (durée config.reservationDays). Force l'expiration. */
async function orderWithForcedExpiry(name: string) {
  const buyer = (await registerUser(server, 'buy')).client;
  const product = await createApprovedProduct(seller, admin, { name });
  const { body } = await createOrder(buyer, product.id);
  await dbQuery(`UPDATE products SET reserved_until = now() - interval '2 minutes' WHERE id = $1`, [product.id]);
  return { buyer, product, order: body.order };
}

describe('Job d’expiration — expireExpiredReservations (D3, §5.2)', () => {
  it('libère la commande expirée : produit AVAILABLE, commande PAYMENT_FAILED, paiement FAILED', async () => {
    const { product } = await orderWithForcedExpiry('Batterie externe');

    const released = await expireExpiredReservations();
    assert.equal(released, 1);

    const prod = await dbQuery<{ status: string; reserved_until: string | null }>(
      'SELECT status, reserved_until FROM products WHERE id = $1',
      [product.id],
    );
    assert.equal(prod[0].status, 'AVAILABLE');
    assert.equal(prod[0].reserved_until, null);

    const orders = await dbQuery<{ status: string }>('SELECT status FROM orders WHERE product_id = $1', [product.id]);
    assert.equal(orders[0].status, 'PAYMENT_FAILED');
    const payments = await dbQuery<{ status: string }>('SELECT status FROM payments WHERE order_id = (SELECT id FROM orders WHERE product_id = $1)', [product.id]);
    assert.equal(payments[0].status, 'FAILED');
  });

  it('l’acheteur reçoit une notification reservation_expired', async () => {
    const { buyer } = await orderWithForcedExpiry('Clavier sans fil');
    await expireExpiredReservations();
    const notif = await buyer.get('/api/me/notifications');
    const types = (notif.body as any).items.map((n: any) => n.type);
    assert.ok(types.includes('reservation_expired'), 'acheteur notifié de l’expiration');
  });

  it('idempotent : un second run ne libère RIEN (aucune double libération)', async () => {
    const again = await expireExpiredReservations();
    assert.equal(again, 0);
  });
});

describe('Libération paresseuse à la lecture de la fiche (D3, CA-CAT03-04)', () => {
  it('GET /api/products/:slug sur réservation expirée → revient AVAILABLE', async () => {
    const { product } = await orderWithForcedExpiry('Enceinte Bluetooth');
    const res = await server.newClient().get(`/api/products/${product.slug}`);
    assert.equal(res.status, 200);
    assert.equal((res.body as any).status, 'AVAILABLE');
  });
});

describe('Conséquences métier de l’expiration', () => {
  it('le produit expiré est redevenu achetables par un autre → commande 201', async () => {
    const { product } = await orderWithForcedExpiry('Montre connectée');
    await expireExpiredReservations();
    const nextBuyer = (await registerUser(server, 'next')).client;
    const { status, body } = await createOrder(nextBuyer, product.id);
    assert.equal(status, 201);
    assert.equal(body.order.status, 'PAYMENT_PENDING');
  });

  it('la libération journalise l’event PAYMENT_PENDING → PAYMENT_FAILED (1 changement = 1 ligne)', async () => {
    const { order } = await orderWithForcedExpiry('Tablette');
    await expireExpiredReservations();
    const events = await dbQuery<{ from_status: string | null; to_status: string; actor: string }>(
      'SELECT from_status, to_status, actor FROM order_events WHERE order_id = $1 ORDER BY id',
      [order.id],
    );
    assert.ok(events.some((e) => e.from_status === 'PAYMENT_PENDING' && e.to_status === 'PAYMENT_FAILED' && e.actor === 'system'));
  });

  it('confirmer le paiement d’une commande EXPIRÉE → 409 INVALID_TRANSITION + currentStatus=PAYMENT_FAILED', async () => {
    const { order } = await orderWithForcedExpiry('Casque audio');
    await expireExpiredReservations();
    const res = await admin.request(`/api/admin/orders/${order.id}/confirm-payment`, 'POST', {
      json: { method: 'MOBILE_MONEY' },
    });
    assert.equal(res.status, 409);
    assert.equal(errorCode(res.body), 'INVALID_TRANSITION');
    assert.equal((res.body as any).error.currentStatus, 'PAYMENT_FAILED');
  });
});