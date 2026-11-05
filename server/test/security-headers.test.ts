/**
 * En-têtes de sécurité — non-régression CSP images.
 *
 * Contexte : les photos produit sont sur Vercel Blob, donc sur une origine
 * différente. La CSP par défaut de Helmet (`img-src 'self' data:`) bloque ces
 * images : le fichier répond 200 mais le navigateur affiche une image cassée.
 * Le commit 77269eb a supprimé la directive et cassé toutes les photos en
 * production. Ce test verrouille les sources autorisées.
 */
import './env.js';
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, type ServerHandle } from './helpers.js';

describe('CSP — images Vercel Blob autorisées', () => {
  let server: ServerHandle;

  before(async () => {
    server = await startTestServer();
  });

  after(async () => {
    await server.close();
  });

  it('img-src autorise blob: et *.public.blob.vercel-storage.com', async () => {
    const res = await fetch(`${server.baseUrl}/api/health`);
    assert.equal(res.status, 200);
    const csp = res.headers.get('content-security-policy') ?? '';
    assert.match(csp, /img-src[^;]*'self'/, 'img-src présent et autorise same-origin');
    assert.match(csp, /img-src[^;]*data:/, 'data: autorisé (aperçus locaux)');
    assert.match(csp, /img-src[^;]*blob:/, 'blob: autorisé (aperçus avant upload)');
    assert.match(
      csp,
      /img-src[^;]*https:\/\/\*\.public\.blob\.vercel-storage\.com/,
      'le store Blob public doit être autorisé (photos produit en production)',
    );
  });
});
