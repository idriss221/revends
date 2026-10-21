/**
 * Observabilité (WS5) :
 * - CA-V5-090 : journalisation structurée unique, sans secret/PII, corrélée.
 * - CA-V5-091 : `/api/health` et `/health` répondent 200 `{status:'ok'}` MÊME
 *   si la base de données est injoignable (test de non-régression).
 *
 * Fichier exécuté isolément par le runner (`npm test`) ; `./env.js` d'abord.
 */
import './env.js';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Request, Response, NextFunction } from 'express';
import { redact, scrubSecrets, describeError, logger } from '../src/utils/logger.js';
import { errorHandler } from '../src/middleware/errors.js';
import { requestId } from '../src/middleware/request-id.js';
import { startTestServer } from './helpers.js';
import { pool } from '../src/db/pool.js';

// ---------------------------------------------------------------------------
// Capture d'un flux de sortie le temps d'un callback synchrone.
// ---------------------------------------------------------------------------
function capture(stream: 'stdout' | 'stderr', run: () => void): string {
  const original = process[stream].write.bind(process[stream]);
  let out = '';
  (process[stream] as unknown as { write: (c: unknown) => boolean }).write = (chunk: unknown) => {
    out += String(chunk);
    return true;
  };
  try {
    run();
  } finally {
    (process[stream] as unknown as { write: typeof original }).write = original;
  }
  return out;
}

const srcDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src');

describe('logger — flux JSON unique (CA-V5-090)', () => {
  it('écrit une ligne JSON sur stderr en niveau error', () => {
    const out = capture('stderr', () => logger.error('échec de test', { code: 'X', status: 500 }));
    assert.equal(out.split('\n').filter(Boolean).length, 1, 'exactement une ligne');
    const entry = JSON.parse(out.trim());
    assert.equal(entry.level, 'error');
    assert.equal(entry.msg, 'échec de test');
    assert.equal(entry.code, 'X');
    assert.equal(entry.status, 500);
    assert.ok(typeof entry.ts === 'string' && !Number.isNaN(Date.parse(entry.ts)), 'ts ISO valide');
  });

  it('écrit info/warn/debug sur stdout (jamais sur stderr)', () => {
    const stdout = capture('stdout', () => {
      logger.info('i');
      logger.warn('w');
      logger.debug('d');
    });
    const stderr = capture('stderr', () => {
      logger.info('i');
      logger.warn('w');
      logger.debug('d');
    });
    assert.equal(stdout.split('\n').filter(Boolean).length, 3);
    assert.equal(stderr, '', 'aucun niveau non-error sur stderr');
  });

  it('masque les clés sensibles et les données personnelles (redact)', () => {
    const masked = redact({
      password: 'hunter2',
      sessionSecret: 'abc',
      csrfToken: 'xyz',
      email: 'a@b.c',
      phone: '+225 07',
      route: '/api/x',
      nested: { apiKey: 'k', correlationId: 'cid', userId: 7 },
    }) as Record<string, unknown>;
    const flat = JSON.stringify(masked);
    for (const secret of ['hunter2', 'abc', 'xyz', 'a@b.c', '+225 07', '"k"']) {
      assert.equal(flat.includes(secret), false, `« ${secret} » ne doit pas apparaître`);
    }
    // Les champs non sensibles sont conservés.
    assert.equal(masked.route, '/api/x');
    assert.equal((masked.nested as Record<string, unknown>).correlationId, 'cid');
    assert.equal((masked.nested as Record<string, unknown>).userId, 7);
  });

  it('scrubSecrets neutralise les secrets présents DANS une valeur', () => {
    const cases: [string, string][] = [
      ['postgres://admin:sup3rs3cret@db:5432/revends', 'sup3rs3cret'],
      ['password=hunter2 reste', 'hunter2'],
      ['Authorization: Bearer abc.def.ghi', 'abc.def.ghi'],
      ['token: "tok_live_123"', 'tok_live_123'],
    ];
    for (const [input, secret] of cases) {
      const scrubbed = scrubSecrets(input);
      assert.equal(scrubbed.includes(secret), false, `« ${secret} » non masqué dans « ${input} »`);
      assert.ok(scrubbed.includes('[redacted]'), 'marqueur [redacted] présent');
    }
  });

  it("un message d'erreur contenant un secret est masqué à l'écriture", () => {
    const out = capture('stderr', () =>
      logger.error('erreur', describeError(new Error('connect ECONNREFUSED (password=hunter2)'))),
    );
    assert.equal(out.includes('hunter2'), false, 'jamais de secret dans la sortie');
    assert.ok(out.includes('[redacted]'));
  });

  it('describeError borne la pile et ne lève jamais', () => {
    const err = new Error('boom');
    const fields = describeError(err);
    assert.equal(fields.errorName, 'Error');
    assert.equal(fields.errorMessage, 'boom');
    assert.ok(typeof fields.stack === 'string');
    assert.ok((fields.stack as string).split('\n').length <= 6, 'pile bornée à 6 lignes');
    // Entrée non-Error.
    assert.deepEqual(describeError('simple'), { errorMessage: 'simple' });
    assert.deepEqual(describeError(42), { errorMessage: '42' });
  });

  it('aucun console.* libre dans src/ (homogénéité de la journalisation)', async () => {
    const files = (await readdir(srcDir, { recursive: true })).filter((f) => f.endsWith('.ts'));
    assert.ok(files.length > 10, 'le scan couvre bien le code source');
    const offenders: string[] = [];
    for (const rel of files) {
      const content = await readFile(path.join(srcDir, rel), 'utf8');
      if (/console\.(log|error|warn|info|debug)\s*\(/.test(content)) offenders.push(rel);
    }
    assert.deepEqual(offenders, [], 'toute journalisation doit passer par logger');
  });
});

describe('errorHandler — journalisation corrélée (CA-V5-090)', () => {
  const call = (status401 = false): string => {
    const res: any = {
      locals: { correlationId: 'cid-123' },
      status(c: number) { this._status = c; return res; },
      json() { return res; },
      setHeader() { return res; },
    };
    const req = { originalUrl: '/api/things?token=secret', method: 'GET', path: '/api/things' } as unknown as Request;
    const err = status401
      ? Object.assign(new Error('client'), { status: 401, code: 'UNAUTHORIZED' })
      : Object.assign(new Error('boom'), {});
    return capture('stderr', () => errorHandler(err, req, res, (() => undefined) as NextFunction));
  };

  it('journalise route, méthode et correlationId sans query string', () => {
    const out = call();
    const entry = JSON.parse(out.trim().split('\n').pop() as string);
    assert.equal(entry.route, '/api/things', 'query string retirée');
    assert.equal(entry.method, 'GET');
    assert.equal(entry.correlationId, 'cid-123');
  });
});

describe('requestId — corrélation par requête (CA-V5-090)', () => {
  it('reprend X-Request-Id entrant et le renvoie', () => {
    const res: any = { locals: {}, setHeader(k: string, v: string) { this._h = { [k]: v }; return res; } };
    const req = { get: (h: string) => (h.toLowerCase() === 'x-request-id' ? 'cid-abc' : undefined) } as unknown as Request;
    requestId(req, res as unknown as Response, (() => undefined) as NextFunction);
    assert.equal((res.locals as any).correlationId, 'cid-abc');
    assert.equal((res._h as any)['X-Request-Id'], 'cid-abc');
  });

  it('génère un UUID quand aucun en-tête valable n’est fourni', () => {
    const res: any = { locals: {}, setHeader() { return res; } };
    const req = { get: () => undefined } as unknown as Request;
    requestId(req, res as unknown as Response, (() => undefined) as NextFunction);
    assert.match(String((res.locals as any).correlationId), /^[0-9a-f-]{36}$/i);
  });
});

describe('CA-V5-091 — santé indépendante de la base de données', () => {
  it('/api/health et /health → 200 {status:"ok"} même BDD injoignable', async () => {
    const server = await startTestServer();
    const client = server.newClient();
    const originalQuery = pool.query;
    // Simule une base de données HS : toute requête échoue.
    (pool as unknown as { query: unknown }).query = () => Promise.reject(new Error('DB down (simulé)'));
    try {
      const api = await client.get('/api/health');
      assert.equal(api.status, 200, 'probe API toujours 200');
      assert.deepEqual(api.body, { status: 'ok' });

      const root = await client.get('/health');
      assert.equal(root.status, 200, 'alias root toujours 200');
      assert.deepEqual(root.body, { status: 'ok' });

      const sys = await client.get('/api/system/health');
      assert.equal(sys.status, 200, 'probe détaillée toujours 200');
      assert.equal((sys.body as any).status, 'ok');

      // Contraste : une route adossée à la BDD échoue bien (prouve le « DB down »).
      const dbBacked = await client.get('/api/categories');
      assert.equal(dbBacked.status, 500, 'une route BDD retourne 500 quand la BDD est HS');
    } finally {
      (pool as unknown as { query: unknown }).query = originalQuery;
      await server.close();
    }
  });
});
