/**
 * PANIER — contrat `GET /api/cart` (régression).
 *
 * Contexte : `getCartLines` oubliait de lier le paramètre `user_id` à la requête
 * SQL (`WHERE c.user_id = $1`) → PostgreSQL rejetait `there is no parameter $1`
 * → `GET /api/cart` répondait 500. Aucun test ne couvrait cette route, d'où le
 * bug non détecté. Ces tests verrouillent le comportement :
 *
 *  - auth obligatoire (401 sans session) ;
 *  - panier vide → `[]` (jamais 500) ;
 *  - add → GET renvoie la ligne avec ses infos produit (`product_id`, `qty`) ;
 *  - incrémentation plafonnée à 9 (LEAST) ;
 *  - isolation par utilisateur ;
 *  - DELETE ligne puis vidage complet.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  bootTestServer,
  registerUser,
  loginAdmin,
  createApprovedProduct,
} from './helpers.js';
import type { ServerHandle, ApiClient } from './helpers.js';

let server: ServerHandle;
let seller: ApiClient;
let productId: number;

before(async () => {
  server = await bootTestServer();
  const sellerUser = await registerUser(server, 'cartseller');
  seller = sellerUser.client;
  const admin = await loginAdmin(server);
  const created = await createApprovedProduct(seller, admin, { name: 'Article panier e2e' });
  productId = created.id;
});

after(async () => {
  await server?.close();
});

describe('GET /api/cart', () => {
  it('401 sans session (route protégée)', async () => {
    const res = await server.newClient().get('/api/cart');
    assert.equal(res.status, 401);
  });

  it('200 + [] pour un panier vide (jamais 500)', async () => {
    const { client } = await registerUser(server, 'cartempty');
    const res = await client.get('/api/cart');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body), 'la réponse est un TABLEAU brut');
    assert.equal((res.body as unknown[]).length, 0);
  });
});

describe('cycle panier', () => {
  let buyer: ApiClient;

  before(async () => {
    buyer = (await registerUser(server, 'cartbuyer')).client;
  });

  it('POST ajoute une ligne, GET la renvoie avec les infos produit', async () => {
    const add = await buyer.post('/api/cart', { productId, qty: 2 });
    assert.equal(add.status, 201);

    const res = await buyer.get('/api/cart');
    assert.equal(res.status, 200);
    const lines = res.body as any[];
    assert.equal(lines.length, 1, 'une seule ligne après un ajout');
    assert.equal(lines[0].productId, productId);
    assert.equal(lines[0].qty, 2);
    // La jointure produit expose le nom ; l'image primaire est présente (clé).
    assert.equal(lines[0].productName, 'Article panier e2e');
    assert.ok('image' in lines[0]);
  });

  it('un 2ᵉ POST incrémente la quantité, plafonnée à 9', async () => {
    await buyer.post('/api/cart', { productId, qty: 3 });
    let res = await buyer.get('/api/cart');
    assert.equal((res.body as any[])[0].qty, 5, '2 + 3 = 5');

    await buyer.post('/api/cart', { productId, qty: 9 });
    res = await buyer.get('/api/cart');
    assert.equal((res.body as any[])[0].qty, 9, 'LEAST(5+9, 9) = 9');
  });

  it('le panier est isolé par utilisateur', async () => {
    const other = (await registerUser(server, 'cartother')).client;
    const res = await other.get('/api/cart');
    assert.equal(res.status, 200);
    assert.equal((res.body as any[]).length, 0, 'un autre utilisateur ne voit rien');
  });

  it('PATCH modifie la quantité', async () => {
    const res = await buyer.request(`/api/cart/${productId}`, 'PATCH', { json: { qty: 4 } });
    assert.equal(res.status, 200);
    assert.equal((res.body as any).qty, 4);
  });

  it('DELETE la ligne puis vidage complet', async () => {
    let res = await buyer.request(`/api/cart/${productId}`, 'DELETE');
    assert.equal(res.status, 204);
    assert.equal(((await buyer.get('/api/cart')).body as any[]).length, 0);

    // Ré-ajout puis vidage global.
    await buyer.post('/api/cart', { productId, qty: 1 });
    res = await buyer.request('/api/cart', 'DELETE');
    assert.equal(res.status, 204);
    assert.equal(((await buyer.get('/api/cart')).body as any[]).length, 0);
  });
});
