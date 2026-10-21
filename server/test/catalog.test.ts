/**
 * CATALOGUE — parcours public
 *  GET /api/categories (T09) · GET /api/products (liste + q/catégorie/tris/pagination)
 *  GET /api/products/:slugOrId (détail, statuts masqués, vendeur RG 7.7)
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { bootTestServer, registerUser, loginAdmin, createApprovedProduct, assertPublicUserClean } from './helpers.js';
import type { ServerHandle, ApiClient } from './helpers.js';

let server: ServerHandle;
let owner: ApiClient;
let ownerId: number;
let admin: ApiClient;

before(async () => {
  server = await bootTestServer();
  const ownerUser = await registerUser(server, 'catalog');
  owner = ownerUser.client;
  ownerId = ownerUser.id as number;
  admin = await loginAdmin(server);
});

after(async () => {
  await server?.close();
});

describe('GET /api/categories (T09)', () => {
  it('200 : hiérarchie complète avec sous-catégories (api.md §3.2 bis)', async () => {
    const res = await server.newClient().get('/api/categories');
    assert.equal(res.status, 200);
    const cats = (res.body as any).categories as any[];
    assert.ok(Array.isArray(cats));
    const electronique = cats.find((c) => c.name === 'Électronique');
    assert.ok(electronique, 'catégorie Électronique présente');
    assert.ok(electronique.children.some((s: any) => s.name === 'Téléphones & tablettes'));
  });
  it('expose UNIQUEMENT id/name/slug/children (aucun champ interne)', async () => {
    const res = await server.newClient().get('/api/categories');
    const cats = (res.body as any).categories as any[];
    for (const c of cats) {
      assert.deepEqual(Object.keys(c).sort(), ['children', 'id', 'name', 'slug']);
      for (const s of c.children) {
        assert.deepEqual(Object.keys(s).sort(), ['active', 'id', 'name', 'slug']);
      }
    }
  });
});

describe('Création + non-exposition avant validation admin (T10, §2.3)', () => {
  let pendingSlug: string;

  it('produit soumis → status PENDING (l’admin décide de la publication)', async () => {
    const res = await createViaApi({ name: 'Soumis pour validation' });
    assert.equal(res.status, 201);
    const p = (res.body as any).product;
    pendingSlug = p.slug;
    assert.equal(p.status, 'PENDING');
  });

  it('un produit PENDING n’apparaît PAS dans le catalogue public (2.3)', async () => {
    const res = await server.newClient().get('/api/products');
    const body = res.body as any;
    assert.equal(body.total, 0, 'aucun produit approuvé ne doit être listé');
  });

  it('la fiche publique d’un produit PENDING → 404 PRODUCT_NOT_FOUND (CA-CAT03-04)', async () => {
    const res = await server.newClient().get(`/api/products/${pendingSlug}`);
    assert.equal(res.status, 404);
    assert.equal((res.body as any).error.code, 'PRODUCT_NOT_FOUND');
  });

  async function createViaApi(fields: { name: string }) {
    const fd = new FormData();
    fd.append('name', fields.name);
    fd.append('categoryId', '3');
    fd.append('subcategoryId', '13');
    fd.append('condition', 'Bon état');
    fd.append('price', '100000');
    fd.append('location', 'Abidjan, Cocody');
    fd.append('description', 'Article de test avec une description valide.');
    for (let i = 1; i <= 3; i++) {
      fd.append('photos', new Blob([Buffer.from([0xff, 0xd8, 0xff, 0xe0])], { type: 'image/jpeg' }), `photo-${i}.jpg`);
    }
    return owner.request('/api/products', 'POST', { form: fd });
  }
});

describe('GET /api/products — listings publics (US-CATALOG-01)', () => {
  let p1: { id: number; slug: string };
  let p2: { id: number; slug: string };
  let p3: { id: number; slug: string };

  before(async () => {
    // 3 produits approuvés (le 4e reste PENDING, créé au describe précédent)
    p1 = await createApprovedProduct(owner, admin, { name: 'iPhone 13 Pro', price: 500_000, location: 'Abidjan, Plateau' });
    p2 = await createApprovedProduct(owner, admin, { name: 'Vélo VTT', price: 150_000, location: 'Bouaké' });
    p3 = await createApprovedProduct(owner, admin, { name: 'Livre de poche', price: 5_000, location: 'Yamoussoukro' });
  });

  it('réponse paginée : 3 articles approuvés, aucun PENDING (2.3)', async () => {
    const res = await server.newClient().get('/api/products');
    const body = res.body as any;
    assert.equal(body.total, 3);
    assert.equal(body.items.length, 3);
    assert.equal(body.totalPages, 1);
    const slugs = body.items.map((p: any) => p.slug);
    assert.ok(slugs.includes(p1.slug) && slugs.includes(p2.slug) && slugs.includes(p3.slug));
  });

  it('carte produit : aucun champ interne ni réservation (RG-PROD-1)', async () => {
    const res = await server.newClient().get('/api/products');
    const body = res.body as any;
    const card = body.items[0];
    assert.equal(typeof card.price, 'number');
    assert.ok(!('status' in card), 'la carte ne doit pas exposer l’état interne');
    assert.ok(!('reservedUntil' in card), 'la carte ne doit pas exposer la réservation');
    assert.ok(!('ownerId' in card) && !('owner_id' in card));
    assert.ok(card.category && card.subcategory);
  });

  it('tri prix_asc / prix_desc (CA-CATALOG02-02)', async () => {
    const asc = (await server.newClient().get('/api/products?sort=price_asc')).body as any;
    const desc = (await server.newClient().get('/api/products?sort=price_desc')).body as any;
    const pa = asc.items.map((x: any) => x.price);
    const pd = desc.items.map((x: any) => x.price);
    assert.deepEqual(pa, [...pa].sort((a, b) => a - b));
    assert.deepEqual(pd, [...pd].sort((a, b) => b - a));
    assert.equal(pa[0], 5_000);
    assert.equal(pd[0], 500_000);
  });

  it('filtre par catégorie (CA-CATALOG02-01)', async () => {
    const res = await server.newClient().get('/api/products?categoryId=3');
    const body = res.body as any;
    assert.ok(body.total >= 1);
    assert.ok(body.items.every((p: any) => p.category.id === 3));
  });

  it('filtre texte q (CA-CATALOG02-01) : "iPhone" → seulement le bon article', async () => {
    const res = await server.newClient().get(`/api/products?q=${encodeURIComponent('iPhone')}`);
    const body = res.body as any;
    assert.ok(body.total >= 1);
    assert.ok(body.items.some((p: any) => p.slug === p1.slug));
  });

  it('q trop long (> 120) → 400 VALIDATION_ERROR', async () => {
    const res = await server.newClient().get(`/api/products?q=${'a'.repeat(121)}`);
    assert.equal(res.status, 400);
    assert.equal((res.body as any).error.code, 'VALIDATION_ERROR');
  });

  it('catégorie inexistante → 400 CATEGORY_NOT_FOUND', async () => {
    const res = await server.newClient().get('/api/products?categoryId=999999');
    assert.equal(res.status, 400);
    assert.equal((res.body as any).error.code, 'CATEGORY_NOT_FOUND');
  });

  it('pagination : page=2&perPage=2 → 1 article restant, total préservé', async () => {
    const res = await server.newClient().get('/api/products?page=2&perPage=2');
    const body = res.body as any;
    assert.equal(body.items.length, 1);
    assert.equal(body.total, 3);
    assert.equal(body.totalPages, 2);
  });

  it('perPage > 48 → 400 VALIDATION_ERROR (anti-abus)', async () => {
    const res = await server.newClient().get('/api/products?perPage=1000');
    assert.equal(res.status, 400);
  });
});

describe('GET /api/products/:slugOrId — fiche publique (US-ADJ05)', () => {
  let approved: { id: number; slug: string };

  before(async () => {
    approved = await createApprovedProduct(owner, admin, { name: 'Philips Écran PC', price: 300_000 });
  });

  it('récupère par slug SEO-friendly', async () => {
    const res = await server.newClient().get(`/api/products/${approved.slug}`);
    assert.equal(res.status, 200);
    const p = res.body as any;
    assert.equal(p.slug, approved.slug);
    assert.equal(p.status, 'AVAILABLE');
  });

  it('récupère par id numérique', async () => {
    const res = await server.newClient().get(`/api/products/${approved.id}`);
    assert.equal(res.status, 200);
    assert.equal((res.body as any).id, approved.id);
  });

  it('photos incluses avec URL publique (expression.static /uploads)', async () => {
    const res = await server.newClient().get(`/api/products/${approved.slug}`);
    const images = (res.body as any).images;
    assert.ok(Array.isArray(images) && images.length >= 1);
    assert.ok((images[0].url as string).startsWith('/uploads/'));
    // La photo doit être réellement servie (200, pas un chemin fantôme)
    const img = await server.newClient().get(images[0].url as string);
    assert.equal(img.status, 200);
  });

  it('vendeur : identity publique SANS coordonnées (RG 7.7, §7.2)', async () => {
    const res = await server.newClient().get(`/api/products/${approved.slug}`);
    assertPublicUserClean((res.body as any).seller, 'seller (détail produit)');
    assert.equal((res.body as any).seller.id, ownerId);
  });

  it('404 PRODUCT_NOT_FOUND pour un identifiant inconnu', async () => {
    const res = await server.newClient().get('/api/products/not-existing-slug');
    assert.equal(res.status, 404);
    assert.equal((res.body as any).error.code, 'PRODUCT_NOT_FOUND');
  });
});