/**
 * Tests du middleware CSRF — double soumission (`middleware/csrf.ts`).
 *
 * Le bypass `NODE_ENV=test` est **désactivé** via `enforce: true` : on teste donc
 * le comportement réel de production sur une app Express minimale.
 */
import './env.js';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Server } from 'node:http';
import express, { type NextFunction, type Request, type Response } from 'express';
import { createCsrfProtection, CSRF_COOKIE } from '../src/middleware/csrf.js';

const ORIGIN = 'https://app.test';

/** Monte le middleware (enforce) sur une app minimale et exécute le scénario. */
async function withServer(fn: (baseUrl: string) => Promise<void>): Promise<void> {
  const app = express();
  const csrf = createCsrfProtection({ enforce: true, origins: [ORIGIN], cookieSecure: false });
  app.use('/api', csrf);
  app.get('/api/ping', (_req: Request, res: Response) => {
    res.status(204).end();
  });
  app.post('/api/mutate', (_req: Request, res: Response) => {
    res.status(204).end();
  });
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    res.status(500).json({ error: err.message });
  });

  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const addr = server.address();
  if (typeof addr !== 'object' || addr === null) throw new Error('adresse non résolue');
  const baseUrl = `http://127.0.0.1:${addr.port}`;
  try {
    await fn(baseUrl);
  } finally {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
      server.closeAllConnections?.();
    });
  }
}

test('GET pose un cookie csrf_token lisible (jamais HttpOnly)', async () => {
  await withServer(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/ping`);
    assert.equal(res.status, 204);
    const setCookie = res.headers.get('set-cookie') ?? '';
    assert.match(setCookie, /csrf_token=/);
    assert.doesNotMatch(setCookie.toLowerCase(), /httponly/);
  });
});

test('POST sans cookie CSRF ni Origin (client non navigateur) → 403 CSRF_INVALID', async () => {
  await withServer(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/mutate`, { method: 'POST' });
    assert.equal(res.status, 403);
    const body = (await res.json()) as { error: { code: string } };
    assert.equal(body.error.code, 'CSRF_INVALID');
  });
});

test('POST avec cookie CSRF mais sans en-tête → 403 CSRF_INVALID', async () => {
  await withServer(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/mutate`, {
      method: 'POST',
      headers: { cookie: `${CSRF_COOKIE}=abc123` },
    });
    assert.equal(res.status, 403);
    const body = (await res.json()) as { error: { code: string } };
    assert.equal(body.error.code, 'CSRF_INVALID');
  });
});

test('POST avec cookie CSRF + en-tête correspondant → accepté', async () => {
  await withServer(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/mutate`, {
      method: 'POST',
      headers: { cookie: `${CSRF_COOKIE}=s3cr3t`, 'x-csrf-token': 's3cr3t' },
    });
    assert.equal(res.status, 204);
  });
});

test('POST avec cookie CSRF + en-tête divergent → 403', async () => {
  await withServer(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/mutate`, {
      method: 'POST',
      headers: { cookie: `${CSRF_COOKIE}=s3cr3t`, 'x-csrf-token': 'autre' },
    });
    assert.equal(res.status, 403);
  });
});

test('POST depuis une origine NON autorisée → 403', async () => {
  await withServer(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/mutate`, {
      method: 'POST',
      headers: { origin: 'https://evil.test' },
    });
    assert.equal(res.status, 403);
  });
});

test('POST depuis une origine autorisée (sans cookie CSRF) → 403 CSRF_INVALID', async () => {
  await withServer(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/mutate`, {
      method: 'POST',
      headers: { origin: ORIGIN },
    });
    assert.equal(res.status, 403);
    const body = (await res.json()) as { error: { code: string } };
    assert.equal(body.error.code, 'CSRF_INVALID');
  });
});

test('parcours réel : GET remet le jeton (maxAge 7 j), POST cookie + en-tête → 204', async () => {
  await withServer(async (baseUrl) => {
    const getRes = await fetch(`${baseUrl}/api/ping`);
    assert.equal(getRes.status, 204);
    const setCookie = getRes.headers.get('set-cookie') ?? '';
    const match = setCookie.match(/csrf_token=([^;]+)/);
    assert.ok(match, 'le GET pose le cookie csrf_token');
    // maxAge aligné sur la session (config.sessionMaxAgeMs = 7 j = 604800 s).
    assert.match(setCookie, /max-age=604800/i, 'durée de vie alignée sur la session');

    const token = match[1]!;
    const postRes = await fetch(`${baseUrl}/api/mutate`, {
      method: 'POST',
      headers: { cookie: `${CSRF_COOKIE}=${token}`, 'x-csrf-token': token },
    });
    assert.equal(postRes.status, 204);
  });
});
