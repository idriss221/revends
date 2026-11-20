/**
 * V9 — fail-closed complet, dans un processus où WAVE_ENABLED est ABSENT.
 *
 * Deux buts : prouver la valeur par défaut `false` (et l'admin système 7),
 * et prouver que le webhook accuse réception SANS écrire ni appeler Wave.
 * Aucune clé réelle : le secret de test n'est jamais lu quand WAVE est off.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setWaveEnv, spyFetchWave, postRaw, waveSignatureHeader, type WaveFetchSpy } from './helpers-wave.js';

setWaveEnv({ enabled: false });
// On retire Volontairement la variable pour tester le DEFAULT du schéma config (CA-V9-001/004).
delete process.env.WAVE_ENABLED;
delete process.env.WAVE_SYSTEM_ADMIN_ID;
const FAKE_SECRET = 'c'.repeat(32);

const { bootTestServer, registerUser, dbQuery, errorCode } = await import('./helpers.js');
const { config } = await import('../src/config.js');

type ServerHandle = Awaited<ReturnType<typeof bootTestServer>>;

let server: ServerHandle;
let waveSpy: WaveFetchSpy;

before(async () => {
  waveSpy = spyFetchWave(() => new Response('{}', { status: 200 }));
  server = await bootTestServer();
});

after(async () => {
  waveSpy.restore();
  await server.close();
});

describe('V9 — configuration par défaut et webhook désactivé', () => {
  it('CA-V9-001/004 — WAVE_ENABLED absent ⇒ false, WAVE_SYSTEM_ADMIN_ID absent ⇒ 7', () => {
    assert.equal(process.env.WAVE_ENABLED, undefined);
    assert.equal(config.wave.enabled, false);
    assert.equal(config.wave.systemAdminId, 7);
  });

  it('CA-V9-001 — création de session sans WAVE_* ⇒ 503 WAVE_DISABLED, 0 appel HTTP', async () => {
    const user = await registerUser(server, 'wavedefaultoff');
    const sub = await user.client.post('/api/subscriptions', {
      planId: 1,
      slug: 'wave-default-off',
      paymentMethod: 'wave',
      paymentReference: 'REF-WAVE-DEFAULT-OFF',
    });
    assert.equal(sub.status, 201);
    const id = (sub.body as any).subscription.id as number;
    const before = waveSpy.waveCalls().length;
    const res = await user.client.post('/api/wave/checkout/sessions', { subscriptionId: id });
    assert.equal(res.status, 503);
    assert.equal(errorCode(res.body), 'WAVE_DISABLED');
    assert.equal(waveSpy.waveCalls().length, before);
  });

  it('CA-V9-001/074 — webhook désactivé ⇒ 200 ignored WAVE_DISABLED, 0 trace, 0 activation, 0 appel', async () => {
    const user = await registerUser(server, 'waveoffwebhook');
    const sub = await user.client.post('/api/subscriptions', {
      planId: 1,
      slug: 'wave-off-webhook',
      paymentMethod: 'wave',
      paymentReference: 'REF-WAVE-OFF-WEBHOOK',
    });
    const id = (sub.body as any).subscription.id as number;
    const tracesBefore = (await dbQuery('SELECT COUNT(*)::text AS n FROM wave_checkout_events'))[0]!.n;
    const beforeCalls = waveSpy.waveCalls().length;

    const event = {
      id: 'EV_V9_DISABLED_SHOULD_NOT_BE_RECORDED',
      type: 'checkout.session.completed',
      data: { id: 'cos-faux', amount: '2000', currency: 'XOF', client_reference: 'wave-sub-inconnue' },
    };
    const raw = Buffer.from(JSON.stringify(event));
    const t = Math.floor(Date.now() / 1000);
    const res = await postRaw(server.baseUrl, '/api/webhooks/wave', raw, {
      // Même une signature valide ne doit rien déclencher : la garde est AVANT le HMAC.
      'wave-signature': waveSignatureHeader(FAKE_SECRET, t, raw),
    });

    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { received: true, ignored: true, reason: 'WAVE_DISABLED' });
    assert.equal(waveSpy.waveCalls().length, beforeCalls);
    assert.equal((await dbQuery('SELECT COUNT(*)::text AS n FROM wave_checkout_events'))[0]!.n, tracesBefore);
    const row = (await dbQuery('SELECT status, activated_by FROM seller_subscriptions WHERE id = $1', [id]))[0]!;
    assert.equal(row.status, 'PENDING');
    assert.equal(row.activated_by, null);
  });

  it('aucun appel Wave réel dans le processus désactivé', () => {
    assert.equal(waveSpy.waveCalls().length, 0);
  });
});
