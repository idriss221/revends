/**
 * AUTH — US-AUTH 01/02/03 : register, login email/téléphone, erreur générique,
 * me, logout idempotent, 403 user↔admin. Base DDL fraîche par suite.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { bootTestServer, registerUser, loginAdmin, ApiClient, dbQuery, errorCode } from './helpers.js';
import type { ServerHandle } from './helpers.js';

let server: ServerHandle;

before(async () => {
  server = await bootTestServer();
});

after(async () => {
  await server?.close();
});

describe('POST /api/auth/register', () => {
  it('201 : compte créé, session posée, aucun mot de passe renvoyé (CA-AUTH01-01/04)', async () => {
    const a = server.newClient();
    const res = await a.request('/api/auth/register', 'POST', {
      json: {
        displayName: 'Aicha123',
        name: 'Aïcha Koné',
        email: 'aicha@example.com',
        phone: '+225 07 00 00 00 00',
        password: 'motdepasse123',
        acceptedCgu: true,
      },
    });
    assert.equal(res.status, 201);
    const body = res.body as any;
    assert.equal(body.user.role, 'user');
    assert.equal(body.user.displayName, 'Aicha123');
    assert.equal(body.user.email, 'aicha@example.com');
    assert.equal(typeof body.user.id, 'number');
    assert.equal(body.unreadNotifications, 0);
    assert.ok(!('password' in body.user), 'le mot de passe ne doit jamais être renvoyé');

    // Session immédiate : /api/auth/me répond avec ce profil (CA-AUTH01-04).
    const me = await a.get('/api/auth/me');
    assert.equal(me.status, 200);
    assert.equal((me.body as any).user.email, 'aicha@example.com');
  });

  it("e-mail déjà utilisé → 409 EMAIL_TAKEN (CA-AUTH01-02)", async () => {
    const a = server.newClient();
    await a.request('/api/auth/register', 'POST', {
      json: {
        displayName: 'Pseudo1',
        name: 'Nom Un',
        email: 'dup@example.com',
        phone: '+225 07 00 00 00 01',
        password: 'motdepasse123',
        acceptedCgu: true,
      },
    });
    const res = await server.newClient().request('/api/auth/register', 'POST', {
      json: {
        displayName: 'Pseudo2',
        name: 'Nom Deux',
        email: 'DUP@example.com', // insensible à la casse (normalisé)
        phone: '+225 07 00 00 00 02',
        password: 'motdepasse123',
        acceptedCgu: true,
      },
    });
    assert.equal(res.status, 409);
    assert.equal(errorCode(res.body), 'EMAIL_TAKEN');
    assert.match((res.body as any).error.message, /e-mail existe déjà/);
  });

  it('téléphone déjà utilisé → 409 PHONE_TAKEN', async () => {
    const phone = '+225 07 11 22 33 44';
    await server.newClient().request('/api/auth/register', 'POST', {
      json: {
        displayName: 'U1',
        name: 'Un',
        email: 'u1@example.com',
        phone,
        password: 'motdepasse123',
        acceptedCgu: true,
      },
    });
    const res = await server.newClient().request('/api/auth/register', 'POST', {
      json: {
        displayName: 'U2',
        name: 'Deux',
        email: 'u2@example.com',
        phone,
        password: 'motdepasse123',
        acceptedCgu: true,
      },
    });
    assert.equal(res.status, 409);
    assert.equal(errorCode(res.body), 'PHONE_TAKEN');
  });

  it('CGU non cochée → 400 (CA-AUTH01-01)', async () => {
    const res = await server.newClient().request('/api/auth/register', 'POST', {
      json: {
        displayName: 'SansCgu',
        name: 'X',
        email: 'nocgu@example.com',
        phone: '+225 07 00 00 00 09',
        password: 'motdepasse123',
        acceptedCgu: false,
      },
    });
    assert.equal(res.status, 400);
    assert.equal(errorCode(res.body), 'VALIDATION_ERROR');
  });

  it('CA-AUTH01-03 : mot de passe stocké HACHÉ (bcrypt), jamais en clair', async () => {
    const a = server.newClient();
    await a.request('/api/auth/register', 'POST', {
      json: {
        displayName: 'HashTest',
        name: 'H',
        email: 'hashtest@example.com',
        phone: '+225 07 00 00 00 10',
        password: 'clair-comme-de-l-eau',
        acceptedCgu: true,
      },
    });
    const [row] = await dbQuery<{ password_hash: string }>(
      'SELECT password_hash FROM users WHERE email = $1',
      ['hashtest@example.com'],
    );
    assert.ok(row, 'utilisateur en base');
    assert.notEqual(row.password_hash, 'clair-comme-de-l-eau');
    assert.match(row.password_hash, /^\$2[aby]\$/, 'hash bcrypt');
  });
});

describe('POST /api/auth/login (CA-AUTH02-01)', () => {
  let user: Awaited<ReturnType<typeof registerUser>>;
  before(async () => {
    user = await registerUser(server, 'login');
  });

  it('connexion par E-MAIL → 200 + role', async () => {
    const a = server.newClient();
    const res = await a.request('/api/auth/login', 'POST', { json: { identifier: user.email, password: user.password } });
    assert.equal(res.status, 200);
    assert.equal((res.body as any).user.role, 'user');
    assert.equal((res.body as any).user.displayName, user.displayName);
  });

  it('connexion par TÉLÉPHONE → 400 VALIDATION_ERROR (E1 : identifiant = e-mail uniquement, CA-AUTH04-07)', async () => {
    const a = server.newClient();
    const res = await a.request('/api/auth/login', 'POST', { json: { identifier: user.phone, password: user.password } });
    assert.equal(res.status, 400);
    assert.equal(errorCode(res.body), 'VALIDATION_ERROR');
  });

  it('mauvais mot de passe → 401 INVALID_CREDENTIALS, message GÉNÉRIQUE', async () => {
    const res = await server.newClient().request('/api/auth/login', 'POST', {
      json: { identifier: user.email, password: 'mauvais-mdp' },
    });
    assert.equal(res.status, 401);
    assert.equal(errorCode(res.body), 'INVALID_CREDENTIALS');
    assert.equal((res.body as any).error.message, 'Identifiants incorrects');
  });

  it('compte INCONNU → même 401 (aucune fuite d’information)', async () => {
    const res = await server.newClient().request('/api/auth/login', 'POST', {
      json: { identifier: 'personne@example.com', password: 'nimporte' },
    });
    assert.equal(res.status, 401);
    assert.equal(errorCode(res.body), 'INVALID_CREDENTIALS');
    assert.equal((res.body as any).error.message, 'Identifiants incorrects');
  });

  it('identifiant vide → 400 VALIDATION_ERROR', async () => {
    const res = await server.newClient().request('/api/auth/login', 'POST', {
      json: { identifier: '', password: 'x' },
    });
    assert.equal(res.status, 400);
  });
});

describe('GET /api/auth/me & logout (CA-AUTH02-02/03)', () => {
  it('me sans session → 401 UNAUTHENTICATED', async () => {
    const res = await server.newClient().get('/api/auth/me');
    assert.equal(res.status, 401);
    assert.equal(errorCode(res.body), 'UNAUTHENTICATED');
  });

  it('logout → 204, puis me → 401 (session serveur détruite)', async () => {
    const a = server.newClient();
    await a.post('/api/auth/register', {
      displayName: 'LogoutUser',
      name: 'L',
      email: 'logout@example.com',
      phone: '+225 07 00 00 00 11',
      password: 'motdepasse123',
      acceptedCgu: true,
    } as any);
    const out = await a.post('/api/auth/logout');
    assert.equal(out.status, 204);
    const me = await a.get('/api/auth/me');
    assert.equal(me.status, 401);
  });

  it('logout est IDEMPOTENT : re-logout → 204', async () => {
    const a = server.newClient();
    await a.post('/api/auth/logout');
    const again = await a.post('/api/auth/logout');
    assert.equal(again.status, 204);
  });
});

describe('Rôles : user vs admin (T04, CA-AUTH02-04 / CA-AUTH03-02)', () => {
  let userA: ApiClient;
  let admin: ApiClient;

  before(async () => {
    userA = (await registerUser(server, 'role-user')).client;
    admin = await loginAdmin(server);
  });

  it('user sur route ADMIN → 403 FORBIDDEN', async () => {
    const res = await userA.get('/api/admin/stats');
    assert.equal(res.status, 403);
    assert.equal(errorCode(res.body), 'FORBIDDEN');
  });
  it('user sur admin orders → 403', async () => {
    const res = await userA.get('/api/admin/orders');
    assert.equal(res.status, 403);
  });
  it('admin sur route USER → 403', async () => {
    const res = await admin.get('/api/me/products');
    assert.equal(res.status, 403);
  });
  it('admin a bien accès à ses routes (200)', async () => {
    const res = await admin.get('/api/admin/stats');
    assert.equal(res.status, 200);
    assert.ok('users' in (res.body as any));
  });
});