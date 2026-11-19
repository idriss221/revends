/**
 * V9 — endpoints Wave de diagnostic (CA-V9-013 / CA-V9-018).
 *
 * Le client serveur sait lire une session et rechercher par `client_reference`,
 * mais ces appels ne sont JAMAIS une preuve d'activation : seul le webhook
 * signé peut activer. Tout est injecté (`fetchImpl`) : aucune clé réelle, aucun
 * appel réseau Wave, aucune route HTTP supplémentaire.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setWaveEnv, spyFetchWave, type WaveFetchSpy } from './helpers-wave.js';

const FAKE_API_KEY = 'wave-diagnostic-key-local-only';
setWaveEnv({ enabled: false });

const { bootTestServer, registerUser, dbQuery } = await import('./helpers.js');
const { flushAfterCommit } = await import('../src/utils/db.js');
const { clearSentMails, recentSentMails } = await import('../src/mail/mailer.js');
const { createWaveClient } = await import('../src/services/wave-client.service.js');
const { buildWaveClientReference } = await import('../src/services/wave-checkout.service.js');

type ServerHandle = Awaited<ReturnType<typeof bootTestServer>>;
type TestUser = Awaited<ReturnType<typeof registerUser>>;

interface RecordedCall {
  url: string;
  method?: string;
  authorization: string;
  body?: string;
}

let server: ServerHandle;
let waveSpy: WaveFetchSpy;

function jsonReply(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function injectedClient(responder: (url: string) => Response) {
  const calls: RecordedCall[] = [];
  const client = createWaveClient({
    baseUrl: 'https://api.wave.test/',
    apiKey: FAKE_API_KEY,
    fetchImpl: async (url, init) => {
      calls.push({
        url,
        method: init?.method,
        authorization: String(Object.entries(init?.headers ?? {}).find(([key]) => key === 'Authorization')?.[1] ?? ''),
        body: typeof init?.body === 'string' ? init.body : undefined,
      });
      return responder(url);
    },
  });
  return { client, calls };
}

async function subscribe(user: TestUser, slug: string): Promise<number> {
  const res = await user.client.post('/api/subscriptions', {
    planId: 1,
    slug,
    paymentMethod: 'wave',
    paymentReference: `REF-${slug.toUpperCase()}`,
  });
  assert.equal(res.status, 201, `subscribe → ${res.status} ${JSON.stringify(res.body)}`);
  return (res.body as any).subscription.id as number;
}

function session(overrides: Record<string, unknown> = {}) {
  return {
    id: 'cos-v9-diagnostic',
    amount: '2000',
    currency: 'XOF',
    checkout_status: 'open',
    payment_status: 'processing',
    client_reference: 'wave-sub-1-01234567',
    wave_launch_url: 'https://pay.wave.com/c/cos-v9-diagnostic',
    when_created: '2026-11-19T10:00:00Z',
    ...overrides,
  };
}

before(async () => {
  waveSpy = spyFetchWave(() => {
    throw new Error('aucun appel réseau Wave n’est autorisé dans ce fichier de test');
  });
  server = await bootTestServer();
});

after(async () => {
  waveSpy.restore();
  await server.close();
});

describe('V9 — diagnostics Wave : client uniquement, jamais une preuve d’activation', () => {
  it('CA-V9-018 — retrieveCheckoutSession : URL exacte, GET, Bearer, réponse typée', async () => {
    const payload = session({ checkout_status: 'complete', payment_status: 'succeeded' });
    const { client, calls } = injectedClient(() => jsonReply(payload));

    const result = await client.retrieveCheckoutSession('cos-v9-diagnostic');

    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.url, 'https://api.wave.test/v1/checkout/sessions/cos-v9-diagnostic');
    assert.equal(calls[0]!.method, 'GET');
    assert.equal(calls[0]!.authorization, `Bearer ${FAKE_API_KEY}`);
    assert.equal(calls[0]!.body, undefined);
    assert.deepEqual(result, payload);
    assert.equal(result.checkout_status, 'complete');
    assert.equal(waveSpy.waveCalls().length, 0, 'fetchImpl injecté : 0 appel global');
  });

  it('CA-V9-013/018 — searchCheckoutSessions : URL exacte, query, Bearer, réponse { result: [...] }', async () => {
    const reference = 'wave-sub-77-a1b2c3d4';
    const payload = { result: [session({ client_reference: reference })] };
    const { client, calls } = injectedClient(() => jsonReply(payload));

    const result = await client.searchCheckoutSessions(reference);

    assert.equal(calls.length, 1);
    assert.equal(
      calls[0]!.url,
      `https://api.wave.test/v1/checkout/sessions/search?client_reference=${reference}`,
    );
    assert.equal(calls[0]!.method, 'GET');
    assert.equal(calls[0]!.authorization, `Bearer ${FAKE_API_KEY}`);
    assert.deepEqual(result, payload);
    assert.equal(result.result[0]!.client_reference, reference);
    assert.equal(waveSpy.waveCalls().length, 0);
  });

  it('les deux identifiants sont encodés dans l’URL (chemin et query)', async () => {
    const { client: retrieveClient, calls: retrieveCalls } = injectedClient(() => jsonReply(session()));
    await retrieveClient.retrieveCheckoutSession('cos-a/b c+d&e');
    assert.equal(
      retrieveCalls[0]!.url,
      'https://api.wave.test/v1/checkout/sessions/cos-a%2Fb%20c%2Bd%26e',
    );

    const { client: searchClient, calls: searchCalls } = injectedClient(() => jsonReply({ result: [] }));
    await searchClient.searchCheckoutSessions('a b/c+d&e=f');
    assert.equal(
      searchCalls[0]!.url,
      'https://api.wave.test/v1/checkout/sessions/search?client_reference=a%20b%2Fc%2Bd%26e%3Df',
    );
  });

  it('CA-V9-013 — référence stable, unique, retrouvée par le mock search ET par la table de suivi', async () => {
    const user = await registerUser(server, 'wavediagref');
    const first = await subscribe(user, 'wave-diag-ref-first');
    const second = await subscribe(user, 'wave-diag-ref-second');
    const reference = buildWaveClientReference(first);
    const otherReference = buildWaveClientReference(second);

    assert.equal(reference, buildWaveClientReference(first), 'référence stable');
    assert.notEqual(reference, otherReference, 'référence unique par souscription');
    assert.ok(reference.length > 0 && reference.length <= 255);

    const tracesBefore = (await dbQuery('SELECT COUNT(*)::text AS n FROM wave_checkout_events WHERE subscription_id = $1', [first]))[0]!.n;
    await dbQuery(
      `INSERT INTO wave_checkout_events
         (client_reference, subscription_id, seller_id, amount_fcfa, currency, status)
       VALUES ($1, $2, $3, 2000, 'XOF', 'SESSION_CREATED')`,
      [reference, first, user.id],
    );

    const { client, calls } = injectedClient(() => jsonReply({ result: [session({ client_reference: reference })] }));
    const found = await client.searchCheckoutSessions(reference);
    assert.equal(found.result.length, 1);
    assert.equal(found.result[0]!.client_reference, reference);
    assert.equal(calls[0]!.url.endsWith(`client_reference=${encodeURIComponent(reference)}`), true);

    const rows = await dbQuery<{ subscription_id: number; seller_id: number; status: string }>(
      'SELECT subscription_id, seller_id, status FROM wave_checkout_events WHERE client_reference = $1',
      [reference],
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.subscription_id, first);
    assert.equal(rows[0]!.seller_id, user.id);
    assert.equal(rows[0]!.status, 'SESSION_CREATED');
    assert.equal(
      (await dbQuery('SELECT COUNT(*)::text AS n FROM wave_checkout_events WHERE subscription_id = $1', [first]))[0]!.n,
      String(Number(tracesBefore) + 1),
    );
  });

  it('CA-V9-018 — session COMPLETED retrouvée par GET sans webhook : PENDING, 0 activation, 0 e-mail, 0 écriture', async () => {
    const user = await registerUser(server, 'wavediagcompleted');
    const subscriptionId = await subscribe(user, 'wave-diag-completed');
    await flushAfterCommit();
    clearSentMails();

    const before = (
      await dbQuery<{ status: string; activated_by: number | null; started_at: string | null }>(
        'SELECT status, activated_by, started_at FROM seller_subscriptions WHERE id = $1',
        [subscriptionId],
      )
    )[0]!;
    const tracesBefore = (
      await dbQuery('SELECT COUNT(*)::text AS n FROM wave_checkout_events WHERE subscription_id = $1', [subscriptionId])
    )[0]!.n;

    const { client } = injectedClient(() =>
      jsonReply(
        session({
          id: 'cos-v9-diag-completed',
          client_reference: buildWaveClientReference(subscriptionId),
          checkout_status: 'complete',
          payment_status: 'succeeded',
        }),
      ),
    );
    const found = await client.retrieveCheckoutSession('cos-v9-diag-completed');
    assert.equal(found.checkout_status, 'complete');
    assert.equal(found.payment_status, 'succeeded');

    const after = (
      await dbQuery<{ status: string; activated_by: number | null; started_at: string | null }>(
        'SELECT status, activated_by, started_at FROM seller_subscriptions WHERE id = $1',
        [subscriptionId],
      )
    )[0]!;
    assert.deepEqual(after, before);
    assert.equal(after.status, 'PENDING');
    assert.equal(after.activated_by, null);
    assert.equal(
      (await dbQuery('SELECT COUNT(*)::text AS n FROM wave_checkout_events WHERE subscription_id = $1', [subscriptionId]))[0]!.n,
      tracesBefore,
      '0 écriture de trace',
    );

    await flushAfterCommit();
    assert.equal(recentSentMails().length, 0, '0 e-mail');

    const me = await user.client.get('/api/subscriptions/me');
    assert.equal((me.body as any).subscription.status, 'PENDING');
    assert.equal((me.body as any).subscription.wavePaymentPending, true);
    assert.equal(waveSpy.waveCalls().length, 0);
  });

  it('erreur réseau : WAVE_UPSTREAM_ERROR explicite, sans clé, 0 écriture', async () => {
    const user = await registerUser(server, 'wavediagnetwork');
    const subscriptionId = await subscribe(user, 'wave-diag-network');
    await flushAfterCommit();
    clearSentMails();
    const tracesBefore = (
      await dbQuery('SELECT COUNT(*)::text AS n FROM wave_checkout_events WHERE subscription_id = $1', [subscriptionId])
    )[0]!.n;

    const { client } = injectedClient(() => {
      throw new Error('réseau Wave simulé indisponible');
    });

    await assert.rejects(
      client.retrieveCheckoutSession('cos-v9-diag-network'),
      (error: any) => {
        assert.equal(error.code, 'WAVE_UPSTREAM_ERROR');
        assert.equal(error.status, 502);
        assert.equal(error.message, "Impossible d'ouvrir Wave pour le moment. Le paiement manuel reste disponible ci-dessous.");
        assert.equal(error.message.includes(FAKE_API_KEY), false);
        return true;
      },
    );
    await assert.rejects(
      client.searchCheckoutSessions('wave-sub-1-broken'),
      (error: any) => error.code === 'WAVE_UPSTREAM_ERROR',
    );

    const sub = (await dbQuery('SELECT status, activated_by FROM seller_subscriptions WHERE id = $1', [subscriptionId]))[0]!;
    assert.equal(sub.status, 'PENDING');
    assert.equal(sub.activated_by, null);
    assert.equal(
      (await dbQuery('SELECT COUNT(*)::text AS n FROM wave_checkout_events WHERE subscription_id = $1', [subscriptionId]))[0]!.n,
      tracesBefore,
    );
    await flushAfterCommit();
    assert.equal(recentSentMails().length, 0);
  });

  it('HTTP 500 : erreur explicite pour les deux méthodes, 0 écriture', async () => {
    const user = await registerUser(server, 'wavediag500');
    const subscriptionId = await subscribe(user, 'wave-diag-500');
    await flushAfterCommit();
    clearSentMails();
    const tracesBefore = (
      await dbQuery('SELECT COUNT(*)::text AS n FROM wave_checkout_events WHERE subscription_id = $1', [subscriptionId])
    )[0]!.n;

    const { client } = injectedClient(() => jsonReply({ error: 'internal-server-error' }, 500));
    for (const call of [
      () => client.retrieveCheckoutSession('cos-v9-diag-500'),
      () => client.searchCheckoutSessions('wave-sub-1-500'),
    ]) {
      await assert.rejects(call(), (error: any) => {
        assert.equal(error.code, 'WAVE_UPSTREAM_ERROR');
        assert.equal(error.status, 502);
        assert.equal(String(error.message).includes(FAKE_API_KEY), false);
        return true;
      });
    }

    const sub = (await dbQuery('SELECT status, activated_by FROM seller_subscriptions WHERE id = $1', [subscriptionId]))[0]!;
    assert.equal(sub.status, 'PENDING');
    assert.equal(sub.activated_by, null);
    assert.equal(
      (await dbQuery('SELECT COUNT(*)::text AS n FROM wave_checkout_events WHERE subscription_id = $1', [subscriptionId]))[0]!.n,
      tracesBefore,
    );
    await flushAfterCommit();
    assert.equal(recentSentMails().length, 0);
  });

  it('aucune route HTTP de diagnostic n’est exposée par /api/wave', async () => {
    const user = await registerUser(server, 'wavediagroute');
    const retrieve = await user.client.get('/api/wave/checkout/sessions/cos-v9-diagnostic');
    const search = await user.client.get('/api/wave/checkout/sessions/search?client_reference=wave-sub-1-01234567');
    assert.equal(retrieve.status, 404);
    assert.equal(search.status, 404);
    assert.equal(waveSpy.waveCalls().length, 0);
  });
});
