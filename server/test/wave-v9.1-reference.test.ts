/**
 * V9.1 — « Référence de paiement optionnelle pour Wave » (avenant approuvé).
 *
 * Preuves portées ici :
 *  - CA-V9.1-001 : génération serveur WAVE-AUTO-<8 hex majuscules> + 201 PENDING ;
 *  - CA-V9.1-002 : OM/virement strictement inchangés, référence Wave saisie conservée ;
 *  - CA-V9.1-003 : la création PENDING n'appelle Wave, n'active rien et n'envoie aucun e-mail ;
 *  - CA-V9.1-005 : aucun diff Gmail/Whapi/REDIS_URL, aucune migration, aucun secret.
 *
 * Aucun appel réseau Wave : le spy n'intercepte que les hôtes api.wave.* et
 * toute tentative est comptée puis échouée par les assertions. `WAVE_ENABLED`
 * reste à sa valeur par défaut (false) : config.ts n'est pas modifié.
 */
import './env.js';
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PAYMENT_REFERENCE_REGEX, validatePaymentFields } from '../src/utils/storefront-validation.js';
import { spyFetchWave, type WaveFetchSpy } from './helpers-wave.js';

// Messagerie FORCÉE pour que l'absence d'e-mail soit une preuve et non un effet du désactivation.
process.env.MAIL_ENABLED = 'true';

const { bootTestServer, registerUser, dbQuery, errorCode } = await import('./helpers.js');
const { clearSentMails, recentSentMails } = await import('../src/mail/mailer.js');
const { flushAfterCommit } = await import('../src/utils/db.js');

type ServerHandle = Awaited<ReturnType<typeof bootTestServer>>;

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const V9_BASE = 'b57eb54';
const GENERATED_REF = /^WAVE-AUTO-[0-9A-F]{8}$/;
const REQUIRED_MESSAGE = 'La référence de paiement est requise à la souscription';

const git = (...args: string[]) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' });

let server: ServerHandle;
let waveSpy: WaveFetchSpy;

async function rowFor(subscriptionId: number) {
  const rows = await dbQuery<{ status: string; payment_method: string; payment_reference: string }>(
    'SELECT status, payment_method, payment_reference FROM seller_subscriptions WHERE id = $1',
    [subscriptionId],
  );
  const row = rows[0];
  assert.ok(row, `souscription ${subscriptionId} introuvable`);
  return row;
}

before(async () => {
  waveSpy = spyFetchWave(() => new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }));
  server = await bootTestServer();
});

after(async () => {
  waveSpy?.restore();
  await server?.close();
});

describe('CA-V9.1-001 — référence Wave générée côté serveur', () => {
  it('CA-V9.1-001 — validatePaymentFields(wave, ""/espace/absente) → WAVE-AUTO-[0-9A-F]{8} (18 car., regex V8), unique sur 2 appels', () => {
    const outputs = [undefined, '', '   '].map((paymentReference) =>
      validatePaymentFields({ paymentMethod: 'wave', paymentReference }),
    );
    for (const out of outputs) {
      assert.equal(out.paymentMethod, 'wave');
      assert.match(out.paymentReference, GENERATED_REF);
      assert.equal(out.paymentReference.length, 18);
      assert.ok(PAYMENT_REFERENCE_REGEX.test(out.paymentReference));
      assert.ok(out.paymentReference.length <= 64);
    }
    assert.notEqual(outputs[0]!.paymentReference, outputs[1]!.paymentReference);
  });

  it('CA-V9.1-001 — POST /api/subscriptions wave sans référence (absente, "", espaces, null) → 201 PENDING + référence générée distincte', async () => {
    const variants: Array<{ prefix: string; slug: string; paymentReference: string | null | undefined }> = [
      { prefix: 'v91abs', slug: 'V91 Absente', paymentReference: undefined },
      { prefix: 'v91vide', slug: 'V91 Vide', paymentReference: '' },
      { prefix: 'v91esp', slug: 'V91 Espaces', paymentReference: '    ' },
      { prefix: 'v91null', slug: 'V91 Null', paymentReference: null },
    ];
    const references: string[] = [];
    for (const { prefix, slug, paymentReference } of variants) {
      const seller = await registerUser(server, prefix);
      const body: Record<string, unknown> = { planId: 1, slug, paymentMethod: 'wave' };
      if (paymentReference !== undefined) body.paymentReference = paymentReference;
      const res = await seller.client.post('/api/subscriptions', body);
      assert.equal(res.status, 201, `${prefix} → ${res.status} ${JSON.stringify(res.body)}`);
      assert.equal((res.body as any).subscription.status, 'PENDING');
      const row = await rowFor((res.body as any).subscription.id as number);
      assert.equal(row.status, 'PENDING');
      assert.equal(row.payment_method, 'wave');
      assert.match(row.payment_reference, GENERATED_REF);
      assert.equal(row.payment_reference.length, 18);
      assert.ok(PAYMENT_REFERENCE_REGEX.test(row.payment_reference));
      references.push(row.payment_reference);
    }
    assert.equal(new Set(references).size, references.length, 'deux souscriptions doivent avoir deux références distinctes');
  });
});

describe('CA-V9.1-002 — non-régression OM/virement et référence Wave saisie', () => {
  it('CA-V9.1-002 — OM/virement sans référence → PAYMENT_REFERENCE_REQUIRED ; < 4 car. → INVALID_PAYMENT_REFERENCE (unité)', () => {
    for (const paymentMethod of ['orange_money', 'virement'] as const) {
      assert.throws(
        () => validatePaymentFields({ paymentMethod, paymentReference: '' }),
        (err: any) => err.code === 'PAYMENT_REFERENCE_REQUIRED' && err.message === REQUIRED_MESSAGE,
      );
      assert.throws(
        () => validatePaymentFields({ paymentMethod, paymentReference: 'AB' }),
        (err: any) => err.code === 'INVALID_PAYMENT_REFERENCE',
      );
    }
  });

  it('CA-V9.1-002 — OM/virement sans référence → 400 PAYMENT_REFERENCE_REQUIRED en HTTP, aucune souscription créée', async () => {
    const seller = await registerUser(server, 'v91strict');
    const before = await dbQuery<{ count: number }>(
      'SELECT COUNT(*)::int AS count FROM seller_subscriptions WHERE seller_id = $1',
      [seller.id!],
    );
    for (const paymentMethod of ['orange_money', 'virement']) {
      const missing = await seller.client.post('/api/subscriptions', {
        planId: 1, slug: `V91 Strict ${paymentMethod}`, paymentMethod,
      });
      assert.equal(missing.status, 400);
      assert.equal(errorCode(missing.body), 'PAYMENT_REFERENCE_REQUIRED');
      const short = await seller.client.post('/api/subscriptions', {
        planId: 1, slug: `V91 Court ${paymentMethod}`, paymentMethod, paymentReference: 'AB',
      });
      assert.equal(short.status, 400);
      assert.equal(errorCode(short.body), 'INVALID_PAYMENT_REFERENCE');
    }
    const after = await dbQuery<{ count: number }>(
      'SELECT COUNT(*)::int AS count FROM seller_subscriptions WHERE seller_id = $1',
      [seller.id!],
    );
    assert.equal(after[0]!.count, before[0]!.count);
  });

  it('CA-V9.1-002 — wave avec référence valide fournie → conservée telle quelle (unité + HTTP)', async () => {
    const unit = validatePaymentFields({ paymentMethod: 'wave', paymentReference: 'REF-V91-FOURNIE' });
    assert.equal(unit.paymentReference, 'REF-V91-FOURNIE');
    const seller = await registerUser(server, 'v91kept');
    const res = await seller.client.post('/api/subscriptions', {
      planId: 1, slug: 'V91 Ref Conservee', paymentMethod: 'wave', paymentReference: 'REF-V91-FOURNIE',
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    const row = await rowFor((res.body as any).subscription.id as number);
    assert.equal(row.payment_reference, 'REF-V91-FOURNIE');
  });

  it('CA-V9.1-002 — paymentMethod absent/invalide → 400 INVALID_PAYMENT_METHOD (inchangé)', async () => {
    const seller = await registerUser(server, 'v91meth');
    const missing = await seller.client.post('/api/subscriptions', {
      planId: 1, slug: 'V91 Sans Methode', paymentReference: 'REF-V91-1234',
    });
    assert.equal(missing.status, 400);
    assert.equal(errorCode(missing.body), 'INVALID_PAYMENT_METHOD');
    const invalid = await seller.client.post('/api/subscriptions', {
      planId: 1, slug: 'V91 Cash', paymentMethod: 'cash', paymentReference: 'REF-V91-1234',
    });
    assert.equal(invalid.status, 400);
    assert.equal(errorCode(invalid.body), 'INVALID_PAYMENT_METHOD');
  });
});

describe('CA-V9.1-003 — le webhook signé reste la seule source d’activation', () => {
  it('CA-V9.1-003 — création PENDING : 0 appel Wave, 0 activation, 0 intention de session, 0 e-mail', async () => {
    const seller = await registerUser(server, 'v91noact');
    clearSentMails();
    const res = await seller.client.post('/api/subscriptions', {
      planId: 1, slug: 'V91 Sans Activation', paymentMethod: 'wave', paymentReference: '',
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    const id = (res.body as any).subscription.id as number;
    await flushAfterCommit();

    const row = await rowFor(id);
    assert.equal(row.status, 'PENDING');
    assert.match(row.payment_reference, GENERATED_REF);

    const actions = await dbQuery<{ count: number }>(
      "SELECT COUNT(*)::int AS count FROM admin_actions WHERE target_type = 'subscription' AND target_id = $1",
      [id],
    );
    assert.equal(actions[0]!.count, 0, 'aucune activation/trace admin déclenchée par la référence');
    const sessions = await dbQuery<{ count: number }>(
      'SELECT COUNT(*)::int AS count FROM wave_checkout_events WHERE subscription_id = $1',
      [id],
    );
    assert.equal(sessions[0]!.count, 0, 'aucune session Wave créée à la souscription');
    assert.deepEqual(waveSpy.waveCalls(), [], 'aucun appel réseau Wave');
    assert.equal(recentSentMails().length, 0, 'aucun e-mail émis à la création PENDING');
  });
});

describe('CA-V9.1-005 — verrous de contenu, configuration et secrets', () => {
  it('CA-V9.1-005 — 0 diff Gmail/Whapi/REDIS_URL, 0 migration, 0 secret littéral, WAVE_ENABLED non activé', () => {
    const changed = git('diff', '--name-only', V9_BASE).split('\n').filter(Boolean);
    assert.equal(
      changed.filter((file) => file.startsWith('server/migrations/')).length,
      0,
      `aucune migration ne doit être ajoutée : ${changed.join(', ')}`,
    );

    const added = git('diff', '--unified=0', V9_BASE, '--', 'server/src', 'server/migrations')
      .split('\n')
      .filter((line) => line.startsWith('+') && !line.startsWith('+++'));
    const forbidden: Array<[string, RegExp]> = [
      ['Gmail', /gmail/i],
      ['Whapi', /whapi/i],
      ['REDIS_URL', /REDIS_URL/],
      ['ranga', /ranga/i],
      ['WAVE_ENABLED=true', /WAVE_ENABLED[^\n]*true/i],
      ['secret littéral', /wave_sn_|sk_[A-Za-z0-9]{16,}|WAVE_(API_KEY|WEBHOOK_SECRET)\s*[:=]\s*['"][^'"]{8,}['"]/i],
    ];
    for (const [label, pattern] of forbidden) {
      assert.equal(added.filter((line) => pattern.test(line)).length, 0, `diff serveur : occurrence de ${label}`);
    }

    const config = readFileSync(join(ROOT, 'server/src/config.ts'), 'utf8');
    assert.match(config, /WAVE_ENABLED:\s*z\.enum\(\['true', 'false'\]\)\.default\('false'\)/);
  });
});
