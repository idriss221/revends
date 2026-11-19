import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setWaveEnv, spyFetchWave, fakeFetch, type WaveFetchSpy } from './helpers-wave.js';

setWaveEnv({ enabled: false });

const { bootTestServer, registerUser, loginAdmin, dbQuery, errorCode } = await import('./helpers.js');
const { clearSentMails } = await import('../src/mail/mailer.js');
const { config } = await import('../src/config.js');

type ServerHandle = Awaited<ReturnType<typeof bootTestServer>>;
type TestUser = Awaited<ReturnType<typeof registerUser>>;

let server: ServerHandle;
let admin: Awaited<ReturnType<typeof loginAdmin>>;
let waveSpy: WaveFetchSpy;

async function subscribe(user: TestUser, slug: string, planId = 1, method = 'wave') {
  const res = await user.client.post('/api/subscriptions', {
    planId,
    slug,
    paymentMethod: method,
    paymentReference: `REF-${slug.toUpperCase()}`,
  });
  assert.equal(res.status, 201, `subscribe → ${res.status} ${JSON.stringify(res.body)}`);
  return (res.body as any).subscription.id as number;
}

before(async () => {
  waveSpy = spyFetchWave(
    fakeFetch({
      body: {
        id: 'cos-v9-disabled-should-never-be-used',
        wave_launch_url: 'https://pay.wave.com/c/cos-v9-disabled-should-never-be-used',
      },
    }),
  );
  server = await bootTestServer();
  admin = await loginAdmin(server);
  clearSentMails();
});

after(async () => {
  waveSpy.restore();
  await server.close();
});

describe('V9 — checkout Wave désactivé (fail-closed) et extension /me', () => {
  it('config : WAVE_ENABLED=false est la valeur par défaut', () => {
    assert.equal(config.wave.enabled, false);
  });

  it('GET /api/wave/config sans session → 401 UNAUTHENTICATED', async () => {
    const client = server.newClient();
    const res = await client.get('/api/wave/config');
    assert.equal(res.status, 401);
    assert.equal(errorCode(res.body), 'UNAUTHENTICATED');
  });

  it('GET /api/wave/config authentifié → un seul champ waveEnabled:false', async () => {
    const user = await registerUser(server, 'waveconfig');
    const res = await user.client.get('/api/wave/config');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { waveEnabled: false });
    assert.deepEqual(Object.keys(res.body as object), ['waveEnabled']);
  });

  it('POST /api/wave/checkout/sessions sans session → 401', async () => {
    const res = await server.newClient().post('/api/wave/checkout/sessions', { subscriptionId: 1 });
    assert.equal(res.status, 401);
    assert.equal(errorCode(res.body), 'UNAUTHENTICATED');
  });

  it('POST /api/wave/checkout/sessions avec un corps invalide → 400 VALIDATION_ERROR', async () => {
    const user = await registerUser(server, 'waveinvalid');
    const res = await user.client.post('/api/wave/checkout/sessions', {});
    assert.equal(res.status, 400);
    assert.equal(errorCode(res.body), 'VALIDATION_ERROR');
    assert.equal((res.body as any).error.details[0].field, 'subscriptionId');
  });

  it('souscription PENDING/wave mais WAVE_ENABLED=false → 503 WAVE_DISABLED, 0 appel Wave, 0 intention', async () => {
    const user = await registerUser(server, 'wavedisabled');
    const subId = await subscribe(user, 'wave-disabled');
    const beforeCalls = waveSpy.waveCalls().length;

    const res = await user.client.post('/api/wave/checkout/sessions', { subscriptionId: subId });
    assert.equal(res.status, 503);
    assert.equal(errorCode(res.body), 'WAVE_DISABLED');
    assert.equal((res.body as any).error.message, 'Le paiement automatique Wave est désactivé. Le paiement manuel reste disponible.');
    assert.equal(waveSpy.waveCalls().length, beforeCalls);

    const traces = await dbQuery('SELECT id FROM wave_checkout_events WHERE subscription_id = $1', [subId]);
    assert.equal(traces.length, 0);
  });

  it('souscription d’un autre vendeur → 404 non divulgateur, 0 appel Wave', async () => {
    const owner = await registerUser(server, 'waveowner');
    const other = await registerUser(server, 'waveother');
    const subId = await subscribe(owner, 'wave-autre-vendeur');
    const beforeCalls = waveSpy.waveCalls().length;

    const res = await other.client.post('/api/wave/checkout/sessions', { subscriptionId: subId });
    assert.equal(res.status, 404);
    assert.equal(errorCode(res.body), 'WAVE_SUBSCRIPTION_NOT_FOUND');
    assert.equal((res.body as any).error.message, 'Abonnement introuvable');
    assert.equal(waveSpy.waveCalls().length, beforeCalls);
  });

  it('souscription ACTIVE → 409 WAVE_SUBSCRIPTION_NOT_PENDING, 0 appel Wave', async () => {
    const user = await registerUser(server, 'waveactive');
    const subId = await subscribe(user, 'wave-active-sub');
    const activation = await admin.post(`/api/admin/subscriptions/${subId}/activate`, {});
    assert.equal(activation.status, 200);

    const beforeCalls = waveSpy.waveCalls().length;
    const res = await user.client.post('/api/wave/checkout/sessions', { subscriptionId: subId });
    assert.equal(res.status, 409);
    assert.equal(errorCode(res.body), 'WAVE_SUBSCRIPTION_NOT_PENDING');
    assert.equal(waveSpy.waveCalls().length, beforeCalls);
  });

  it('souscription orange_money → 409 WAVE_PAYMENT_METHOD_MISMATCH, 0 appel Wave', async () => {
    const user = await registerUser(server, 'waveom');
    const subId = await subscribe(user, 'wave-om-sub', 1, 'orange_money');
    const beforeCalls = waveSpy.waveCalls().length;

    const res = await user.client.post('/api/wave/checkout/sessions', { subscriptionId: subId });
    assert.equal(res.status, 409);
    assert.equal(errorCode(res.body), 'WAVE_PAYMENT_METHOD_MISMATCH');
    assert.equal(waveSpy.waveCalls().length, beforeCalls);
  });

  it('GET /api/subscriptions/me : wavePaymentPending vrai pour Wave PENDING, faux sinon, absent si aucune souscription', async () => {
    const waveUser = await registerUser(server, 'wavependingme');
    await subscribe(waveUser, 'wave-pending-me');
    const waveRes = await waveUser.client.get('/api/subscriptions/me');
    assert.equal(waveRes.status, 200);
    assert.equal((waveRes.body as any).subscription.status, 'PENDING');
    assert.equal((waveRes.body as any).subscription.wavePaymentPending, true);

    const omUser = await registerUser(server, 'waveomme');
    await subscribe(omUser, 'wave-om-me', 1, 'virement');
    const omRes = await omUser.client.get('/api/subscriptions/me');
    assert.equal((omRes.body as any).subscription.wavePaymentPending, false);

    const noSubUser = await registerUser(server, 'wavenosub');
    const noSubRes = await noSubUser.client.get('/api/subscriptions/me');
    assert.equal(noSubRes.status, 200);
    assert.equal((noSubRes.body as any).subscription, null);
    assert.equal('wavePaymentPending' in ((noSubRes.body as any).subscription ?? {}), false);
  });

  it('GET /api/wave/admin/events : 401 anonyme, 403 user, 400 per_page hors bornes', async () => {
    const anonymous = await server.newClient().get('/api/wave/admin/events');
    assert.equal(anonymous.status, 401);

    const user = await registerUser(server, 'waveadminrefus');
    const forbidden = await user.client.get('/api/wave/admin/events');
    assert.equal(forbidden.status, 403);
    assert.equal(errorCode(forbidden.body), 'FORBIDDEN');

    const invalid = await admin.get('/api/wave/admin/events?per_page=49');
    assert.equal(invalid.status, 400);
    assert.equal(errorCode(invalid.body), 'VALIDATION_ERROR');
    assert.equal((invalid.body as any).error.details[0].field, 'per_page');
  });

  it('GET /api/wave/admin/events : file paginée et intention SESSION_CREATED sans exposition publique', async () => {
    const user = await registerUser(server, 'wavetrace');
    const subId = await subscribe(user, 'wave-trace-admin');
    await dbQuery(
      `INSERT INTO wave_checkout_events
         (client_reference, subscription_id, seller_id, amount_fcfa, currency, status)
       VALUES ($1, $2, $3, 2000, 'XOF', 'SESSION_CREATED')`,
      [`wave-sub-${subId}-01234567`, subId, user.id],
    );

    const res = await admin.get('/api/wave/admin/events?subscriptionId=' + subId + '&page=1&per_page=12');
    assert.equal(res.status, 200);
    assert.equal((res.body as any).perPage, 12);
    assert.equal((res.body as any).total, 1);
    assert.equal((res.body as any).totalPages, 1);
    const item = (res.body as any).items[0];
    assert.equal(item.subscriptionId, subId);
    assert.equal(item.eventId, null);
    assert.equal(item.sessionId, null);
    assert.equal(item.eventType, null);
    assert.equal(item.status, 'SESSION_CREATED');
    assert.equal(item.amountFcfa, 2000);

    const publicRes = await user.client.get('/api/wave/admin/events');
    assert.equal(publicRes.status, 403);
  });

  it('aucun appel réseau Wave sur toute la suite désactivée', () => {
    assert.equal(waveSpy.waveCalls().length, 0);
  });
});
