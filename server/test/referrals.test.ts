/**
 * PARRAINAGE — « Le Cercle des 10 » (migration 018).
 *
 * Ce que ces tests verrouillent, dans l'ordre où ça compte :
 *
 *  1. **La route est privée** : un code de parrainage personnel ne fuit jamais
 *     dans une réponse anonyme.
 *  2. **L'attribution ne casse jamais une inscription** : code inconnu, code
 *     malformé → 201 quand même, `referred_by` simplement nul. Un lien
 *     publicitaire périmé ne doit pas bloquer la création d'un compte.
 *  3. **La qualification vient de l'ARTICLE, pas du compte** : c'est
 *     l'approbation du premier article qui crédite le parrain. Un compte vide
 *     ou auto-parrainé ne crédite rien.
 *  4. **Idempotence** : un second article approuvé ne recrédite jamais.
 *  5. **Paliers** : 5 → badge 30 j + Vitrine 7 j, avec UN seul e-mail ; 10 →
 *     badge 1 an + Vitrine 30 j (vérifié par la logique de palier).
 *  6. **Vitrine** : le vendeur récompensé passe devant à tri par défaut, sans
 *     fausser les tris explicites (prix).
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  bootTestServer,
  loginAdmin,
  createApprovedProduct,
  dbQuery,
} from './helpers.js';
import type { ServerHandle } from './helpers.js';
import { attributeReferral } from '../src/services/referral.service.js';
import { clearSentMails, recentSentMails } from '../src/mail/mailer.js';

let server: ServerHandle;
let admin: Awaited<ReturnType<typeof loginAdmin>>;
/**
 * `MAIL_ENABLED` est faux par défaut en test (aucun envoi parasite dans les
 * suites métier). On l'active ICI : le transport reste `jsonTransport`
 * (NODE_ENV=test) — aucun réseau — mais le journal d'envoi devient observable,
 * ce qui permet de prouver qu'un palier produit UN e-mail, pas zéro ni deux.
 */
const previousMailEnabled = process.env.MAIL_ENABLED;

/** Compteur local : numéros et e-mails uniques sans collision avec les autres suites. */
let seq = 0;

interface Registered {
  client: ReturnType<ServerHandle['newClient']>;
  id: number;
  email: string;
  status: number;
  body: any;
}

/**
 * Inscription avec `ref` facultatif. Volontairement séparée de `registerUser`
 * (helpers partagés) : on teste ici le champ `ref` du contrat, sans élargir
 * l'empreinte des autres suites.
 */
async function registerWith(prefix: string, ref?: string): Promise<Registered> {
  seq += 1;
  const client = server.newClient();
  const email = `${prefix}${seq}@test.revends`;
  const body = {
    displayName: `${prefix}${seq}`,
    name: `Nom ${prefix} ${seq}`,
    email,
    phone: `+221 77 66 0 ${String(1000 + seq).slice(-4)}`,
    password: `motdepasse${seq}!`,
    acceptedCgu: true,
    ...(ref === undefined ? {} : { ref }),
  };
  const res = await client.post('/api/auth/register', body);
  return {
    client,
    id: (res.body as any)?.user?.id as number,
    email,
    status: res.status,
    body: res.body,
  };
}

/** `referred_by` d'un compte, lu en base (source de vérité, pas la réponse HTTP). */
async function referredBy(userId: number): Promise<number | null> {
  const rows = await dbQuery<{ referred_by: number | null }>(
    'SELECT referred_by FROM users WHERE id = $1',
    [userId],
  );
  return rows[0]?.referred_by ?? null;
}

async function qualificationCount(referrerId: number): Promise<number> {
  const rows = await dbQuery<{ n: number }>(
    'SELECT count(*)::int AS n FROM referral_qualifications WHERE referrer_id = $1',
    [referrerId],
  );
  return rows[0]?.n ?? 0;
}

before(async () => {
  process.env.MAIL_ENABLED = 'true';
  server = await bootTestServer();
  admin = await loginAdmin(server);
});

after(async () => {
  await server?.close();
  process.env.MAIL_ENABLED = previousMailEnabled;
});

describe('GET /api/referrals/me — route privée', () => {
  it('401 sans session : un code personnel ne fuit jamais', async () => {
    const res = await server.newClient().get('/api/referrals/me');
    assert.equal(res.status, 401);
  });

  it('un admin connecté y accède aussi (cohérence avec le garde client)', async () => {
    const res = await admin.get('/api/referrals/me');
    assert.equal(res.status, 200);
    assert.match((res.body as any).code, /^RV[A-Z0-9]{8}$/);
  });

  it('200 : code RV…, progression initiale à zéro, aucune donnée privée', async () => {
    const u = await registerWith('refsummary');
    assert.equal(u.status, 201, JSON.stringify(u.body));

    const res = await u.client.get('/api/referrals/me');
    assert.equal(res.status, 200);
    const b = res.body as any;

    assert.match(b.code, /^RV[A-Z0-9]{8}$/, 'code = RV + 8 caractères');
    assert.equal(b.qualified, 0);
    assert.equal(b.target, 10);
    assert.equal(b.badgeTarget, 5);
    assert.equal(b.remaining, 10);
    assert.equal(b.badgeActive, false, 'aucun badge avant 5 filleuls');
    assert.equal(b.vitrineActive, false, 'aucune Vitrine avant 5 filleuls');
    assert.equal(b.badgeUntil, null);
    assert.equal(b.vitrineUntil, null);

    // Le contrat de cette route ne contient QUE le parrainage : ni e-mail, ni
    // téléphone, ni nom complet (données privées du compte).
    for (const forbidden of ['email', 'phone', 'name']) {
      assert.equal(forbidden in b, false, `champ privé "${forbidden}" exposé`);
    }
  });

  it('le code est stable entre deux lectures (pas de régénération)', async () => {
    const u = await registerWith('refstable');
    const a = (await u.client.get('/api/referrals/me')).body as any;
    const b = (await u.client.get('/api/referrals/me')).body as any;
    assert.equal(a.code, b.code);
    assert.match(a.code, /^RV[A-Z0-9]{8}$/);
  });

  it('le code est aussi exposé dans /api/me (profil connecté)', async () => {
    const u = await registerWith('refme');
    const code = ((await u.client.get('/api/referrals/me')).body as any).code;
    const me = await u.client.get('/api/auth/me');
    assert.equal(me.status, 200);
    assert.equal((me.body as any).user?.referralCode, code);
  });
});

describe('attribution du parrain à l’inscription', () => {
  it('un code valide rattache le filleul (casse indifférente)', async () => {
    const referrer = await registerWith('refowner');
    const code = ((await referrer.client.get('/api/referrals/me')).body as any).code as string;

    const filleul = await registerWith('reffilleul', code.toLowerCase());
    assert.equal(filleul.status, 201, JSON.stringify(filleul.body));
    assert.equal(await referredBy(filleul.id), referrer.id);
  });

  it('un code inconnu est IGNORÉ : l’inscription reste un succès', async () => {
    const u = await registerWith('refunknown', 'RVZZZZZZZZ');
    assert.equal(u.status, 201, JSON.stringify(u.body));
    assert.equal(await referredBy(u.id), null);
  });

  it('un code malformé est IGNORÉ, sans 400 bloquant', async () => {
    const u = await registerWith('refgarbage', 'pas-un-code');
    assert.equal(u.status, 201, JSON.stringify(u.body));
    assert.equal(await referredBy(u.id), null);
  });

  it('l’auto-parrainage est refusé', async () => {
    const u = await registerWith('refself');
    const code = ((await u.client.get('/api/referrals/me')).body as any).code as string;
    assert.equal(await attributeReferral(u.id, code), false);
    assert.equal(await referredBy(u.id), null);
  });
});

describe('qualification : l’article approuvé crédite le parrain', () => {
  let referrer: Registered;
  let filleul: Registered;

  before(async () => {
    referrer = await registerWith('refqual');
    const code = ((await referrer.client.get('/api/referrals/me')).body as any).code as string;
    filleul = await registerWith('refqualchild', code);
    assert.equal(await referredBy(filleul.id), referrer.id);
  });

  it('un compte inscrit mais SANS article ne crédite rien', async () => {
    assert.equal(await qualificationCount(referrer.id), 0);
    const summary = (await referrer.client.get('/api/referrals/me')).body as any;
    assert.equal(summary.qualified, 0);
  });

  it('l’approbation du premier article crédite le parrain', async () => {
    await createApprovedProduct(filleul.client, admin, { name: 'Premier article filleul' });

    assert.equal(await qualificationCount(referrer.id), 1);
    const summary = (await referrer.client.get('/api/referrals/me')).body as any;
    assert.equal(summary.qualified, 1);
    assert.equal(summary.remaining, 9);
  });

  it('un second article du même filleul ne recrédite jamais', async () => {
    await createApprovedProduct(filleul.client, admin, { name: 'Second article filleul' });
    assert.equal(await qualificationCount(referrer.id), 1, 'idempotence par filleul');
    const summary = (await referrer.client.get('/api/referrals/me')).body as any;
    assert.equal(summary.qualified, 1);
  });

  it('le badge public du vendeur apparaît sur le serializer public', async () => {
    const rows = await dbQuery<{ id: number }>(
      "SELECT id FROM products WHERE owner_id = $1 AND status = 'AVAILABLE' ORDER BY id LIMIT 1",
      [filleul.id],
    );
    assert.ok(rows[0]?.id);
    // La fiche produit n'expose `seller.ambassador` QUE s'il est actif : un
    // filleul sans palier ne doit porter aucun badge (ni `false` inutile dans
    // toutes les réponses publiques).
    const detail = await server.newClient().get(`/api/products/${rows[0]!.id}`);
    assert.equal(detail.status, 200);
    assert.equal('ambassador' in ((detail.body as any).seller ?? {}), false);
  });
});

describe('paliers : 5 filleuls validés → badge 30 j + Vitrine 7 j', () => {
  let referrer: Registered;
  let code: string;

  before(async () => {
    referrer = await registerWith('refmilestone');
    code = ((await referrer.client.get('/api/referrals/me')).body as any).code as string;
  });

  it('le 5ᵉ filleul validé active les récompenses et envoie UN e-mail', async () => {
    // 4 filleuls validés (aucun palier encore franchi).
    for (let i = 0; i < 4; i += 1) {
      const f = await registerWith('refmchild', code);
      await createApprovedProduct(f.client, admin, { name: `Article palier ${i + 1}` });
    }
    let summary = (await referrer.client.get('/api/referrals/me')).body as any;
    assert.equal(summary.qualified, 4);
    assert.equal(summary.badgeActive, false, 'rien avant le 5ᵉ');
    assert.equal(summary.vitrineActive, false);

    // Le 5ᵉ : c'est CE passage qui doit produire exactement un e-mail.
    clearSentMails();
    const fifth = await registerWith('refmchild', code);
    await createApprovedProduct(fifth.client, admin, { name: 'Article palier 5' });

    summary = (await referrer.client.get('/api/referrals/me')).body as any;
    assert.equal(summary.qualified, 5);
    assert.equal(summary.badgeActive, true);
    assert.equal(summary.vitrineActive, true);
    assert.equal(summary.remaining, 5);

    const badgeUntil = new Date(summary.badgeUntil).getTime();
    const vitrineUntil = new Date(summary.vitrineUntil).getTime();
    const now = Date.now();
    const DAY = 86_400_000;
    assert.ok(badgeUntil > now + 29 * DAY, 'badge valable ~30 jours');
    assert.ok(badgeUntil < now + 31 * DAY);
    assert.ok(vitrineUntil > now + 6 * DAY, 'Vitrine valable ~7 jours au palier 5');
    assert.ok(vitrineUntil < now + 8 * DAY);

    const milestoneMails = recentSentMails().filter(
      (m) => m.event === 'referral_milestone' && m.to === referrer.email,
    );
    assert.equal(milestoneMails.length, 1, 'un seul e-mail de palier par franchissement');
  });

  it('la Vitrine place le vendeur devant au tri par défaut', async () => {
    const boosted = await createApprovedProduct(referrer.client, admin, { name: 'Article ambassadeur' });
    // Article plus RÉCENT, vendeur non ambassadeur : sans Vitrine il passerait devant.
    const otherSeller = await registerWith('refother');
    const newer = await createApprovedProduct(otherSeller.client, admin, { name: 'Article récent ordinaire' });
    assert.ok(newer.id > boosted.id);

    // Le badge est PUBLIC dès que la période est active (fiche produit).
    const detail = await server.newClient().get(`/api/products/${boosted.id}`);
    assert.equal((detail.body as any).seller?.ambassador, true, 'badge Ambassadeur exposé');

    const page = (await server.newClient().get('/api/products?perPage=48')).body as any;
    const ids: number[] = page.items.map((p: any) => p.id);
    assert.ok(
      ids.indexOf(boosted.id) < ids.indexOf(newer.id),
      `Vitrine ignorée : ordre = ${ids.join(',')}`,
    );

    // Un tri explicite (prix) n'est PAS faussé par la Vitrine : 100 000 vs 100 000
    // ne prouverait rien, on fixe donc un écart net.
    const cheap = await createApprovedProduct(otherSeller.client, admin, {
      name: 'Article premier prix',
      price: 5_000,
    });
    const asc = (await server.newClient().get('/api/products?sort=price_asc&perPage=48')).body as any;
    assert.equal(asc.items[0].id, cheap.id, 'price_asc reste un tri par prix');
  });
});

describe('régression : une approbation sans parrain ne crée aucune qualification', () => {
  it('aucune ligne orpheline en base', async () => {
    const solo = await registerWith('refsolo');
    await createApprovedProduct(solo.client, admin, { name: 'Article sans parrain' });
    const rows = await dbQuery<{ n: number }>(
      'SELECT count(*)::int AS n FROM referral_qualifications WHERE referee_id = $1',
      [solo.id],
    );
    assert.equal(rows[0]?.n ?? 0, 0);
  });
});
