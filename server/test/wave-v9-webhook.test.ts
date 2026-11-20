import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  setWaveEnv,
  spyFetchWave,
  fakeFetch,
  postRaw,
  waveSignatureHeader,
  signWaveHmac,
  type WaveFetchSpy,
} from './helpers-wave.js';

const WEBHOOK_SECRET = '9f8e7d6c5b4a39281706f5e4d3c2b1a0';
setWaveEnv({
  enabled: true,
  apiKey: 'wave-api-key-for-local-tests-only',
  webhookSecret: WEBHOOK_SECRET,
  systemAdminId: 1,
  mailEnabled: true,
});

const { bootTestServer, registerUser, loginAdmin, dbQuery, errorCode } = await import('./helpers.js');
const { verifyWaveSignature } = await import('../src/utils/wave-signature.js');
const { logger } = await import('../src/utils/logger.js');
const { flushAfterCommit } = await import('../src/utils/db.js');
const { clearSentMails, recentSentMails } = await import('../src/mail/mailer.js');
const { config } = await import('../src/config.js');

type ServerHandle = Awaited<ReturnType<typeof bootTestServer>>;
type TestUser = Awaited<ReturnType<typeof registerUser>>;

interface PendingWaveSubscription {
  user: TestUser;
  subscriptionId: number;
  sessionId: string;
  clientReference: string;
}

let server: ServerHandle;
let admin: Awaited<ReturnType<typeof loginAdmin>>;
let waveSpy: WaveFetchSpy;
let sessionSeq = 0;
let eventSeq = 0;

function nextEventId(): string {
  eventSeq += 1;
  return `EV_V9_TEST_${String(eventSeq).padStart(4, '0')}`;
}

async function subscribe(user: TestUser, slug: string, planId = 1, method = 'wave'): Promise<number> {
  const res = await user.client.post('/api/subscriptions', {
    planId,
    slug,
    paymentMethod: method,
    paymentReference: `REF-${slug.toUpperCase()}`,
  });
  assert.equal(res.status, 201, `subscribe → ${res.status} ${JSON.stringify(res.body)}`);
  return (res.body as any).subscription.id as number;
}

async function createWavePending(prefix: string): Promise<PendingWaveSubscription> {
  const user = await registerUser(server, prefix);
  const subscriptionId = await subscribe(user, `${prefix}-abonnement`);
  const res = await user.client.post('/api/wave/checkout/sessions', { subscriptionId });
  assert.equal(res.status, 200, `checkout → ${res.status} ${JSON.stringify(res.body)}`);

  const intents = await dbQuery<{ client_reference: string }>(
    `SELECT client_reference FROM wave_checkout_events
      WHERE subscription_id = $1 AND status = 'SESSION_CREATED'
      ORDER BY id DESC LIMIT 1`,
    [subscriptionId],
  );
  assert.ok(intents[0], 'intention SESSION_CREATED introuvable');

  return {
    user,
    subscriptionId,
    sessionId: (res.body as any).sessionId as string,
    clientReference: intents[0].client_reference,
  };
}

interface EventOptions {
  eventId?: string;
  secret?: string;
  timestamp?: number;
  rotate?: boolean;
  headerOverride?: string;
  rawOverride?: Buffer;
}

function completedEvent(
  pending: PendingWaveSubscription,
  overrides: Partial<{ amount: string; currency: string; clientReference: string }> = {},
) {
  return {
    id: nextEventId(),
    type: 'checkout.session.completed',
    data: {
      id: pending.sessionId,
      amount: overrides.amount ?? '2000',
      currency: overrides.currency ?? 'XOF',
      client_reference: overrides.clientReference ?? pending.clientReference,
    },
  };
}

function failedEvent(pending: PendingWaveSubscription) {
  return {
    id: nextEventId(),
    type: 'checkout.session.payment_failed',
    data: {
      id: pending.sessionId,
      payment_status: 'failed',
      checkout_status: 'failed',
    },
  };
}

async function sendWebhook(event: unknown, options: EventOptions = {}) {
  const raw = options.rawOverride ?? Buffer.from(JSON.stringify(event));
  const timestamp = options.timestamp ?? Math.floor(Date.now() / 1000);
  const header =
    options.headerOverride ??
    waveSignatureHeader(options.secret ?? WEBHOOK_SECRET, timestamp, raw, { rotate: options.rotate });
  return postRaw(server.baseUrl, '/api/webhooks/wave', raw, { 'wave-signature': header });
}

async function trace(eventId: string) {
  const rows = await dbQuery('SELECT * FROM wave_checkout_events WHERE event_id = $1', [eventId]);
  return rows[0];
}

before(async () => {
  waveSpy = spyFetchWave(
    fakeFetch((call) => {
      const body = JSON.parse(call.body ?? '{}');
      sessionSeq += 1;
      const id = `cos-v9-webhook-${sessionSeq}`;
      assert.equal(body.currency, 'XOF');
      assert.ok(['2000', '5000', '10000'].includes(body.amount), `montant inattendu: ${body.amount}`);
      return { body: { id, wave_launch_url: `https://pay.wave.com/c/${id}` } };
    }),
  );
  server = await bootTestServer();
  admin = await loginAdmin(server);

  const admins = await dbQuery<{ id: number }>("SELECT id FROM users WHERE role = 'admin' ORDER BY id LIMIT 1");
  assert.equal(
    admins[0]?.id,
    config.wave.systemAdminId,
    'WAVE_SYSTEM_ADMIN_ID doit désigner un admin existant dans la base de test',
  );
  clearSentMails();
});

after(async () => {
  waveSpy.restore();
  await server.close();
});

describe('V9 — signature et fenêtre temporelle (helper pur)', () => {
  it('valide les signatures multi-v1 et rejette corps resérialisé, rejoué et futur', () => {
    const now = 1_800_000_000;
    const raw = Buffer.from('{"id":"EV_X","type":"checkout.session.completed"}');

    assert.equal(verifyWaveSignature(`t=${now},v1=${'0'.repeat(64)},v1=${signWaveHmac(WEBHOOK_SECRET, now, raw)}`, raw, WEBHOOK_SECRET, now), true);
    assert.equal(verifyWaveSignature(waveSignatureHeader(WEBHOOK_SECRET, now - 240, raw), raw, WEBHOOK_SECRET, now), true);
    assert.equal(verifyWaveSignature(waveSignatureHeader(WEBHOOK_SECRET, now + 20, raw), raw, WEBHOOK_SECRET, now), true);
    assert.equal(verifyWaveSignature(waveSignatureHeader(WEBHOOK_SECRET, now - 360, raw), raw, WEBHOOK_SECRET, now), false);
    assert.equal(verifyWaveSignature(waveSignatureHeader(WEBHOOK_SECRET, now + 40, raw), raw, WEBHOOK_SECRET, now), false);

    const original = Buffer.from('{ "id" : "EV_X" }');
    const compacted = Buffer.from('{"id":"EV_X"}');
    assert.equal(verifyWaveSignature(waveSignatureHeader(WEBHOOK_SECRET, now, original), compacted, WEBHOOK_SECRET, now), false);
    assert.equal(verifyWaveSignature(undefined, raw, WEBHOOK_SECRET, now), false);
  });
});

describe('V9 — webhook Wave haché, idempotent et non activateur hors contrôle', () => {
  it('signature absente → 400 INVALID_SIGNATURE, 0 trace', async () => {
    const pending = await createWavePending('whnosig');
    const event = completedEvent(pending);
    const res = await postRaw(server.baseUrl, '/api/webhooks/wave', Buffer.from(JSON.stringify(event)), {
      'content-type': 'application/json',
      'wave-signature': '',
    });
    assert.equal(res.status, 400);
    assert.equal(errorCode(res.body), 'INVALID_SIGNATURE');
    assert.equal(await trace(event.id), undefined);
  });

  it('mauvais secret → 400 INVALID_SIGNATURE', async () => {
    const pending = await createWavePending('whbadsecret');
    const event = completedEvent(pending);
    const res = await sendWebhook(event, { secret: 'b'.repeat(32) });
    assert.equal(res.status, 400);
    assert.equal(errorCode(res.body), 'INVALID_SIGNATURE');
  });

  it('CA-V9-052 — aucun secret, signature ni corps brut dans la journalisation', async () => {
    const pending = await createWavePending('whnolog');
    const event = completedEvent(pending);
    const raw = Buffer.from(JSON.stringify(event));
    const badSecret = 'c'.repeat(32);
    const signature = waveSignatureHeader(badSecret, Math.floor(Date.now() / 1000), raw);

    const captured: string[] = [];
    const sink = (chunk: Uint8Array | string): boolean => {
      captured.push(String(chunk));
      return true;
    };
    const originalStdout = process.stdout.write;
    const originalStderr = process.stderr.write;
    process.stdout.write = sink as typeof process.stdout.write;
    process.stderr.write = sink as typeof process.stderr.write;
    let status = 0;
    try {
      // Sonde positive : prouve que l'interception des flux fonctionne. Sans
      // elle, une capture vide ferait passer le test par défaut.
      logger.info('V9 sonde de capture journal');
      const res = await postRaw(server.baseUrl, '/api/webhooks/wave', raw, {
        'content-type': 'application/json',
        'wave-signature': signature,
      });
      status = res.status;
    } finally {
      process.stdout.write = originalStdout;
      process.stderr.write = originalStderr;
    }

    assert.equal(status, 400);
    const logs = captured.join('');
    assert.ok(logs.includes('V9 sonde de capture journal'), 'la capture des flux n’a pas fonctionné');
    assert.ok(!logs.includes(badSecret), 'le secret de test a fuité dans un log');
    assert.ok(!logs.includes(signature), 'la signature a fuité dans un log');
    assert.ok(!logs.includes(raw.toString('utf8')), 'le corps brut a fuité dans un log');
  });

  it('rejeu à 6 minutes → 400 INVALID_SIGNATURE', async () => {
    const pending = await createWavePending('whreplay');
    const event = completedEvent(pending);
    const res = await sendWebhook(event, { timestamp: Math.floor(Date.now() / 1000) - 360 });
    assert.equal(res.status, 400);
    assert.equal(errorCode(res.body), 'INVALID_SIGNATURE');
  });

  it('rotation multi-v1 : une signature valide suffit → 200 et activation', async () => {
    const pending = await createWavePending('whrotation');
    const event = completedEvent(pending);
    clearSentMails();

    const res = await sendWebhook(event, { rotate: true });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.deepEqual(res.body, { received: true });
    await flushAfterCommit();

    const row = (await dbQuery('SELECT status, activated_by FROM seller_subscriptions WHERE id = $1', [pending.subscriptionId]))[0];
    assert.equal(row.status, 'ACTIVE');
    assert.equal(row.activated_by, config.wave.systemAdminId);
    assert.equal(recentSentMails().length, 1);
  });

  it('corps resérialisé : HMAC calculé sur les octets d’origine → 400', async () => {
    const pending = await createWavePending('whreserialize');
    const event = completedEvent(pending);
    const original = Buffer.from(JSON.stringify(event, null, 2));
    const compacted = Buffer.from(JSON.stringify(event));
    const res = await sendWebhook(event, { rawOverride: compacted, timestamp: Math.floor(Date.now() / 1000) });
    assert.equal(res.status, 200);

    const spoofed = await postRaw(server.baseUrl, '/api/webhooks/wave', compacted, {
      'wave-signature': waveSignatureHeader(WEBHOOK_SECRET, Math.floor(Date.now() / 1000), original),
    });
    assert.equal(spoofed.status, 400);
    assert.equal(errorCode(spoofed.body), 'INVALID_SIGNATURE');
  });

  it('JSON invalide signé → 400 INVALID_PAYLOAD', async () => {
    const raw = Buffer.from('{ oui');
    const res = await postRaw(server.baseUrl, '/api/webhooks/wave', raw, {
      'wave-signature': waveSignatureHeader(WEBHOOK_SECRET, Math.floor(Date.now() / 1000), raw),
    });
    assert.equal(res.status, 400);
    assert.equal(errorCode(res.body), 'INVALID_PAYLOAD');
  });

  it('type inconnu mais corrélé → 200 ignored, trace IGNORED, aucune activation', async () => {
    const pending = await createWavePending('whunknown');
    const event = {
      id: nextEventId(),
      type: 'checkout.session.expired',
      data: { id: pending.sessionId, client_reference: pending.clientReference },
    };
    clearSentMails();
    const res = await sendWebhook(event);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { received: true, ignored: true });
    await flushAfterCommit();

    const row = await trace(event.id);
    assert.equal(row.status, 'IGNORED');
    assert.equal(row.activated, false);
    const sub = (await dbQuery('SELECT status FROM seller_subscriptions WHERE id = $1', [pending.subscriptionId]))[0];
    assert.equal(sub.status, 'PENDING');
    assert.equal(recentSentMails().length, 0);
  });

  it('montant erroné, décimal et devise étrangère → 200 ignored, 0 activation', async () => {
    for (const [index, overrides] of [
      { amount: '1000' },
      { amount: '2000.5' },
      { currency: 'EUR' },
    ].entries()) {
      const pending = await createWavePending(`whbadamount${index}`);
      const event = completedEvent(pending, overrides);
      clearSentMails();
      const res = await sendWebhook(event);
      assert.equal(res.status, 200, JSON.stringify(res.body));
      assert.deepEqual(res.body, { received: true, ignored: true });
      await flushAfterCommit();

      const row = await trace(event.id);
      assert.equal(row.status, 'IGNORED');
      const sub = (await dbQuery('SELECT status FROM seller_subscriptions WHERE id = $1', [pending.subscriptionId]))[0];
      assert.equal(sub.status, 'PENDING');
      assert.equal(recentSentMails().length, 0);
    }
  });

  it('payment_method ≠ wave → 200 ignored, validation manuelle conservée', async () => {
    const user = await registerUser(server, 'whomrefus');
    const subscriptionId = await subscribe(user, 'wh-om-refus', 1, 'orange_money');
    const event = {
      id: nextEventId(),
      type: 'checkout.session.completed',
      data: { id: 'cos-inconnue-om', amount: '2000', currency: 'XOF', client_reference: 'wave-sub-inconnue' },
    };
    clearSentMails();
    const res = await sendWebhook(event);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { received: true, ignored: true });
    await flushAfterCommit();

    assert.equal(await trace(event.id), undefined);
    const sub = (await dbQuery('SELECT status, payment_method FROM seller_subscriptions WHERE id = $1', [subscriptionId]))[0];
    assert.equal(sub.status, 'PENDING');
    assert.equal(sub.payment_method, 'orange_money');
    assert.equal(recentSentMails().length, 0);
  });

  it('souscription déjà ACTIVE → 200 ignored, aucun écrasement de activated_by', async () => {
    const pending = await createWavePending('whalreadyactive');
    await admin.post(`/api/admin/subscriptions/${pending.subscriptionId}/activate`, {});
    await flushAfterCommit();
    const before = (await dbQuery('SELECT activated_by FROM seller_subscriptions WHERE id = $1', [pending.subscriptionId]))[0];
    const event = completedEvent(pending);
    clearSentMails();

    const res = await sendWebhook(event);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { received: true, ignored: true });
    await flushAfterCommit();

    const after = (await dbQuery('SELECT status, activated_by FROM seller_subscriptions WHERE id = $1', [pending.subscriptionId]))[0];
    assert.equal(after.status, 'ACTIVE');
    assert.equal(after.activated_by, before.activated_by);
    assert.equal(recentSentMails().length, 0);
  });

  it('payment_failed sans référence, corrélé par data.id → 200, souscription PENDING, 0 e-mail', async () => {
    const pending = await createWavePending('whfailed');
    const event = failedEvent(pending);
    clearSentMails();

    const res = await sendWebhook(event);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.deepEqual(res.body, { received: true });
    await flushAfterCommit();

    const row = await trace(event.id);
    assert.equal(row.status, 'PAYMENT_FAILED');
    assert.equal(row.activated, false);
    assert.equal(row.session_id, pending.sessionId);

    const sub = (
      await dbQuery(
        'SELECT status, started_at, ends_at, activated_by, payment_method, payment_reference FROM seller_subscriptions WHERE id = $1',
        [pending.subscriptionId],
      )
    )[0];
    assert.equal(sub.status, 'PENDING');
    assert.equal(sub.started_at, null);
    assert.equal(sub.ends_at, null);
    assert.equal(sub.activated_by, null);
    assert.equal(sub.payment_method, 'wave');
    assert.ok(sub.payment_reference);
    assert.equal(recentSentMails().length, 0);
  });

  it('completed valide → 200, ACTIVE 30 jours, activated_by admin, 1 seul e-mail', async () => {
    const pending = await createWavePending('whsuccess');
    const event = completedEvent(pending);
    clearSentMails();

    const res = await sendWebhook(event);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.deepEqual(res.body, { received: true });
    await flushAfterCommit();

    const traceRow = await trace(event.id);
    assert.equal(traceRow.status, 'COMPLETED');
    assert.equal(traceRow.activated, true);

    const sub = (
      await dbQuery(
        'SELECT status, started_at, ends_at, activated_by, payment_method, payment_reference FROM seller_subscriptions WHERE id = $1',
        [pending.subscriptionId],
      )
    )[0];
    assert.equal(sub.status, 'ACTIVE');
    assert.equal(sub.activated_by, config.wave.systemAdminId);
    assert.ok(sub.started_at);
    assert.ok(sub.ends_at);
    const days = (new Date(sub.ends_at).getTime() - new Date(sub.started_at).getTime()) / 86_400_000;
    assert.ok(days > 29.9 && days < 30.1, `durée = ${days} jours`);
    assert.equal(sub.payment_method, 'wave');
    assert.ok(sub.payment_reference);
    assert.equal(recentSentMails().length, 1);
  });

  it('3 webhooks concurrents avec le même event.id → 1 trace, 1 activation, 1 e-mail', async () => {
    const pending = await createWavePending('whduplicate');
    const event = completedEvent(pending);
    clearSentMails();

    const responses = await Promise.all([sendWebhook(event), sendWebhook(event), sendWebhook(event)]);
    for (const res of responses) {
      assert.equal(res.status, 200, JSON.stringify(res.body));
      assert.equal(res.body.received, true);
    }
    await flushAfterCommit();

    const traces = await dbQuery('SELECT id, status FROM wave_checkout_events WHERE event_id = $1', [event.id]);
    assert.equal(traces.length, 1);
    assert.equal(traces[0].status, 'COMPLETED');

    const active = await dbQuery("SELECT id FROM seller_subscriptions WHERE id = $1 AND status = 'ACTIVE'", [pending.subscriptionId]);
    assert.equal(active.length, 1);
    assert.equal(recentSentMails().length, 1);
  });

  it('admin Wave inexistant → 503 INTERNAL_ERROR, trace FAILED, aucune activation', async () => {
    const pending = await createWavePending('whnoadmin');
    const event = completedEvent(pending);
    clearSentMails();
    await dbQuery("UPDATE users SET role = 'user' WHERE id = $1", [config.wave.systemAdminId]);
    try {
      const res = await sendWebhook(event);
      assert.equal(res.status, 503);
      assert.equal(errorCode(res.body), 'INTERNAL_ERROR');
      assert.equal((await trace(event.id)).status, 'FAILED');
      const sub = (await dbQuery('SELECT status FROM seller_subscriptions WHERE id = $1', [pending.subscriptionId]))[0];
      assert.equal(sub.status, 'PENDING');
      assert.equal(recentSentMails().length, 0);
    } finally {
      await dbQuery("UPDATE users SET role = 'admin' WHERE id = $1", [config.wave.systemAdminId]);
    }
  });

  it('événement signé sans intention corrélable → 200 ignored sans trace (FK NOT NULL de 023)', async () => {
    const event = {
      id: nextEventId(),
      type: 'checkout.session.completed',
      data: { id: 'cos-jamais-cree', amount: '2000', currency: 'XOF', client_reference: 'wave-sub-99999999-00000000' },
    };
    const res = await sendWebhook(event);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { received: true, ignored: true });
    assert.equal(await trace(event.id), undefined);
  });

  it('CA-V9-030/036 — doublon séquentiel 2× puis 3× : 2xx partout, 1 trace, 1 e-mail', async () => {
    const pending = await createWavePending('whseqduplicate');
    const event = completedEvent(pending);
    await flushAfterCommit();
    clearSentMails();

    const first = await sendWebhook(event);
    assert.deepEqual(first.body, { received: true });
    const second = await sendWebhook(event);
    assert.deepEqual(second.body, { received: true, duplicate: true });
    const third = await sendWebhook(event);
    assert.deepEqual(third.body, { received: true, duplicate: true });
    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    assert.equal(third.status, 200);
    await flushAfterCommit();

    const traces = await dbQuery('SELECT id, status FROM wave_checkout_events WHERE event_id = $1', [event.id]);
    assert.equal(traces.length, 1);
    assert.equal(traces[0]!.status, 'COMPLETED');
    const active = await dbQuery("SELECT id FROM seller_subscriptions WHERE id = $1 AND status = 'ACTIVE'", [pending.subscriptionId]);
    assert.equal(active.length, 1);
    assert.equal(recentSentMails().length, 1);
  });

  it('CA-V9-032 — horodatage HTTP : 4 min accepté, 6 min / absent / non numérique / futur rejetés', async () => {
    const now = Math.floor(Date.now() / 1000);
    const accepted = await createWavePending('whtime4min');
    const okEvent = completedEvent(accepted);
    const ok = await sendWebhook(okEvent, { timestamp: now - 240 });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    await flushAfterCommit();
    assert.equal((await dbQuery('SELECT status FROM seller_subscriptions WHERE id = $1', [accepted.subscriptionId]))[0]!.status, 'ACTIVE');

    const cases: Array<{ label: string; timestamp?: number; mode?: 'no-t' | 'bad-t' }> = [
      { label: '6 minutes', timestamp: now - 360 },
      { label: 'futur +40 s', timestamp: now + 40 },
      { label: 't absent', mode: 'no-t' },
      { label: 't non numérique', mode: 'bad-t' },
    ];
    for (const { label, timestamp, mode } of cases) {
      const pending = await createWavePending(`whtime${label.replace(/[^a-z0-9]/gi, '')}`);
      const event = completedEvent(pending);
      const raw = Buffer.from(JSON.stringify(event));
      const t = timestamp ?? now;
      const header = mode === 'no-t'
        ? waveSignatureHeader(WEBHOOK_SECRET, t, raw, { includeTimestamp: false })
        : mode === 'bad-t'
          ? `t=pas-un-nombre,v1=${'0'.repeat(64)}`
          : waveSignatureHeader(WEBHOOK_SECRET, t, raw);
      const res = await postRaw(server.baseUrl, '/api/webhooks/wave', raw, { 'wave-signature': header });
      assert.equal(res.status, 400, `${label} → ${res.status}`);
      assert.equal(errorCode(res.body), 'INVALID_SIGNATURE', label);
      assert.equal((await dbQuery('SELECT status FROM seller_subscriptions WHERE id = $1', [pending.subscriptionId]))[0]!.status, 'PENDING');
    }
  });

  it('CA-V9-033/034 — montant d’un autre plan et devise absente → ignored, 0 activation', async () => {
    const user = await registerUser(server, 'whplan2');
    const subscriptionId = await subscribe(user, 'wh-plan-2', 2);
    const session = await user.client.post('/api/wave/checkout/sessions', { subscriptionId });
    assert.equal(session.status, 200);
    const sessionId = (session.body as any).sessionId as string;

    for (const [label, data] of [
      ['montant plan Découverte sur un plan Boutique', { id: sessionId, amount: '2000', currency: 'XOF' }],
      ['devise absente', { id: sessionId, amount: '5000' }],
    ] as const) {
      const event = { id: nextEventId(), type: 'checkout.session.completed', data };
      clearSentMails();
      const res = await sendWebhook(event);
      assert.equal(res.status, 200, label);
      assert.deepEqual(res.body, { received: true, ignored: true });
      await flushAfterCommit();
      assert.equal((await trace(event.id))!.status, 'IGNORED');
      assert.equal((await dbQuery('SELECT status FROM seller_subscriptions WHERE id = $1', [subscriptionId]))[0]!.status, 'PENDING');
      assert.equal(recentSentMails().length, 0);
    }
  });

  it('CA-V9-035/041/046 — référence d’autrui, EXPIRED/CANCELLED et virement → 2xx ignored, 0 activation', async () => {
    const victim = await createWavePending('whvictim');
    const foreign = await createWavePending('whforeign');
    const foreignEvent = completedEvent(foreign);
    clearSentMails();
    const foreignRes = await sendWebhook(foreignEvent);
    assert.equal(foreignRes.status, 200);
    await flushAfterCommit();
    assert.equal((await dbQuery('SELECT status FROM seller_subscriptions WHERE id = $1', [victim.subscriptionId]))[0]!.status, 'PENDING');
    assert.equal(recentSentMails().length, 1, 'seule la souscription rattachée à la référence est activée');

    for (const [label, status] of [['EXPIRED', 'EXPIRED'], ['CANCELLED', 'CANCELLED']] as const) {
      const pending = await createWavePending(`wh${status.toLowerCase()}`);
      if (status === 'EXPIRED') {
        await dbQuery(
          `UPDATE seller_subscriptions
              SET status = 'EXPIRED', started_at = now() - interval '40 days', ends_at = now() - interval '10 days',
                  activated_at = now() - interval '40 days', activated_by = (SELECT id FROM users WHERE role='admin' LIMIT 1)
            WHERE id = $1`,
          [pending.subscriptionId],
        );
      } else {
        await dbQuery("UPDATE seller_subscriptions SET status = 'CANCELLED' WHERE id = $1", [pending.subscriptionId]);
      }
      const before = (await dbQuery('SELECT activated_by FROM seller_subscriptions WHERE id = $1', [pending.subscriptionId]))[0]!;
      clearSentMails();
      const res = await sendWebhook(completedEvent(pending));
      assert.equal(res.status, 200, label);
      assert.deepEqual(res.body, { received: true, ignored: true });
      await flushAfterCommit();
      const after = (await dbQuery('SELECT status, activated_by FROM seller_subscriptions WHERE id = $1', [pending.subscriptionId]))[0]!;
      assert.equal(after.status, status);
      assert.equal(after.activated_by, before.activated_by, `${label} : activated_by non écrasé`);
      assert.equal(recentSentMails().length, 0);
    }

    const transferUser = await registerUser(server, 'whvirement');
    const transferId = await subscribe(transferUser, 'wh-virement', 1, 'virement');
    const transferSession = await transferUser.client.post('/api/wave/checkout/sessions', { subscriptionId: transferId });
    assert.equal(transferSession.status, 409, 'aucune session Wave pour un virement');
    const event = {
      id: nextEventId(),
      type: 'checkout.session.completed',
      data: { id: 'cos-virement-fictif', amount: '2000', currency: 'XOF', client_reference: 'wave-sub-inconnu' },
    };
    const res = await sendWebhook(event);
    assert.equal(res.status, 200);
    assert.equal((await dbQuery('SELECT status FROM seller_subscriptions WHERE id = $1', [transferId]))[0]!.status, 'PENDING');
  });

  it('CA-V9-036 — 2xx en < 5 s pour traité et non pertinent, 4xx rapide pour signature invalide', async () => {
    const pending = await createWavePending('whtiming');
    const event = completedEvent(pending);
    await sendWebhook(event);
    await flushAfterCommit();

    const duplicateStart = performance.now();
    const duplicate = await sendWebhook(event);
    const duplicateMs = performance.now() - duplicateStart;
    assert.equal(duplicate.status, 200);
    assert.ok(duplicateMs < 5_000, `doublon en ${duplicateMs.toFixed(1)} ms`);

    const other = await createWavePending('whtiming2');
    const ignoredEvent = {
      id: nextEventId(),
      type: 'checkout.session.expired',
      data: { id: other.sessionId, client_reference: other.clientReference },
    };
    const ignoredStart = performance.now();
    const ignored = await sendWebhook(ignoredEvent);
    const ignoredMs = performance.now() - ignoredStart;
    assert.equal(ignored.status, 200);
    assert.ok(ignoredMs < 5_000, `ignoré en ${ignoredMs.toFixed(1)} ms`);

    const raw = Buffer.from(JSON.stringify(completedEvent(other)));
    const badStart = performance.now();
    const bad = await postRaw(server.baseUrl, '/api/webhooks/wave', raw, {
      'wave-signature': `t=${Math.floor(Date.now() / 1000)},v1=${'0'.repeat(64)}`,
    });
    const badMs = performance.now() - badStart;
    assert.equal(bad.status, 400);
    assert.ok(badMs < 5_000, `signature invalide en ${badMs.toFixed(1)} ms`);
  });

  it('CA-V9-044 — parité des effets webhook vs activation admin (statut, dates, activation, e-mail)', async () => {
    const auto = await createWavePending('whparityauto');
    const manualUser = await registerUser(server, 'whparityadmin');
    const manualId = await subscribe(manualUser, 'wh-parity-admin');
    const autoBefore = (await dbQuery('SELECT payment_method, payment_reference FROM seller_subscriptions WHERE id = $1', [auto.subscriptionId]))[0]!;
    const manualBefore = (await dbQuery('SELECT payment_method, payment_reference FROM seller_subscriptions WHERE id = $1', [manualId]))[0]!;
    clearSentMails();

    const res = await sendWebhook(completedEvent(auto));
    assert.equal(res.status, 200);
    const adminRes = await admin.post(`/api/admin/subscriptions/${manualId}/activate`, {});
    assert.equal(adminRes.status, 200);
    await flushAfterCommit();

    const columns = 'status, payment_method, activated_by, EXTRACT(EPOCH FROM (ends_at - started_at)) / 86400 AS days';
    const byWebhook = (await dbQuery(`SELECT ${columns} FROM seller_subscriptions WHERE id = $1`, [auto.subscriptionId]))[0]!;
    const byAdmin = (await dbQuery(`SELECT ${columns} FROM seller_subscriptions WHERE id = $1`, [manualId]))[0]!;
    assert.deepEqual(byWebhook, byAdmin, 'les effets métier sont identiques');
    assert.equal(byWebhook.status, 'ACTIVE');
    assert.equal(byWebhook.activated_by, config.wave.systemAdminId);
    assert.equal(Number(byWebhook.days), 30);

    const autoAfter = (await dbQuery('SELECT payment_method, payment_reference FROM seller_subscriptions WHERE id = $1', [auto.subscriptionId]))[0]!;
    const manualAfter = (await dbQuery('SELECT payment_method, payment_reference FROM seller_subscriptions WHERE id = $1', [manualId]))[0]!;
    assert.deepEqual(autoAfter, autoBefore, 'CA-V9-045 : référence conservée par le webhook');
    assert.deepEqual(manualAfter, manualBefore, 'référence conservée par l’activation admin');

    const mails = recentSentMails().filter((mail) => mail.event === 'subscription_activated');
    assert.equal(mails.length, 2, '1 e-mail par activation, aucun doublon');
    assert.equal(mails[0]!.subject, mails[1]!.subject);

    for (const id of [auto.subscriptionId, manualId]) {
      const me = id === auto.subscriptionId ? auto.user : manualUser;
      const detail = await me.client.get('/api/subscriptions/me');
      assert.equal((detail.body as any).subscription.status, 'ACTIVE');
    }
  });

  it('CA-V9-045 — activation automatique : payment_method et payment_reference intacts', async () => {
    const pending = await createWavePending('whrefconservee');
    const columns = 'payment_method, payment_reference';
    const before = (await dbQuery(`SELECT ${columns} FROM seller_subscriptions WHERE id = $1`, [pending.subscriptionId]))[0]!;
    assert.equal(before.payment_method, 'wave');
    assert.ok(before.payment_reference, 'une référence manuelle est saisie à la souscription');
    clearSentMails();

    const res = await sendWebhook(completedEvent(pending));
    assert.equal(res.status, 200, JSON.stringify(res.body));
    await flushAfterCommit();

    const after = (await dbQuery(`SELECT ${columns}, status, activated_by FROM seller_subscriptions WHERE id = $1`, [pending.subscriptionId]))[0]!;
    assert.deepEqual(
      { payment_method: after.payment_method, payment_reference: after.payment_reference },
      before,
      'V9 ne réécrit aucun champ de paiement',
    );
    assert.equal(after.status, 'ACTIVE');
    assert.equal(after.activated_by, config.wave.systemAdminId);
  });

  it('CA-V9-047 — deux événements distincts simultanés pour la même souscription → 1 seul ACTIVE', async () => {
    const pending = await createWavePending('whdistinctrace');
    clearSentMails();
    const events = [completedEvent(pending), completedEvent(pending)];
    const responses = await Promise.all(events.map((event) => sendWebhook(event)));
    for (const res of responses) assert.equal(res.status, 200, JSON.stringify(res.body));
    await flushAfterCommit();

    assert.equal((await dbQuery("SELECT COUNT(*)::text AS n FROM seller_subscriptions WHERE id = $1 AND status = 'ACTIVE'", [pending.subscriptionId]))[0]!.n, '1');
    assert.equal(recentSentMails().length, 1);
  });

  it('le webhook n’appelle jamais l’API Wave : seuls les appels de création de session ont été stubés', () => {
    const calls = waveSpy.waveCalls();
    assert.ok(calls.length > 0, 'au moins un appel de création de session attendu');
    assert.equal(calls.every((call) => call.url.endsWith('/v1/checkout/sessions')), true);
  });
});
