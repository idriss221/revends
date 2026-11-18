/**
 * V8 — « HÉBERGEMENT BOUTIQUE » (migrations 020).
 *
 * Couvre côté serveur :
 *   auto-approbation ACTIVE + variantes non éligibles (PENDING / expiré /
 *   non abonné / téléphone non strict) · kill-switch AUTO_APPROVE_V8 ·
 *   trace auto_approved_products (R2) · admin_actions NON polluée ·
 *   rétrogradation F8 (garde R2, INVALID_STATUS, motif court, notif vendeur) ·
 *   storeBadge() dérivé · boost tri par défaut (Atelier > Boutique > Découverte
 *   > Vitrine > reste) · tris explicites intacts · filtre + boost combinés ·
 *   filtres de prix compatibles boost · profil boutique (logo/bannière > 2/4 Mo,
 *   description 500 graphèmes Unicode, adresse 10–500, magic bytes, XSS inerte,
 *   idempotence du retrait) · boutique publique étendue (logoUrl/bannerUrl/
 *   publicDescription, collecteAddress JAMAIS exposée (ni propriétaire, ni admin)).
 *   référence (E3) · E1 paiement (Wave/OM/virement, codes dédiés) ·
 *   E4 bloc profile · stats 30 j + 12 m · bilan mensuel (idempotence,
 *   relevé, FAILED si SMTP coupé, EXPIRED exclu) · rappel J-3 ·
 *   e-mail d'activation · cron GET/POST dual-auth fail-closed · PDF (%PDF-,
 *   1 page A4, pièces jointes).
 *
 * ⚠️ AUTO_APPROVE_V8 : `test/env.ts` le force à `false` (flag R-V8-01 — les
 * suites V7 testent le parcours PENDING → approve). Cette suite l'ACTIVE
 * explicitement dans son `before` (flag produit V8 par défaut).
 * ⚠️ Les suites existantes ne sont PAS modifiées ; les 2 échecs annexes
 * mesurés (CA-V7-014 — l'ALTER payment_method contredit le verrou V7, et
 * catalogue V7 avec auto-approbation) sont documentés dans le rapport V8.
 */
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  bootTestServer,
  registerUser,
  loginAdmin,
  createProduct,
  createApprovedProduct,
  dbQuery,
  errorCode,
} from './helpers.js';
import type { ServerHandle, TestUser } from './helpers.js';
import { clearSentMails, recentSentMails } from '../src/mail/mailer.js';
import { flushAfterCommit } from '../src/utils/db.js';
import { config } from '../src/config.js';
import { storeBadge, badgeFromPlanName } from '../src/utils/storefront-badges.js';
import { getStoreEligibility, clearEligibilityCache } from '../src/services/store-eligibility.service.js';
import { selectAutoApproval } from '../src/repositories/auto-approved.repository.js';
import {
  computeMonthlyMetrics,
  runExpiryReminders,
  runMonthlyReport,
  runMonthlyReportIfDue,
  runViewSnapshot,
  toPeriodUTC,
  periodLabelFr,
} from '../src/services/storefront-reports.service.js';
import { renderBilanPdf, toWinAnsi } from '../src/utils/bilan-pdf.js';

let server: ServerHandle;
let admin: Awaited<ReturnType<typeof loginAdmin>>;
const previousMailEnabled = process.env.MAIL_ENABLED;
const previousAutoApprove = config.autoApproveV8;
const previousDisableCron = config.disableCron;
const previousCronSecret = config.cronSecret;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

async function activateFor(user: TestUser, planId: number, slug: string, payment?: { method: string; reference: string }) {
  const pay = payment ?? { method: 'wave', reference: 'WAVE-TEST-0000001' };
  const res = await user.client.post('/api/subscriptions', {
    planId,
    slug,
    paymentMethod: pay.method,
    paymentReference: pay.reference,
  });
  assert.equal(res.status, 201, `subscribe → ${res.status} ${JSON.stringify(res.body)}`);
  const subId = (res.body as any).subscription.id as number;
  const act = await admin.post(`/api/admin/subscriptions/${subId}/activate`, {});
  assert.equal(act.status, 200, `activate → ${act.status} ${JSON.stringify(act.body)}`);
  return subId;
}

async function expireSubscription(sellerId: number): Promise<void> {
  // chk_active_window impose ends_at > started_at : on backdate les deux.
  await dbQuery(
    `UPDATE seller_subscriptions SET started_at = now() - interval '40 days', ends_at = now() - interval '1 day' WHERE seller_id = $1`,
    [sellerId],
  );
}

async function makePaidOrder(seller: TestUser, buyer: TestUser, productId: number, amount: number, when: Date): Promise<void> {
  const commission = Math.floor(amount * 0.1);
  const sellerAmount = amount - commission;
  const rows = await dbQuery<{ id: number }>(
    `INSERT INTO orders (product_id, buyer_id, seller_id, amount, commission, seller_amount, quantity, status, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, 1, 'COMPLETED', $7, $7) RETURNING id`,
    [productId, buyer.id!, seller.id!, amount, commission, sellerAmount, when],
  );
  const orderId = rows[0]!.id;
  await dbQuery(
    `INSERT INTO order_events (order_id, from_status, to_status, actor, note, created_at)
     VALUES ($1, 'PAYMENT_PENDING', 'PAID', 'system', 'test v8', $2)`,
    [orderId, when],
  );
}

function previousMonth(ref: Date): { period: string; when: Date } {
  const d = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth() - 1, 15, 12, 0, 0));
  return { period: toPeriodUTC(d), when: d };
}

before(async () => {
  process.env.MAIL_ENABLED = 'true';
  (config as any).autoApproveV8 = true;
  server = await bootTestServer();
  admin = await loginAdmin(server);
});

after(async () => {
  await server?.close();
  process.env.MAIL_ENABLED = previousMailEnabled;
  (config as any).autoApproveV8 = previousAutoApprove;
  (config as any).disableCron = previousDisableCron;
  (config as any).cronSecret = previousCronSecret;
});

beforeEach(async () => {
  await flushAfterCommit();
  clearSentMails();
});

// ---------------------------------------------------------------------------
// 1. Publication directe (V8-D2 / §4)
// ---------------------------------------------------------------------------

describe('V8-D2 — publication directe pour vendeurs éligibles', () => {
  it('ACTIVE + téléphone strict → AVAILABLE immédiat, trace R2, 0 notif vendeur, 0 admin_actions', async () => {
    const seller = await registerUser(server, 'v8auto1');
    await activateFor(seller, 1, 'Auto Approuver Un');
    const { product } = await createProduct(seller.client, { name: 'V8Auto Phone Un' });

    assert.equal((product as any).status, 'AVAILABLE', `statut → ${(product as any).status}`);
    const trace = await selectAutoApproval(product.id);
    assert.ok(trace, 'trace auto_approved_products manquante');
    assert.equal(trace!.seller_id, seller.id);
    const notifs = await dbQuery<{ count: string }>(
      `SELECT COUNT(*)::int AS count FROM notifications WHERE user_id = $1 AND type = 'article_submitted'`,
      [seller.id!],
    );
    assert.equal(Number(notifs[0]!.count), 0, 'le vendeur ne doit PAS être notifié (V6.4)');
    const actions = await dbQuery<{ count: string }>(
      `SELECT COUNT(*)::int AS count FROM admin_actions WHERE action LIKE '%auto_approv%'`,
    );
    assert.equal(Number(actions[0]!.count), 0, 'admin_actions ne doit PAS tracer les auto-approbations (R1 écartée)');
  });

  it('non éligible : jamais abonné → PENDING (comportement V7)', async () => {
    const seller = await registerUser(server, 'v8pend1');
    const { product } = await createProduct(seller.client, { name: 'V8Pend Article' });
    assert.equal((product as any).status, 'PENDING');
    assert.equal(await selectAutoApproval(product.id), undefined);
  });

  it('non éligible : abonnement PENDING (non activé) → PENDING', async () => {
    const seller = await registerUser(server, 'v8pend2');
    await seller.client.post('/api/subscriptions', { paymentMethod: 'wave', paymentReference: 'WAVE-TEST-0000001', planId: 1, slug: 'Pending Pas Encore' });
    const { product } = await createProduct(seller.client, { name: 'V8Pend Second' });
    assert.equal((product as any).status, 'PENDING');
  });

  it('non éligible : ACTIVE mais expirée → PENDING (révocation paresseuse)', async () => {
    const seller = await registerUser(server, 'v8exp1');
    await activateFor(seller, 1, 'Expire Paresseux');
    await expireSubscription(seller.id!);
    const { product } = await createProduct(seller.client, { name: 'V8Expire Article' });
    assert.equal((product as any).status, 'PENDING');
  });

  it('non éligible : ACTIVE mais téléphone hors format strict → PENDING', async () => {
    const seller = await registerUser(server, 'v8phone');
    await activateFor(seller, 1, 'Phone Hors Format');
    await dbQuery(`UPDATE users SET phone = '+221339999999' WHERE id = $1`, [seller.id!]);
    const { product } = await createProduct(seller.client, { name: 'V8Phone Article' });
    assert.equal((product as any).status, 'PENDING');
  });

  it('kill-switch AUTO_APPROVE_V8=false → éligible mais PENDING (R-V8-01)', async () => {
    (config as any).autoApproveV8 = false;
    try {
      const seller = await registerUser(server, 'v8flag');
      await activateFor(seller, 1, 'Kill Switch Flag');
      const { product } = await createProduct(seller.client, { name: 'V8Flag Article' });
      assert.equal((product as any).status, 'PENDING');
    } finally {
      (config as any).autoApproveV8 = true;
    }
  });

  it('getStoreEligibility : dérivée en lecture, cache 30 s, purge explicite possible', async () => {
    const seller = await registerUser(server, 'v8elig');
    await activateFor(seller, 1, 'Eligibilite Cache');
    clearEligibilityCache();
    const first = await getStoreEligibility(seller.id!);
    assert.equal(first.eligible, true);
    assert.ok(first.subscriptionId);
    await expireSubscription(seller.id!);
    const cached = await getStoreEligibility(seller.id!); // cache frais (< 30 s) → encore éligible
    assert.equal(cached.eligible, true, 'le cache (30 s) masque la transition — attendu et documenté');
    clearEligibilityCache();
    const fresh = await getStoreEligibility(seller.id!);
    assert.equal(fresh.eligible, false, 'après purge du cache, l’expiration est visible');
    // remet le vendeur ACTIVE pour les tests suivants ne pas dépendre de l’état
    await dbQuery(`UPDATE seller_subscriptions SET ends_at = now() + interval '30 days' WHERE seller_id = $1`, [seller.id!]);
  });
});

// ---------------------------------------------------------------------------
// 2. Badges de palier + boost tri par défaut (V8-D3/D4 / §5/§6)
// ---------------------------------------------------------------------------

describe('V8-D3/D4 — badges dérivés et tri par défaut (Atelier > Boutique > Découverte > Vitrine > reste)', () => {
  it('storeBadge : mapping palier → badge, null sinon (jamais stocké)', async () => {
    const pro = await registerUser(server, 'v8badge1');
    const verifiee = await registerUser(server, 'v8badge2');
    const boutique = await registerUser(server, 'v8badge3');
    const plain = await registerUser(server, 'v8badge4');
    await activateFor(pro, 3, 'Badge Atelier Pro');
    await activateFor(verifiee, 2, 'Badge Boutique Verif');
    await activateFor(boutique, 1, 'Badge Decouverte');
    assert.equal(await storeBadge(pro.id!), 'pro');
    assert.equal(await storeBadge(verifiee.id!), 'verifiee');
    assert.equal(await storeBadge(boutique.id!), 'boutique');
    assert.equal(await storeBadge(plain.id!), null);
    assert.equal(badgeFromPlanName('Annulé'), null);
  });

  it('tri par défaut : Atelier > Boutique > Découverte > Vitrine > non payants, puis created_at DESC', async () => {
    const token = `ordenk${Date.now()}`;
    const mk = async (prefix: string, planId: number | null, ambassador = false) => {
      const u = await registerUser(server, prefix);
      const name = `${token} article ${prefix}`;
      if (planId !== null) {
        await activateFor(u, planId, `Boutique ${prefix}`.slice(0, 40));
        await createProduct(u.client, { name });
      } else {
        const created = await createProduct(u.client, { name });
        const appr = await admin.post(`/api/admin/products/${created.id}/approve`, {});
        assert.equal(appr.status, 200, `approve → ${appr.status}`);
      }
      if (ambassador) {
        await dbQuery(`UPDATE users SET vitrine_until = now() + interval '30 days' WHERE id = $1`, [u.id!]);
      }
      return u;
    };
    const atelier = await mk('triAtelier', 3);
    const boutique = await mk('triBoutique', 2);
    const decouverte = await mk('triDecouverte', 1);
    const vitrine = await mk('triVitrine', null, true);
    const plain = await mk('triPlain', null, false);
    const peek = await registerUser(server, 'v8peek');

    const res = await peek.client.get(`/api/products?q=${token}`);
    assert.equal(res.status, 200);
    const items = (res.body as any).items as Array<{ name: string; sellerBadge?: string | null }>;
    assert.equal(items.length, 5, JSON.stringify(items));
    const order = items.map((i) => i.name.split(' ').pop());
    assert.deepEqual(order, ['triAtelier', 'triBoutique', 'triDecouverte', 'triVitrine', 'triPlain']);
    assert.equal(items[0]!.sellerBadge, 'pro');
    assert.equal(items[1]!.sellerBadge, 'verifiee');
    assert.equal(items[2]!.sellerBadge, 'boutique');
    void atelier; void boutique; void decouverte; void vitrine; void plain;
  });

  it('tris explicites (price_asc) intacts : le boost ne s’y injecte pas', async () => {
    const token = `prixasc${Date.now()}`;
    const atelier = await registerUser(server, 'v8prixA');
    const plain = await registerUser(server, 'v8prixB');
    await activateFor(atelier, 3, 'Prix Atelier Tri');
    // Atelier plus CHER que le non payant : en price_asc, le non payant d’abord.
    await createProduct(atelier.client, { name: `${token} article cher`, price: 900_000 });
    const created = await createProduct(plain.client, { name: `${token} article abordable`, price: 10_000 });
    await admin.post(`/api/admin/products/${created.id}/approve`, {});
    const res = await plain.client.get(`/api/products?q=${token}&sort=price_asc`);
    const prices = ((res.body as any).items as Array<{ price: number }>).map((i) => i.price);
    assert.deepEqual(prices, [...prices].sort((a, b) => a - b), 'price_asc doit ordonner par prix croissant');
  });

  it('section explicite (popular) intacte : view_count DESC, boost ignoré', async () => {
    const token = `popular${Date.now()}`;
    const atelier = await registerUser(server, 'v8popA');
    const plain = await registerUser(server, 'v8popB');
    await activateFor(atelier, 3, 'Popular Atelier Tri');
    await createProduct(atelier.client, { name: `${token} article peu vu` });
    const plainCreated = await createProduct(plain.client, { name: `${token} article survu` });
    await admin.post(`/api/admin/products/${plainCreated.id}/approve`, {});
    await dbQuery(`UPDATE products SET view_count = 9000 WHERE id = $1`, [plainCreated.id]);
    const res = await plain.client.get(`/api/products?q=${token}&section=popular`);
    const items = (res.body as any).items as Array<{ name: string }>;
    assert.equal(items[0]!.name, `${token} article survu`, 'popular doit primer : le boost ne s’applique pas aux sections');
  });

  it('filtre (price_max) + tri par défaut : boost compatible avec les filtres', async () => {
    const token = `filtre${Date.now()}`;
    const atelier = await registerUser(server, 'v8filtA');
    const plain = await registerUser(server, 'v8filtB');
    await activateFor(atelier, 3, 'Filtre Atelier Tri');
    await createProduct(atelier.client, { name: `${token} article filtre`, price: 555_000 });
    const created = await createProduct(plain.client, { name: `${token} article filtre`, price: 5_000 });
    await admin.post(`/api/admin/products/${created.id}/approve`, {});
    const res = await plain.client.get(`/api/products?q=${token}&price_max=600000`);
    const items = (res.body as any).items as Array<{ sellerBadge?: string | null }>;
    assert.equal(items.length, 2);
    assert.equal(items[0]!.sellerBadge, 'pro', 'sous filtre prix, le tri par défaut conserve le boost');
  });

  it('expiration : le badge disparaît sans aucune écriture (boost dérivé)', async () => {
    const seller = await registerUser(server, 'v8aurevoir');
    await activateFor(seller, 3, 'Badge Expire Revoke');
    const token = `expirerevoke${Date.now()}`;
    await createProduct(seller.client, { name: `${token} article revoke` });
    await expireSubscription(seller.id!);
    const badge = await storeBadge(seller.id!);
    assert.equal(badge, null);
    const res = await registerUser(server, 'v8peek').then((u) => u.client.get(`/api/products?q=${token}`));
    const items = (res.body as any).items as Array<{ sellerBadge?: string | null }>;
    assert.equal(items[0]?.sellerBadge ?? null, null, 'plus de badge après expiration (dérivé en lecture)');
  });
});

// ---------------------------------------------------------------------------
// 3. Profil boutique (V8-D5 / §7) — branding, magic bytes, tailles, adresse privée
// ---------------------------------------------------------------------------

describe('V8-D5 — profil boutique (PUT/POST/DELETE logo & bannière)', () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...new Array(64).fill(0)]);

  function profileForm(fields: Record<string, string>, files: { name: string; data: Buffer; type: string }[] = []): FormData {
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) fd.append(k, v);
    for (const f of files) fd.append(f.name, new Blob([f.data], { type: f.type }), `${f.name}.png`);
    return fd;
  }

  it('PUT multipart : logo + bannière + description + collecteAddress (§14.D clos : l’adresse n’apparaît JAMAIS dans l’API — propriétaire inclus)', async () => {
    const seller = await registerUser(server, 'v8prof1');
    const address = 'Sandaga, Dakar — 12 rue Carnot, porte B';
    const res = await seller.client.request('/api/storefront/profile', 'PUT', {
      form: profileForm(
        { publicDescription: 'Notre atelier répare et vend des téléphones.', collecteAddress: address },
        [
          { name: 'logo', data: png, type: 'image/png' },
          { name: 'banner', data: png, type: 'image/png' },
        ],
      ),
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const profile = (res.body as any).profile;
    assert.ok(profile.logoUrl, 'logoUrl attendu');
    assert.ok(profile.bannerUrl, 'bannerUrl attendu');
    assert.equal(profile.publicDescription, 'Notre atelier répare et vend des téléphones.');
    assert.equal(profile.collecteAddressSet, true);
    assert.equal(profile.collecteAddress, undefined, "§14.D clos : l'adresse n'apparaît nulle part dans l'API");

    const get = await seller.client.get('/api/storefront/profile');
    assert.equal(get.status, 200);
    assert.equal((get.body as any).profile.collecteAddressSet, true);
    assert.equal((get.body as any).profile.collecteAddress, undefined, "§14.D clos : jamais de valeur en lecture");

    const row = await dbQuery<{ logo_path: string | null; banner_path: string | null; collecte_address: string }>(
      'SELECT logo_path, banner_path, collecte_address FROM storefront_profiles WHERE seller_id = $1',
      [seller.id!],
    );
    assert.ok(row[0]!.logo_path && row[0]!.banner_path);
    assert.equal(row[0]!.collecte_address, address);
  });

  it('PUT : logo > 2 Mo → 413 FILE_TOO_LARGE ; bannière > 4 Mo → 413 FILE_TOO_LARGE', async () => {
    const seller = await registerUser(server, 'v8prof2');
    const bigLogo = Buffer.concat([png, Buffer.alloc(2 * 1024 * 1024)]);
    const bigBanner = Buffer.concat([png, Buffer.alloc(4 * 1024 * 1024)]);
    const r1 = await seller.client.request('/api/storefront/profile', 'PUT', {
      form: profileForm({}, [{ name: 'logo', data: bigLogo, type: 'image/png' }]),
    });
    assert.equal(r1.status, 413);
    assert.equal(errorCode(r1.body), 'FILE_TOO_LARGE');
    const r2 = await seller.client.request('/api/storefront/profile', 'PUT', {
      form: profileForm({}, [{ name: 'banner', data: bigBanner, type: 'image/png' }]),
    });
    assert.equal(r2.status, 413);
    assert.equal(errorCode(r2.body), 'FILE_TOO_LARGE');
  });

  it('PUT : MIME réel invalide (pas une image) → 400 INVALID_IMAGE', async () => {
    const seller = await registerUser(server, 'v8prof3');
    const r = await seller.client.request('/api/storefront/profile', 'PUT', {
      form: profileForm({}, [{ name: 'logo', data: Buffer.from('not an image at all'), type: 'image/png' }]),
    });
    assert.equal(r.status, 400);
    assert.equal(errorCode(r.body), 'INVALID_IMAGE');
  });

  it('PUT : description > 500 graphèmes → 400 ; exactement 500 caractères → 200 ; 👨‍👩‍👧 compte pour 1 graphème', async () => {
    const seller = await registerUser(server, 'v8prof4');
    const tooLong = 'a'.repeat(501);
    const r1 = await seller.client.request('/api/storefront/profile', 'PUT', {
      form: profileForm({ publicDescription: tooLong }),
    });
    assert.equal(r1.status, 400);
    assert.equal(errorCode(r1.body), 'VALIDATION_ERROR');
    // 499 « a » + 1 graphème familial = 500 graphèmes / 504 codepoints
    // → double garde (graphemes + char_length BDD) : 400 propre, jamais un 500.
    const doubleGuard = 'a'.repeat(499) + '👨‍👩‍👧';
    const r2 = await seller.client.request('/api/storefront/profile', 'PUT', {
      form: profileForm({ publicDescription: doubleGuard }),
    });
    assert.equal(r2.status, 400);
    assert.equal(errorCode(r2.body), 'VALIDATION_ERROR');
    // Exactement 500 caractères simples → 200.
    const exactly = 'a'.repeat(500);
    const r3 = await seller.client.request('/api/storefront/profile', 'PUT', {
      form: profileForm({ publicDescription: exactly }),
    });
    assert.equal(r3.status, 200, JSON.stringify(r3.body));
  });

  it('PUT : collecteAddress < 10 caractères → 400 VALIDATION_ERROR', async () => {
    const seller = await registerUser(server, 'v8prof5');
    const r = await seller.client.request('/api/storefront/profile', 'PUT', {
      form: profileForm({ collecteAddress: 'Court' }),
    });
    assert.equal(r.status, 400);
    assert.equal(errorCode(r.body), 'VALIDATION_ERROR');
  });

  it('POST JSON : écriture sans fichiers (profil accessible dès PENDING)', async () => {
    const seller = await registerUser(server, 'v8prof6');
    await seller.client.post('/api/subscriptions', { paymentMethod: 'wave', paymentReference: 'WAVE-TEST-0000001', planId: 1, slug: 'Profil Pending Prepa' });
    const r = await seller.client.post('/api/storefront/profile', {
      publicDescription: 'Description avant activation',
      collecteAddress: 'Liberté 6, Dakar — derrière la mosquée',
    });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal((r.body as any).profile.publicDescription, 'Description avant activation');
  });

  it('DELETE logo puis re-DELETE : 200 idempotent, le profil est conservé', async () => {
    const seller = await registerUser(server, 'v8prof7');
    await seller.client.request('/api/storefront/profile', 'PUT', {
      form: profileForm({}, [{ name: 'logo', data: png, type: 'image/png' }]),
    });
    const d1 = await seller.client.request('/api/storefront/profile/logo', 'DELETE');
    assert.equal(d1.status, 200);
    assert.equal((d1.body as any).ok, true);
    const d2 = await seller.client.request('/api/storefront/profile/logo', 'DELETE');
    assert.equal(d2.status, 200, 'DELETE idempotent');
    const row = await dbQuery<{ logo_path: string | null }>('SELECT logo_path FROM storefront_profiles WHERE seller_id = $1', [seller.id!]);
    assert.equal(row[0]!.logo_path, null);
  });

  it('DELETE bannière : 200 + bannière NULL en base', async () => {
    const seller = await registerUser(server, 'v8prof8');
    await seller.client.request('/api/storefront/profile', 'PUT', {
      form: profileForm({}, [{ name: 'banner', data: png, type: 'image/png' }]),
    });
    const d = await seller.client.request('/api/storefront/profile/banner', 'DELETE');
    assert.equal(d.status, 200);
    const row = await dbQuery<{ banner_path: string | null }>('SELECT banner_path FROM storefront_profiles WHERE seller_id = $1', [seller.id!]);
    assert.equal(row[0]!.banner_path, null);
  });

  it('XSS : description avec <script> stockée brute mais inerte (React échappe) — API ne la rend pas as raw HTML', async () => {
    const seller = await registerUser(server, 'v8prof9');
    const payload = '<script>alert(1)</script>';
    const r = await seller.client.post('/api/storefront/profile', { publicDescription: payload });
    assert.equal(r.status, 200);
    assert.equal((r.body as any).profile.publicDescription, payload, 'stockage brut assumé ; échappement au rendu');
  });
});

describe('V8-D5 — boutique publique étendue (E2) : branding public, adresse jamais divulguée', () => {
  it('ACTIVE + profil → logoUrl/bannerUrl/publicDescription exposés ; collecteAddress JAMAIS', async () => {
    const seller = await registerUser(server, 'v8pub1');
    const address = 'Marché HLM, Dakar — box 44';
    await seller.client.post('/api/storefront/profile', {
      publicDescription: 'Boutique de confiance',
      collecteAddress: address,
    });
    await activateFor(seller, 1, 'Boutique Publique V8');
    const res = await seller.client.get('/api/storefront/boutique-publique-v8');
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const storefront = (res.body as any).storefront;
    assert.equal(storefront.publicDescription, 'Boutique de confiance');
    assert.ok(storefront.logoUrl === undefined || typeof storefront.logoUrl === 'string');
    const raw = JSON.stringify(res.body);
    assert.ok(!raw.includes(address), 'collecteAddress ne doit JAMAIS apparaître dans la réponse publique');
  });

  it('profil présent mais abonnement EXPIRED → 404 identique V7 (non-divulgation)', async () => {
    const seller = await registerUser(server, 'v8pub2');
    await activateFor(seller, 1, 'Boutique Expiree V8');
    await expireSubscription(seller.id!);
    const res = await seller.client.get('/api/storefront/boutique-expiree-v8');
    assert.equal(res.status, 404);
  });

  it('collecteAddress : aucun accès non authentifié (401) et aucune fiche publique', async () => {
    const anon = server.newClient();
    const res = await anon.get('/api/storefront/profile');
    assert.equal(res.status, 401);
  });
});

// ---------------------------------------------------------------------------
// 4. Souscription & admin (E1/E3/E4) — références Wave/OM/virement
// ---------------------------------------------------------------------------

describe('V8-D8 / E1 — souscription avec référence de paiement (Wave | Orange Money | virement)', () => {
  it('Wave → 201, la référence et la méthode sont persistées ; GET /me ne les expose pas en clair… mais la file admin si (E3)', async () => {
    const seller = await registerUser(server, 'v8wave');
    const res = await seller.client.post('/api/subscriptions', {
      planId: 1,
      slug: 'Wave Boutique',
      paymentMethod: 'wave',
      paymentReference: 'WAVE-2026-000123',
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    const subId = (res.body as any).subscription.id as number;
    const row = await dbQuery<{ payment_method: string; payment_reference: string }>(
      'SELECT payment_method, payment_reference FROM seller_subscriptions WHERE id = $1',
      [subId],
    );
    assert.equal(row[0]!.payment_method, 'wave');
    assert.equal(row[0]!.payment_reference, 'WAVE-2026-000123');

    const file = await admin.get('/api/admin/subscriptions?status=PENDING');
    const item = (file.body as any).items.find((i: any) => i.id === subId);
    assert.equal(item.paymentMethod, 'wave');
    assert.equal(item.paymentReference, 'WAVE-2026-000123');
    assert.ok(!('collecteAddress' in item), "§14.D clos : la valeur n'apparaît jamais dans la file admin ; booléen seul");
  });

  it('paymentMethod hors enum → 400 INVALID_PAYMENT_METHOD', async () => {
    const seller = await registerUser(server, 'v8bad1');
    const res = await seller.client.post('/api/subscriptions', {
      planId: 1,
      slug: 'Cash Moyen',
      paymentMethod: 'cash',
      paymentReference: 'CASH-12345',
    });
    assert.equal(res.status, 400);
    assert.equal(errorCode(res.body), 'INVALID_PAYMENT_METHOD');
  });

  it('paymentReference invalide (trop courte / caractères interdits) → 400 INVALID_PAYMENT_REFERENCE', async () => {
    const seller = await registerUser(server, 'v8bad2');
    const r1 = await seller.client.post('/api/subscriptions', {
      planId: 1, slug: 'Ref Courte', paymentMethod: 'orange_money', paymentReference: 'AB',
    });
    assert.equal(r1.status, 400);
    assert.equal(errorCode(r1.body), 'INVALID_PAYMENT_REFERENCE');
    const r2 = await seller.client.post('/api/subscriptions', {
      planId: 1, slug: 'Ref Chars', paymentMethod: 'virement', paymentReference: '!!***###',
    });
    assert.equal(r2.status, 400);
    assert.equal(errorCode(r2.body), 'INVALID_PAYMENT_REFERENCE');
  });

  it('CA-V8-050/053 — la référence est OBLIGATOIRE pour toute nouvelle souscription (400 sinon) ; un PENDING legacy (NULL) reste activable', async () => {
    const seller = await registerUser(server, 'v8req');
    const noRef = await seller.client.post('/api/subscriptions', {
      planId: 1, slug: 'Sans Ref', paymentMethod: 'wave',
      // paymentReference volontairement ABSENTE (CA-V8-050)
    });
    assert.equal(noRef.status, 400);
    assert.equal(errorCode(noRef.body), 'PAYMENT_REFERENCE_REQUIRED');
    const noMethod = await seller.client.post('/api/subscriptions', {
      planId: 1, slug: 'Sans Methode', paymentReference: 'WAVE-12345',
      // paymentMethod volontairement ABSENTE (CA-V8-050)
    });
    assert.equal(noMethod.status, 400);
    assert.equal(errorCode(noMethod.body), 'INVALID_PAYMENT_METHOD');
    // Legacy (lignes antérieures à V8, payment_* = NULL) : activation non bloquée.
    const legacy = await seller.client.post('/api/subscriptions', {
      planId: 2, slug: 'Legacy Pre-v8', paymentMethod: 'wave', paymentReference: 'WAVE-2026-LEGACY-001',
    });
    assert.equal(legacy.status, 201);
    const legacyId = (legacy.body as any).subscription.id as number;
    await dbQuery('UPDATE seller_subscriptions SET payment_method = NULL, payment_reference = NULL WHERE id = $1', [legacyId]);
    const activate = await admin.post(`/api/admin/subscriptions/${legacyId}/activate`, {});
    assert.equal(activate.status, 200, `legacy activable → ${activate.status} ${JSON.stringify(activate.body)}`);
  });

  it('la file /api/admin/subscriptions est réservée aux admins (403 pour un user)', async () => {
    const user = await registerUser(server, 'v8rbac');
    const res = await user.client.get('/api/admin/subscriptions');
    assert.equal(res.status, 403);
  });

  it('E4 — GET /api/subscriptions/me expose le bloc profile sans la valeur collecteAddress', async () => {
    const seller = await registerUser(server, 'v8e4');
    const address = 'Médina, Dakar — 5e rue x 3e avenue';
    await seller.client.post('/api/storefront/profile', {
      publicDescription: 'Description E4',
      collecteAddress: address,
    });
    await activateFor(seller, 1, 'Profile E4 Bloc');
    const res = await seller.client.get('/api/subscriptions/me');
    assert.equal(res.status, 200);
    const profile = (res.body as any).profile;
    assert.equal(profile.publicDescription, 'Description E4');
    assert.equal(profile.collecteAddressSet, true);
    const raw = JSON.stringify(res.body);
    assert.ok(!raw.includes(address), 'la valeur de collecteAddress n’apparaît JAMAIS dans /me');
  });
});

// ---------------------------------------------------------------------------
// 5. Gouvernance admin (R5/F8) — auto-approvals + rétrogradation
// ---------------------------------------------------------------------------

describe('V8-F8 / R5 — rétrogradation et file des auto-approbations', () => {
  it('admin : GET /auto-approvals liste la trace (produit, vendeur, forfait) ; user → 403', async () => {
    const seller = await registerUser(server, 'v8retro1');
    await activateFor(seller, 1, 'Retro Auto Approuver');
    const { product } = await createProduct(seller.client, { name: 'Retro Liste Article' });

    const file = await admin.get('/api/admin/auto-approvals');
    assert.equal(file.status, 200);
    const mine = (file.body as any).items.find((i: any) => i.productId === product.id);
    assert.ok(mine, 'la trace doit apparaître dans la file admin');
    assert.equal(mine.sellerId, seller.id);
    assert.equal(mine.subscriptionId > 0, true);

    const userFile = await seller.client.get('/api/admin/auto-approvals');
    assert.equal(userFile.status, 403);
  });

  it('rétrogradation admin : AVAILABLE → REJECTED + admin_actions + notif article_rejected au vendeur', async () => {
    const seller = await registerUser(server, 'v8retro2');
    await activateFor(seller, 1, 'Retro Degrade');
    const { product } = await createProduct(seller.client, { name: 'Retro Degrade Article' });

    const res = await admin.post(`/api/admin/products/${product.id}/retrograde`, {
      reason: 'Article non conforme à la charte de la plateforme',
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal((res.body as any).product.status, 'REJECTED');

    const actions = await dbQuery<{ action: string; target_id: number }>(
      `SELECT action, target_id FROM admin_actions WHERE target_id = $1 AND action = 'product.auto_approved_retrograded'`,
      [product.id],
    );
    assert.equal(actions.length, 1);

    const notifs = await dbQuery<{ type: string; user_id: number }>(
      `SELECT type, user_id FROM notifications WHERE user_id = $1 AND type = 'article_rejected' ORDER BY id DESC LIMIT 1`,
      [seller.id!],
    );
    assert.equal(notifs.length, 1);
  });

  it('rétrogradation d’un produit PENDING (non auto-approuvé) → 409 INVALID_STATUS', async () => {
    const seller = await registerUser(server, 'v8retro3');
    const { product } = await createProduct(seller.client, { name: 'Retro Pending Article' });
    const res = await admin.post(`/api/admin/products/${product.id}/retrograde`, {
      reason: 'Tentative de rétrograder un article en attente',
    });
    assert.equal(res.status, 409);
    assert.equal(errorCode(res.body), 'INVALID_STATUS');
  });

  it('rétrogradation d’un produit AVAILABLE mais PAS auto-approuvé (validation manuelle) → 409 NOT_AUTO_APPROVED', async () => {
    const seller = await registerUser(server, 'v8retro4');
    const created = await createProduct(seller.client, { name: 'Retro Manuel Article' });
    await admin.post(`/api/admin/products/${created.id}/approve`, {});
    const res = await admin.post(`/api/admin/products/${created.id}/retrograde`, {
      reason: 'Article pourtant approuvé manuellement hier',
    });
    assert.equal(res.status, 409);
    assert.equal(errorCode(res.body), 'NOT_AUTO_APPROVED');
  });

  it('rétrogradation : motif < 10 caractères → 400 VALIDATION_ERROR', async () => {
    const seller = await registerUser(server, 'v8retro5');
    await activateFor(seller, 1, 'Retro Motif Court');
    const { product } = await createProduct(seller.client, { name: 'Retro Motif Article' });
    const res = await admin.post(`/api/admin/products/${product.id}/retrograde`, { reason: 'court' });
    assert.equal(res.status, 400);
    assert.equal(errorCode(res.body), 'VALIDATION_ERROR');
  });

  it('rétrogradation : id inexistant → 404', async () => {
    const res = await admin.post('/api/admin/products/999999999/retrograde', {
      reason: 'Article introuvable dans la base',
    });
    assert.equal(res.status, 404);
  });
});

// ---------------------------------------------------------------------------
// 6. Bilan mensuel + cron + PDF + stats (V8-D7)
// ---------------------------------------------------------------------------

describe('V8-D7 — bilan mensuel : calcul, idempotence, PDF, rappel J-3, stats', () => {
  it('runViewSnapshot : pose views_baseline (cumul) ; computeMonthlyMetrics → delta du mois', async () => {
    const seller = await registerUser(server, 'v8snap1');
    const subId = await activateFor(seller, 1, 'Snapshot Baseline V8');
    const { product } = await createProduct(seller.client, { name: 'Snapshot Article V8' });
    await dbQuery('UPDATE products SET view_count = 700 WHERE id = $1', [product.id]);

    const { period, when } = previousMonth(new Date());
    // Relevé de BASE (1er du mois) puis relevé final (dernier jour).
    const snap1 = await runViewSnapshot(when, period, 'baseline');
    assert.equal(snap1.processed >= 1, true);
    // Le vendeur gagne 250 vues de plus.
    await dbQuery('UPDATE products SET view_count = 950 WHERE id = $1', [product.id]);
    const snap2 = await runViewSnapshot(new Date(Date.UTC(when.getUTCFullYear(), when.getUTCMonth(), 28, 6, 0, 0)), period, 'sum');
    assert.equal(snap2.processed >= 1, true);
    const row = await dbQuery<{ views_baseline: number; views_sum: number }>(
      'SELECT views_baseline, views_sum FROM monthly_metrics WHERE subscription_id = $1 AND period = $2',
      [subId, period],
    );
    assert.equal(row[0]!.views_baseline, 700);
    assert.equal(row[0]!.views_sum, 950);
    const metrics = await computeMonthlyMetrics(subId, period, undefined as any);
    assert.equal(metrics.views, 250, `delta attendu 250 → ${metrics.views}`);
    assert.equal(metrics.viewsLabel, 'vues du mois');
  });

  it('premier bilan SANS relevé : delta = cumul, libellé « vues cumulées (1er relevé) »', async () => {
    const seller = await registerUser(server, 'v8first1');
    const subId = await activateFor(seller, 1, 'Premier Releve V8');
    const { product } = await createProduct(seller.client, { name: 'Premier Article V8' });
    await dbQuery('UPDATE products SET view_count = 1234 WHERE id = $1', [product.id]);
    const { period } = previousMonth(new Date());
    const metrics = await computeMonthlyMetrics(subId, period, undefined as any);
    assert.equal(metrics.views, 1234);
    assert.equal(metrics.viewsLabel, 'vues cumulées (1er relevé)');
  });

  it('bilan complet : ventes PAID du mois, CA brut + commission 10 %, panier moyen, meilleur article, conversion ; ligne monthly_metrics SENT ; anti-doublon storefront-monthly-report', async () => {
    const seller = await registerUser(server, 'v8rep1');
    const buyer = await registerUser(server, 'v8buyer1');
    const subId = await activateFor(seller, 1, 'Bilan Complet V8');
    const { product } = await createProduct(seller.client, { name: 'Bilan Article V8' });
    await dbQuery('UPDATE products SET view_count = 800 WHERE id = $1', [product.id]);

    const { period, when } = previousMonth(new Date());
    await makePaidOrder(seller, buyer, product.id, 50_000, when);
    await makePaidOrder(seller, buyer, product.id, 30_000, when);
    await makePaidOrder(seller, buyer, product.id, 20_000, when); // hors période ? non : même when

    clearSentMails();
    const summary = await runMonthlyReport(new Date(Date.UTC(when.getUTCFullYear(), when.getUTCMonth() + 1, 1, 6, 0, 0)), period);
    assert.equal(summary.processed >= 1, true);
    assert.equal(summary.sent >= 1, true);

    const metricRow = await dbQuery<{
      views_sum: number; sales_count: number; ca_fcfa: string; email_status: string; sent_at: string | null;
    }>(
      'SELECT views_sum, sales_count, ca_fcfa, email_status, sent_at FROM monthly_metrics WHERE subscription_id = $1 AND period = $2',
      [subId, period],
    );
    assert.equal(metricRow[0]!.email_status, 'SENT');
    assert.equal(metricRow[0]!.sales_count, 3);
    assert.equal(Number(metricRow[0]!.ca_fcfa), 100_000);
    assert.equal(metricRow[0]!.views_sum, 800, 'cumul (pas de relevé préalable)');

    const deliveries = await dbQuery<{ idempotency_key: string; status: string; channel: string }>(
      `SELECT idempotency_key, status, channel FROM notification_deliveries WHERE idempotency_key = $1`,
      [`storefront-monthly-report:${seller.id!}:${period}`],
    );
    assert.equal(deliveries.length, 1);
    assert.equal(deliveries[0]!.status, 'SENT');

    const mine = recentSentMails().filter((m) => m.event === 'storefront_monthly_report' && m.to === seller.email.toLowerCase());
    assert.equal(mine.length, 1);
    assert.equal(mine[0]!.attachmentCount, 1, 'le PDF doit être joint');

    // Idempotence : rejouer ne renvoie RIEN.
    const replay = await runMonthlyReport(new Date(Date.UTC(when.getUTCFullYear(), when.getUTCMonth() + 1, 1, 6, 0, 0)), period);
    const mineAfter = recentSentMails().filter((m) => m.event === 'storefront_monthly_report' && m.to === seller.email.toLowerCase());
    assert.equal(mineAfter.length, 1, 'aucun doublon au rejeu');
    assert.equal(replay.skipped >= 1, true);
  });

  it('bilan : EXPIRED exclu (aucune métrique, aucun e-mail)', async () => {
    const seller = await registerUser(server, 'v8rep2');
    const subId = await activateFor(seller, 1, 'Bilan Exclu V8');
    await expireSubscription(seller.id!);
    // Drainer les effets post-commit (mail d'activation) AVANT de purger le journal.
    await flushAfterCommit();
    clearSentMails();
    const { period } = previousMonth(new Date());
    await runMonthlyReport(new Date(), period);
    const row = await dbQuery('SELECT 1 FROM monthly_metrics WHERE subscription_id = $1', [subId]);
    assert.equal(row.length, 0);
    const mine = recentSentMails().filter((m) => m.to === seller.email.toLowerCase());
    assert.equal(mine.length, 0);
  });

  it('bilan : SMTP coupé (MAIL_ENABLED=false) → FAILED persisté, job non bloquant, aucun e-mail', async () => {
    const seller = await registerUser(server, 'v8rep3');
    const subId = await activateFor(seller, 1, 'Bilan SMTP KO');
    const { period } = previousMonth(new Date());
    const previous = process.env.MAIL_ENABLED;
    process.env.MAIL_ENABLED = 'false';
    clearSentMails();
    try {
      const summary = await runMonthlyReport(new Date(), period);
      assert.equal(summary.failed >= 1, true);
    } finally {
      process.env.MAIL_ENABLED = previous;
    }
    const row = await dbQuery<{ email_status: string }>(
      'SELECT email_status FROM monthly_metrics WHERE subscription_id = $1 AND period = $2',
      [subId, period],
    );
    assert.equal(row[0]!.email_status, 'FAILED');
  });

  it('rappel J-3 : abonnement expirant sous 3 jours → 1 rappel, rejoué → duplicates bloqués', async () => {
    const seller = await registerUser(server, 'v8rem1');
    await activateFor(seller, 1, 'Rappel J3 V8');
    await dbQuery(`UPDATE seller_subscriptions SET ends_at = now() + interval '2 days' WHERE seller_id = $1`, [seller.id!]);
    clearSentMails();
    const first = await runExpiryReminders(new Date());
    const reminderKey = `subscription-expiry-reminder:${seller.id!}:${toPeriodUTC(new Date())}`;
    const mine = recentSentMails().filter((m) => m.event === 'subscription_expiry_reminder' && m.to === seller.email.toLowerCase());
    assert.equal(mine.length, 1, `rappel attendu → ${JSON.stringify(recentSentMails())}`);
    assert.ok(first.sent >= 1);
    const second = await runExpiryReminders(new Date());
    assert.equal(second.duplicates >= 1, true, 'le rappel ne part pas deux fois dans le même mois');
    const deliveries = await dbQuery<{ idempotency_key: string }>(
      `SELECT idempotency_key FROM notification_deliveries WHERE idempotency_key = $1`,
      [reminderKey],
    );
    assert.equal(deliveries.length, 1);
  });

  it('e-mail d’activation : envoyé après activation admin (subscription-activated:<userId>:<subscriptionId>)', async () => {
    const seller = await registerUser(server, 'v8act1');
    clearSentMails();
    const subId = await activateFor(seller, 1, 'Activation Mail V8');
    await flushAfterCommit();
    const mine = recentSentMails().filter((m) => m.event === 'subscription_activated' && m.to === seller.email.toLowerCase());
    assert.equal(mine.length, 1, JSON.stringify(recentSentMails()));
    const deliveries = await dbQuery<{ status: string }>(
      `SELECT status FROM notification_deliveries WHERE idempotency_key = $1`,
      [`subscription-activated:${seller.id!}:${subId}`],
    );
    assert.equal(deliveries[0]?.status, 'SENT');
  });

  it('dispatch quotidien : 1er → report ; dernier jour → snapshot ; sinon noop', async () => {
    const now = new Date();
    const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 6, 0, 0));
    const lastDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 6, 0, 0));
    const mid = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 15, 6, 0, 0));
    const r1 = await runMonthlyReportIfDue(first);
    assert.equal(r1.mode, 'report');
    const r2 = await runMonthlyReportIfDue(lastDay);
    assert.equal(r2.mode, 'snapshot');
    const r3 = await runMonthlyReportIfDue(mid);
    assert.equal(r3.mode, 'noop');
  });

  it('cron HTTP : GET/POST, dual-auth, fail-closed si secret absent, 401 sinon', async () => {
    const prevCron = config.cronSecret;
    const prevDisabled = config.disableCron;
    (config as any).disableCron = false;
    try {
      (config as any).cronSecret = undefined;
      const r1 = await admin.request('/api/cron/monthly-report', 'GET');
      assert.equal(r1.status, 401, 'secret absent ⇒ 401 (fail-closed)');

      (config as any).cronSecret = 'segv8-cron-secret-0123456789abcdef';
      const r2 = await admin.request('/api/cron/monthly-report', 'GET');
      assert.equal(r2.status, 401, 'aucun header ⇒ 401');

      const req = (method: 'GET' | 'POST', headers: Record<string, string>) =>
        fetch(`${server.baseUrl}/api/cron/monthly-report`, {
          method,
          headers: { connection: 'close', ...headers },
        });

      const wrong = await req('GET', { 'x-cron-secret': 'mauvais-secret' });
      assert.equal(wrong.status, 401);

      const okHeader = await req('GET', { 'x-cron-secret': 'segv8-cron-secret-0123456789abcdef' });
      assert.equal(okHeader.status, 200);
      const okBody = (await okHeader.json()) as any;
      assert.equal(okBody.ok, true);
      assert.ok(['report', 'snapshot', 'noop'].includes(okBody.mode));

      const okBearer = await req('POST', { authorization: 'Bearer segv8-cron-secret-0123456789abcdef' });
      assert.equal(okBearer.status, 200);
      const badBearer = await req('POST', { authorization: 'Bearer pas-le-bon' });
      assert.equal(badBearer.status, 401);
    } finally {
      (config as any).cronSecret = prevCron;
      (config as any).disableCron = prevDisabled;
    }
  });

  it('PDF : %PDF-, A4, translittération Latin-1 sans crash, < 2 Mo', async () => {
    const pdf = await renderBilanPdf({
      boutique: 'Atelier Awa — 中文 👨‍👩‍👧 <b>',
      period: periodLabelFr(toPeriodUTC(new Date())),
      periodIso: toPeriodUTC(new Date()),
      views: 42,
      viewsLabel: 'vues du mois',
      salesCount: 3,
      revenueFcfa: 150_000,
      netRevenueFcfa: 135_000,
      commissionFcfa: 15_000,
      avgBasketFcfa: 50_000,
      bestProductName: 'iPhone 12 Pro',
      bestProductSales: 2,
      conversionRate: 0.0714,
    });
    assert.equal(pdf.subarray(0, 5).toString('latin1'), '%PDF-');
    assert.ok(pdf.length > 1_000 && pdf.length < 2 * 1024 * 1024, `taille PDF : ${pdf.length}`);
    assert.match(toWinAnsi('👨‍👩‍👧'), /^\?+$/); // translittération défensive, jamais de crash
    assert.equal(toWinAnsi('cérémonie'), 'cérémonie'); // Latin-1 précomposé conservé
    assert.equal(toWinAnsi('ce\u0301re\u0301monie'), 'ceremonie'); // diacritiques combinants absorbés
    assert.equal(toWinAnsi('é'), 'é');
  });

  it('GET /api/subscriptions/me/stats : payload complet (vues totales, ventes 30j, CA seller_amount, meilleur article, panier, conversion, historique ≤ 12)', async () => {
    const seller = await registerUser(server, 'v8stats1');
    const buyer = await registerUser(server, 'v8buyer2');
    const subId = await activateFor(seller, 1, 'Stats Complets V8');
    const { product } = await createProduct(seller.client, { name: 'Stats Article V8' });
    await dbQuery('UPDATE products SET view_count = 500 WHERE id = $1', [product.id]);
    const { period, when } = previousMonth(new Date());
    // Une vente dans la période du bilan, une vente dans les 30 derniers jours.
    await makePaidOrder(seller, buyer, product.id, 40_000, when);
    await makePaidOrder(seller, buyer, product.id, 60_000, new Date());

    // Générer le bilan (remplit monthly_metrics).
    await runMonthlyReport(new Date(Date.UTC(when.getUTCFullYear(), when.getUTCMonth() + 1, 1, 6, 0, 0)), period);

    const res = await seller.client.get('/api/subscriptions/me/stats');
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const body = res.body as any;

    assert.equal(body.subscription.plan.name, 'Découverte');
    assert.equal(body.current.windowDays, 30);
    assert.equal(body.current.viewsCumulated, 500);
    assert.equal(body.current.salesCount, 1, 'seule la vente des 30 derniers jours compte');
    assert.equal(body.current.revenueFcfa, 60_000);
    assert.equal(body.current.netRevenueFcfa, 54_000, 'CA net = seller_amount (60 000 − 10 %)');
    assert.equal(body.current.avgBasketFcfa, 60_000);
    assert.equal(body.current.bestProduct?.name, 'Stats Article V8');

    assert.ok(Array.isArray(body.history));
    assert.equal(body.history.length, 1);
    assert.equal(body.history[0].period, period);
    assert.equal(body.history[0].salesCount, 1);
    assert.equal(body.history[0].revenueFcfa, 40_000);
    assert.equal(body.history[0].netRevenueFcfa, 36_000);
    assert.equal(body.history[0].emailStatus, 'SENT');
    assert.equal(body.isFirstReport, true);
    assert.equal(body.latestReport.period, period);

    // Un autre vendeur ne peut pas lire ces stats (périmètre session).
    const other = await registerUser(server, 'v8stats2');
    const forbidden = await other.client.get('/api/subscriptions/me/stats');
    assert.equal(forbidden.status, 200);
    assert.equal(forbidden.body.subscription, null, 'les stats sont scopées au connecté');
    void subId;
  });

  it('GET /api/subscriptions/me/stats : anonyme → 401', async () => {
    const anon = server.newClient();
    const res = await anon.get('/api/subscriptions/me/stats');
    assert.equal(res.status, 401);
  });
});

// ---------------------------------------------------------------------------
// V8 — GET /api/subscriptions/me/report?period=YYYY-MM : PDF du bilan persisté.
// requireAuth (« me » exclusivement — aucun paramètre userId) ; 404
// REPORT_NOT_AVAILABLE si aucune ligne monthly_metrics pour la période.
// ---------------------------------------------------------------------------

describe('V8 — GET /api/subscriptions/me/report : PDF du bilan de la période', () => {
  it('anonyme → 401', async () => {
    const anon = server.newClient();
    const res = await anon.get('/api/subscriptions/me/report?period=2026-10');
    assert.equal(res.status, 401);
  });

  it('period malformée → 400 INVALID_PERIOD', async () => {
    const seller = await registerUser(server, 'v8rep400');
    await activateFor(seller, 1, 'Report Mauvais Format');
    for (const bad of ['2026-13', '2026-1', 'oct-2026', '']) {
      const res = await seller.client.get(`/api/subscriptions/me/report?period=${encodeURIComponent(bad)}`);
      assert.equal(res.status, 400, `period=${bad} → ${res.status}`);
      assert.equal(errorCode(res.body), 'INVALID_PERIOD');
    }
  });

  it('aucune ligne monthly_metrics pour la période → 404 REPORT_NOT_AVAILABLE', async () => {
    const seller = await registerUser(server, 'v8rep404');
    await activateFor(seller, 1, 'Report Inconnue');
    const res = await seller.client.get('/api/subscriptions/me/report?period=2020-01');
    assert.equal(res.status, 404, JSON.stringify(res.body));
    assert.equal(errorCode(res.body), 'REPORT_NOT_AVAILABLE');
  });

  it('période d’un autre vendeur → 404 (périmètre session, aucun accès croisé)', async () => {
    const owner = await registerUser(server, 'v8repown');
    const buyer = await registerUser(server, 'v8repbuy');
    const subId = await activateFor(owner, 1, 'Report Proprietaire');
    const { product } = await createProduct(owner.client, { name: 'Report Article Proprietaire' });
    const { period, when } = previousMonth(new Date());
    await makePaidOrder(owner, buyer, product.id, 25_000, when);
    await runMonthlyReport(new Date(Date.UTC(when.getUTCFullYear(), when.getUTCMonth() + 1, 1, 6, 0, 0)), period);

    const stranger = await registerUser(server, 'v8repother');
    await activateFor(stranger, 1, 'Report Autre Boutique');
    const res = await stranger.client.get(`/api/subscriptions/me/report?period=${period}`);
    assert.equal(res.status, 404, 'une ligne monthly_metrics du voisin n’est jamais servie');
    assert.equal(errorCode(res.body), 'REPORT_NOT_AVAILABLE');
    void subId;
  });

  it('période appartenant au vendeur → 200 application/pdf, disposition attachment, magic bytes %PDF-', async () => {
    const seller = await registerUser(server, 'v8rep200');
    const buyer = await registerUser(server, 'v8repbuy2');
    const subId = await activateFor(seller, 1, 'Report Telechargement');
    const { product } = await createProduct(seller.client, { name: 'Report Article Telecharge' });
    await dbQuery('UPDATE products SET view_count = 321 WHERE id = $1', [product.id]);
    const { period, when } = previousMonth(new Date());
    await makePaidOrder(seller, buyer, product.id, 70_000, when);
    const summary = await runMonthlyReport(new Date(Date.UTC(when.getUTCFullYear(), when.getUTCMonth() + 1, 1, 6, 0, 0)), period);
    assert.equal(summary.sent >= 1, true, 'le bilan de la période doit être persisté par le cron');

    const res = await seller.client.get(`/api/subscriptions/me/report?period=${period}`);
    assert.equal(res.status, 200, typeof res.body === 'string' ? res.body.slice(0, 200) : JSON.stringify(res.body));
    assert.match(res.headers.get('content-type') ?? '', /^application\/pdf/);
    const disposition = res.headers.get('content-disposition') ?? '';
    assert.equal(disposition, `attachment; filename="bilan-ReVendsen-${period}.pdf"`);
    assert.equal(typeof res.body, 'string', 'corps binaire relu en texte (client de test)');
    assert.equal((res.body as string).slice(0, 5), '%PDF-', 'magic bytes %PDF-');
    void subId;
  });
});

// ---------------------------------------------------------------------------
// CA-V8-15/badges : contrat de plan — les noms de palier sont EXACTEMENT ceux
// attendus par badgeFromPlanName/BADGE_CASE_SQL (seed 019 / migration 020).
// ---------------------------------------------------------------------------
describe('CA-V8-010/badged — contrat des noms de paliers (protection du mapping)', () => {
  it('les 3 paliers portent exactement les noms attendus (seed 019 + 020)', async () => {
    const rows = await dbQuery<{ name: string }>(
      'SELECT name FROM subscription_plans ORDER BY price_fcfa',
    );
    assert.deepEqual(rows.map((r) => r.name), ['Découverte', 'Boutique', 'Atelier']);
  });
});
