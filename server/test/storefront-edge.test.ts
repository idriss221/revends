/**
 * V7 — HÉBERGEMENT DES VENDEURS : CAS LIMITES (compléments à storefront.test.ts).
 *
 * Objectif : couvrir les angles morts de la suite principale, sans amender
 * aucun test existant. Critères visés (cahier V7, 17/11/2026) :
 *   011/013 activation concurrente · 015 supersedesId invalide · 016 add après
 *   expiration · 020/022 slug (bornes 3/40, réservation après CANCELLED,
 *   casse) · 022/045 bornes exactes message 10/2000 · 023/050 pagination
 *   bounds · 030 PLAN_NOT_FOUND / id · 031 RESERVED compte, soft-delete libère,
 *   concurrence quota · 034 re-ajout après retrait (STOREFRONT_ALREADY_LISTED)
 *   · 035 même id/titre/prix deux vues · 039 15 produits non-abonné · 045
 *   contact après expiration/annulation · 001/002/014 audit schéma runtime.
 *
 * ⚠️ Même discipline que storefront.test.ts : SOLD/REJECTED/soft-delete via SQL
 * direct (dérivation en lecture), jamais d'écriture V7 dans le pipeline de
 * commande. Les tests de concurrence reposent sur `Promise.all` + le verrou
 * `SELECT … FOR UPDATE` de `addListingToStorefront` (déterministe en mono-
 * process : chaque transaction sérialise sur la ligne `seller_subscriptions`).
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  bootTestServer,
  loginAdmin,
  registerUser,
  createProduct,
  createApprovedProduct,
  createOrder,
  dbQuery,
  errorCode,
} from './helpers.js';
import type { ServerHandle, TestUser } from './helpers.js';

let server: ServerHandle;
let admin: Awaited<ReturnType<typeof loginAdmin>>;

async function subscribeAndActivate(
  user: TestUser,
  planId: number,
  slug: string,
  supersedesId?: number,
) {
  const res = await user.client.post('/api/subscriptions', { planId, slug, supersedesId });
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
// CA-V7-001/002/014 — audit runtime : tables/colonnes/rôles/paiement
// ---------------------------------------------------------------------------
describe('CA-V7-001/002/014 — audit runtime : schéma additif, rôles, aucune donnée bancaire', () => {
  it('CA-V7-001 — les tables EXISTANTES n’ont reçu aucune colonne (liste attendue)', async () => {
    // Preuve partielle exécutable : les tables préexistantes n'ont que leurs
    // colonnes connues. La preuve complète (information_schema avant/après)
    // relève de l'audit de migration (019) — cf. journal V7, section recette.
    const cols = await dbQuery<{ table_name: string; column_name: string }>(
      `SELECT table_name, column_name FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name IN ('users', 'products', 'orders', 'notifications', 'referral_qualifications')
        ORDER BY table_name, column_name`,
    );
    const byTable = new Map<string, string[]>();
    for (const c of cols) {
      byTable.set(c.table_name, [...(byTable.get(c.table_name) ?? []), c.column_name]);
    }
    for (const table of ['users', 'products', 'orders', 'notifications', 'referral_qualifications']) {
      const names = byTable.get(table) ?? [];
      assert.ok(names.length > 0, `table ${table} absente de l’information_schema ?`);
      // Aucune colonne V7 (subscription/storefront/quota) n'a atterri dans l'existant.
      assert.equal(
        names.filter((n) => /subscription|storefront|quota|withdrawn|plan_id|supersedes/i.test(n)).length,
        0,
        `colonne V7 détectée dans ${table} : ${names.join(', ')}`,
      );
    }
  });

  it('CA-V7-002 — le rôle applicatif ne contient que user/admin (aucune élévation)', async () => {
    const rows = await dbQuery<{ enumlabel: string }>(
      `SELECT e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
        WHERE t.typname = 'user_role' ORDER BY e.enumsortorder`,
    );
    const labels = rows.map((r) => r.enumlabel);
    assert.deepEqual([...labels].sort(), ['admin', 'user']);
  });

  it('CA-V7-014 — seller_subscriptions ne stocke AUCUNE donnée bancaire / de paiement', async () => {
    const cols = await dbQuery<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'seller_subscriptions'`,
    );
    const names = cols.map((c) => c.column_name);
    for (const forbidden of ['card', 'credit_card', 'cvv', 'iban', 'pan', 'stripe']) {
      assert.ok(
        !names.some((n) => n.toLowerCase().includes(forbidden)),
        `colonne bancaire "${forbidden}" détectée dans seller_subscriptions`,
      );
    }
    // Note : `payment_reference` / `payment_method` sont **volontairement**
    // présentes depuis la V8 (décision V8-D8 — référence Wave/OM/virement à
    // vérifier par l'admin) ; elles ne contiennent aucun numéro de carte ni
    // donnée bancaire — ce verrou couvre le périmètre bancaire uniquement.
  });
});

// ---------------------------------------------------------------------------
// CA-V7-022/020 — slug : bornes exactes 3/40, casse, tiret final, réservation à vie
// ---------------------------------------------------------------------------
describe('CA-V7-022 — bornes EXACTES du slug (3 et 40) et variantes refusées', () => {
  it('slug de exactement 3 caractères « abc » → 201', async () => {
    const user = await registerUser(server, 'cv7b3');
    const res = await user.client.post('/api/subscriptions', { planId: 1, slug: 'abc' });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal((res.body as any).subscription.slug, 'abc');
  });

  it('slug de exactement 3 caractères avec tiret central « a-b » → 201', async () => {
    const user = await registerUser(server, 'cv7ab');
    const res = await user.client.post('/api/subscriptions', { planId: 1, slug: 'a-b' });
    assert.equal(res.status, 201, JSON.stringify(res.body));
  });

  it('slug de exactement 40 caractères → 201', async () => {
    const user = await registerUser(server, 'cv740');
    const slug40 = 'a'.repeat(40); // 40 caractères, regex valide
    const res = await user.client.post('/api/subscriptions', { planId: 1, slug: slug40 });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal((res.body as any).subscription.slug, slug40);
  });

  it('slug de exactement 41 caractères → 400 (déjà couvert indirectement : limite 40)', async () => {
    const user = await registerUser(server, 'cv741');
    const res = await user.client.post('/api/subscriptions', { planId: 1, slug: 'a'.repeat(41) });
    assert.equal(res.status, 400);
  });

  it('tiret final « mode- » et tiret initial « -mode » → 400', async () => {
    const user = await registerUser(server, 'cv7dash');
    for (const slug of ['mode-', '-mode', 'a--b', 'a---b']) {
      const res = await user.client.post('/api/subscriptions', { planId: 1, slug });
      assert.equal(res.status, 400, `slug « ${slug} » attendu 400, reçu ${res.status}`);
    }
  });

  it('slugs de 1 et 2 caractères → 400 (jamais 3)', async () => {
    const user = await registerUser(server, 'cv7tiny');
    for (const slug of ['a', 'ab']) {
      const res = await user.client.post('/api/subscriptions', { planId: 1, slug });
      assert.equal(res.status, 400);
    }
  });
});

describe('CA-V7-020/021 — normalisation casse + réservation à vie (même après CANCELLED)', () => {
  it('« MODE-DAKAR » (majuscules) est normalisé et rejeté 409 si pris', async () => {
    const owner = await registerUser(server, 'cv7case1');
    const res1 = await owner.client.post('/api/subscriptions', { planId: 1, slug: 'case-shop' });
    assert.equal(res1.status, 201);

    const other = await registerUser(server, 'cv7case2');
    const res2 = await other.client.post('/api/subscriptions', { planId: 1, slug: 'CASE-SHOP' });
    assert.equal(res2.status, 409);
    assert.equal(errorCode(res2.body), 'SLUG_TAKEN');
  });

  it('« ADMIN » (casse mixte) est normalisé puis refusé 400 SLUG_RESERVED', async () => {
    const user = await registerUser(server, 'cv7case3');
    const res = await user.client.post('/api/subscriptions', { planId: 1, slug: 'ADMIN' });
    assert.equal(res.status, 400);
    assert.equal(errorCode(res.body), 'SLUG_RESERVED');
  });

  it('après un changement de forfait (ancien CANCELLED), le slug reste réservé au vendeur A', async () => {
    const sellerA = await registerUser(server, 'cv7resvA');
    const { subId: oldId } = await subscribeAndActivate(sellerA, 2, 'Boutique Slug Cancelled');
    const res = await sellerA.client.post('/api/subscriptions', { planId: 3, supersedesId: oldId });
    assert.equal(res.status, 201);
    const newId = (res.body as any).subscription.id as number;
    const act = await admin.post(`/api/admin/subscriptions/${newId}/activate`, {});
    assert.equal(act.status, 200);
    // L'ancien est CANCELLED, le slug lui reste réservé.
    const sellerB = await registerUser(server, 'cv7resvB');
    const takeover = await sellerB.client.post('/api/subscriptions', { planId: 1, slug: 'boutique-slug-cancelled' });
    assert.equal(takeover.status, 409);
    assert.equal(errorCode(takeover.body), 'SLUG_TAKEN');
  });
});

// ---------------------------------------------------------------------------
// CA-V7-030/015 — souscription : plans invalides, supersedesId invalide
// ---------------------------------------------------------------------------
describe('CA-V7-030/015 — planId inconnu, bornes numériques, supersedesId non autorisé', () => {
  it('planId inexistant → 404 PLAN_NOT_FOUND', async () => {
    const user = await registerUser(server, 'cv7plan404');
    const res = await user.client.post('/api/subscriptions', { planId: 999999, slug: 'Plan Inexistant' });
    assert.equal(res.status, 404);
    assert.equal(errorCode(res.body), 'PLAN_NOT_FOUND');
  });

  it('planId = 0 / négatif / non numérique → 400 VALIDATION_ERROR', async () => {
    const user = await registerUser(server, 'cv7plan400');
    for (const planId of [0, -3, 'abc']) {
      const res = await user.client.post('/api/subscriptions', { planId: planId as any, slug: 'Plan Bord' });
      assert.equal(res.status, 400, `planId « ${String(planId)} » attendu 400`);
    }
  });

  it('supersedesId appartenant à un AUTRE vendeur → 404 NOT_FOUND', async () => {
    const owner = await registerUser(server, 'cv7superA');
    const { subId } = await subscribeAndActivate(owner, 1, 'Boutique Super Own');
    const other = await registerUser(server, 'cv7superB');
    const res = await other.client.post('/api/subscriptions', { planId: 1, supersedesId: subId });
    assert.equal(res.status, 404);
    assert.equal(errorCode(res.body), 'NOT_FOUND');
  });

  it('supersedesId pointant sur son propre abonnement PENDING (≠ ACTIVE) → 400 INVALID_SUPERSEDES', async () => {
    const user = await registerUser(server, 'cv7superP');
    const res = await user.client.post('/api/subscriptions', { planId: 1, slug: 'Boutique Super Pend' });
    assert.equal(res.status, 201);
    const pendingId = (res.body as any).subscription.id as number;
    const res2 = await user.client.post('/api/subscriptions', { planId: 2, supersedesId: pendingId });
    assert.equal(res2.status, 400);
    assert.equal(errorCode(res2.body), 'INVALID_SUPERSEDES');
  });
});

// ---------------------------------------------------------------------------
// CA-V7-016 — après expiration, l'ajout en boutique est refusé (403)
// ---------------------------------------------------------------------------
describe('CA-V7-016 — un abonnement expiré ne permet plus l’ajout en boutique', () => {
  it('ACTIVE → EXPIRED (ends_at passé) : POST listings → 403 SUBSCRIPTION_REQUIRED', async () => {
    const seller = await registerUser(server, 'cv7expadd');
    const created = await createProduct(seller.client, { name: 'Produit apres expiration unique' });
    const { subId } = await subscribeAndActivate(seller, 1, 'Boutique Exp Add');
    await dbQuery(
      `UPDATE seller_subscriptions SET started_at = now() - interval '31 days', ends_at = now() - interval '1 day' WHERE id = $1`,
      [subId],
    );
    const res = await seller.client.post('/api/storefront/listings', { productId: created.id });
    assert.equal(res.status, 403);
    assert.equal(errorCode(res.body), 'SUBSCRIPTION_REQUIRED');
  });
});

// ---------------------------------------------------------------------------
// CA-V7-031 — le quota dérive RESERVED et ignore les produits soft-deletés
// ---------------------------------------------------------------------------
describe('CA-V7-031 — statuts dérivés : RESERVED compte, soft-delete libère', () => {
  it('un produit RESERVED occupe une place de quota (10/10 atteignables avec RESERVED)', async () => {
    const seller = await registerUser(server, 'cv7resvQ');
    const ids: number[] = [];
    for (let i = 1; i <= 11; i += 1) {
      const created = await createProduct(seller.client, { name: `Produit reversed quota ${i} unique` });
      ids.push(created.id);
    }
    await subscribeAndActivate(seller, 1, 'Boutique Reserved Quota');
    // 9 produits normaux + 1 produit RESERVED (via SQL direct).
    for (let i = 0; i < 9; i += 1) {
      const res = await seller.client.post('/api/storefront/listings', { productId: ids[i] });
      assert.equal(res.status, 201);
    }
    await dbQuery(
      `UPDATE products SET status = 'RESERVED', reserved_at = now(), reserved_until = now() + interval '15 minutes' WHERE id = $1`,
      [ids[9]],
    );
    const tenth = await seller.client.post('/api/storefront/listings', { productId: ids[9] });
    assert.equal(tenth.status, 201, `le produit RESERVED doit compter dans le quota (201, reçu ${JSON.stringify(tenth.body)})`);
    // 10/10 atteints → le 11e produit est refusé.
    const eleventh = await seller.client.post('/api/storefront/listings', { productId: ids[10] });
    assert.equal(eleventh.status, 409);
    assert.equal(errorCode(eleventh.body), 'STOREFRONT_QUOTA_EXCEEDED');
  });

  it('un produit soft-deleté (deleted_at) ne compte plus : une place est libérée', async () => {
    const seller = await registerUser(server, 'cv7sdelQ');
    const ids: number[] = [];
    for (let i = 1; i <= 11; i += 1) {
      const created = await createProduct(seller.client, { name: `Produit soft del ${i} unique` });
      ids.push(created.id);
    }
    await subscribeAndActivate(seller, 1, 'Boutique Soft Delete');
    for (let i = 0; i < 10; i += 1) {
      const res = await seller.client.post('/api/storefront/listings', { productId: ids[i] });
      assert.equal(res.status, 201);
    }
    const eleventhBlocked = await seller.client.post('/api/storefront/listings', { productId: ids[10] });
    assert.equal(eleventhBlocked.status, 409);
    // Soft-delete du produit n°1 (ligne conservée, deleted_at posé).
    await dbQuery(`UPDATE products SET deleted_at = now() WHERE id = $1`, [ids[0]]);
    const afterDelete = await seller.client.post('/api/storefront/listings', { productId: ids[10] });
    assert.equal(afterDelete.status, 201, `deleted_at doit libérer une place (201, reçu ${JSON.stringify(afterDelete.body)})`);
  });
});

// ---------------------------------------------------------------------------
// STOREFRONT_ALREADY_LISTED — double ajout refusé, re-ajout après retrait permis
// ---------------------------------------------------------------------------
describe('CA-V7-034/031 — produit déjà listé : 409, puis re-ajout après retrait → 201', () => {
  it('double ajout → 409 STOREFRONT_ALREADY_LISTED ; retrait puis ré-ajout → 201', async () => {
    const seller = await registerUser(server, 'cv7double');
    const created = await createProduct(seller.client, { name: 'Produit double ajout unique' });
    await subscribeAndActivate(seller, 1, 'Boutique Double Ajout');
    const first = await seller.client.post('/api/storefront/listings', { productId: created.id });
    assert.equal(first.status, 201);
    const second = await seller.client.post('/api/storefront/listings', { productId: created.id });
    assert.equal(second.status, 409);
    assert.equal(errorCode(second.body), 'STOREFRONT_ALREADY_LISTED');
    // Retrait → le produit redevient ajoutable (l'unicité est partielle sur actif).
    const me = await seller.client.get('/api/subscriptions/me');
    const listingId = ((me.body as any).listings as Array<{ id: number; productId: number }>).find(
      (l) => l.productId === created.id,
    )!.id;
    const del = await seller.client.request(`/api/storefront/listings/${listingId}`, 'DELETE');
    assert.equal(del.status, 200);
    const readd = await seller.client.post('/api/storefront/listings', { productId: created.id });
    assert.equal(readd.status, 201, JSON.stringify(readd.body));
  });
});

// ---------------------------------------------------------------------------
// Concurrence — quota : verrou FOR UPDATE sérialise les ajouts
// ---------------------------------------------------------------------------
describe('CA-V7-031 — concurrence quota : 3 ajouts simultanés à 9/10 → exactement 1×201', () => {
  it('9/10 utilisés, 3 POST /listings en parallèle → 1×201, 2×409 STOREFRONT_QUOTA_EXCEEDED', async () => {
    const seller = await registerUser(server, 'cv7conq');
    const ids: number[] = [];
    for (let i = 1; i <= 12; i += 1) {
      const created = await createProduct(seller.client, { name: `Produit concurrence ${i} unique` });
      ids.push(created.id);
    }
    await subscribeAndActivate(seller, 1, 'Boutique Concurrence');
    for (let i = 0; i < 9; i += 1) {
      const res = await seller.client.post('/api/storefront/listings', { productId: ids[i] });
      assert.equal(res.status, 201);
    }
    const [a, b, c] = await Promise.all([
      seller.client.post('/api/storefront/listings', { productId: ids[9] }),
      seller.client.post('/api/storefront/listings', { productId: ids[10] }),
      seller.client.post('/api/storefront/listings', { productId: ids[11] }),
    ]);
    const statuses = [a.status, b.status, c.status].sort();
    assert.deepEqual(statuses, [201, 409, 409], `attendu [201,409,409], reçu ${JSON.stringify(statuses)}`);
    const refused = [a, b, c].filter((r) => r.status === 409);
    for (const r of refused) assert.equal(errorCode(r.body), 'STOREFRONT_QUOTA_EXCEEDED');
    // 10 listings exactement — jamais 11.
    const rows = await dbQuery<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM storefront_listings l
         JOIN seller_subscriptions s ON s.id = l.subscription_id WHERE s.seller_id = $1`,
      [seller.id],
    );
    assert.equal(rows[0]!.n, 10);
  });
});

// ---------------------------------------------------------------------------
// Concurrence — activation admin : un seul 200, jamais deux ACTIVE
// ---------------------------------------------------------------------------
describe('CA-V7-013/011 — activation concurrente : exactement une activation réussit', () => {
  it('deux activations PARALLÈLES du même abonnement PENDING → une 200, une 409, COUNT(ACTIVE)=1', async () => {
    const user = await registerUser(server, 'cv7actpar');
    const res = await user.client.post('/api/subscriptions', { planId: 1, slug: 'Boutique Activation Parallele' });
    assert.equal(res.status, 201);
    const subId = (res.body as any).subscription.id as number;

    const [r1, r2] = await Promise.all([
      admin.post(`/api/admin/subscriptions/${subId}/activate`, {}),
      admin.post(`/api/admin/subscriptions/${subId}/activate`, {}),
    ]);
    const statuses = [r1.status, r2.status].sort();
    assert.deepEqual(statuses, [200, 409], `attendu [200,409], reçu ${JSON.stringify(statuses)}`);
    const rows = await dbQuery<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM seller_subscriptions WHERE seller_id = $1 AND status = 'ACTIVE'`,
      [user.id],
    );
    assert.equal(rows[0]!.n, 1);
    const sub = await dbQuery<{ status: string }>(
      'SELECT status FROM seller_subscriptions WHERE id = $1',
      [subId],
    );
    assert.equal(sub[0]!.status, 'ACTIVE');
  });

  it('deux demandes PENDING INDÉPENDANTES activées en parallèle (aucun ACTIVE préexistant) → une 200, une 409', async () => {
    // Scénario du double appel résolu par le filet DB : aucune ACTIVE au
    // départ, les deux activations voient « pas d'ACTIVE » dans le service —
    // la contrainte partielle uq_one_active_subscription_per_seller tranche.
    const user = await registerUser(server, 'cv7indpar');
    const p1 = await user.client.post('/api/subscriptions', { planId: 1, slug: 'Boutique Parallele Indep' });
    assert.equal(p1.status, 201);
    const p2 = await user.client.post('/api/subscriptions', { planId: 2 }); // slug récupéré automatiquement
    assert.equal(p2.status, 201);
    const id1 = (p1.body as any).subscription.id as number;
    const id2 = (p2.body as any).subscription.id as number;
    const [r1, r2] = await Promise.all([
      admin.post(`/api/admin/subscriptions/${id1}/activate`, {}),
      admin.post(`/api/admin/subscriptions/${id2}/activate`, {}),
    ]);
    const statuses = [r1.status, r2.status].sort();
    assert.deepEqual(statuses, [200, 409], `attendu [200,409], reçu ${JSON.stringify(statuses)}`);
    const refused = [r1, r2].find((r) => r.status === 409)!;
    assert.equal(errorCode(refused.body), 'SUBSCRIPTION_ALREADY_ACTIVE');
    const rows = await dbQuery<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM seller_subscriptions WHERE seller_id = $1 AND status = 'ACTIVE'`,
      [user.id],
    );
    assert.equal(rows[0]!.n, 1);
  });
});

// ---------------------------------------------------------------------------
// CA-V7-023/050 — pagination : bornes strictes (boutique publique + file admin)
// ---------------------------------------------------------------------------
describe('CA-V7-023/050 — bornes de pagination (boutique publique et file admin)', () => {
  let anonSlug = '';
  before(async () => {
    const seller = await registerUser(server, 'cv7page');
    await subscribeAndActivate(seller, 1, 'Boutique Pagination');
    anonSlug = 'boutique-pagination';
  });

  it('per_page = 0 / 49 / -1 → 400 ; per_page = 1 et 48 → 200', async () => {
    for (const pp of ['0', '49', '-1']) {
      const res = await server.newClient().get(`/api/storefront/${anonSlug}?per_page=${pp}`);
      assert.equal(res.status, 400, `per_page=${pp} attendu 400`);
    }
    for (const pp of ['1', '48']) {
      const res = await server.newClient().get(`/api/storefront/${anonSlug}?per_page=${pp}`);
      assert.equal(res.status, 200, `per_page=${pp} attendu 200`);
      assert.equal((res.body as any).perPage, Number(pp));
    }
  });

  it('page = 0 / -1 → 400 ; page = 2 hors contenu → 200 avec items []', async () => {
    for (const p of ['0', '-1']) {
      const res = await server.newClient().get(`/api/storefront/${anonSlug}?page=${p}`);
      assert.equal(res.status, 400, `page=${p} attendu 400`);
    }
    const res = await server.newClient().get(`/api/storefront/${anonSlug}?page=99`);
    assert.equal(res.status, 200);
    assert.deepEqual((res.body as any).items, []);
  });

  it('admin : per_page = 0 / 49 → 400 ; status inconnu → 400 VALIDATION_ERROR ; page = 0 → 400', async () => {
    for (const pp of ['0', '49']) {
      const res = await admin.get(`/api/admin/subscriptions?status=PENDING&per_page=${pp}`);
      assert.equal(res.status, 400, `admin per_page=${pp} attendu 400`);
    }
    const bad = await admin.get('/api/admin/subscriptions?status=BOGUS');
    assert.equal(bad.status, 400);
    assert.equal(errorCode(bad.body), 'VALIDATION_ERROR');
    const page0 = await admin.get('/api/admin/subscriptions?status=PENDING&page=0');
    assert.equal(page0.status, 400);
  });
});

// ---------------------------------------------------------------------------
// CA-V7-045 — message : bornes EXACTES (10 et 2000), email 255, espaces
// ---------------------------------------------------------------------------
describe('CA-V7-045 — bornes exactes du formulaire de contact', () => {
  let slug = '';
  before(async () => {
    const seller = await registerUser(server, 'cv7bornes');
    await subscribeAndActivate(seller, 1, 'Boutique Bornes Contact');
    slug = 'boutique-bornes-contact';
  });

  it('message exactement 10 caractères → 201 ; exactement 9 → 400', async () => {
    const buyer = await registerUser(server, 'cv7msg10');
    const ok = await buyer.client.post(`/api/storefront/${slug}/contact`, { message: 'x'.repeat(10) });
    assert.equal(ok.status, 201, JSON.stringify(ok.body));
    const ko = await buyer.client.post(`/api/storefront/${slug}/contact`, { message: 'x'.repeat(9) });
    assert.equal(ko.status, 400);
    assert.equal(errorCode(ko.body), 'VALIDATION_ERROR');
  });

  it('message exactement 2000 caractères → 201 ; exactement 2001 → 400', async () => {
    const buyer = await registerUser(server, 'cv7msg2000');
    const ok = await buyer.client.post(`/api/storefront/${slug}/contact`, { message: 'y'.repeat(2000) });
    assert.equal(ok.status, 201, JSON.stringify(ok.body));
    const ko = await buyer.client.post(`/api/storefront/${slug}/contact`, { message: 'y'.repeat(2001) });
    assert.equal(ko.status, 400);
  });

  it('message composé uniquement d’espaces → 400 (trimmé sous la borne basse)', async () => {
    const buyer = await registerUser(server, 'cv7msgsp');
    const res = await buyer.client.post(`/api/storefront/${slug}/contact`, { message: ' '.repeat(50) });
    assert.equal(res.status, 400);
    assert.equal(errorCode(res.body), 'VALIDATION_ERROR');
  });

  it('email de 255 caractères → 400 ; email 254 max (format valide) → 201', async () => {
    const buyer = await registerUser(server, 'cv7email254');
    // 244 caractères de local + domaine fixe → total > 254.
    const longEmail = `${'a'.repeat(245)}@example.com`;
    const tooLong = await buyer.client.post(`/api/storefront/${slug}/contact`, {
      message: 'Message valide avec adresse trop longue, dix caracteres.',
      email: longEmail,
    });
    assert.equal(tooLong.status, 400);

    const ok254 = `${'a'.repeat(242)}@example.com`; // 242 + 12 = 254
    assert.equal(ok254.length, 254);
    const exact = await buyer.client.post(`/api/storefront/${slug}/contact`, {
      message: 'Message valide avec adresse de 254 caracteres exactement.',
      email: ok254,
    });
    assert.equal(exact.status, 201, JSON.stringify(exact.body));
  });

  it('boutique après expiration → contact 404 (jamais 5xx)', async () => {
    const seller = await registerUser(server, 'cv7contactexp');
    const { subId } = await subscribeAndActivate(seller, 1, 'Boutique Contact Exp');
    await dbQuery(
      `UPDATE seller_subscriptions SET started_at = now() - interval '31 days', ends_at = now() - interval '1 day' WHERE id = $1`,
      [subId],
    );
    const buyer = await registerUser(server, 'cv7contactexp2');
    const res = await buyer.client.post(`/api/storefront/boutique-contact-exp/contact`, {
      message: 'Message vers une boutique expiree, dix caracteres.',
    });
    assert.equal(res.status, 404);
    assert.deepEqual(res.body, { error: { code: 'NOT_FOUND', message: 'Boutique introuvable' } });
  });

  it('boutique après CANCELLED → contact 404 (identique au slug inconnu)', async () => {
    const seller = await registerUser(server, 'cv7contactcan');
    const { subId } = await subscribeAndActivate(seller, 1, 'Boutique Contact Can');
    await dbQuery(`UPDATE seller_subscriptions SET status = 'CANCELLED' WHERE id = $1`, [subId]);
    const buyer = await registerUser(server, 'cv7contactcan2');
    const res = await buyer.client.post(`/api/storefront/boutique-contact-can/contact`, {
      message: 'Message vers une boutique annulee, dix caracteres.',
    });
    assert.equal(res.status, 404);
    assert.deepEqual(res.body, { error: { code: 'NOT_FOUND', message: 'Boutique introuvable' } });
  });
});

// ---------------------------------------------------------------------------
// CA-V7-035 — cohérence des deux vues : même id, même titre, même prix
// ---------------------------------------------------------------------------
describe('CA-V7-035 — boutique et catalogue exposent le même id/titre/prix', () => {
  it('comparer la carte boutique et la fiche catalogue pour le même produit', async () => {
    const seller = await registerUser(server, 'cv7coherent');
    const approved = await createApprovedProduct(seller.client, admin, {
      name: 'Article coherente deux vues unique',
      price: 777_000,
    });
    await subscribeAndActivate(seller, 1, 'Boutique Coherente');
    const add = await seller.client.post('/api/storefront/listings', { productId: approved.id });
    assert.equal(add.status, 201);

    const boutique = await server.newClient().get('/api/storefront/boutique-coherente');
    assert.equal(boutique.status, 200);
    const item = ((boutique.body as any).items as Array<{ id: number; name: string; price: number }>).find(
      (i) => i.id === approved.id,
    );
    assert.ok(item, 'le produit doit apparaître dans la boutique');

    const fiche = await server.newClient().get(`/api/products/${approved.slug}`);
    assert.equal(fiche.status, 200);
    assert.equal((fiche.body as any).id, item!.id);
    assert.equal((fiche.body as any).name, item!.name);
    assert.equal(Number((fiche.body as any).price), item!.price);
  });
});

// ---------------------------------------------------------------------------
// CA-V7-039 — non-abonné : 15 produits → 15 × 201
// ---------------------------------------------------------------------------
describe('CA-V7-039 — non-abonné : 15 publications catalogue, toutes 201', () => {
  it('15 créations successives via POST /api/products → toutes 201, COUNT = 15', async () => {
    const seller = await registerUser(server, 'cv715');
    for (let i = 1; i <= 15; i += 1) {
      const res = await createProduct(seller.client, { name: `Article quinze ${i} unique` });
      assert.ok(res.id > 0);
    }
    const rows = await dbQuery<{ n: number }>(
      'SELECT COUNT(*)::int AS n FROM products WHERE owner_id = $1',
      [seller.id],
    );
    assert.equal(rows[0]!.n, 15);
    // Toute tentative d'ajout boutique reste 403.
    const attempt = await seller.client.post('/api/storefront/listings', { productId: 1 });
    assert.equal(attempt.status, 403);
    assert.equal(errorCode(attempt.body), 'SUBSCRIPTION_REQUIRED');
  });
});

// ---------------------------------------------------------------------------
// Routes protégées — 401 sans session
// ---------------------------------------------------------------------------
describe('CA-V7-013/030/045 — sans session : 401 UNAUTHENTICATED sur toutes les routes privées', () => {
  it('POST /api/subscriptions, GET /me, POST/DELETE listings, POST contact → 401', async () => {
    const anon = server.newClient();
    const sub = await anon.post('/api/subscriptions', { planId: 1, slug: 'Anon Sans Session' });
    assert.equal(sub.status, 401);
    const me = await anon.get('/api/subscriptions/me');
    assert.equal(me.status, 401);
    const add = await anon.post('/api/storefront/listings', { productId: 1 });
    assert.equal(add.status, 401);
    const del = await anon.request('/api/storefront/listings/1', 'DELETE');
    assert.equal(del.status, 401);
    const contact = await anon.post('/api/storefront/boutique-coherente/contact', {
      message: 'Message anonyme dix caracteres minimum.',
    });
    assert.equal(contact.status, 401);
  });

  it('DELETE listing id=0 / id non numérique → 400 VALIDATION_ERROR', async () => {
    const user = await registerUser(server, 'cv7id400');
    const zero = await user.client.request('/api/storefront/listings/0', 'DELETE');
    assert.equal(zero.status, 400);
    assert.equal(errorCode(zero.body), 'VALIDATION_ERROR');
    const junk = await user.client.request('/api/storefront/listings/abc', 'DELETE');
    assert.equal(junk.status, 400);
    assert.equal(errorCode(junk.body), 'VALIDATION_ERROR');
  });
});

// ---------------------------------------------------------------------------
// CA-V7-012/013 — /api/subscriptions/me pour un utilisateur SANS aucun abonnement
// ---------------------------------------------------------------------------
describe('CA-V7-012 — utilisateur sans abonnement : me → subscription null, jamais d’erreur', () => {
  it('GET /api/subscriptions/me → 200, subscription null, plans visibles', async () => {
    const user = await registerUser(server, 'cv7never');
    const res = await user.client.get('/api/subscriptions/me');
    assert.equal(res.status, 200);
    assert.equal((res.body as any).subscription, null);
    assert.equal((res.body as any).usage, null);
    assert.deepEqual((res.body as any).listings, []);
    const plans = (res.body as any).plans as Array<{ name: string }>;
    assert.equal(plans.length, 3);
  });
});

// ---------------------------------------------------------------------------
// Fixes de revue — contre-exemples qui échouaient avant le correctif
// ---------------------------------------------------------------------------
describe('Revue V7 — correctifs I-2/I-3 : plan change après expiration, course sur le slug', () => {
  it('activation AVEC plan change après expiration matérialisée → listings réattachés, boutique non vide', async () => {
    const seller = await registerUser(server, 'cv7recov');
    const { subId: oldId } = await subscribeAndActivate(seller, 2, 'Recuperation Expire');
    const product = await createApprovedProduct(seller.client, admin, { name: `Produit recuperation ${Date.now()}` });
    const add = await seller.client.post('/api/storefront/listings', { productId: product.id });
    assert.equal(add.status, 201);
    // Force l'ACTIVE à être déjà expirée à l'activation du plan change.
    await dbQuery("UPDATE seller_subscriptions SET started_at = now() - interval '40 days', ends_at = now() - interval '1 day' WHERE id = $1", [oldId]);
    // Demande de changement de forfait (nouvel abonnement PENDING).
    const move = await seller.client.post('/api/subscriptions', { planId: 3, supersedesId: oldId });
    assert.equal(move.status, 201);
    const newId = (move.body as any).subscription.id as number;
    const act = await admin.post(`/api/admin/subscriptions/${newId}/activate`, {});
    assert.equal(act.status, 200, `activation → ${act.status} ${JSON.stringify(act.body)}`);
    // La boutique publique contient le listing réattaché (et l'abonné le voit).
    const me = await seller.client.get('/api/subscriptions/me');
    assert.equal((me.body as any).usage.used, 1);
    const pub = await server.newClient().get('/api/storefront/recuperation-expire');
    assert.equal(pub.status, 200);
    assert.equal((pub.body as any).items.length, 1);
  });

  it('deux vendeurs souscrivent le même slug en parallèle → 201 + 409 SLUG_TAKEN (jamais deux PENDING)', async () => {
    const sellerA = await registerUser(server, 'cv7raceA');
    const sellerB = await registerUser(server, 'cv7raceB');
    const slug = `cv7race-win-${Date.now().toString(36)}`;
    const [a, b] = await Promise.all([
      sellerA.client.post('/api/subscriptions', { planId: 1, slug }),
      sellerB.client.post('/api/subscriptions', { planId: 1, slug }),
    ]);
    const statuses = [a.status, b.status].sort((x, y) => x - y);
    assert.deepEqual(statuses, [201, 409], `statuts=${statuses.join(',')} bodies=${JSON.stringify([a.body, b.body])}`);
    const refused = [a, b].find((r) => r.status === 409)!;
    assert.equal(errorCode(refused.body), 'SLUG_TAKEN');
    // Un seul abonnement PENDING existe pour ce slug.
    const rows = await dbQuery<{ n: number }>(
      "SELECT count(*)::int AS n FROM seller_subscriptions WHERE slug = $1",
      [slug],
    );
    assert.equal(rows[0]?.n, 1);
  });
});

// ---------------------------------------------------------------------------
// CA-V7-033 / CA-V7-037a — bout-en-bout commande réelle : quota libéré en
// lecture via le VRAI parcours d'achat, commission 10 % intacte
// ---------------------------------------------------------------------------
describe('CA-V7-033/037a — parcours commande réel : commission 10 % + libération du quota en lecture', () => {
  it('commande → confirm-payment → SOLD → le vendeur récupère sa place (0/10), commission exactement 10 %', async () => {
    const seller = await registerUser(server, 'cv7covA');
    const buyer = (await registerUser(server, 'cv7buyerA')).client;
    const price = 100_000; // commission attendue : floor(100 000 × 10 %) = 10 000
    const product = await createApprovedProduct(seller.client, admin, {
      name: `Produit commande boutique ${Date.now()}`,
      price,
    });
    const sub = await subscribeAndActivate(seller, 1, 'boutique-commande');
    const add = await seller.client.post('/api/storefront/listings', { productId: product.id });
    assert.equal(add.status, 201);
    const before = await seller.client.get('/api/subscriptions/me');
    assert.equal((before.body as any).usage.used, 1);

    const { status, body } = await createOrder(buyer, product.id);
    assert.equal(status, 201, JSON.stringify(body));
    assert.equal(body.order.amount, price);
    assert.equal(body.order.commission, Math.floor(price * 0.1));
    assert.equal(body.order.sellerAmount, price - Math.floor(price * 0.1));

    const confirm = await admin.request(`/api/admin/orders/${body.order.id}/confirm-payment`, 'POST', {
      json: { method: 'CASH' },
    });
    assert.equal(confirm.status, 200, `confirm-payment → ${confirm.status}`);

    const after = await seller.client.get('/api/subscriptions/me');
    assert.equal((after.body as any).usage.used, 0, 'SOLD via le parcours commande doit libérer la place en lecture');
    // Le produit SOLD reste dans le catalogue et sa fiche répond 200.
    const fiche = await server.newClient().get(`/api/products/${product.slug}`);
    assert.equal(fiche.status, 200);
  });

  it('CA-V7-033 — au quota : annonce refusée créée (201), vendue via checkout, commission = COMMISSION_RATE', async () => {
    const seller = await registerUser(server, 'cv7covB');
    const buyer = (await registerUser(server, 'cv7buyerB')).client;
    await subscribeAndActivate(seller, 1, 'boutique-quota-full-commande');
    // Remplit la boutique (10/10) avec des articles approuvés.
    const productIds: number[] = [];
    for (let i = 1; i <= 10; i += 1) {
      const p = await createApprovedProduct(seller.client, admin, {
        name: `Article quota commande ${i} ${Date.now()}`,
        price: 50_000,
      });
      productIds.push(p.id);
      const res = await seller.client.post('/api/storefront/listings', { productId: p.id });
      assert.equal(res.status, 201, `listing ${i} → ${res.status}`);
    }
    const full = await seller.client.get('/api/subscriptions/me');
    assert.equal((full.body as any).usage.used, 10);

    // CA-V7-033 : création d'un 11e article malgré le quota → 201, vendable.
    const extra = await createApprovedProduct(seller.client, admin, {
      name: `Article hors quota ${Date.now()}`,
      price: 80_000,
    });
    const refused = await seller.client.post('/api/storefront/listings', { productId: extra.id });
    assert.equal(refused.status, 409);
    // … et il reste achetable via le parcours existant, commission 10 %.
    const { status, body } = await createOrder(buyer, extra.id);
    assert.equal(status, 201, JSON.stringify(body));
    assert.equal(body.order.commission, 8_000); // floor(80 000 × 10 %)
    const confirm = await admin.request(`/api/admin/orders/${body.order.id}/confirm-payment`, 'POST', {
      json: { method: 'CASH' },
    });
    assert.equal(confirm.status, 200);
  });
});
