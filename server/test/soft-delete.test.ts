/**
 * C4 — Suppression logique d'un article par l'administration.
 *
 * Couvre CA-V5-054 (route vendeur retirée), CA-V5-056 (204/404/401/403 +
 * idempotence), CA-V5-057 (disparition immédiate), CA-V5-058 (soft delete),
 * CA-V5-059 (historique des commandes intact), CA-V5-060 (notification unique
 * dans la même transaction), CA-V5-061 (traçabilité), CA-V5-062 (droits vendeur)
 * et CA-V5-063 (le compteur `pendingProducts` exclut les produits supprimés).
 *
 * Ces tests sont le PREMIER garde-fou de la bascule : tant qu'ils ne sont pas
 * verts, la migration 009 ne doit pas être appliquée sur la base de dev (PO-V5-12).
 */
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  bootTestServer,
  createOrder,
  createProduct,
  dbQuery,
  DEFAULT_FIELDS,
  errorCode,
  jpegBuffer,
  loginAdmin,
  productForm,
  registerUser,
  type ApiClient,
  type ServerHandle,
} from './helpers.js';

let server: ServerHandle;
let admin: ApiClient;

before(async () => {
  // bootTestServer() réinitialise déjà la base de test (DDL + seed) puis démarre
  // l'app sur un port éphémère.
  server = await bootTestServer();
  admin = await loginAdmin(server);
});

after(async () => {
  await server?.close();
});

/** Produit PENDING du préfixe donné, pour les tests d'état suppression. */
async function seedPendingProduct(prefix: string, name: string): Promise<{ id: number; slug: string }> {
  const owner = await registerUser(server, prefix);
  const created = await createProduct(owner.client, { ...DEFAULT_FIELDS, name }, [jpegBuffer(), jpegBuffer(), jpegBuffer()]);
  return { id: created.id, slug: created.slug, ownerId: owner.id! };
}

/** Produit AVAILABLE (PENDING + approbation admin). */
async function seedAvailableProduct(prefix: string, name: string): Promise<{ id: number; slug: string; ownerId: number }> {
  const seeded = await seedPendingProduct(prefix, name);
  await admin.request(`/api/admin/products/${seeded.id}/approve`, 'POST', { json: {} });
  return seeded;
}

describe('C4 — DELETE /api/admin/products/:id : contrôle d\'accès', () => {
  test('sans session → 401 et produit intact', async () => {
    const anon = server.newClient();
    const { id } = await seedAvailableProduct('soft401', 'Accès anonyme');
    const res = await anon.request(`/api/admin/products/${id}`, 'DELETE');
    assert.equal(res.status, 401);
    const rows = await dbQuery<{ deleted_at: Date | null }>('SELECT deleted_at FROM products WHERE id = $1', [id]);
    assert.equal(rows[0]!.deleted_at, null);
  });

  test('utilisateur simple → 403, même propriétaire du produit', async () => {
    const owner = await registerUser(server, 'soft403');
    const created = await createProduct(owner.client, { ...DEFAULT_FIELDS, name: 'Interdit 403' }, [jpegBuffer(), jpegBuffer(), jpegBuffer()]);
    const res = await owner.client.request(`/api/admin/products/${created.id}`, 'DELETE');
    assert.equal(res.status, 403);
    const rows = await dbQuery<{ deleted_at: Date | null }>('SELECT deleted_at FROM products WHERE id = $1', [created.id]);
    assert.equal(rows[0]!.deleted_at, null);
  });

  test('admin → 204 sans corps', async () => {
    const { id } = await seedAvailableProduct('softadmin', 'Supprimé par admin');
    const res = await admin.request(`/api/admin/products/${id}`, 'DELETE');
    assert.equal(res.status, 204);
    assert.equal(res.body, undefined, '204 sans corps');
  });

  test('produit inexistant → 404 PRODUCT_NOT_FOUND', async () => {
    const res = await admin.request('/api/admin/products/99999999', 'DELETE');
    assert.equal(res.status, 404);
    assert.equal(errorCode(res.body), 'PRODUCT_NOT_FOUND');
  });
});

describe('C4 — idempotence (CA-V5-056)', () => {
  test('supprimer deux fois → 204 puis 204, jamais d\'erreur', async () => {
    const { id } = await seedAvailableProduct('softidem', 'Idempotent');
    assert.equal((await admin.request(`/api/admin/products/${id}`, 'DELETE')).status, 204);
    const second = await admin.request(`/api/admin/products/${id}`, 'DELETE');
    assert.equal(second.status, 204, 'le second appel ne doit pas erreur (CA-V5-056)');
  });

  test('idempotence en base : deleted_at n\'est PAS réécrit', async () => {
    const { id } = await seedAvailableProduct('softhorod', 'Horodatage stable');
    await admin.request(`/api/admin/products/${id}`, 'DELETE');
    const before = await dbQuery<{ deleted_at: Date }>('SELECT deleted_at FROM products WHERE id = $1', [id]);
    await new Promise((r) => setTimeout(r, 25));
    await admin.request(`/api/admin/products/${id}`, 'DELETE');
    const after = await dbQuery<{ deleted_at: Date }>('SELECT deleted_at FROM products WHERE id = $1', [id]);
    assert.equal(
      new Date(after[0]!.deleted_at).getTime(),
      new Date(before[0]!.deleted_at).getTime(),
      'le second appel ne doit pas réécrire l\'horodatage',
    );
  });

  test('une seule notification article_deleted malgré deux appels (CA-V5-060)', async () => {
    const owner = await registerUser(server, 'softnotif');
    const created = await createProduct(owner.client, { ...DEFAULT_FIELDS, name: 'Notif unique' }, [jpegBuffer(), jpegBuffer(), jpegBuffer()]);
    await admin.request(`/api/admin/products/${created.id}`, 'DELETE');
    await admin.request(`/api/admin/products/${created.id}`, 'DELETE');
    const rows = await dbQuery<{ n: number }>(
      "SELECT COUNT(*)::int AS n FROM notifications WHERE user_id = $1 AND type = 'article_deleted'",
      [owner.id],
    );
    assert.equal(rows[0]!.n, 1, 'exactement une notification');
  });
});

describe('C4 — garde commande en cours (409)', () => {
  test('produit réservé par une commande active → 409 PRODUCT_HAS_ACTIVE_ORDER, rien notifié', async () => {
    const seller = await registerUser(server, 'softres');
    const buyer = await registerUser(server, 'softbuy');
    const created = await createProduct(seller.client, { ...DEFAULT_FIELDS, name: 'Produit commandé' }, [jpegBuffer(), jpegBuffer(), jpegBuffer()]);
    await admin.request(`/api/admin/products/${created.id}/approve`, 'POST', { json: {} });
    const order = await createOrder(buyer.client, created.id);
    assert.equal(order.status, 201, 'pré-condition : commande créée');

    const res = await admin.request(`/api/admin/products/${created.id}`, 'DELETE');
    assert.equal(res.status, 409);
    assert.equal(errorCode(res.body), 'PRODUCT_HAS_ACTIVE_ORDER');

    const rows = await dbQuery<{ deleted_at: Date | null }>('SELECT deleted_at FROM products WHERE id = $1', [created.id]);
    assert.equal(rows[0]!.deleted_at, null, 'suppression refusée : produit toujours vivant');
    const notifs = await dbQuery<{ n: number }>(
      "SELECT COUNT(*)::int AS n FROM notifications WHERE user_id = $1 AND type = 'article_deleted'",
      [seller.id],
    );
    assert.equal(notifs[0]!.n, 0, 'un refus ne notifie personne');
  });

  test('commande CANCELLED puis suppression → 204 (statut non actif)', async () => {
    const seller = await registerUser(server, 'softcanc');
    const buyer = await registerUser(server, 'softcancb');
    const created = await createProduct(seller.client, { ...DEFAULT_FIELDS, name: 'Produit annulé' }, [jpegBuffer(), jpegBuffer(), jpegBuffer()]);
    await admin.request(`/api/admin/products/${created.id}/approve`, 'POST', { json: {} });
    const order = await createOrder(buyer.client, created.id);
    const cancelled = await admin.request(`/api/admin/orders/${order.body.order.id}/cancel`, 'POST', {
      json: { note: 'Annulation de test' },
    });
    assert.equal(cancelled.status, 200, 'pré-condition : commande annulée');

    const res = await admin.request(`/api/admin/products/${created.id}`, 'DELETE');
    assert.equal(res.status, 204, 'CANCELLED ne compte plus comme commande active');
  });
});

describe('C4 — effets immédiats (CA-V5-057)', () => {
  test('disparition du catalogue, de la recherche, de ids, de la fiche, de me/products et de l\'admin', async () => {
    const owner = await registerUser(server, 'softvis');
    const name = 'Article Fraude Oligarchique';
    const created = await createProduct(owner.client, { ...DEFAULT_FIELDS, name }, [jpegBuffer(), jpegBuffer(), jpegBuffer()]);
    await admin.request(`/api/admin/products/${created.id}/approve`, 'POST', { json: {} });

    // Pré-condition : visible partout
    assert.equal((await server.newClient().get(`/api/products/${created.slug}`)).status, 200);
    assert.equal(
      (((await server.newClient().get(`/api/products?ids=${created.id}`)).body as any).items as any[]).length,
      1,
      'pré-condition : visible dans ids',
    );

    // Pré-condition admin + total de référence, lus AVANT la suppression.
    const adminBefore = await admin.get('/api/admin/products?status=AVAILABLE&perPage=48');
    const totalBefore = (adminBefore.body as any).total as number;
    assert.equal(
      ((adminBefore.body as any).items as any[]).filter((p) => p.id === created.id).length,
      1,
      'pré-condition : présent dans la liste admin',
    );

    assert.equal((await admin.request(`/api/admin/products/${created.id}`, 'DELETE')).status, 204);

    // 1. absent du catalogue
    const catalog = await server.newClient().get('/api/products?perPage=48');
    assert.equal(
      ((catalog.body as any).items as any[]).filter((p) => p.id === created.id).length,
      0,
      'absent de GET /api/products',
    );
    // 2. absent de la recherche par nom exact
    const search = await server.newClient().get(`/api/products?q=${encodeURIComponent(name)}`);
    assert.equal(((search.body as any).items as any[]).filter((p) => p.id === created.id).length, 0, 'absent de la recherche');
    // 3. absent de ids, ENVELOPPE INCHANGÉE
    const byIds = await server.newClient().get(`/api/products?ids=${created.id}`);
    assert.equal(byIds.status, 200);
    assert.equal(((byIds.body as any).items as any[]).length, 0, 'absent de ids');
    assert.ok(Array.isArray((byIds.body as any).items), 'enveloppe inchangée : items');
    assert.ok('total' in (byIds.body as any), 'enveloppe inchangée : total');
    // 4. fiche publique 404 (slug ET id)
    assert.equal((await server.newClient().get(`/api/products/${created.slug}`)).status, 404);
    assert.equal((await server.newClient().get(`/api/products/${created.id}`)).status, 404);
    // 5. absent de me/products ET des compteurs
    const mine = await owner.client.get('/api/me/products');
    assert.equal(((mine.body as any).items as any[]).filter((p) => p.id === created.id).length, 0, 'absent de me/products');
    assert.equal((mine.body as any).counts.total, 0, 'compteur total décrémenté dans la MÊME réponse');
    // 6. absent de l'admin ET de total. La base est partagée par tous les tests
    //    du fichier : on compare le total AVANT/APRÈS, jamais à 0 (sinon le
    //    résultat dépendrait de l'ordre d'exécution des tests).
    const adminAfter = await admin.get('/api/admin/products?status=AVAILABLE&perPage=48');
    assert.equal(
      ((adminAfter.body as any).items as any[]).filter((p) => p.id === created.id).length,
      0,
      'absent de admin/products',
    );
    assert.equal((adminAfter.body as any).total, totalBefore - 1, 'total admin décrémenté');
    assert.equal(
      (adminAfter.body as any).totalPages,
      Math.ceil((totalBefore - 1) / 12),
      'totalPages cohérent avec total (perPage par défaut = 12)',
    );
  });
});

describe('C4 — soft delete et non-régression (CA-V5-058/059)', () => {
  test('ligne conservée, deleted_at renseigné, status INCHANGÉ, photos et commandes intactes', async () => {
    const seller = await registerUser(server, 'softkeep');
    const buyer = await registerUser(server, 'softkeepb');
    const created = await createProduct(seller.client, { ...DEFAULT_FIELDS, name: 'Intégrité' }, [jpegBuffer(), jpegBuffer(), jpegBuffer()]);
    await admin.request(`/api/admin/products/${created.id}/approve`, 'POST', { json: {} });
    const order = await createOrder(buyer.client, created.id);
    // La commande doit être CLOSE pour que la suppression soit autorisée : une
    // commande encore active déclenche volontairement le 409 (testé plus haut).
    await admin.request(`/api/admin/orders/${order.body.order.id}/cancel`, 'POST', {
      json: { note: 'Clôture de la commande de test' },
    });

    const beforeOrders = await dbQuery<{ n: number }>('SELECT COUNT(*)::int AS n FROM orders WHERE product_id = $1', [created.id]);
    const beforeImages = await dbQuery<{ n: number }>(
      'SELECT COUNT(*)::int AS n FROM product_images WHERE product_id = $1',
      [created.id],
    );
    const beforeStatus = await dbQuery<{ status: string }>('SELECT status FROM products WHERE id = $1', [created.id]);

    assert.equal((await admin.request(`/api/admin/products/${created.id}`, 'DELETE')).status, 204);

    const row = await dbQuery<{ status: string; deleted_at: Date | null }>(
      'SELECT status, deleted_at FROM products WHERE id = $1',
      [created.id],
    );
    assert.equal(row.length, 1, 'la ligne products existe toujours (soft delete)');
    assert.notEqual(row[0]!.deleted_at, null, 'deleted_at renseigné');
    assert.equal(row[0]!.status, beforeStatus[0]!.status, 'status métier conservé (D1)');

    const afterImages = await dbQuery<{ n: number }>(
      'SELECT COUNT(*)::int AS n FROM product_images WHERE product_id = $1',
      [created.id],
    );
    assert.equal(afterImages[0]!.n, beforeImages[0]!.n, 'les lignes product_images survivent (aucun CASCADE)');
    const afterOrders = await dbQuery<{ n: number }>('SELECT COUNT(*)::int AS n FROM orders WHERE product_id = $1', [created.id]);
    assert.equal(afterOrders[0]!.n, beforeOrders[0]!.n, 'les commandes liées sont intactes');
    assert.ok(order.body.order.id > 0);
  });

  test('détail de commande accessible et STRICTEMENT identique pour les 3 parties (CA-V5-059)', async () => {
    const seller = await registerUser(server, 'softhist');
    const buyer = await registerUser(server, 'softhistb');
    const created = await createProduct(seller.client, { ...DEFAULT_FIELDS, name: 'Historique' }, [jpegBuffer(), jpegBuffer(), jpegBuffer()]);
    await admin.request(`/api/admin/products/${created.id}/approve`, 'POST', { json: {} });
    const order = await createOrder(buyer.client, created.id);
    const orderId = order.body.order.id;
    // Commande close : c'est le seul cas où la suppression est autorisée, et
    // c'est précisément le cas que CA-V5-059 veut couvrir (commande historique
    // dont le produit disparaît du catalogue).
    await admin.request(`/api/admin/orders/${orderId}/cancel`, 'POST', {
      json: { note: 'Clôture avant suppression du produit' },
    });

    const buyerBefore = (await buyer.client.get(`/api/orders/${orderId}`)).body;
    const sellerBefore = (await seller.client.get(`/api/orders/${orderId}`)).body;
    const adminBefore = (await admin.get(`/api/admin/orders/${orderId}`)).body;

    assert.equal((await admin.request(`/api/admin/products/${created.id}`, 'DELETE')).status, 204);

    const buyerAfter = await buyer.client.get(`/api/orders/${orderId}`);
    const sellerAfter = await seller.client.get(`/api/orders/${orderId}`);
    const adminAfter = await admin.get(`/api/admin/orders/${orderId}`);
    assert.equal(buyerAfter.status, 200, 'acheteur : pas de 404');
    assert.equal(sellerAfter.status, 200, 'vendeur : pas de 404');
    assert.equal(adminAfter.status, 200, 'admin : pas de 404');
    assert.deepEqual(buyerAfter.body, buyerBefore, 'détail acheteur strictement identique');
    assert.deepEqual(sellerAfter.body, sellerBefore, 'détail vendeur strictement identique');

    // Côté ADMIN, la comparaison est stricte sur TOUT SAUF les champs VIFS du
    // produit et des compteurs — et c'est délibéré, pas une entorse :
    //   · `product.updatedAt` — le trigger `trg_products_updated` (001_init.sql:211)
    //    bumpe `updated_at` sur TOUT UPDATE, donc l'écriture de `deleted_at` le
    //    modifie mécaniquement ; `status` reste lui inchangé (asserté en base) ;
    //   · `product.viewCount` — s'incrémente à CHAQUE consultation publique, donc
    //     déjà non figé AVANT tout soft delete ;
    //   · `buyer/seller.productCount` — statistique VIVE du compteur d'articles,
    //     qui DOIT exclure un produit supprimé (CA-V5-063) : c'est
    //     CA-V5-059 et CA-V5-063 qu'il faut réconcilier ici.
    // Le cœur de la commande (montants, statut, snapshot, events[], identité du
    // produit) est en revanche comparé strictement.
    const orderOnly = (detail: any): any => ({
      ...detail,
      order: {
        ...detail.order,
        buyer: { ...detail.order.buyer, productCount: '<live>' },
        seller: { ...detail.order.seller, productCount: '<live>' },
        product: {
          ...detail.order.product,
          updatedAt: '<live>',
          viewCount: '<live>',
          // le bloc `owner` du produit est lui aussi un AdminUser : son
          // productCount est le même compteur VIF.
          owner: { ...detail.order.product.owner, productCount: '<live>' },
        },
      },
    });
    assert.deepEqual(
      orderOnly(adminAfter.body),
      orderOnly(adminBefore),
      'détail admin : données de commande strictement identiques',
    );
    assert.deepEqual(
      adminAfter.body.order.events,
      adminBefore.order.events,
      'events[] strictement identiques',
    );
    const prodAfter = adminAfter.body.order.product as any;
    const prodBefore = adminBefore.order.product as any;
    for (const field of ['id', 'name', 'slug', 'price', 'oldPrice', 'status', 'condition', 'images']) {
      assert.deepEqual(prodAfter[field], prodBefore[field], `produit de la commande : ${field} inchangé`);
    }
    for (const field of ['amount', 'commission', 'sellerAmount', 'status', 'orderNumber']) {
      assert.deepEqual(
        (adminAfter.body.order as any)[field],
        (adminBefore.order as any)[field],
        `commande : ${field} inchangé`,
      );
    }
  });
});

describe('C4 — notification et traçabilité (CA-V5-060/061)', () => {
  test('exactement une notification article_deleted chez le propriétaire, aucune ailleurs', async () => {
    const owner = await registerUser(server, 'softn');
    const other = await registerUser(server, 'softn2');
    const created = await createProduct(owner.client, { ...DEFAULT_FIELDS, name: 'Notification' }, [jpegBuffer(), jpegBuffer(), jpegBuffer()]);

    await admin.request(`/api/admin/products/${created.id}`, 'DELETE');

    const mine = await owner.client.get('/api/me/notifications');
    const deleted = ((mine.body as any).items as any[]).filter((n) => n.type === 'article_deleted');
    assert.equal(deleted.length, 1, 'une notification pour le propriétaire');
    assert.ok(deleted[0]!.title && deleted[0]!.message, 'titre et corps exploitables');

    const theirs = await other.client.get('/api/me/notifications');
    assert.equal(
      ((theirs.body as any).items as any[]).filter((n) => n.type === 'article_deleted').length,
      0,
      'aucun autre utilisateur notifié',
    );
  });

  test('une ligne admin_actions, cible product, visible dans l\'historique (CA-V5-061)', async () => {
    const owner = await registerUser(server, 'softa');
    const created = await createProduct(owner.client, { ...DEFAULT_FIELDS, name: 'Tracé' }, [jpegBuffer(), jpegBuffer(), jpegBuffer()]);
    await admin.request(`/api/admin/products/${created.id}`, 'DELETE');

    const rows = await dbQuery<{ n: number }>(
      "SELECT COUNT(*)::int AS n FROM admin_actions WHERE action = 'product.delete' AND target_type = 'product' AND target_id = $1",
      [created.id],
    );
    assert.equal(rows[0]!.n, 1, 'exactement une trace');

    const history = await admin.get('/api/admin/history?perPage=48');
    const hit = ((history.body as any).items as any[]).find(
      (a) => a.action === 'product.delete' && a.targetId === created.id,
    );
    assert.ok(hit, 'retrouvable dans GET /api/admin/history');
  });
});

describe('C4 — droits du vendeur après suppression (CA-V5-062) et retrait du DELETE vendeur (CA-V5-054)', () => {
  test('PUT sur un produit supprimé → 404 NOT_FOUND', async () => {
    const owner = await registerUser(server, 'softput');
    const created = await createProduct(owner.client, { ...DEFAULT_FIELDS, name: 'PUT après' }, [jpegBuffer(), jpegBuffer(), jpegBuffer()]);
    await admin.request(`/api/admin/products/${created.id}`, 'DELETE');

    const res = await owner.client.request(
      `/api/products/${created.id}`,
      'PUT',
      { form: productForm({ ...DEFAULT_FIELDS, name: 'PUT après' }, [jpegBuffer(), jpegBuffer(), jpegBuffer()]) },
    );
    assert.equal(res.status, 404);
    // Code 404 métier du produit : PRODUCT_NOT_FOUND (et non le NOT_FOUND
    // générique de route, qui reste réservé au DELETE vendeur retiré).
    assert.equal(errorCode(res.body), 'PRODUCT_NOT_FOUND');
  });

  test('le compte reste actif : un nouveau produit est accepté (201)', async () => {
    const owner = await registerUser(server, 'softactive');
    const first = await createProduct(owner.client, { ...DEFAULT_FIELDS, name: 'Premier article' }, [jpegBuffer(), jpegBuffer(), jpegBuffer()]);
    await admin.request(`/api/admin/products/${first.id}`, 'DELETE');
    const again = await createProduct(owner.client, { ...DEFAULT_FIELDS, name: 'Article suivant' }, [jpegBuffer(), jpegBuffer(), jpegBuffer()]);
    assert.ok(again.id > 0, 'le compte n\'est pas bloqué (CA-V5-069)');
  });

  test('DELETE /api/products/:id côté vendeur → 404 NOT_FOUND (route retirée), jamais 403/405/500', async () => {
    const owner = await registerUser(server, 'softnodel');
    const created = await createProduct(owner.client, { ...DEFAULT_FIELDS, name: 'Pas de DELETE' }, [jpegBuffer(), jpegBuffer(), jpegBuffer()]);

    // cas propriétaire
    const own = await owner.client.request(`/api/products/${created.id}`, 'DELETE');
    assert.equal(own.status, 404, 'même pour le propriétaire');
    assert.equal(errorCode(own.body), 'NOT_FOUND');

    // cas intrusion : produit qui n'appartient pas à l'appelant
    const intruder = (await registerUser(server, 'softintr')).client;
    const other = await intruder.request(`/api/products/${created.id}`, 'DELETE');
    assert.equal(other.status, 404, 'jamais 403 ni 405');
    assert.equal(errorCode(other.body), 'NOT_FOUND');

    const rows = await dbQuery<{ deleted_at: Date | null }>('SELECT deleted_at FROM products WHERE id = $1', [created.id]);
    assert.equal(rows[0]!.deleted_at, null, 'la route retirée ne supprime rien');
  });
});

describe('C4 — hasActiveOrder exposé et compteur de modération (CA-V5-063/065)', () => {
  test('hasActiveOrder : false sans commande, true avec une commande active (exposé par la LISTE)', async () => {
    const seller = await registerUser(server, 'softha');
    const buyer = await registerUser(server, 'softhab');
    const created = await createProduct(seller.client, { ...DEFAULT_FIELDS, name: 'Indicateur' }, [jpegBuffer(), jpegBuffer(), jpegBuffer()]);
    await admin.request(`/api/admin/products/${created.id}/approve`, 'POST', { json: {} });

    // `hasActiveOrder` est exposé par GET /api/admin/products (et non par une
    // route de détail : elle n'existe pas) — le front lit la liste, donc
    // aucun appel supplémentaire par ligne (architecture-v5 §4.4).
    // Le `status` visé dépend de l'état du produit : AVAILABLE avant la
    // réservation, RESERVED après (une commande en cours le bascule).
    const listed = async (status: string): Promise<boolean> => {
      const res = await admin.get(`/api/admin/products?status=${status}&q=Indicateur&perPage=48`);
      const item = ((res.body as any).items as any[]).find((p) => p.id === created.id);
      assert.ok(item, 'le produit doit figurer dans la liste admin');
      assert.equal(typeof item.hasActiveOrder, 'boolean', 'hasActiveOrder est un booléen, jamais absent');
      return item.hasActiveOrder;
    };

    assert.equal(await listed('AVAILABLE'), false, 'false sans commande active');
    await createOrder(buyer.client, created.id);
    assert.equal(await listed('RESERVED'), true, 'true avec une commande active');
  });

  test('pendingProducts exclut un produit supprimé logiquement', async () => {
    const owner = await registerUser(server, 'softst');
    const first = await createProduct(owner.client, { ...DEFAULT_FIELDS, name: 'Stats A' }, [jpegBuffer(), jpegBuffer(), jpegBuffer()]);
    const second = await createProduct(owner.client, { ...DEFAULT_FIELDS, name: 'Stats B' }, [jpegBuffer(), jpegBuffer(), jpegBuffer()]);

    const before = (await admin.get('/api/admin/stats')).body as any;
    assert.ok(before.pendingProducts >= 2, 'pré-condition : 2 produits en attente');

    await admin.request(`/api/admin/products/${first.id}`, 'DELETE');
    await admin.request(`/api/admin/products/${second.id}`, 'DELETE');

    const after = (await admin.get('/api/admin/stats')).body as any;
    assert.equal(after.pendingProducts, before.pendingProducts - 2, 'les produits supprimés sortent du compteur');
  });
});
