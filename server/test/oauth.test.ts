/**
 * OAuth — connexion Google et Facebook
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { bootTestServer, dbQuery } from './helpers.js';
import type { ServerHandle } from './helpers.js';

let server: ServerHandle;

before(async () => {
  server = await bootTestServer();
});

after(async () => {
  await server?.close();
});

describe('OAuth configuration', () => {
  it('non configuré → 503 OAUTH_NOT_CONFIGURED', async () => {
    const res = await server.newClient().get('/api/auth/google');
    assert.equal(res.status, 503);
    const body = res.body as any;
    assert.equal(body.error.code, 'OAUTH_NOT_CONFIGURED');
  });
});

describe('OAuth Google', () => {
  it('configuré → /api/auth/google renvoie 302 avec paramètres requis', async () => {
    const res = await server.newClient().get('/api/auth/google');
    // En environnement test, les creds peuvent être définis dans .env; 
    // si configurés, doit rediriger
    if (res.status === 503) {
      // Skip if not configured in env
      assert.equal(res.body.error.code, 'OAUTH_NOT_CONFIGURED');
      return;
    }
    assert.equal(res.status, 302);
    const location = res.headers.get('location');
    assert.ok(location);
    assert.ok(location.includes('client_id'));
    assert.ok(location.includes('redirect_uri'));
    assert.ok(location.includes('state'));
    assert.ok(location.includes('scope'));
    assert.ok(location.includes('openid'));
    assert.ok(location.includes('email'));
    assert.ok(location.includes('profile'));
  });

  it('callback avec mauvais state → 302 vers ?oauth=error', async () => {
    const res = await server.newClient().get('/api/auth/google/callback?code=fake&state=wrong');
    assert.equal(res.status, 302);
    const location = res.headers.get('location');
    assert.ok(location);
    assert.ok(location.includes('oauth=error'));
  });
});

describe('OAuth Facebook', () => {
  it('configuré → /api/auth/facebook renvoie 302 avec paramètres requis', async () => {
    const res = await server.newClient().get('/api/auth/facebook');
    if (res.status === 503) {
      assert.equal(res.body.error.code, 'OAUTH_NOT_CONFIGURED');
      return;
    }
    assert.equal(res.status, 302);
    const location = res.headers.get('location');
    assert.ok(location);
    assert.ok(location.includes('client_id'));
    assert.ok(location.includes('redirect_uri'));
    assert.ok(location.includes('state'));
    assert.ok(location.includes('scope'));
    assert.ok(location.includes('email'));
  });

  it('callback avec mauvais state → 302 vers ?oauth=error', async () => {
    const res = await server.newClient().get('/api/auth/facebook/callback?code=fake&state=wrong');
    assert.equal(res.status, 302);
    const location = res.headers.get('location');
    assert.ok(location);
    assert.ok(location.includes('oauth=error'));
  });
});

describe('findOrCreateOAuthUser', () => {
  it('crée puis retourne le même user (idempotent)', async () => {
    const { findOrCreateOAuthUser } = await import('../src/services/oauth.service.js');
    const user1 = await findOrCreateOAuthUser({
      provider: 'test',
      providerId: '123',
      email: 'oauth-test@example.com',
      name: 'OAuth Test User',
    });
    assert.ok(user1.id);
    assert.equal(user1.email, 'oauth-test@example.com');
    const [count1] = await dbQuery<{ count: string }>('SELECT COUNT(*) as count FROM users WHERE email = $1', ['oauth-test@example.com']);
    assert.equal(parseInt(count1.count), 1);
    const user2 = await findOrCreateOAuthUser({
      provider: 'test',
      providerId: '123',
      email: 'oauth-test@example.com',
      name: 'OAuth Test User',
    });
    assert.equal(user1.id, user2.id);
    const [count2] = await dbQuery<{ count: string }>('SELECT COUNT(*) as count FROM users WHERE email = $1', ['oauth-test@example.com']);
    assert.equal(parseInt(count2.count), 1);
  });
});
