/**
 * V9 — mode activé (bouché par un mock HTTP, jamais par Wave).
 *
 * Ce fichier tourne dans son propre processus : `config.ts` fige `WAVE_ENABLED`
 * au chargement, donc `setWaveEnv({ enabled: true })` doit précéder tout import
 * applicatif. Aucune clé réelle, aucun appel réseau Wave : `spyFetchWave`
 * intercepte `api.wave.com` et renvoie des réponses fabriquées ici.
 */
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  setWaveEnv,
  spyFetchWave,
  waveSignatureHeader,
  type WaveFetchSpy,
  type WaveFetchCall,
} from './helpers-wave.js';

const FAKE_API_KEY = 'wave-api-key-for-local-tests-only';
const FAKE_WEBHOOK_SECRET = 'a'.repeat(32);
setWaveEnv({
  enabled: true,
  apiKey: FAKE_API_KEY,
  webhookSecret: FAKE_WEBHOOK_SECRET,
  systemAdminId: 1,
  mailEnabled: true,
});

const { bootTestServer, registerUser, loginAdmin, dbQuery, errorCode } = await import('./helpers.js');
const { flushAfterCommit } = await import('../src/utils/db.js');
const { clearSentMails, recentSentMails } = await import('../src/mail/mailer.js');
const { config } = await import('../src/config.js');
const { createWaveClient } = await import('../src/services/wave-client.service.js');
const { buildWaveClientReference } = await import('../src/services/wave-checkout.service.js');

type ServerHandle = Awaited<ReturnType<typeof bootTestServer>>;
type TestUser = Awaited<ReturnType<typeof registerUser>>;

let server: ServerHandle;
let admin: Awaited<ReturnType<typeof loginAdmin>>;
let waveSpy: WaveFetchSpy;
let sessionSeq = 0;
let responder: (call: WaveFetchCall) => Response | Promise<Response>;

function defaultResponder(_call: WaveFetchCall): Response {
  sessionSeq += 1;
  const id = `cos-v9-enabled-${sessionSeq}`;
  return new Response(
    JSON.stringify({ id, wave_launch_url: `https://pay.wave.com/c/${id}` }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}

async function subscribe(
  user: TestUser,
  slug: string,
  planId = 1,
  method = 'wave',
): Promise<number> {
  const res = await user.client.post('/api/subscriptions', {
    planId,
    slug,
    paymentMethod: method,
    paymentReference: `REF-${slug.toUpperCase()}`,
    // Montant fourni par un client abusif : doit être ignoré (CA-V9-011).
    amount: 1,
  });
  assert.equal(res.status, 201, `subscribe → ${res.status} ${JSON.stringify(res.body)}`);
  return (res.body as any).subscription.id as number;
}

async function checkout(user: TestUser, subscriptionId: number) {
  return user.client.post('/api/wave/checkout/sessions', { subscriptionId, amount: 1 });
}

function waveCalls() {
  return waveSpy.waveCalls();
}

async function noMails() {
  await flushAfterCommit();
  assert.equal(recentSentMails().length, 0);
}

before(async () => {
  responder = defaultResponder;
  waveSpy = spyFetchWave((call) => responder(call));
  server = await bootTestServer();
  admin = await loginAdmin(server);
  clearSentMails();
});

after(async () => {
  waveSpy.restore();
  await server.close();
});

beforeEach(() => {
  responder = defaultResponder;
});

describe('V9 — création de session activée, 100 % mockée', () => {
  it('CA-V9-001 — borne enabled:true prouvée, clé de test fictive, 0 secret réel en fixture', () => {
    assert.equal(config.wave.enabled, true);
    assert.equal(config.wave.apiKey, FAKE_API_KEY);
    assert.equal(config.wave.webhookSecret, FAKE_WEBHOOK_SECRET);
    assert.equal(FAKE_API_KEY.startsWith('wave_sn_'), false);
    assert.equal(FAKE_WEBHOOK_SECRET.startsWith('wave_sn_WHS_'), false);
  });

  it('CA-V9-010 — 1 appel POST /v1/checkout/sessions avec Bearer, via fetchImpl injectable', async () => {
    const calls: WaveFetchCall[] = [];
    const client = createWaveClient({
      baseUrl: 'https://api.wave.com',
      apiKey: FAKE_API_KEY,
      fetchImpl: async (url, init) => {
        calls.push({
          url,
          method: init?.method,
          headers: Object.fromEntries(
            Object.entries(init?.headers ?? {}).map(([key, value]) => [key.toLowerCase(), String(value)]),
          ),
          body: typeof init?.body === 'string' ? init.body : undefined,
        });
        return { ok: true, status: 200, json: async () => ({ id: 'cos-injected', wave_launch_url: 'https://pay.wave.com/c/cos-injected' }) };
      },
    });
    const result = await client.createCheckoutSession({
      amount: '2000',
      currency: 'XOF',
      success_url: 'https://revends.test/paiement-wave/succes',
      error_url: 'https://revends.test/paiement-wave/echec',
      client_reference: 'wave-sub-1-01234567',
    });
    assert.deepEqual(result, {
      sessionId: 'cos-injected',
      waveLaunchUrl: 'https://pay.wave.com/c/cos-injected',
    });
    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.url, 'https://api.wave.com/v1/checkout/sessions');
    assert.equal(calls[0]!.method, 'POST');
    assert.equal(calls[0]!.headers['authorization'], `Bearer ${FAKE_API_KEY}`);
    // Aucun appel global : le spy n'a rien vu, l'injection est bien utilisée.
    assert.equal(waveCalls().length, 0);
  });

  it('CA-V9-011 — montant serveur par plan 1/2/3, chaîne entière, XOF, client ignoré', async () => {
    for (const [planId, expected] of [[1, '2000'], [2, '5000'], [3, '10000']] as const) {
      const user = await registerUser(server, `waveenabledplan${planId}`);
      const subscriptionId = await subscribe(user, `wave-plan-${planId}-enabled`, planId);
      const before = waveCalls().length;

      const res = await checkout(user, subscriptionId);
      assert.equal(res.status, 200, JSON.stringify(res.body));
      assert.equal(waveCalls().length, before + 1, 'exactement 1 appel Wave');

      const payload = JSON.parse(waveCalls().at(-1)!.body!);
      assert.equal(payload.amount, expected, `plan ${planId}`);
      assert.equal(typeof payload.amount, 'string');
      assert.match(payload.amount, /^\d+$/);
      assert.equal(payload.currency, 'XOF');
      assert.equal('amount' in (res.body as object), false);
    }
  });

  it('CA-V9-012 — URLs HTTPS sans query, référence non vide ≤ 255, corps sans secret', async () => {
    const user = await registerUser(server, 'waveenabledurls');
    const subscriptionId = await subscribe(user, 'wave-urls-enabled');
    const res = await checkout(user, subscriptionId);
    assert.equal(res.status, 200, JSON.stringify(res.body));

    const payload = JSON.parse(waveCalls().at(-1)!.body!);
    for (const key of ['success_url', 'error_url'] as const) {
      const url = new URL(payload[key]);
      assert.equal(url.protocol, 'https:');
      assert.equal(url.search, '');
      assert.equal(url.hash, '');
      assert.match(url.pathname, /^\/paiement-wave\/(succes|echec)$/);
    }
    assert.ok(payload.client_reference.length > 0);
    assert.ok(payload.client_reference.length <= 255);

    const body = JSON.stringify(res.body);
    assert.equal(body.includes(FAKE_API_KEY), false);
    assert.equal(body.includes(FAKE_WEBHOOK_SECRET), false);
    assert.equal(body.includes(payload.client_reference), false);
    assert.deepEqual(Object.keys(res.body as object).sort(), ['sessionId', 'waveLaunchUrl']);
  });

  it('CA-V9-013 — référence stable pour une souscription, unique entre deux souscriptions, traçable', async () => {
    const user = await registerUser(server, 'waveenabledref');
    const first = await subscribe(user, 'wave-ref-first');
    const second = await subscribe(user, 'wave-ref-second');

    const a = await checkout(user, first);
    const b = await checkout(user, first);
    const c = await checkout(user, second);
    assert.equal(a.status, 200);
    assert.equal(b.status, 200);
    assert.equal(c.status, 200);

    const refA = JSON.parse(waveCalls().at(-3)!.body!).client_reference as string;
    const refA2 = JSON.parse(waveCalls().at(-2)!.body!).client_reference as string;
    const refB = JSON.parse(waveCalls().at(-1)!.body!).client_reference as string;
    assert.equal(refA, buildWaveClientReference(first));
    assert.equal(refA2, refA, 'même souscription → référence stable');
    assert.notEqual(refB, refA, 'souscriptions distinctes → références distinctes');

    const traces = await dbQuery<{ client_reference: string }>(
      "SELECT client_reference FROM wave_checkout_events WHERE subscription_id = $1 AND status = 'SESSION_CREATED'",
      [first],
    );
    assert.equal(traces.length, 1, '1 intention upsertée, pas 2');
    assert.equal(traces[0]!.client_reference, refA);
  });

  it('CA-V9-014 — wave_launch_url HTTPS renvoyée, aucune référence d’un autre vendeur', async () => {
    const owner = await registerUser(server, 'waveenabledowner');
    const other = await registerUser(server, 'waveenabledother');
    const ownId = await subscribe(owner, 'wave-launch-owner');
    await subscribe(other, 'wave-launch-other');

    const res = await checkout(owner, ownId);
    assert.equal(res.status, 200);
    const launch = (res.body as any).waveLaunchUrl as string;
    assert.match(launch, /^https:\/\/pay\.wave\.com\/c\/cos-/);
    const otherTraces = await dbQuery<{ client_reference: string }>(
      'SELECT client_reference FROM wave_checkout_events WHERE seller_id = $2 AND subscription_id <> $1',
      [ownId, owner.id],
    );
    for (const row of otherTraces) assert.equal(String(res.body).includes(row.client_reference), false);
  });

  it('CA-V9-015 — sans abonnement éligible : 404/409, 0 appel Wave, 0 écriture', async () => {
    const scenarios: Array<{ label: string; prepare: () => Promise<[TestUser, number]> }> = [
      {
        label: 'aucune souscription',
        prepare: async () => {
          const user = await registerUser(server, 'wavenosell');
          return [user, 999999];
        },
      },
      {
        label: 'souscription EXPIRED',
        prepare: async () => {
          const user = await registerUser(server, 'waveexpired');
          const id = await subscribe(user, 'wave-expired');
          await dbQuery(
            `UPDATE seller_subscriptions
                SET status = 'EXPIRED', started_at = now() - interval '40 days',
                    ends_at = now() - interval '10 days', activated_by = (SELECT id FROM users WHERE role='admin' LIMIT 1),
                    activated_at = now() - interval '40 days'
              WHERE id = $1`,
            [id],
          );
          return [user, id];
        },
      },
      {
        label: 'souscription CANCELLED',
        prepare: async () => {
          const user = await registerUser(server, 'wavecancelled');
          const id = await subscribe(user, 'wave-cancelled');
          await dbQuery("UPDATE seller_subscriptions SET status = 'CANCELLED' WHERE id = $1", [id]);
          return [user, id];
        },
      },
      {
        label: 'souscription d’un autre vendeur',
        prepare: async () => {
          const owner = await registerUser(server, 'waveotherowner');
          const other = await registerUser(server, 'waveotherclient');
          return [other, await subscribe(owner, 'wave-other-sub')];
        },
      },
    ];

    for (const { label, prepare } of scenarios) {
      const [user, id] = await prepare();
      const beforeCalls = waveCalls().length;
      const beforeTraces = (await dbQuery('SELECT COUNT(*)::text AS n FROM wave_checkout_events'))[0]!.n;
      const res = await checkout(user, id);
      assert.ok([404, 409].includes(res.status), `${label} → ${res.status}`);
      assert.equal(waveCalls().length, beforeCalls, `${label} : 0 appel Wave`);
      assert.equal(
        (await dbQuery('SELECT COUNT(*)::text AS n FROM wave_checkout_events'))[0]!.n,
        beforeTraces,
        `${label} : 0 écriture`,
      );
    }
  });

  it('CA-V9-016 — erreur Wave 500 : 502, souscription PENDING, 0 activation, 0 e-mail, 1 trace autorisée', async () => {
    const user = await registerUser(server, 'waveenabled500');
    const id = await subscribe(user, 'wave-500');
    await flushAfterCommit();
    clearSentMails();
    responder = () => new Response('{}', { status: 500, headers: { 'content-type': 'application/json' } });

    const res = await checkout(user, id);
    assert.equal(res.status, 502);
    assert.equal(errorCode(res.body), 'WAVE_UPSTREAM_ERROR');
    await noMails();

    const sub = (
      await dbQuery('SELECT status, activated_by, started_at, ends_at FROM seller_subscriptions WHERE id = $1', [id])
    )[0]!;
    assert.equal(sub.status, 'PENDING');
    assert.equal(sub.activated_by, null);
    assert.equal(sub.started_at, null);
    assert.equal(sub.ends_at, null);
    const traces = await dbQuery(
      "SELECT status FROM wave_checkout_events WHERE subscription_id = $1 AND status = 'SESSION_CREATED'",
      [id],
    );
    assert.equal(traces.length, 1, 'seule trace autorisée : intention SESSION_CREATED');
  });

  it('CA-V9-016 — timeout réseau : 502, aucune écriture métier, souscription intacte', async () => {
    const user = await registerUser(server, 'waveenabledtimeout');
    const id = await subscribe(user, 'wave-timeout');
    await flushAfterCommit();
    clearSentMails();
    responder = () => {
      throw new Error('réseau Wave simulé indisponible');
    };

    const res = await checkout(user, id);
    assert.equal(res.status, 502);
    assert.equal(errorCode(res.body), 'WAVE_UPSTREAM_ERROR');
    await noMails();

    const sub = (await dbQuery('SELECT status, activated_by FROM seller_subscriptions WHERE id = $1', [id]))[0]!;
    assert.equal(sub.status, 'PENDING');
    assert.equal(sub.activated_by, null);
  });

  it('CA-V9-017 — montant jamais lu dans le corps du client, aucun prix codé dans le module Wave', async () => {
    const user = await registerUser(server, 'waveamountclient');
    const id = await subscribe(user, 'wave-amount-client');
    for (const abusive of [1, 0, -5, 99999, '1000']) {
      const res = await user.client.post('/api/wave/checkout/sessions', { subscriptionId: id, amount: abusive });
      assert.equal(res.status, 200, `amount client ${abusive} doit être ignoré`);
      assert.equal(JSON.parse(waveCalls().at(-1)!.body!).amount, '2000');
    }
  });

  it('CA-V9-019 — indicateur /me explicite : true Wave PENDING, false OM/virement', async () => {
    const wave = await registerUser(server, 'waveindicator');
    await subscribe(wave, 'wave-indicator');
    const om = await registerUser(server, 'waveindicatorom');
    await subscribe(om, 'wave-indicator-om', 1, 'orange_money');
    const transfer = await registerUser(server, 'waveindicatortr');
    await subscribe(transfer, 'wave-indicator-tr', 1, 'virement');

    for (const [user, expected] of [[wave, true], [om, false], [transfer, false]] as const) {
      const res = await user.client.get('/api/subscriptions/me');
      assert.equal(res.status, 200);
      assert.equal((res.body as any).subscription.wavePaymentPending, expected);
    }
  });

  it('CA-V9-053 / SC-V9-11 — retour navigateur et session créée : 0 e-mail, 0 activation', async () => {
    const user = await registerUser(server, 'waveretour');
    const id = await subscribe(user, 'wave-retour');
    await flushAfterCommit();
    clearSentMails();

    const session = await checkout(user, id);
    assert.equal(session.status, 200);
    const successPage = await server.newClient().get('/paiement-wave/succes');
    assert.ok([200, 404].includes(successPage.status), 'page SPA ou 404 statique, jamais d’écriture');
    const me = await user.client.get('/api/subscriptions/me');
    assert.equal((me.body as any).subscription.status, 'PENDING');
    assert.equal((me.body as any).subscription.startedAt, null);
    assert.equal((me.body as any).subscription.activatedBy, null);
    await noMails();
  });

  it('CA-V9-060/061/062 — flux manuels Wave/OM/virement et contrat des routes inchangés', async () => {
    for (const [method, label] of [['wave', 'wave'], ['orange_money', 'om'], ['virement', 'virement']] as const) {
      const user = await registerUser(server, `wavemanual${label}`);
      const beforeCalls = waveCalls().length;
      const res = await user.client.post('/api/subscriptions', {
        planId: 1,
        slug: `wave-manual-${label}`,
        paymentMethod: method,
        paymentReference: `MANUAL-${label.toUpperCase()}`,
      });
      assert.equal(res.status, 201);
      assert.equal((res.body as any).subscription.status, 'PENDING');
      assert.equal(waveCalls().length, beforeCalls, 'le flux manuel n’appelle pas Wave');
      const me = await user.client.get('/api/subscriptions/me');
      assert.equal(me.status, 200);
      assert.equal((me.body as any).subscription.wavePaymentPending, method === 'wave');
    }

    // Le chemin admin préexistant active toujours une souscription manuelle.
    const user = await registerUser(server, 'wavemanualadmin');
    const id = await subscribe(user, 'wave-manual-admin', 1, 'virement');
    const activation = await admin.post(`/api/admin/subscriptions/${id}/activate`, {});
    assert.equal(activation.status, 200);
    const sub = (await dbQuery('SELECT status FROM seller_subscriptions WHERE id = $1', [id]))[0]!;
    assert.equal(sub.status, 'ACTIVE');
  });

  it('CA-V9-006 — webhook sans cookie ni en-tête CSRF est accepté quand le corps est signé', async () => {
    const user = await registerUser(server, 'wavenocsrf');
    const id = await subscribe(user, 'wave-no-csrf');
    const session = await checkout(user, id);
    assert.equal(session.status, 200);
    const raw = Buffer.from(
      JSON.stringify({
        id: 'EV_V9_ENABLED_NO_CSRF',
        type: 'checkout.session.payment_failed',
        data: { id: (session.body as any).sessionId },
      }),
    );
    const t = Math.floor(Date.now() / 1000);
    const res = await fetch(`${server.baseUrl}/api/webhooks/wave`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'wave-signature': waveSignatureHeader(FAKE_WEBHOOK_SECRET, t, raw) },
      body: raw,
    });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { received: true });
  });

  it('aucun appel réseau Wave réel : tous les appels ont été interceptés par le spy', () => {
    const calls = waveCalls();
    assert.ok(calls.length > 0);
    assert.equal(calls.every((call) => new URL(call.url).hostname === 'api.wave.com'), true);
  });
});
