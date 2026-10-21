/**
 * VENTE (US-SELL) — création produit, contraintes (prix/photos/catégorie),
 * workflow de modération admin (approuver/refuser), édition (retour PENDING),
 * suppression. L'acheteur = autre compte → commandable (buy.test).
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  bootTestServer, registerUser, loginAdmin, jpegBuffer, pngBuffer, webpBuffer, invalidBuffer,
  errorCode, dbQuery, DEFAULT_FIELDS, productForm, createProduct, createApprovedProduct, createOrder,
} from './helpers.js';
import type { ServerHandle, ApiClient } from './helpers.js';

let server: ServerHandle;
let owner: ApiClient;
let admin: ApiClient;

before(async () => {
  server = await bootTestServer();
  admin = await loginAdmin(server);
  owner = (await registerUser(server, 'sell')).client;
});

after(async () => {
  await server?.close();
});

describe('POST /api/products (CA-SELL01-01)', () => {
  it('201 : produit PENDING, photos écrites sur disque (RG-MEDIA-1)', async () => {
    const { product } = await createProduct(owner);
    assert.equal(product.status, 'PENDING');
    const files = await dbQuery<{ path: string }>('SELECT path FROM product_images WHERE product_id = $1 ORDER BY position', [product.id]);
    assert.equal(files.length, 3);
    assert.ok(files.every((r) => r.path.startsWith('uploads/products/')));
    assert.ok(product.images[0].isPrimary);
  });

  it('le propriétaire retrouve le produit dans /api/me/products (US-MESANNONCES)', async () => {
    const res = await owner.get('/api/me/products');
    const body = res.body as any;
    assert.equal(body.items.length, 1);
    assert.ok('counts' in body);
  });

  it('produit exposé → chaque photo a une URL publique', async () => {
    const { product } = await createProduct(owner, { name: 'Chéquier vélo' });
    assert.ok(product.images.every((i: any) => i.url.startsWith('/uploads/')));
  });

  it('400 : prix < 500 (borne min)', async () => {
    const res = await owner.request('/api/products', 'POST', { form: productForm({ ...DEFAULT_FIELDS, price: 499 }) });
    assert.equal(res.status, 400);
    assert.equal(errorCode(res.body), 'VALIDATION_ERROR');
  });

  it('400 : prix > 10 000 000 (borne max)', async () => {
    const res = await owner.request('/api/products', 'POST', { form: productForm({ ...DEFAULT_FIELDS, price: 10_000_001 }) });
    assert.equal(res.status, 400);
  });

  it('400 : prix non numérique', async () => {
    const fd = productForm({ ...DEFAULT_FIELDS });
    fd.set('price', 'abc');
    const res = await owner.request('/api/products', 'POST', { form: fd });
    assert.equal(res.status, 400);
  });

  it('400 : description < 10 caractères', async () => {
    const res = await owner.request('/api/products', 'POST', { form: productForm({ ...DEFAULT_FIELDS, description: 'court' }) });
    assert.equal(res.status, 400);
  });

  it('400 : état hors liste fermée', async () => {
    const res = await owner.request('/api/products', 'POST', { form: productForm({ ...DEFAULT_FIELDS, condition: 'Impeccable' }) });
    assert.equal(res.status, 400);
  });

  it('400 : location trop courte', async () => {
    const res = await owner.request('/api/products', 'POST', { form: productForm({ ...DEFAULT_FIELDS, location: 'ZZ' }) });
    assert.equal(res.status, 400);
  });

  it('400 : sous-catégorie n’appartenant pas à la catégorie → CATEGORY_MISMATCH', async () => {
    const res = await owner.request('/api/products', 'POST', {
      form: productForm({ ...DEFAULT_FIELDS, categoryId: 1, subcategoryId: 13 }),
    });
    assert.equal(res.status, 400);
    assert.equal(errorCode(res.body), 'CATEGORY_MISMATCH');
  });

  it('400 : catégorie inactive → CATEGORY_INACTIVE', async () => {
    try {
      await dbQuery(`UPDATE categories SET active = FALSE WHERE id = 13`);
      const res = await owner.request('/api/products', 'POST', {
        form: productForm({ ...DEFAULT_FIELDS, categoryId: 3, subcategoryId: 13 }),
      });
      assert.equal(res.status, 400);
      assert.equal(errorCode(res.body), 'CATEGORY_INACTIVE');
    } finally {
      await dbQuery(`UPDATE categories SET active = TRUE WHERE id = 13`);
    }
  });

  it('401 : non connecté', async () => {
    const res = await server.newClient().request('/api/products', 'POST', { form: productForm(DEFAULT_FIELDS) });
    assert.equal(res.status, 401);
  });
});

describe('Photos (RG-MEDIA-1)', () => {
  it('accepte PNG et WebP (magic bytes réels)', async () => {
    const res = await owner.request('/api/products', 'POST', { form: productForm(DEFAULT_FIELDS, [pngBuffer(), webpBuffer(), jpegBuffer()]) });
    assert.equal(res.status, 201);
  });

  it('400 : contenu NON-image déclaré jpeg → PHOTO_INVALID_TYPE', async () => {
    const res = await owner.request('/api/products', 'POST', { form: productForm(DEFAULT_FIELDS, [jpegBuffer(), jpegBuffer(), invalidBuffer]) });
    assert.equal(res.status, 400);
    assert.equal(errorCode(res.body), 'PHOTO_INVALID_TYPE');
  });

  it('400 : 5 photos → PHOTO_LIMIT', async () => {
    const res = await owner.request('/api/products', 'POST', {
      form: productForm(DEFAULT_FIELDS, [jpegBuffer(), jpegBuffer(), jpegBuffer(), jpegBuffer(), jpegBuffer()]),
    });
    assert.equal(res.status, 400);
    assert.equal(errorCode(res.body), 'PHOTO_LIMIT');
  });

  it('400 : photo > 5 Mo → PHOTO_TOO_LARGE', async () => {
    const big = Buffer.concat([jpegBuffer(), Buffer.alloc(5 * 1024 * 1024, 0x11)]);
    const res = await owner.request('/api/products', 'POST', { form: productForm(DEFAULT_FIELDS, [big]) });
    assert.equal(res.status, 400);
    assert.equal(errorCode(res.body), 'PHOTO_TOO_LARGE');
  });

  it('400 : aucune photo → PHOTO_MISSING', async () => {
    const res = await owner.request('/api/products', 'POST', { form: productForm(DEFAULT_FIELDS, []) });
    assert.equal(res.status, 400);
    assert.equal(errorCode(res.body), 'PHOTO_MISSING');
  });

  it('400 : 1 photo → PHOTO_MISSING (minimum 3 exigé)', async () => {
    const res = await owner.request('/api/products', 'POST', { form: productForm(DEFAULT_FIELDS, [jpegBuffer()]) });
    assert.equal(res.status, 400);
    assert.equal(errorCode(res.body), 'PHOTO_MISSING');
    assert.match((res.body as any).error.message, /au moins 3 photos/i);
  });

  it('400 : 2 photos → PHOTO_MISSING (minimum 3 exigé)', async () => {
    const res = await owner.request('/api/products', 'POST', {
      form: productForm(DEFAULT_FIELDS, [jpegBuffer(), jpegBuffer()]),
    });
    assert.equal(res.status, 400);
    assert.equal(errorCode(res.body), 'PHOTO_MISSING');
    assert.match((res.body as any).error.message, /au moins 3 photos/i);
  });

  it('201 : 3 photos → borne basse acceptée', async () => {
    const res = await owner.request('/api/products', 'POST', {
      form: productForm(DEFAULT_FIELDS, [jpegBuffer(), jpegBuffer(), jpegBuffer()]),
    });
    assert.equal(res.status, 201);
    assert.equal((res.body as any).product.images.length, 3);
  });

  it('201 : 4 photos → borne haute acceptée', async () => {
    const res = await owner.request('/api/products', 'POST', {
      form: productForm(DEFAULT_FIELDS, [jpegBuffer(), jpegBuffer(), jpegBuffer(), jpegBuffer()]),
    });
    assert.equal(res.status, 201);
    assert.equal((res.body as any).product.images.length, 4);
  });
});

describe('Workflow admin (T10, CA-SELL01-03/04)', () => {
  it('approbation → AVAILABLE + notification vendeur "article_approved"', async () => {
    const p = await createProduct(owner, { name: 'Anti-vol vélo', price: 25_000 });
    const res = await admin.request(`/api/admin/products/${p.id}/approve`, 'POST', { json: {} });
    assert.equal(res.status, 200);
    assert.equal((res.body as any).product.status, 'AVAILABLE');
    const pub = await server.newClient().get(`/api/products/${p.slug}`);
    assert.equal((pub.body as any).status, 'AVAILABLE');
    const notif = await dbQuery<{ type: string }>(`SELECT type FROM notifications WHERE user_id = (SELECT id FROM users WHERE email = 'sell1@test.revends') ORDER BY id DESC LIMIT 1`);
    assert.equal(notif[0]?.type, 'article_approved');
  });

  it('refus SANS motif → 400 VALIDATION_ERROR (RG-REFUS, api.md §3.6)', async () => {
    const p = await createProduct(owner, { name: 'Refus sans motif' });
    const res = await admin.request(`/api/admin/products/${p.id}/reject`, 'POST', { json: {} });
    assert.equal(res.status, 400);
    assert.equal(errorCode(res.body), 'VALIDATION_ERROR');
  });

  it('refus AVEC motif de la liste → REJECTED + motif exposé qu’au propriétaire', async () => {
    const p = await createProduct(owner, { name: 'Refus motivé' });
    const res = await admin.request(`/api/admin/products/${p.id}/reject`, 'POST', {
      json: { reason: 'Photos insuffisantes' },
    });
    assert.equal(res.status, 200);
    assert.equal((res.body as any).product.status, 'REJECTED');
    // public → 404 masqué (CA-CAT03-04)
    const pub = await server.newClient().get(`/api/products/${p.slug}`);
    assert.equal(pub.status, 404);
    // propriétaire → motif visible (D13)
    const mine = await owner.get('/api/me/products');
    const mineP = (mine.body as any).items.find((x: any) => x.id === p.id);
    assert.equal(mineP.status, 'REJECTED');
    assert.equal(mineP.rejectionReason, 'Photos insuffisantes');
  });

  it('approuver un produit non-PENDING → 409 PRODUCT_NOT_PENDING', async () => {
    const p = await createProduct(owner, { name: 'Déjà approuvé' });
    await admin.request(`/api/admin/products/${p.id}/approve`, 'POST', { json: {} });
    const again = await admin.request(`/api/admin/products/${p.id}/approve`, 'POST', { json: {} });
    assert.equal(again.status, 409);
    assert.equal(errorCode(again.body), 'PRODUCT_NOT_PENDING');
  });

  it('admin sur produit inexistant → 404 PRODUCT_NOT_FOUND', async () => {
    const res = await admin.request('/api/admin/products/424242/reject', 'POST', {
      json: { reason: 'Photos insuffisantes' },
    });
    assert.equal(res.status, 404);
  });
});

describe('Édition (CA-SELL01-05) et suppression (CA-SELL06-01)', () => {
  let p: { id: number; slug: string };

  before(async () => {
    p = await createProduct(owner, { name: 'À modifier', price: 50_000 });
  });

  it('PUT : le propriétaire modifie nom+prix', async () => {
    const res = await owner.request(`/api/products/${p.id}`, 'PUT', {
      json: { name: 'Nom modifié', price: 60_000, categoryId: 3, subcategoryId: 13, condition: 'Bon état', location: 'Abidjan, Cocody', description: 'Description mise à jour pour le test.' },
    });
    assert.equal(res.status, 200);
    assert.equal((res.body as any).product.name, 'Nom modifié');
    assert.equal((res.body as any).product.price, 60_000);
  });

  it('toute édition d’un produit validé → retour PENDING (re-modération, D9)', async () => {
    const prod = await createProduct(owner, { name: 'Réédité après validation', price: 30_000 });
    await admin.request(`/api/admin/products/${prod.id}/approve`, 'POST', { json: {} });
    const res = await owner.request(`/api/products/${prod.id}`, 'PUT', {
      json: { name: 'Réédité après validation', price: 35_000, categoryId: 3, subcategoryId: 13, condition: 'Bon état', location: 'Abidjan', description: 'Mise à jour après validation: bien plus long.' },
    });
    assert.equal(res.status, 200);
    assert.equal((res.body as any).product.status, 'PENDING');
  });

  it('PUT sans nouvelles photos → 200, les photos existantes (3) sont conservées', async () => {
    const prod = await createProduct(owner, { name: 'Édition sans photo', price: 45_000 });
    const res = await owner.request(`/api/products/${prod.id}`, 'PUT', {
      json: {
        name: 'Édition sans photo (bis)',
        price: 46_000,
        categoryId: 3,
        subcategoryId: 13,
        condition: 'Bon état',
        location: 'Abidjan, Cocody',
        description: 'Édition légitime sans toucher aux photos existantes.',
      },
    });
    assert.equal(res.status, 200);
    assert.equal((res.body as any).product.images.length, 3);
  });

  it('PUT : retirer une photo sans en ajouter (total 2 < 3) → 400 PHOTO_MISSING', async () => {
    const prod = await createProduct(owner, { name: 'Retrait sous le minimum', price: 40_000 });
    const removeId = prod.product.images[0].id as number;
    const res = await owner.request(`/api/products/${prod.id}`, 'PUT', {
      json: {
        name: 'Retrait sous le minimum',
        price: 40_000,
        categoryId: 3,
        subcategoryId: 13,
        condition: 'Bon état',
        location: 'Abidjan, Cocody',
        description: 'Retrait d’une photo sans ajout : le total tombe sous le minimum.',
        removePhotoIds: JSON.stringify([removeId]),
      },
    });
    assert.equal(res.status, 400);
    assert.equal(errorCode(res.body), 'PHOTO_MISSING');
  });

  it('PUT : total final > 4 photos → 400 PHOTO_LIMIT (jamais 500)', async () => {
    const prod = await createProduct(owner, { name: 'Trop de photos', price: 42_000 });
    const res = await owner.request(`/api/products/${prod.id}`, 'PUT', {
      form: productForm({ ...DEFAULT_FIELDS, name: 'Trop de photos', price: 42_000 }, [jpegBuffer(), jpegBuffer()]),
    });
    assert.equal(res.status, 400);
    assert.equal(errorCode(res.body), 'PHOTO_LIMIT');
  });

  it('PUT par un NON-propriétaire → 404 (non-divulgation §1.4, jamais 403)', async () => {
    const intru = (await registerUser(server, 'intru')).client;
    const res = await intru.request(`/api/products/${p.id}`, 'PUT', {
      json: { name: 'Hack', price: 60_000, categoryId: 3, subcategoryId: 13, condition: 'Bon état', location: 'Abidjan', description: 'Tentative de piratage de l’article d’autrui.' },
    });
    assert.equal(res.status, 404);
    assert.equal(errorCode(res.body), 'PRODUCT_NOT_FOUND');
  });

  // C4/CA-V5-054 : la route DELETE vendeur est RETIRÉE. Ce test est RÉÉCRIT
  // (et non supprimé) pour asserter 404 NOT_FOUND — jamais 403/405/500.
  // La suppression réelle est désormais l'affaire de l'admin
  // (DELETE /api/admin/products/:id), couverte par test/soft-delete.test.ts.
  it('DELETE /api/products/:id : route retirée → 404 NOT_FOUND, produit intact', async () => {
    // Produit APPROUVÉ créé ICI : l'assertion « reste visible publiquement »
    // (200) n'a de sens que sur un produit AVAILABLE. Réutiliser la fixture
    // partagée `p` créerait une dépendance à l'ordre d'exécution (elle est
    // PENDING → 404 légitime) : ce test doit passer seul, quel que soit le
    // nombre de tests qui le précèdent.
    const approved = await createApprovedProduct(owner, admin, { name: 'Suppression vendeur refusée' });
    const del = await owner.request(`/api/products/${approved.id}`, 'DELETE');
    assert.equal(del.status, 404, 'la route vendeur n’existe plus');
    assert.equal(errorCode(del.body), 'NOT_FOUND');
    const pub = await server.newClient().get(`/api/products/${approved.slug}`);
    assert.equal(pub.status, 200, 'le produit reste visible : rien n’a été supprimé');
    const rows = await dbQuery('SELECT id, deleted_at FROM products WHERE id = $1', [approved.id]);
    assert.equal(rows.length, 1, 'la ligne produit est toujours en base');
    assert.equal(rows[0].deleted_at, null, 'deleted_at reste NULL');
  });

  it('DELETE du produit d’autrui → 404 NOT_FOUND (non-divulgation §1.4)', async () => {
    const prod = await createProduct(owner, { name: 'À ne pas supprimer' });
    const intru = (await registerUser(server, 'intru2')).client;
    const res = await intru.request(`/api/products/${prod.id}`, 'DELETE');
    assert.equal(res.status, 404, 'route retirée : 404 pour tout le monde');
    assert.equal(errorCode(res.body), 'NOT_FOUND');
    const rows = await dbQuery<{ deleted_at: Date | null }>('SELECT deleted_at FROM products WHERE id = $1', [prod.id]);
    assert.equal(rows[0].deleted_at, null, 'le produit d’autrui n’est pas touché');
  });

  it('DELETE d’un article REJECTED sans commande → 404 NOT_FOUND (route retirée, CA-V5-054)', async () => {
    const prod = await createProduct(owner, { name: 'Refusé puis supprimé' });
    const rej = await admin.request(`/api/admin/products/${prod.id}/reject`, 'POST', {
      json: { reason: 'Photos insuffisantes' },
    });
    assert.equal(rej.status, 200);
    assert.equal((rej.body as any).product.status, 'REJECTED');

    const del = await owner.request(`/api/products/${prod.id}`, 'DELETE');
    assert.equal(del.status, 404, 'plus de suppression côté vendeur, même sans commande');
    assert.equal(errorCode(del.body), 'NOT_FOUND');
    const rows = await dbQuery<{ deleted_at: Date | null }>('SELECT deleted_at FROM products WHERE id = $1', [prod.id]);
    assert.equal(rows[0].deleted_at, null, 'l’article REJECTED n’est pas supprimé logiquement sans l’admin');
  });

  it('DELETE d’un article SOLD → 404 NOT_FOUND (route retirée) ; la garde SOLD vit désormais côté admin', async () => {
    const prod = await createApprovedProduct(owner, admin, { name: 'Vendu, non supprimable' });
    const buyer = (await registerUser(server, 'soldbuy')).client;
    const { body } = await createOrder(buyer, prod.id);
    await admin.request(`/api/admin/orders/${body.order.id}/confirm-payment`, 'POST', { json: { method: 'MOBILE_MONEY' } });
    // V3 : le produit passe SOLD dès confirm-payment (§3.6 étape 3, D5). L'ancienne
    // route V2 pay-seller a été renommée seller-payout et répond 410 ROUTE_DEPRECATED :
    // on ne l'appelle plus ici (le test ne vise que la garde DELETE d'un article SOLD).
    const sold = await dbQuery<{ status: string }>('SELECT status FROM products WHERE id = $1', [prod.id]);
    assert.equal(sold[0].status, 'SOLD', 'le produit est vendu (précondition du test)');

    // La route vendeur n'existe plus : la garde « article lié à une commande »
    // est devenue PRODUCT_HAS_ACTIVE_ORDER sur la route ADMIN
    // (test/soft-delete.test.ts → « garde commande en cours (409) »).
    const del = await owner.request(`/api/products/${prod.id}`, 'DELETE');
    assert.equal(del.status, 404, 'route retirée : jamais 409 ni 403');
    assert.equal(errorCode(del.body), 'NOT_FOUND');
    const rows = await dbQuery<{ id: number; deleted_at: Date | null }>(
      'SELECT id, deleted_at FROM products WHERE id = $1',
      [prod.id],
    );
    assert.equal(rows.length, 1, 'l’article SOLD reste en base');
    assert.equal(rows[0].deleted_at, null, 'et n’est pas supprimé logiquement');
  });
});