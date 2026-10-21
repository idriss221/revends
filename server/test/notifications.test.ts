/**
 * NOTIFICATIONS — badge non lues (CA-NOT01), listes (CA-NOT02-01/02),
 * lecture individuelle idempotente (CA-NOT03), read-all, isolation par
 * utilisateur (404 pour la notification d'autrui).
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { bootTestServer, registerUser, loginAdmin, createApprovedProduct, createOrder, errorCode } from './helpers.js';
import type { ServerHandle, ApiClient } from './helpers.js';

let server: ServerHandle;
let admin: ApiClient;
let alice: ApiClient;

/** Badge « non lues » tel qu'exposé par GET /api/auth/me (CA-NOT01). */
async function unreadBadge(c: ApiClient): Promise<number> {
  const res = await c.get('/api/auth/me');
  assert.equal(res.status, 200);
  return (res.body as any).unreadNotifications;
}

before(async () => {
  server = await bootTestServer();
  admin = await loginAdmin(server);
  alice = (await registerUser(server, 'alice')).client;
});

after(async () => {
  await server?.close();
});

describe('CA-NOT01 — badge non lues au /api/auth/me', () => {
  it('0 au départ puis incrément à chaque événement (soumission, approbation)', async () => {
    assert.equal(await unreadBadge(alice), 0);

    const p = await alice.request('/api/products', 'POST', { form: fd('Badge test') });
    assert.equal(p.status, 201);
    assert.equal(await unreadBadge(alice), 1, 'article_submitted compté');

    await admin.request(`/api/admin/products/${(p.body as any).product.id}/approve`, 'POST', { json: {} });
    assert.equal(await unreadBadge(alice), 2, 'article_approved compté');

    // marque tout lu → badge revient à 0
    await alice.post('/api/me/notifications/read-all');
    assert.equal(await unreadBadge(alice), 0);
  });

  function fd(name: string) {
    const form = new FormData();
    form.append('name', name);
    form.append('categoryId', '3');
    form.append('subcategoryId', '13');
    form.append('condition', 'Bon état');
    form.append('price', '100000');
    form.append('location', 'Abidjan, Cocody');
    form.append('description', 'Description suffisamment longue pour ce test.');
    for (let i = 1; i <= 3; i++) {
      form.append('photos', new Blob([Buffer.from([0xff, 0xd8, 0xff, 0xe0])], { type: 'image/jpeg' }), `p-${i}.jpg`);
    }
    return form;
  }
});

describe('CA-NOT02 — liste et filtre non lues', () => {
  let product: { id: number; slug: string };
  let buyer: ApiClient;

  before(async () => {
    const a = (await registerUser(server, 'notifBuy')).client;
    buyer = a;
    product = await createApprovedProduct(alice, admin, { name: 'Produit notif' });
    await createOrder(a, product.id);
  });

  it('liste triée : les NON LUES en premier', async () => {
    const res = await buyer.get('/api/me/notifications');
    const body = res.body as any;
    assert.ok(body.items.length >= 1);
    assert.ok(body.unreadCount >= 1);
    assert.equal(body.unreadCount, body.items.length, 'toutes non lues ici');
  });

  it('?unread_only=true → contenu non lu ; false → historique complet', async () => {
    const only = (await buyer.get('/api/me/notifications?unread_only=true')).body as any;
    assert.equal(only.unreadCount, only.items.length);
  });
});

describe('CA-NOT03 / CA-NOT04 — lecture et read-all', () => {
  it('marquage unique → unreadCount décrémenté (lecture idempotente)', async () => {
    const buyer = (await registerUser(server, 'iq')).client;
    const product = await createApprovedProduct(alice, admin, { name: 'Lecture unique' });
    const { body } = await createOrder(buyer, product.id);

    const notifs = (await buyer.get('/api/me/notifications')).body as any;
    const target = notifs.items.find((n: any) => n.type === 'order_created');
    assert.ok(target, 'notification order_created présente');

    const before = (await buyer.get('/api/me/notifications')).body.unreadCount;
    const read = await buyer.post(`/api/me/notifications/${target.id}/read`);
    assert.equal(read.status, 200);
    assert.ok((read.body as any).notification.readAt, 'readAt posé');

    const after = (await buyer.get('/api/me/notifications')).body.unreadCount;
    assert.equal(after, before - 1);

    // re-marquage → aucun changement (idempotent)
    const again = await buyer.post(`/api/me/notifications/${target.id}/read`);
    assert.equal(again.status, 200);
    assert.equal((await buyer.get('/api/me/notifications')).body.unreadCount, after);
  });

  it('read-all : toutes non lues passées en lues → badge 0', async () => {
    const b = (await registerUser(server, 'bulk')).client;
    const product = await createApprovedProduct(alice, admin, { name: 'Vidage canon' });
    await createOrder(b, product.id);

    const res = await b.post('/api/me/notifications/read-all');
    assert.equal(res.status, 200);
    assert.ok((res.body as any).updated >= 1);
    const me = await b.get('/api/auth/me');
    assert.equal((me.body as any).unreadNotifications, 0);
  });
});

describe('Isolation (sécurité)', () => {
  it('marquer la notification D’AUTRUI → 404 NOTIFICATION_NOT_FOUND (pas de fuite)', async () => {
    const eve = (await registerUser(server, 'eve')).client;
    const product = await createApprovedProduct(alice, admin, { name: 'Privée moi' });
    await createOrder(eve, product.id);

    const notifOfEve = (await eve.get('/api/me/notifications')).body as any;
    const someNotifId = notifOfEve.items[0].id as number;

    // alice tente de marquer la notification d'eve :
    const res = await alice.post(`/api/me/notifications/${someNotifId}/read`);
    assert.equal(res.status, 404);
    assert.equal(errorCode(res.body), 'NOTIFICATION_NOT_FOUND');
  });
});