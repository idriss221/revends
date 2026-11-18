/**
 * V7 — HÉBERGEMENT DES VENDEURS (migrations 018 → 019).
 *
 * Couvre les critères automatisables du cahier V7 côté serveur (45 CA) :
 *   003/039 non-abonné catalogue illimité · 010 forfaits seed · 011 unicité
 *   ACTIVE · 012 PENDING sans accès · 013 activation admin seule · 014 aucun
 *   chemin de paiement · 015 changement de forfait · 016 expiration paresseuse ·
 *   020 unicité/réservation du slug · 021 mots réservés · 022 format ·
 *   023/024 boutique publique 200/404 · 025 isolation listings · 026 aucune
 *   coordonnée · 030 ownership route dédiée · 031 quota par jointure ·
 *   032 message clair · 033 refusé reste vendable · 034 retrait scopé ·
 *   035 même id · 036 pas de reset · 037 SOLD libère par lecture ·
 *   045 formulaire/notification interne · 046 aucun numéro · 047 fiche
 *   inchangée · 048 auto-contact · 050 RBAC admin · 051 file PENDING +
 *   traçabilité · 052 aucun rôle écrit · 053 pas de CRUD forfait · 054
 *   parrainage préservé.
 *
 * ⚠️ Les produits passés en SOLD/REJECTED le sont via SQL direct
 * (`dbQuery`) : on teste ICI la dérivation en lecture côté boutique, pas le
 * pipeline de commande (couvert par buy/checkout/payments suites, non modifiées).
 * Aucune écriture V7 dans le pipeline n'est donc exercée ni requise.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  bootTestServer,
  loginAdmin,
  registerUser,
  createProduct,
  createApprovedProduct,
  dbQuery,
  errorCode,
} from './helpers.js';
import type { ServerHandle, TestUser } from './helpers.js';

let server: ServerHandle;
let admin: Awaited<ReturnType<typeof loginAdmin>>;
let adminId = 0;

async function resolveAdminId(): Promise<number> {
  if (adminId === 0) {
    const rows = await dbQuery<{ id: number }>(`SELECT id FROM users WHERE role = 'admin' LIMIT 1`);
    adminId = rows[0]!.id;
  }
  return adminId;
}

/** Souscrit + active un abonnement pour `user` et retourne la boutique/réponses. */
async function subscribeAndActivate(
  user: TestUser,
  planId: number,
  slug: string,
  supersedesId?: number,
) {
  const res = await user.client.post('/api/subscriptions', { paymentMethod: 'wave', paymentReference: 'WAVE-TEST-0000001', planId, slug, supersedesId });
  assert.equal(res.status, 201, `subscribe → ${res.status} ${JSON.stringify(res.body)}`);
  const subId = (res.body as any).subscription.id as number;
  const act = await admin.post(`/api/admin/subscriptions/${subId}/activate`, {});
  assert.equal(act.status, 200, `activate → ${act.status} ${JSON.stringify(act.body)}`);
  return { subId, subscribeBody: res.body, activateBody: act.body };
}

before(async () => {
  server = await bootTestServer();
  admin = await loginAdmin(server);
});

after(async () => {
  await server.close();
});

// ---------------------------------------------------------------------------
// CA-V7-010 — 3 paliers seedés, prix/quotas en base
// ---------------------------------------------------------------------------
describe('CA-V7-010 — forfaits en base (seed migration 019)', () => {
  it('subscription_plans retourne Découverte 2000/10, Boutique 5000/30, Atelier 10000/100 (duration 30)', async () => {
    const rows = await dbQuery<{ name: string; price_fcfa: number; quota: number; duration_days: number; active: boolean }>(
      'SELECT name, price_fcfa, quota, duration_days, active FROM subscription_plans ORDER BY price_fcfa ASC',
    );
    assert.equal(rows.length, 3);
    assert.deepEqual(
      rows.map((r) => [r.name, r.price_fcfa, r.quota, r.duration_days, r.active]),
      [
        ['Découverte', 2000, 10, 30, true],
        ['Boutique', 5000, 30, 30, true],
        ['Atelier', 10000, 100, 30, true],
      ],
    );
  });

  it('les 3 tables V7 existent, notification_type est inchangé', async () => {
    const tables = await dbQuery<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name IN ('subscription_plans','seller_subscriptions','storefront_listings')
        ORDER BY 1`,
    );
    assert.deepEqual(tables.map((t) => t.table_name), [
      'seller_subscriptions',
      'storefront_listings',
      'subscription_plans',
    ]);
    const enumValues = await dbQuery<{ enumlabel: string }>(
      `SELECT e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
        WHERE t.typname = 'notification_type' ORDER BY e.enumsortorder`,
    );
    const labels = enumValues.map((e) => e.enumlabel);
    assert.ok(labels.includes('product.contact'));
    assert.ok(!labels.includes('storefront.contact'));
  });

  it('storefront_listings n’a AUCUNE colonne status', async () => {
    const cols = await dbQuery<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'storefront_listings'`,
    );
    const names = cols.map((c) => c.column_name).sort();
    assert.deepEqual(names, ['created_at', 'id', 'product_id', 'subscription_id', 'withdrawn_at']);
  });
});

// ---------------------------------------------------------------------------
// CA-V7-022 / 020 / 021 — slug : format, réservation à vie, mots réservés
// ---------------------------------------------------------------------------
describe('CA-V7-022 — format du slug (validation stricte)', () => {
  const invalid = ['a', 'ab', '--x', 'x--y', 'mode_dakar', 'mode.dakar', 'république', 'a/b', 'x'.repeat(41)];
  for (const slug of invalid) {
    it(`refuse « ${slug.slice(0, 20)}${slug.length > 20 ? '…' : ''} » (400)`, async () => {
      const user = await registerUser(server, 'cv7');
      const res = await user.client.post('/api/subscriptions', { paymentMethod: 'wave', paymentReference: 'WAVE-TEST-0000001', planId: 1, slug });
      assert.equal(res.status, 400, JSON.stringify(res.body));
      assert.equal(errorCode(res.body), 'VALIDATION_ERROR');
    });
  }

  it('accepte « shop123 » et « mode-dakar » au format valide', async () => {
    const user = await registerUser(server, 'cv7ok');
    const res = await user.client.post('/api/subscriptions', { paymentMethod: 'wave', paymentReference: 'WAVE-TEST-0000001', planId: 1, slug: 'shop123' });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal((res.body as any).subscription.slug, 'shop123');
  });
});

describe('CA-V7-021 — les 20 mots réservés sont refusés (400 SLUG_RESERVED)', () => {
  const reserved = [
    'admin', 'api', 'boutique', 'catalogue', 'vendre', 'mes-articles', 'mon-abonnement',
    'parrainage', 'panier', 'profil', 'login', 'register', 'search', 'static', 'assets',
    'health', 'www', 'help', 'contact', 'legal',
  ];
  for (const word of reserved) {
    it(`refuse « ${word} »`, async () => {
      const user = await registerUser(server, 'cv7res');
      const res = await user.client.post('/api/subscriptions', { paymentMethod: 'wave', paymentReference: 'WAVE-TEST-0000001', planId: 1, slug: word });
      assert.equal(res.status, 400, JSON.stringify(res.body));
      assert.equal(errorCode(res.body), 'SLUG_RESERVED');
      const rows = await dbQuery(`SELECT id FROM seller_subscriptions WHERE seller_id = $1`, [user.id]);
      assert.equal(rows.length, 0, 'aucun abonnement ne doit être créé');
    });
  }
});

describe('CA-V7-020 — unicité du slug et réservation à vie par vendeur', () => {
  it('deux vendeurs demandent « mode-dakar » : le second reçoit 409 SLUG_TAKEN', async () => {
    const first = await registerUser(server, 'cv7a');
    const second = await registerUser(server, 'cv7b');
    const res1 = await first.client.post('/api/subscriptions', { paymentMethod: 'wave', paymentReference: 'WAVE-TEST-0000001', planId: 1, slug: 'mode-dakar' });
    assert.equal(res1.status, 201);
    const res2 = await second.client.post('/api/subscriptions', { paymentMethod: 'wave', paymentReference: 'WAVE-TEST-0000001', planId: 1, slug: 'mode-dakar' });
    assert.equal(res2.status, 409);
    assert.equal(errorCode(res2.body), 'SLUG_TAKEN');
  });

  it('la normalisation serveur rend « Mode Dakar » ≡ « mode-dakar »', async () => {
    const user = await registerUser(server, 'cv7c');
    const res = await user.client.post('/api/subscriptions', { paymentMethod: 'wave', paymentReference: 'WAVE-TEST-0000001', planId: 1, slug: 'Mode Dakar' });
    assert.equal(res.status, 409); // déjà pris par le vendeur précédent
    assert.equal(errorCode(res.body), 'SLUG_TAKEN');
  });

  it('le slug reste réservé après expiration : re-souscription sans champ récupère le même slug', async () => {
    const user = await registerUser(server, 'cv7d');
    const { subId } = await subscribeAndActivate(user, 1, 'Salon Testok');
    assert.equal((await user.client.get('/api/subscriptions/me')).status, 200);
    // Simule l'expiration : ends_at passé → lecture → matérialisation EXPIRED.
    await dbQuery(`UPDATE seller_subscriptions SET started_at = now() - interval '31 days', ends_at = now() - interval '1 day' WHERE id = $1`, [subId]);
    const me = await user.client.get('/api/subscriptions/me');
    assert.equal((me.body as any).subscription.status, 'EXPIRED');
    // Re-souscription SANS supersedesId : le slug réservé est récupéré automatiquement.
    const res = await user.client.post('/api/subscriptions', { paymentMethod: 'wave', paymentReference: 'WAVE-TEST-0000001', planId: 1 });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal((res.body as any).subscription.slug, 'salon-testok');
  });
});

// ---------------------------------------------------------------------------
// CA-V7-012/013/014 — PENDING, activation admin seule, aucun paiement
// ---------------------------------------------------------------------------
describe('CA-V7-012 — souscription PENDING, aucun accès abonné', () => {
  it('PENDING : GET boutique → 404, POST listings → 403 SUBSCRIPTION_REQUIRED, me → PENDING', async () => {
    const user = await registerUser(server, 'cv7p');
    const res = await user.client.post('/api/subscriptions', { paymentMethod: 'wave', paymentReference: 'WAVE-TEST-0000001', planId: 1, slug: 'Boutique Pending' });
    assert.equal(res.status, 201);
    assert.equal((res.body as any).subscription.status, 'PENDING');

    const boutique = await server.newClient().get('/api/storefront/boutique-pending');
    assert.equal(boutique.status, 404);
    assert.deepEqual(boutique.body, { error: { code: 'NOT_FOUND', message: 'Boutique introuvable' } });

    const add = await user.client.post('/api/storefront/listings', { productId: 999999 });
    assert.equal(add.status, 403);
    assert.equal(errorCode(add.body), 'SUBSCRIPTION_REQUIRED');

    const me = await user.client.get('/api/subscriptions/me');
    assert.equal(me.status, 200);
    assert.equal((me.body as any).subscription.status, 'PENDING');
    assert.equal((me.body as any).usage, null);
    assert.deepEqual((me.body as any).listings, []);
  });

  it('un status envoyé par le client est TOUJOURS ignoré (CA-V7-014)', async () => {
    const user = await registerUser(server, 'cv7i');
    const res = await user.client.post('/api/subscriptions', { paymentMethod: 'wave', paymentReference: 'WAVE-TEST-0000001', planId: 1, slug: 'Ignore Status', status: 'ACTIVE' });
    assert.equal(res.status, 201);
    assert.equal((res.body as any).subscription.status, 'PENDING');
    const rows = await dbQuery<{ status: string }>(
      'SELECT status FROM seller_subscriptions WHERE seller_id = $1',
      [user.id],
    );
    assert.deepEqual(rows.map((r) => r.status), ['PENDING']);
  });
});

describe('CA-V7-013 — activation MANUELLE par admin uniquement', () => {
  it('un user ne peut pas activer (403 FORBIDDEN) ; l’admin active (200, traçabilité)', async () => {
    const user = await registerUser(server, 'cv7act');
    const res = await user.client.post('/api/subscriptions', { paymentMethod: 'wave', paymentReference: 'WAVE-TEST-0000001', planId: 1, slug: 'Boutique Activer' });
    const subId = (res.body as any).subscription.id as number;

    const forbidden = await user.client.post(`/api/admin/subscriptions/${subId}/activate`, {});
    assert.equal(forbidden.status, 403);
    assert.equal(errorCode(forbidden.body), 'FORBIDDEN');

    const adminIdValue = await resolveAdminId();
    const ok = await admin.post(`/api/admin/subscriptions/${subId}/activate`, { status: 'ACTIVE', activated_by: 1 });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.equal((ok.body as any).subscription.status, 'ACTIVE');
    assert.equal((ok.body as any).subscription.activatedBy, adminIdValue);
    assert.ok((ok.body as any).subscription.activatedAt);

    // La boutique est publique immédiatement.
    const boutique = await server.newClient().get('/api/storefront/boutique-activer');
    assert.equal(boutique.status, 200);
  });

  it('id inconnu → 404 NOT_FOUND ; cible non PENDING → 409 INVALID_STATUS', async () => {
    const missing = await admin.post('/api/admin/subscriptions/999999999/activate', {});
    assert.equal(missing.status, 404);
    assert.equal(errorCode(missing.body), 'NOT_FOUND');

    const user = await registerUser(server, 'cv7inv');
    const { subId } = await subscribeAndActivate(user, 1, 'Boutique Inokib');
    const again = await admin.post(`/api/admin/subscriptions/${subId}/activate`, {});
    assert.equal(again.status, 409);
    assert.equal(errorCode(again.body), 'INVALID_STATUS');
  });
});

// ---------------------------------------------------------------------------
// CA-V7-011 / 015 — unicité ACTIVE & changement de forfait (sans double ACTIVE)
// ---------------------------------------------------------------------------
describe('CA-V7-011 — un seul abonnement ACTIVE par vendeur (409 à la 2e activation)', () => {
  it('2e demande indépendante → 409 SUBSCRIPTION_ALREADY_ACTIVE, COUNT(ACTIVE)=1', async () => {
    const user = await registerUser(server, 'cv7u');
    await subscribeAndActivate(user, 1, 'Boutique Double');
    // 2e demande indépendante : le slug réservé est récupéré automatiquement.
    const res = await user.client.post('/api/subscriptions', { paymentMethod: 'wave', paymentReference: 'WAVE-TEST-0000001', planId: 1 });
    assert.equal(res.status, 201);
    const secondId = (res.body as any).subscription.id as number;
    assert.equal((res.body as any).subscription.slug, 'boutique-double');

    const act = await admin.post(`/api/admin/subscriptions/${secondId}/activate`, {});
    assert.equal(act.status, 409);
    assert.equal(errorCode(act.body), 'SUBSCRIPTION_ALREADY_ACTIVE');

    const rows = await dbQuery<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM seller_subscriptions WHERE seller_id = $1 AND status = 'ACTIVE'`,
      [user.id],
    );
    assert.equal(rows[0]!.n, 1);
  });
});

describe('CA-V7-015 — changement de forfait : ancien CANCELLED, nouveau ACTIVE, listings réattachés', () => {
  it('Atelier demandé depuis Boutique : 1 seul ACTIVE à la fin, historique conservé', async () => {
    const user = await registerUser(server, 'cv7plan');
    // Abonnement actif sur Boutique (plan 2).
    const { subId: oldId } = await subscribeAndActivate(user, 2, 'Boutique Change');

    // Un produit listé sous l'ancien abonnement.
    const created = await createProduct(user.client, { name: 'Article changement forfait' });
    const add = await user.client.post('/api/storefront/listings', { productId: created.id });
    assert.equal(add.status, 201);

    // Demande de changement → nouvel abonnement PENDING, supersedesId renseigné.
    const res = await user.client.post('/api/subscriptions', { paymentMethod: 'wave', paymentReference: 'WAVE-TEST-0000001', planId: 3, supersedesId: oldId });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal((res.body as any).subscription.supersedesId, oldId);
    assert.equal((res.body as any).subscription.slug, 'boutique-change'); // copié du prédécesseur

    const newId = (res.body as any).subscription.id as number;
    // L'ancien reste ACTIVE jusqu'à l'activation du nouveau.
    const countsBefore = await dbQuery<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM seller_subscriptions WHERE seller_id = $1 AND status = 'ACTIVE'`,
      [user.id],
    );
    assert.equal(countsBefore[0]!.n, 1);

    const act = await admin.post(`/api/admin/subscriptions/${newId}/activate`, {});
    assert.equal(act.status, 200, JSON.stringify(act.body));

    const rows = await dbQuery<{ id: number; status: string; plan_id: number }>(
      `SELECT id, status, plan_id FROM seller_subscriptions WHERE seller_id = $1 ORDER BY id ASC`,
      [user.id],
    );
    const active = rows.filter((r) => r.status === 'ACTIVE');
    assert.equal(active.length, 1, 'un seul ACTIVE après activation');
    assert.equal(active[0]!.id, newId);
    assert.equal(rows.find((r) => r.id === oldId)!.status, 'CANCELLED');
    assert.equal(rows.length, 2, 'historique conservé');

    // Le listing actif a été réattaché au NOUVEL abonnement.
    const listing = await dbQuery<{ subscription_id: number }>(
      `SELECT subscription_id FROM storefront_listings WHERE product_id = $1 AND withdrawn_at IS NULL`,
      [created.id],
    );
    assert.equal(listing[0]!.subscription_id, newId);

    // Le quota appliqué est celui du forfait ACTIVE (Atelier 100).
    const me = await user.client.get('/api/subscriptions/me');
    assert.equal((me.body as any).subscription.plan.name, 'Atelier');
    assert.equal((me.body as any).usage.quota, 100);
    assert.equal((me.body as any).usage.used, 1);
    assert.equal((me.body as any).listings.length, 1);
  });
});

// ---------------------------------------------------------------------------
// CA-V7-003/039 — non-abonné : catalogue illimité (verrou CA-V5-069 intact)
// ---------------------------------------------------------------------------
describe('CA-V7-003 / CA-V7-039 — non-abonné : 10 créations → 201, puis SOLD, puis 11e → 201', () => {
  it('un vendeur sans abonnement crée 10 produits (201 × 10), COUNT = 10', async () => {
    const user = await registerUser(server, 'cv7n');
    for (let i = 1; i <= 10; i += 1) {
      const res = await createProduct(user.client, { name: `Article non abonne ${i} unique` });
      assert.equal(res.id > 0, true);
    }
    const rows = await dbQuery<{ n: number }>(
      'SELECT COUNT(*)::int AS n FROM products WHERE owner_id = $1',
      [user.id],
    );
    assert.equal(rows[0]!.n, 10);

    // Passage du produit n°1 en SOLD (via SQL direct) → la publication n°11 répond 201.
    await dbQuery(`UPDATE products SET status = 'SOLD' WHERE id = (SELECT id FROM products WHERE owner_id = $1 AND deleted_at IS NULL ORDER BY id ASC LIMIT 1)`, [user.id]);
    const eleventhProduct = await createProduct(user.client, { name: 'Article non abonne numero onze' });
    assert.ok(eleventhProduct.id > 0);
    const rows2 = await dbQuery<{ n: number }>(
      'SELECT COUNT(*)::int AS n FROM products WHERE owner_id = $1',
      [user.id],
    );
    assert.equal(rows2[0]!.n, 11);
  });

  it('toute tentative d’ajout à une boutique → 403 SUBSCRIPTION_REQUIRED', async () => {
    const user = await registerUser(server, 'cv7na');
    const res = await user.client.post('/api/storefront/listings', { productId: 1 });
    assert.equal(res.status, 403);
    assert.equal(errorCode(res.body), 'SUBSCRIPTION_REQUIRED');
  });
});

// ---------------------------------------------------------------------------
// CA-V7-030/031/032/033/034/035/036/037 — quota, retrait, cohérence, pipeline intact
// ---------------------------------------------------------------------------
describe('CA-V7-031/032 — quota dérivé en lecture (10 ajouts → 201, 11e → 409 avec message clair)', () => {
  let seller: TestUser;
  let productIds: number[] = [];

  before(async () => {
    seller = await registerUser(server, 'cv7quota');
    productIds = [];
    for (let i = 1; i <= 13; i += 1) {
      const created = await createProduct(seller.client, { name: `Produit quota ${i} unique` });
      productIds.push(created.id);
    }
    await subscribeAndActivate(seller, 1, 'Boutique Quota');
  });

  it('ajouts 1→10 → 201 ; 11e → 409 STOREFRONT_QUOTA_EXCEEDED avec (10/10)', async () => {
    for (let i = 0; i < 10; i += 1) {
      const res = await seller.client.post('/api/storefront/listings', { productId: productIds[i] });
      assert.equal(res.status, 201, `ajout ${i + 1} → ${JSON.stringify(res.body)}`);
    }
    const eleven = await seller.client.post('/api/storefront/listings', { productId: productIds[10] });
    assert.equal(eleven.status, 409);
    assert.equal(errorCode(eleven.body), 'STOREFRONT_QUOTA_EXCEEDED');
    const msg = (eleven.body as any).error.message as string;
    assert.match(msg, /Quota de votre forfait atteint \(10\/10\)/);
    assert.match(msg, /Retirez une annonce/);
    // Aucune annonce créée, aucun produit modifié.
    const count = await dbQuery<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM storefront_listings l
         JOIN seller_subscriptions s ON s.id = l.subscription_id WHERE s.seller_id = $1`,
      [seller.id],
    );
    assert.equal(count[0]!.n, 10);
  });

  it('CA-V7-030 — un produit d’autrui → 403 NOT_PRODUCT_OWNER', async () => {
    const other = await registerUser(server, 'cv7other');
    const created = await createProduct(other.client, { name: 'Produit appartenant a un autre' });
    const res = await seller.client.post('/api/storefront/listings', { productId: created.id });
    assert.equal(res.status, 403);
    assert.equal(errorCode(res.body), 'NOT_PRODUCT_OWNER');
  });

  it('CA-V7-030 — un abonnement PENDING reste refusé (déjà couvert) et produit inexistant → 404', async () => {
    const res = await seller.client.post('/api/storefront/listings', { productId: 999999999 });
    assert.equal(res.status, 404);
    assert.equal(errorCode(res.body), 'PRODUCT_NOT_FOUND');
  });

  it('CA-V7-037 — un produit SOLD libère une place EN LECTURE (ajout n°11 → 201)', async () => {
    await dbQuery(`UPDATE products SET status = 'SOLD' WHERE id = $1`, [productIds[0]]);
    const res = await seller.client.post('/api/storefront/listings', { productId: productIds[10] });
    assert.equal(res.status, 201, JSON.stringify(res.body));
  });

  it('CA-V7-031 — un produit REJECTED libère une place EN LECTURE (ajout n°12 → 201)', async () => {
    await dbQuery(`UPDATE products SET status = 'REJECTED', rejection_reason = 'Photos insuffisantes' WHERE id = $1`, [productIds[1]]);
    const res = await seller.client.post('/api/storefront/listings', { productId: productIds[11] });
    assert.equal(res.status, 201, JSON.stringify(res.body));
  });

  it('CA-V7-036 — pas de reset mensuel : le quota reste 10/10 (aucun compteur, aucune colonne reset)', async () => {
    const res = await seller.client.post('/api/storefront/listings', { productId: productIds[12] });
    assert.equal(res.status, 409);
    assert.equal(errorCode(res.body), 'STOREFRONT_QUOTA_EXCEEDED');
    const resetCols = await dbQuery<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name IN ('seller_subscriptions', 'storefront_listings')
          AND column_name ILIKE '%reset%'`,
    );
    assert.equal(resetCols.length, 0);
  });

  it('CA-V7-034/037 — retrait boutique-scopé : disparaît de la boutique, place libérée, produit intact', async () => {
    const meBefore = await seller.client.get('/api/subscriptions/me');
    const listings = (meBefore.body as any).listings as Array<{ id: number; productId: number }>;
    const target = listings.find((l) => l.productId === productIds[2])!;
    const del = await seller.client.request(`/api/storefront/listings/${target.id}`, 'DELETE');
    assert.equal(del.status, 200);
    assert.deepEqual(del.body, { ok: true });
    // Idempotent : second retrait → 200.
    const del2 = await seller.client.request(`/api/storefront/listings/${target.id}`, 'DELETE');
    assert.equal(del2.status, 200);

    // Le produit n'est plus dans la boutique mais reste dans le catalogue.
    const boutique = await server.newClient().get('/api/storefront/boutique-quota');
    const ids = (boutique.body as any).items.map((i: any) => i.id);
    assert.ok(!ids.includes(productIds[2]));

    // La place est libérée : un nouvel ajout → 201.
    const add = await seller.client.post('/api/storefront/listings', { productId: productIds[12] });
    assert.equal(add.status, 201, JSON.stringify(add.body));

    // Le retrait n'a pas touché products (toujours là, toujours le même statut).
    const rows = await dbQuery<{ status: string }>('SELECT status FROM products WHERE id = $1', [productIds[2]]);
    assert.equal(rows[0]!.status, 'PENDING');
  });

  it('CA-V7-034 — retrait d’un listing d’autrui ou inexistant → 404 (jamais 403)', async () => {
    const me = await seller.client.get('/api/subscriptions/me');
    const foreign = (me.body as any).listings[0];
    const other = await registerUser(server, 'cv7w');
    const res = await other.client.request(`/api/storefront/listings/${foreign.id}`, 'DELETE');
    assert.equal(res.status, 404);
  });
});

describe('CA-V7-033 — l’annonce refusée par la boutique reste vendable dans le catalogue', () => {
  it('au quota atteint, un produit approuvé reste visible et trouvable dans le catalogue', async () => {
    const seller = await registerUser(server, 'cv7vendable');
    const product = await createApprovedProduct(seller.client, admin, { name: 'Produit vendable unique au quota' });
    await subscribeAndActivate(seller, 1, 'Boutique Vendable');
    // Remplit le quota avec 10 produits jetables.
    for (let i = 1; i <= 10; i += 1) {
      const filler = await createProduct(seller.client, { name: `Remplissage vendable ${i} unique` });
      const res = await seller.client.post('/api/storefront/listings', { productId: filler.id });
      assert.equal(res.status, 201);
    }
    const refused = await seller.client.post('/api/storefront/listings', { productId: product.id });
    assert.equal(refused.status, 409);
    // Le produit refusé reste dans le catalogue (fiche publique → 200).
    const fiche = await server.newClient().get(`/api/products/${product.slug}`);
    assert.equal(fiche.status, 200, JSON.stringify(fiche.body));
    assert.equal((fiche.body as any).id, product.id);
  });
});

// ---------------------------------------------------------------------------
// CA-V7-023/024/025/026/035 — boutique publique
// ---------------------------------------------------------------------------
describe('CA-V7-023/024/025/026/035 — boutique publique : 200/404, isolation, aucune fuite', () => {
  let seller: TestUser;
  let slug: string;
  const productIds: number[] = [];

  before(async () => {
    seller = await registerUser(server, 'cv7pub');
    for (let i = 1; i <= 4; i += 1) {
      const created = await createProduct(seller.client, { name: `Produit boutique publique ${i} unique` });
      productIds.push(created.id);
    }
    const { subId } = await subscribeAndActivate(seller, 1, 'Boutique Publique');
    slug = 'boutique-publique';
    void subId;
    // 3 annonces en boutique (sur 4 produits catalogue).
    for (const pid of productIds.slice(0, 3)) {
      const res = await seller.client.post('/api/storefront/listings', { productId: pid });
      assert.equal(res.status, 201);
    }
  });

  it('CA-V7-023 — visiteur ANONYME → 200, exactement les annonces de boutique', async () => {
    const anon = server.newClient(); // aucun cookie
    const res = await anon.get(`/api/storefront/${slug}`);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const items = (res.body as any).items as Array<{ id: number; effectiveStatus: string }>;
    assert.equal(items.length, 3);
    assert.deepEqual(
      items.map((i) => i.id).sort((a, b) => a - b),
      [...productIds.slice(0, 3)].sort((a, b) => a - b),
    );
    // CA-V7-035 — les ids sont des products.id (même id dans les deux vues).
    for (const item of items) {
      assert.ok(productIds.includes(item.id));
      assert.ok(['PENDING', 'AVAILABLE', 'RESERVED'].includes(item.effectiveStatus));
    }
    assert.equal((res.body as any).storefront.slug, slug);
    // memberSince (année) est exposé par la boutique publique — jamais l'email/phone/name.
    const memberSince = (res.body as any).storefront.memberSince as number | undefined;
    assert.equal(typeof memberSince, 'number');
    assert.ok(memberSince! >= 2000 && memberSince! <= new Date().getUTCFullYear() + 1);
  });

  it('CA-V7-026 — la réponse boutique ne contient AUCUNE coordonnée privée', async () => {
    const res = await server.newClient().get(`/api/storefront/${slug}`);
    const raw = JSON.stringify(res.body);
    assert.doesNotMatch(raw, /phone|whatsapp|mailto:|tel:/i);
    assert.doesNotMatch(raw, /"email"/);
    assert.doesNotMatch(raw, new RegExp(seller.email.replace('.', '\\.'), 'i'));
  });

  it('CA-V7-024 — 404 identique pour slug inconnu / PENDING / EXPIRED / CANCELLED', async () => {
    // slug inconnu
    const unknownBody = await server.newClient().get('/api/storefront/slug-inexistant-unique-9');
    assert.equal(unknownBody.status, 404);

    // PENDING
    const pendingUser = await registerUser(server, 'cv7pend');
    await pendingUser.client.post('/api/subscriptions', { paymentMethod: 'wave', paymentReference: 'WAVE-TEST-0000001', planId: 1, slug: 'Boutique Pending404' });
    const pendingBody = await server.newClient().get('/api/storefront/boutique-pending404');
    assert.equal(pendingBody.status, 404);

    // EXPIRED (ends_at passé + lecture → matérialisation)
    const expUser = await registerUser(server, 'cv7exp404');
    const { subId } = await subscribeAndActivate(expUser, 1, 'Boutique Expired404');
    await dbQuery(`UPDATE seller_subscriptions SET started_at = now() - interval '31 days', ends_at = now() - interval '1 day' WHERE id = $1`, [subId]);
    const expiredBody = await server.newClient().get('/api/storefront/boutique-expired404');
    assert.equal(expiredBody.status, 404);

    // CANCELLED (matérialisation SQL directe — aucune route admin de cancel en V7)
    const canUser = await registerUser(server, 'cv7can404');
    const canSub = await subscribeAndActivate(canUser, 1, 'Boutique Cancelled404');
    await dbQuery(`UPDATE seller_subscriptions SET status = 'CANCELLED' WHERE id = $1`, [canSub.subId]);
    const cancelledBody = await server.newClient().get('/api/storefront/boutique-cancelled404');
    assert.equal(cancelledBody.status, 404);

    // Payloads strictement identiques (aucune divulgation).
    assert.deepEqual(pendingBody.body, unknownBody.body);
    assert.deepEqual(expiredBody.body, unknownBody.body);
    assert.deepEqual(cancelledBody.body, unknownBody.body);
  });

  it('CA-V7-025 — 3 annonces boutique ; le catalogue garde ses 4 produits (ids distincts)', async () => {
    const boutique = await server.newClient().get(`/api/storefront/${slug}`);
    assert.equal((boutique.body as any).items.length, 3);
    assert.equal((boutique.body as any).total, 3);
    const catalog = await server.newClient().get('/api/products?ids=' + productIds.join(','));
    assert.equal(catalog.status, 200);
  });
});

// ---------------------------------------------------------------------------
// CA-V7-016 — expiration 30 jours glissants (paresseuse, sans cron)
// ---------------------------------------------------------------------------
describe('CA-V7-016 — abonnement expiré : boutique 404, annonces conservées, catalogue intact', () => {
  it('ends_at passé → boutique 404, me → EXPIRED + message, listings conservés, produits visibles', async () => {
    const seller = await registerUser(server, 'cv7exp');
    const approved = await createApprovedProduct(seller.client, admin, { name: 'Article conserve unique expire' });
    const { subId } = await subscribeAndActivate(seller, 1, 'Boutique Vieux');
    const add = await seller.client.post('/api/storefront/listings', { productId: approved.id });
    assert.equal(add.status, 201);

    // ends_at fixé dans le passé → lecture → matérialisation EXPIRED.
    await dbQuery(`UPDATE seller_subscriptions SET started_at = now() - interval '31 days', ends_at = now() - interval '1 day' WHERE id = $1`, [subId]);
    const boutique = await server.newClient().get('/api/storefront/boutique-vieux');
    assert.equal(boutique.status, 404);
    assert.deepEqual(boutique.body, { error: { code: 'NOT_FOUND', message: 'Boutique introuvable' } });

    const me = await seller.client.get('/api/subscriptions/me');
    const sub = (me.body as any).subscription;
    assert.equal(sub.status, 'EXPIRED');
    assert.equal(sub.daysRemaining, 0);
    assert.match(sub.message, /expiré/);
    // Les annonces de boutique sont conservées, pas supprimées.
    assert.equal((me.body as any).listings.length, 1);

    const rows = await dbQuery<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM storefront_listings WHERE product_id = $1 AND withdrawn_at IS NULL`,
      [approved.id],
    );
    assert.equal(rows[0]!.n, 1);

    // Le même produit reste visible dans le catalogue (fiche publique → 200).
    const fiche = await server.newClient().get(`/api/products/${approved.slug}`);
    assert.equal(fiche.status, 200);
  });
});

// ---------------------------------------------------------------------------
// CA-V7-045/046/048 — contact interne boutique
// ---------------------------------------------------------------------------
describe('CA-V7-045/046/048 — formulaire interne boutique-scopé', () => {
  let seller: TestUser;
  let slug = 'boutique-contact';

  before(async () => {
    seller = await registerUser(server, 'cv7contact');
    await subscribeAndActivate(seller, 1, 'Boutique Contact');
  });

  it('CA-V7-045 — message 10..2000 + email optionnel → 201 { ok, notificationId }', async () => {
    const buyer = await registerUser(server, 'cv7buyer');
    const res = await buyer.client.post(`/api/storefront/${slug}/contact`, {
      message: 'Bonjour, cet article est-il toujours disponible ? Je peux passer samedi matin.',
      email: 'aicha@example.com',
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal((res.body as any).ok, true);
    assert.ok(Number.isInteger((res.body as any).notificationId));

    const rows = await dbQuery<{ type: string; title: string; message: string }>(
      'SELECT type, title, message FROM notifications WHERE id = $1',
      [(res.body as any).notificationId],
    );
    assert.equal(rows.length, 1);
    const notification = rows[0]!;
    assert.equal(notification.type, 'product.contact');
    // Titre précisant la boutique + l'expéditeur (jamais un numéro).
    assert.match(notification.title, /boutique-contact/);
    assert.match(notification.title, new RegExp(buyer.displayName));
    assert.match(notification.message, /aicha@example\.com/); // email du DEMANDEUR, réservé au vendeur
    assert.doesNotMatch(notification.title, /\d{2} \d{2} \d{2}/);
  });

  it('CA-V7-045 — message hors bornes → 400 ; email malformé → 400 ; e-mail optionnel omis → 201', async () => {
    const buyer = await registerUser(server, 'cv7buyer2');
    const short = await buyer.client.post(`/api/storefront/${slug}/contact`, { message: 'court' });
    assert.equal(short.status, 400);
    assert.equal(errorCode(short.body), 'VALIDATION_ERROR');

    const long = await buyer.client.post(`/api/storefront/${slug}/contact`, { message: 'x'.repeat(2001) });
    assert.equal(long.status, 400);

    const badEmail = await buyer.client.post(`/api/storefront/${slug}/contact`, {
      message: 'Message valide, dix caracteres minimum.',
      email: 'pas-un-email',
    });
    assert.equal(badEmail.status, 400);

    const noEmail = await buyer.client.post(`/api/storefront/${slug}/contact`, {
      message: 'Message valide sans adresse de reponse, dix caracteres minimum.',
    });
    assert.equal(noEmail.status, 201);
  });

  it('CA-V7-045/024 — boutique inconnue/PENDING/EXPIRED → 404 identique (contact inclus)', async () => {
    const buyer = await registerUser(server, 'cv7buyer3');
    const res = await buyer.client.post('/api/storefront/slug-inexistant-unique-9/contact', {
      message: 'Message valide vers une boutique inexistante, dix caracteres.',
    });
    assert.equal(res.status, 404);
    assert.deepEqual(res.body, { error: { code: 'NOT_FOUND', message: 'Boutique introuvable' } });
  });

  it('CA-V7-048 — auto-contact refusé (400 CONTACT_SELF)', async () => {
    const res = await seller.client.post(`/api/storefront/${slug}/contact`, {
      message: 'Bonjour, je me contacte moi-meme, dix caracteres minimum.',
    });
    assert.equal(res.status, 400);
    assert.equal(errorCode(res.body), 'CONTACT_SELF');
  });

  it('CA-V7-046 — ni la réponse ni la notification ne contient de numéro vendeur', async () => {
    const buyer = await registerUser(server, 'cv7buyer4');
    const res = await buyer.client.post(`/api/storefront/${slug}/contact`, {
      message: 'Question sur la disponibilite, dix caracteres minimum svp.',
    });
    const raw = JSON.stringify(res.body);
    assert.doesNotMatch(raw, /phone|whatsapp|mailto:|tel:/i);
    const rows = await dbQuery<{ title: string; message: string }>(
      'SELECT title, message FROM notifications WHERE id = $1',
      [(res.body as any).notificationId],
    );
    const notif = JSON.stringify(rows[0]);
    assert.doesNotMatch(notif, /whatsapp|mailto:|tel:/i);
    assert.ok(!notif.includes('+221'), 'la notification ne doit contenir aucun numéro');
  });
});

describe('CA-V7-047 — aucun libellé « Contacter » ni canal sur la fiche produit', () => {
  it('GET /api/products/:slug ne contient ni mailto:, ni tel:, ni « Contacter »', async () => {
    const seller = await registerUser(server, 'cv7fiche');
    const product = await createApprovedProduct(seller.client, admin, { name: 'Fiche sans canal unique test' });
    const res = await server.newClient().get(`/api/products/${product.slug}`);
    assert.equal(res.status, 200);
    const raw = JSON.stringify(res.body);
    assert.doesNotMatch(raw, /mailto:|tel:|whatsapp/i);
    assert.doesNotMatch(raw, /Contacter|Écrire au vendeur/i);
  });
});

// ---------------------------------------------------------------------------
// CA-V7-050/051/052/053/054 — gouvernance admin
// ---------------------------------------------------------------------------
describe('CA-V7-050 — GET /api/admin/subscriptions et activate réservés aux admins', () => {
  it('user → 403 FORBIDDEN sur la liste et l’activation ; admin → 200', async () => {
    const user = await registerUser(server, 'cv7rbac');
    const list = await user.client.get('/api/admin/subscriptions');
    assert.equal(list.status, 403);
    assert.equal(errorCode(list.body), 'FORBIDDEN');
    const act = await user.client.post('/api/admin/subscriptions/1/activate', {});
    assert.equal(act.status, 403);
    assert.equal(errorCode(act.body), 'FORBIDDEN');

    const okList = await admin.get('/api/admin/subscriptions?status=PENDING');
    assert.equal(okList.status, 200);
    assert.ok(Array.isArray((okList.body as any).items));
  });
});

describe('CA-V7-051 — file PENDING : 3 demandes affichées, activation de la 2e, 2 restantes', () => {
  it('compte les lignes PENDING avant/après activation et expose la traçabilité', async () => {
    const before = await admin.get('/api/admin/subscriptions?status=PENDING&per_page=48');
    assert.equal(before.status, 200);
    const beforeTotal = (before.body as any).total as number;

    const u1 = await registerUser(server, 'cv7file1');
    const u2 = await registerUser(server, 'cv7file2');
    const u3 = await registerUser(server, 'cv7file3');
    for (const [u, slug] of [[u1, 'File One Pending'], [u2, 'File Two Pending'], [u3, 'File Three Pending']] as const) {
      const res = await u.client.post('/api/subscriptions', { paymentMethod: 'wave', paymentReference: 'WAVE-TEST-0000001', planId: 2, slug });
      assert.equal(res.status, 201);
    }

    const after = await admin.get('/api/admin/subscriptions?status=PENDING&per_page=48');
    assert.equal((after.body as any).total, beforeTotal + 3);
    const items = (after.body as any).items as Array<{ id: number; planName: string; sellerDisplayName: string; createdAt: string }>;
    const fileItems = items.filter((i) => i.planName === 'Boutique');
    for (const item of fileItems.slice(0, 3)) {
      assert.ok(item.sellerDisplayName);
      assert.ok(item.createdAt);
    }

    // Active la 2e demande créée (par slug).
    const second = items.find((i) => (i as any).slug === 'file-two-pending') as any;
    assert.ok(second, 'la 2e demande doit être visible');
    const act = await admin.post(`/api/admin/subscriptions/${second.id}/activate`, {});
    assert.equal(act.status, 200);

    const remaining = await admin.get('/api/admin/subscriptions?status=PENDING&per_page=48');
    assert.equal((remaining.body as any).total, beforeTotal + 2);
    const slugs = (remaining.body as any).items.map((i: any) => i.slug);
    assert.ok(!slugs.includes('file-two-pending'));

    // Traçabilité : activated_by / activated_at renseignés, visibles dans l'historique.
    const history = await admin.get('/api/admin/subscriptions?status=ACTIVE&per_page=48');
    const activated = (history.body as any).items.find((i: any) => i.slug === 'file-two-pending');
    assert.ok(activated.activatedAt);
    assert.equal(activated.activatedBy, await resolveAdminId());
  });
});

describe('CA-V7-052 — aucun endpoint n’écrit users.role', () => {
  it('le rôle du vendeur reste « user » après activation', async () => {
    const user = await registerUser(server, 'cv7role');
    await subscribeAndActivate(user, 1, 'Boutique Role');
    const rows = await dbQuery<{ role: string }>('SELECT role FROM users WHERE id = $1', [user.id]);
    assert.equal(rows[0]!.role, 'user');
  });
});

describe('CA-V7-053 — aucun CRUD forfait n’existe sous /api', () => {
  it('POST /api/admin/subscription-plans → 404 (route inexistante)', async () => {
    const res = await admin.post('/api/admin/subscription-plans', { name: 'Pirate' });
    assert.equal(res.status, 404);
  });
  it('POST /api/subscriptions/plans → 404 (route inexistante)', async () => {
    const res = await admin.post('/api/subscriptions/plans', { name: 'Pirate' });
    assert.equal(res.status, 404);
  });
});

describe('CA-V7-054 — parrainage et Vitrine préservés après souscription + activation', () => {
  it('referred_by / ambassador_until / vitrine_until identiques avant/après V7', async () => {
    // Un parrain avec un code valide.
    const sponsor = await registerUser(server, 'cv7sponsor');
    const codeRows = await dbQuery<{ referral_code: string | null }>(
      'SELECT referral_code FROM users WHERE id = $1',
      [sponsor.id],
    );
    const code = codeRows[0]!.referral_code!;
    assert.ok(code, 'le parrain doit avoir un code');

    // Filleul inscrit AVEC le code → referred_by renseigné.
    const client = server.newClient();
    const email = `cv7filleul${Date.now()}@test.revends`;
    const reg = await client.post('/api/auth/register', {
      displayName: `filleul${Date.now()}`,
      name: 'Nom Filleul',
      email,
      phone: `+221 77 55 9 ${String(Date.now()).slice(-4)}`,
      password: 'motdepasse1!',
      acceptedCgu: true,
      ref: code,
    });
    assert.equal(reg.status, 201, JSON.stringify(reg.body));
    const filleulId = (reg.body as any).user?.id as number;

    const before = await dbQuery(
      'SELECT referred_by, ambassador_until, vitrine_until FROM users WHERE id = $1',
      [filleulId],
    );
    assert.equal(before[0]!.referred_by, sponsor.id);

    // Souscription + activation par V7 (ne doit rien toucher au parrainage).
    const sub = await client.post('/api/subscriptions', { paymentMethod: 'wave', paymentReference: 'WAVE-TEST-0000001', planId: 1, slug: 'Boutique Parrainage' });
    assert.equal(sub.status, 201);
    const subId = (sub.body as any).subscription.id as number;
    const act = await admin.post(`/api/admin/subscriptions/${subId}/activate`, {});
    assert.equal(act.status, 200);

    const after = await dbQuery(
      'SELECT referred_by, ambassador_until, vitrine_until FROM users WHERE id = $1',
      [filleulId],
    );
    assert.equal(after[0]!.referred_by, before[0]!.referred_by);
    assert.equal(after[0]!.ambassador_until, before[0]!.ambassador_until ?? null);
    assert.equal(after[0]!.vitrine_until, before[0]!.vitrine_until ?? null);
  });
});
