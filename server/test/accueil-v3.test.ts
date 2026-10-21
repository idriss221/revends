/**
 * ACCUEIL V3 — tests d'intégration (api.md §3.2, cahier des charges §12) :
 *  - bannières (GET /api/banners + seed idempotent)
 *  - cartes enrichies (oldPrice, viewCount, brand)
 *  - sections (best_offers, promotions, new, discover, popular)
 *  - filtres V4 (price_min/max, condition, location exacte, brand, q étendu,
 *    subcategory_id, not_in, ids excluant tout autre paramètre)
 *  - view_count (incrément à chaque fiche publique)
 *  - POST /api/products/:id/contact (notification interne au vendeur)
 *  - GET /api/products/locations (DISTINCT AVAILABLE, borne 200)
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { seedBannersIfEmpty } from '../src/db/seed.js';
import {
  bootTestServer,
  registerUser,
  loginAdmin,
  createApprovedProduct,
  createProduct,
  createOrder,
  dbQuery,
  type ServerHandle,
  type ApiClient,
  type TestUser,
} from './helpers.js';

let server: ServerHandle;
let owner: ApiClient;
let ownerId: number;
let admin: ApiClient;

before(async () => {
  server = await bootTestServer();
  const ownerUser = await registerUser(server, 'accueil');
  owner = ownerUser.client;
  ownerId = ownerUser.id as number;
  admin = await loginAdmin(server);
});

after(async () => {
  await server?.close();
});

// ---------------------------------------------------------------------------
// Bannières — PO-ACC-4 (table vide → seed ; jamais d'écrasement ; inactive exclue)
// ---------------------------------------------------------------------------
describe('GET /api/banners — carrousel d’accueil', () => {
  it('table vide au démarrage → { banners: [] }', async () => {
    const res = await server.newClient().get('/api/banners');
    assert.equal(res.status, 200);
    assert.deepEqual((res.body as any).banners, []);
  });

  it('seedBannersIfEmpty : insère 3 bannières ordonnées par position', async () => {
    const { inserted, skipped } = await seedBannersIfEmpty();
    assert.equal(skipped, false);
    assert.equal(inserted, 3);

    const res = await server.newClient().get('/api/banners');
    const banners = (res.body as any).banners as any[];
    assert.equal(banners.length, 3);
    assert.deepEqual(banners.map((b) => b.position), [1, 2, 3]);
    assert.equal(banners[0].title, 'Grande braderie de septembre');
    assert.equal(banners[0].subtitle, 'Jusqu’à -30 % sur l’électronique');
    assert.equal(banners[0].imagePath, '/categories/electronique.jpg');
    assert.equal(banners[1].title, 'Vendez vos anciens téléphones');
    assert.equal(banners[2].title, 'Nouveautés de la semaine');
    assert.equal(banners[1].imagePath, null); // CA-ACC-09 : bannière sans image possible
  });

  it('second appel du seed : rien à faire (skipped)', async () => {
    const { inserted, skipped } = await seedBannersIfEmpty();
    assert.equal(skipped, true);
    assert.equal(inserted, 0);
  });

  it('bannière inactive exclue de la réponse', async () => {
    await dbQuery('UPDATE banners SET active = FALSE WHERE position = 2');
    const res = await server.newClient().get('/api/banners');
    const banners = (res.body as any).banners as any[];
    assert.equal(banners.length, 2);
    assert.ok(banners.every((b: any) => b.title !== 'Vendez vos anciens téléphones'));
  });
});

// ---------------------------------------------------------------------------
// oldPrice — RG-PROD-2 (champ multipart, contrainte SQL, carte enrichie)
// ---------------------------------------------------------------------------
describe('Prix barré (oldPrice) — RG-PROD-2', () => {
  it('POST avec oldPrice > price → 201, carte enrichie (oldPrice, viewCount, brand)', async () => {
    const p = await createApprovedProduct(owner, admin, {
      name: 'Braderie Test',
      price: 1_000,
      oldPrice: 2_000,
      brand: 'Flyer',
    });
    assert.equal(p.product.oldPrice, 2_000);
    assert.equal(p.product.viewCount, 0);
    assert.equal(p.product.brand, 'Flyer');

    const res = await server.newClient().get('/api/products');
    const card = (res.body as any).items.find((x: any) => x.id === p.id);
    assert.ok(card, 'carte dans le catalogue');
    assert.equal(card.oldPrice, 2_000);
    assert.equal(card.viewCount, 0);
    assert.equal(card.brand, 'Flyer');
  });

  it('oldPrice <= price → 400 VALIDATION_ERROR avec field oldPrice', async () => {
    const fd = new FormData();
    for (const [k, v] of Object.entries({
      name: 'Réduction invalide', categoryId: '3', subcategoryId: '13', condition: 'Bon état',
      price: '1000', oldPrice: '800', location: 'Abidjan', description: 'Une description valide et assez longue.',
    })) fd.append(k, String(v));
    fd.append('photos', new Blob([Buffer.from([0xff, 0xd8, 0xff, 0xe0])], { type: 'image/jpeg' }), 'photo.jpg');
    const res = await owner.request('/api/products', 'POST', { form: fd });
    assert.equal(res.status, 400);
    assert.equal((res.body as any).error.code, 'VALIDATION_ERROR');
    assert.equal((res.body as any).error.details[0].field, 'oldPrice');
  });

  it('oldPrice vide/absent → NULL en base (aucune réduction)', async () => {
    const p = await createApprovedProduct(owner, admin, { name: 'Sans réduction', price: 50_000 });
    const rows = await dbQuery<{ old_price: number | null }>('SELECT old_price FROM products WHERE id = $1', [p.id]);
    assert.equal(rows[0]!.old_price, null);
  });
});

// ---------------------------------------------------------------------------
// Sections — §12 pts 3/6/7/10 : best_offers, promotions, new, discover, popular
// ---------------------------------------------------------------------------
describe('Sections catalogue V4 (§12)', () => {
  let fifty: { id: number; slug: string };
  let fourteen: { id: number; slug: string };
  let nine: { id: number; slug: string };
  let noDiscount: { id: number; slug: string };

  before(async () => {
    fifty = await createApprovedProduct(owner, admin, { name: 'Réduction 50%', price: 1_000, oldPrice: 2_000 });
    fourteen = await createApprovedProduct(owner, admin, { name: 'Réduction 14%', price: 1_200, oldPrice: 1_400 });
    nine = await createApprovedProduct(owner, admin, { name: 'Réduction 9%', price: 1_100, oldPrice: 1_210 });
    noDiscount = await createApprovedProduct(owner, admin, { name: 'Sans réduction 2', price: 900 });
  });

  it('best_offers : ratios décroissants, sans oldPrice exclu', async () => {
    const res = await server.newClient().get('/api/products?section=best_offers');
    const items = (res.body as any).items as any[];
    const ids = items.map((x: any) => x.id);
    const ratios = items.map((x: any) => (x.oldPrice - x.price) / x.oldPrice);
    assert.ok(ratios.length >= 3, `au moins 3 articles (${ratios.length})`);
    for (let i = 1; i < ratios.length; i++) {
      assert.ok(ratios[i]! <= ratios[i - 1]!, 'ratios non croissants');
    }
    assert.ok(ids.includes(fifty.id) && ids.includes(fourteen.id) && ids.includes(nine.id));
    assert.ok(!ids.includes(noDiscount.id));
    assert.ok(items.every((x: any) => x.oldPrice > x.price), 'aucun stock sans réduction');
  });

  it('promotions : tout article >= 15 % (§12 pt 6), rien en dessous', async () => {
    const res = await server.newClient().get('/api/products?section=promotions');
    const items = (res.body as any).items as any[];
    assert.ok(items.length >= 1);
    for (const x of items) {
      const pct = ((x.oldPrice - x.price) * 100) / x.oldPrice;
      assert.ok(pct >= 15, `ratio ${pct.toFixed(2)} % < 15 %`);
    }
    assert.ok(items.some((x: any) => x.id === fifty.id));
    assert.ok(!items.some((x: any) => x.id === fourteen.id), '14,29 % exclu du seuil');
  });

  it('new : exclut les articles créés il y a plus de 14 jours (§12 pt 7)', async () => {
    await dbQuery("UPDATE products SET created_at = now() - interval '20 days' WHERE id = $1", [nine.id]);
    const res = await server.newClient().get('/api/products?section=new');
    const ids = (res.body as any).items.map((x: any) => x.id);
    assert.ok(!ids.includes(nine.id));
    assert.ok(ids.includes(fifty.id) && ids.includes(fourteen.id) && ids.includes(noDiscount.id));
  });

  it('discover : ordre stable sur la même journée (§12 pt 10, %997)', async () => {
    const r1 = await server.newClient().get('/api/products?section=discover');
    const r2 = await server.newClient().get('/api/products?section=discover');
    const ids1 = (r1.body as any).items.map((x: any) => x.id);
    const ids2 = (r2.body as any).items.map((x: any) => x.id);
    assert.deepEqual(ids1, ids2);
    // Tous les AVAILABLE y sont.
    const all = (await server.newClient().get('/api/products')).body as any;
    assert.equal(ids1.length, all.total);
  });

  it('popular (sort puis section) : décroissant sur view_count (§12 pt 2)', async () => {
    await dbQuery('UPDATE products SET view_count = 10 WHERE id = $1', [fifty.id]);
    await dbQuery('UPDATE products SET view_count = 5 WHERE id = $1', [fourteen.id]);
    await dbQuery('UPDATE products SET view_count = 2 WHERE id = $1', [noDiscount.id]);

    const bySort = await server.newClient().get('/api/products?sort=popular');
    const bySection = await server.newClient().get('/api/products?section=popular');
    for (const res of [bySort, bySection]) {
      const items = (res.body as any).items as any[];
      assert.equal(items[0].id, fifty.id);
      assert.equal(items[1].id, fourteen.id);
      assert.equal(items[2].id, noDiscount.id);
      for (let i = 3; i < items.length; i++) {
        assert.equal(items[i].viewCount, 0, 'tout le reste à 0 vue, tie-break id');
      }
    }
  });

  it('section > sort en cas de conflit (§12 pt 3) : section=promotions & sort=popular', async () => {
    // En popular, les 6 articles sortiraient ; la section promotions restreint au seuil ≥15 %.
    const res = await server.newClient().get('/api/products?section=promotions&sort=popular');
    const items = (res.body as any).items as any[];
    assert.ok(items.length >= 1 && items.length < (await server.newClient().get('/api/products')).body.items.length);
    for (const x of items) {
      assert.ok(((x.oldPrice - x.price) * 100) / x.oldPrice >= 15);
    }
  });
});

// ---------------------------------------------------------------------------
// Filtres V4 — prix, condition, location, brand, q étendu, sous-catégorie,
// not_in, ids (mode exclusif)
// ---------------------------------------------------------------------------
describe('Filtres catalogue V4 (api.md §3.2)', () => {
  let fa: { id: number; slug: string }; // Dyson, Grand-Bassam, Neuf, 5 000
  let fb: { id: number; slug: string }; // Samsung, Man, À réparer, 15 000
  let fc: { id: number; slug: string }; // sous-catégorie 14, San-Pedro, 20 000

  before(async () => {
    fa = await createApprovedProduct(owner, admin, {
      name: 'Aspirateur bâton', price: 5_000, condition: 'Neuf', brand: 'Dyson', location: 'Grand-Bassam',
    });
    fb = await createApprovedProduct(owner, admin, {
      name: 'Réfrigérateur 300L', price: 15_000, condition: 'À réparer', brand: 'Samsung', location: 'Man',
    });
    fc = await createApprovedProduct(owner, admin, {
      name: 'PC portable', price: 20_000, subcategoryId: 14, location: 'San-Pedro',
    });
  });

  it('price_min / price_max (bornes inclusives)', async () => {
    const min = await server.newClient().get('/api/products?price_min=10000');
    assert.equal((min.body as any).items.length > 0, true);
    assert.ok((min.body as any).items.every((x: any) => x.price >= 10_000));
    const max = await server.newClient().get('/api/products?price_max=15999');
    assert.ok((max.body as any).items.every((x: any) => x.price <= 15_999));
  });

  it('price_max < price_min → 400 VALIDATION_ERROR (field price_max)', async () => {
    const res = await server.newClient().get('/api/products?price_min=5000&price_max=4000');
    assert.equal(res.status, 400);
    const err = (res.body as any).error;
    assert.equal(err.code, 'VALIDATION_ERROR');
    assert.equal(err.details[0].field, 'price_max');
  });

  it('condition : filtre exact', async () => {
    const res = await server.newClient().get('/api/products?condition=Neuf');
    assert.ok((res.body as any).items.every((x: any) => x.condition === 'Neuf'));
    assert.ok((res.body as any).items.some((x: any) => x.id === fa.id));
  });

  it('location : correspondance EXACTE, insensible à la casse et aux espaces (§7.2 pas de ILIKE)', async () => {
    const man = await server.newClient().get(`/api/products?location=${encodeURIComponent('Man')}`);
    const manLower = await server.newClient().get(`/api/products?location=${encodeURIComponent('man')}`);
    const sp = await server.newClient().get(`/api/products?location=${encodeURIComponent('SAN-PEDRO')}`);
    const partial = await server.newClient().get(`/api/products?location=${encodeURIComponent('san')}`);
    assert.ok((man.body as any).items.some((x: any) => x.id === fb.id));
    assert.ok((manLower.body as any).items.some((x: any) => x.id === fb.id));
    assert.ok((sp.body as any).items.some((x: any) => x.id === fc.id));
    assert.equal((partial.body as any).total, 0, 'partiel non accepté (exact, pas ILIKE)');
  });

  it('brand : ILIKE partiel', async () => {
    const exact = await server.newClient().get(`/api/products?brand=Dyson`);
    const partial = await server.newClient().get(`/api/products?brand=dyso`);
    assert.ok((exact.body as any).items.some((x: any) => x.id === fa.id));
    assert.ok((partial.body as any).items.some((x: any) => x.id === fa.id));
  });

  it('q étendu : marque et localisation (RG-PROD-5 / CA-ACC-45)', async () => {
    const byBrand = await server.newClient().get(`/api/products?q=Dyson`);
    const byCity = await server.newClient().get(`/api/products?q=${encodeURIComponent('Grand-Bassam')}`);
    assert.ok((byBrand.body as any).items.some((x: any) => x.id === fa.id));
    assert.ok((byCity.body as any).items.some((x: any) => x.id === fa.id));
  });

  it('subcategory_id seul : filtre sur la sous-catégorie', async () => {
    const res = await server.newClient().get('/api/products?subcategory_id=14');
    const items = (res.body as any).items as any[];
    assert.ok(items.length >= 1);
    assert.ok(items.every((x: any) => x.subcategory.id === 14));
    assert.ok(items.some((x: any) => x.id === fc.id));
  });

  it('subcategory_id + category_id incohérents → 400 CATEGORY_MISMATCH (details.field=subcategory_id)', async () => {
    const res = await server.newClient().get('/api/products?categoryId=1&subcategory_id=13');
    assert.equal(res.status, 400);
    const err = (res.body as any).error;
    assert.equal(err.code, 'VALIDATION_ERROR');
    assert.equal(err.details[0].field, 'subcategory_id');
    assert.equal(err.details[0].code, 'CATEGORY_MISMATCH');
  });

  it('subcategory_id inexistant avec category_id → 400 CATEGORY_MISMATCH', async () => {
    const res = await server.newClient().get('/api/products?categoryId=3&subcategory_id=999999');
    assert.equal(res.status, 400);
    assert.equal((res.body as any).error.details[0].code, 'CATEGORY_MISMATCH');
  });

  it('not_in : exclu du résultat ET du total, tous les autres conservés', async () => {
    const before = await server.newClient().get('/api/products');
    const totalBefore = (before.body as any).total as number;
    const res = await server.newClient().get(`/api/products?not_in=${fa.id}`);
    const body = res.body as any;
    assert.equal(body.total, totalBefore - 1);
    assert.ok(!body.items.some((x: any) => x.id === fa.id));
  });

  it('ids : ordre fourni préservé, indisponibles/inconnus ignorés, enveloppe neutre', async () => {
    const fiftyRow = await dbQuery<{ id: number }>('SELECT id FROM products WHERE name = $1', ['Réduction 50%']);
    const fiftyId = fiftyRow[0]!.id;
    // fc (20k) + id inexistant + fifty → seuls fc et fifty existent/AVAILABLE, dans l’ordre de la liste.
    const res = await server.newClient().get(`/api/products?ids=${fc.id},999999,${fiftyId}`);
    const body = res.body as any;
    assert.deepEqual(body.items.map((x: any) => x.id), [fc.id, fiftyId]);
    assert.equal(body.page, 1);
    assert.equal(body.perPage, 2);
    assert.equal(body.total, 2);
    assert.equal(body.totalPages, 1);
  });

  it('ids exclusif : ids + sort → 400 (field ids) ; ids + not_in → 400 (issue not_in)', async () => {
    const withSort = await server.newClient().get(`/api/products?ids=${fc.id},2&sort=popular`);
    assert.equal(withSort.status, 400);
    assert.equal((withSort.body as any).error.details[0].field, 'ids');

    const withNotIn = await server.newClient().get(`/api/products?ids=${fc.id},2&not_in=1`);
    assert.equal(withNotIn.status, 400);
    const fields = (withNotIn.body as any).error.details.map((d: any) => d.field);
    assert.ok(fields.includes('ids'), 'combinaison signalée sur ids');
    assert.ok(fields.includes('not_in'), 'combinaison signalée sur not_in');
  });

  it('ids borné : > 20 identifiants → 400 ; liste vide → 400', async () => {
    const tooMany = Array.from({ length: 21 }, (_, i) => i + 1).join(',');
    const res = await server.newClient().get(`/api/products?ids=${tooMany}`);
    assert.equal(res.status, 400);

    const empty = await server.newClient().get('/api/products?ids=');
    assert.equal(empty.status, 400);
  });
});

// ---------------------------------------------------------------------------
// view_count — RG-PROD-3 (incrément à chaque fiche publique, jamais décrémenté)
// ---------------------------------------------------------------------------
describe('view_count (RG-PROD-3)', () => {
  let pv: { id: number; slug: string };
  let pendSlug: string;

  before(async () => {
    pv = await createApprovedProduct(owner, admin, { name: 'Compté par les vues', price: 60_000 });
    const fd = new FormData();
    for (const [k, v] of Object.entries({
      name: 'Jamais visible', categoryId: '3', subcategoryId: '13', condition: 'Bon état',
      price: '70000', location: 'Abidjan', description: 'Une description valide et assez longue.',
    })) fd.append(k, String(v));
    for (let i = 1; i <= 3; i++) {
      fd.append('photos', new Blob([Buffer.from([0xff, 0xd8, 0xff, 0xe0])], { type: 'image/jpeg' }), `photo-${i}.jpg`);
    }
    const pend = await owner.request('/api/products', 'POST', { form: fd });
    assert.equal(pend.status, 201);
    pendSlug = (pend.body as any).product.slug as string;
  });

  it('deux consultations anonymes → 1 puis 2', async () => {
    const r1 = await server.newClient().get(`/api/products/${pv.slug}`);
    assert.equal(r1.status, 200);
    assert.equal((r1.body as any).viewCount, 1);
    const r2 = await server.newClient().get(`/api/products/${pv.slug}`);
    assert.equal((r2.body as any).viewCount, 2);
  });

  it('fiche PENDING → 404 et AUCUN incrément', async () => {
    const res = await server.newClient().get(`/api/products/${pendSlug}`);
    assert.equal(res.status, 404);
    const rows = await dbQuery<{ view_count: number }>('SELECT view_count FROM products WHERE slug = $1', [pendSlug]);
    assert.equal(rows[0]!.view_count, 0);
  });

  it('le propriétaire ET l’admin incrémentent aussi', async () => {
    const byOwner = await owner.get(`/api/products/${pv.slug}`);
    assert.equal((byOwner.body as any).viewCount, 3);
    const byAdmin = await admin.get(`/api/products/${pv.slug}`);
    assert.equal((byAdmin.body as any).viewCount, 4);
  });
});

// ---------------------------------------------------------------------------
// Robustesse : identifiants numériques démesurés (SÉC-P2b)
// ---------------------------------------------------------------------------
describe('GET /api/products/:identifier — robustesse (SÉC-P2b)', () => {
  let robustId: number;
  let robustSlug: string;

  before(async () => {
    const p = await createApprovedProduct(owner, admin, { name: 'Robustesse Id', price: 41_000 });
    robustId = p.id;
    robustSlug = p.slug;
  });

  it('identifiant numérique de 400 chiffres → 404 PRODUCT_NOT_FOUND (jamais 500)', async () => {
    const res = await server.newClient().get(`/api/products/${'9'.repeat(400)}`);
    assert.equal(res.status, 404);
    assert.equal((res.body as any).error.code, 'PRODUCT_NOT_FOUND');
  });

  it('identifiant numérique valide inchangé : id court → 200', async () => {
    const byId = await server.newClient().get(`/api/products/${robustId}`);
    assert.equal(byId.status, 200);
    assert.equal((byId.body as any).id, robustId);
  });

  it('slug texte inchangé : fiche publique répond 200', async () => {
    const res = await server.newClient().get(`/api/products/${robustSlug}`);
    assert.equal(res.status, 200);
    assert.equal((res.body as any).id, robustId);
  });
});

// ---------------------------------------------------------------------------
// SÉC-P2a / CA-V5-088 — borne de taille de corps JSON.
// Le test vivait dans le bloc « POST /api/products/:id/contact », retiré en C6.
// Il est RECYCLÉ ici, pas supprimé : le garde-fou est porté par `express.json`
// (global), il se vérifie donc sur n'importe quelle route JSON authentifiée.
// Aucune couverture n'est perdue (CA-V5-112) : seule l'URL change.
// ---------------------------------------------------------------------------
describe('Corps JSON > 2 Mo → 413 (SÉC-P2a, CA-V5-088)', () => {
  it('413 PAYLOAD_TOO_LARGE (jamais 500)', async () => {
    const buyer = (await registerUser(server, 'bigbody')).client;
    const res = await buyer.post('/api/orders', { productId: 1, note: 'x'.repeat(2_400_000) });
    assert.equal(res.status, 413);
    assert.equal((res.body as any).error.code, 'PAYLOAD_TOO_LARGE');
    assert.equal((res.body as any).error.message, 'Corps de requête trop volumineux');
  });
});

// ---------------------------------------------------------------------------
// GET /api/products/locations — filtre V4 (DISTINCT AVAILABLE, LIMIT 200)
// ---------------------------------------------------------------------------
describe('GET /api/products/locations', () => {
  it('liste triée asc, DISTINCT, casse distincte conservée', async () => {
    // « douala » et « Douala » restent deux entrées distinctes (pas de normalisation).
    await dbQuery(
      `INSERT INTO products (owner_id, category_id, name, slug, description, condition, price, location, status)
       VALUES ($1, 13, 'Ville Douala A', 'ville-douala-a', 'Description douala valide et assez longue.', 'Bon état', 1000, 'douala', 'AVAILABLE'),
              ($1, 13, 'Ville Douala B', 'ville-douala-b', 'Description douala valide et assez longue.', 'Bon état', 1000, 'Douala', 'AVAILABLE')
       ON CONFLICT (slug) DO NOTHING`,
      [ownerId],
    );

    const res = await server.newClient().get('/api/products/locations');
    assert.equal(res.status, 200);
    const locations = (res.body as any).locations as string[];

    const expected = await dbQuery<{ location: string }>(
      `SELECT DISTINCT BTRIM(location) AS location FROM products
         WHERE status = 'AVAILABLE' AND BTRIM(location) <> ''
         ORDER BY location ASC LIMIT 200`,
    );
    assert.deepEqual(locations, expected.map((r) => r.location));

    assert.equal(locations.includes('Abidjan, Cocody'), true);
    assert.ok(locations.includes('douala') && locations.includes('Douala'), 'casse distincte conservée');
    assert.equal(new Set(locations).size, locations.length);
  });

  it('localisations nettoyées : espaces de bord retirés, vides après trim exclues', async () => {
    await dbQuery(
      `INSERT INTO products (owner_id, category_id, name, slug, description, condition, price, location, status)
       VALUES ($1, 13, 'Ville Padded', 'ville-padded', 'Description padded valide et assez longue.', 'Bon état', 1000, '  Grand-Padded  ', 'AVAILABLE'),
              ($1, 13, 'Ville Vide', 'ville-vide', 'Description vide valide et assez longue.', 'Bon état', 1000, '   ', 'AVAILABLE')
       ON CONFLICT (slug) DO NOTHING`,
      [ownerId],
    );

    const res = await server.newClient().get('/api/products/locations');
    assert.equal(res.status, 200);
    const locations = (res.body as any).locations as string[];

    assert.ok(locations.includes('Grand-Padded'), 'localisation trimmée renvoyée');
    assert.ok(!locations.includes('  Grand-Padded  '), 'jamais la version non nettoyée');
    assert.ok(!locations.includes(''), 'aucune localisation vide');
    assert.ok(locations.every((l) => l === l.trim()), 'toutes les entrées sont trimmées');
  });

  it('borne 200 : au-delà de 200 localisations distinctes, seules 200 sont renvoyées', async () => {
    await dbQuery(
      `INSERT INTO products (owner_id, category_id, name, slug, description, condition, price, location, status)
       SELECT $1, 13, 'Bulk ' || g, 'bulk-loc-' || g, 'Description bulk valide et assez longue.', 'Bon état', 1000,
              'Ville-Bulk-' || lpad(g::text, 3, '0'), 'AVAILABLE'
         FROM generate_series(1, 205) AS g
       ON CONFLICT (slug) DO NOTHING`,
      [ownerId],
    );

    const distinct = await dbQuery<{ count: string }>(
      `SELECT COUNT(DISTINCT location)::text AS count FROM products WHERE status = 'AVAILABLE'`,
    );
    const totalDistinct = Number(distinct[0]!.count);
    assert.ok(totalDistinct > 200, `besoin de > 200 localités distinctes (${totalDistinct})`);

    const res = await server.newClient().get('/api/products/locations');
    const locations = (res.body as any).locations as string[];
    assert.equal(locations.length, 200, 'limite de 200 atteinte');

    const expected = await dbQuery<{ location: string }>(
      `SELECT DISTINCT BTRIM(location) AS location FROM products
         WHERE status = 'AVAILABLE' AND BTRIM(location) <> ''
         ORDER BY location ASC LIMIT 200`,
    );
    assert.deepEqual(locations, expected.map((r) => r.location));
  });

  it('route déclarée avant /:identifier : « locations » n’est jamais traitée comme un slug', async () => {
    const res = await server.newClient().get('/api/products/locations');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray((res.body as any).locations));
  });
});