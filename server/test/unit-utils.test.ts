/**
 * Tests UNITAIRES du backend — logique pure, sans BDD ni HTTP.
 * Base de la pyramide (nombreux, rapides, précis).
 * IMPORTANT : `./env.js` d'abord — upload.ts charge config.ts (éval one-shot).
 */
import './env.js';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { slugify } from '../src/utils/slugify.js';
import { formatFCFA, serializePublicUser } from '../src/utils/serializers.js';
import { registerSchema, productFieldsSchema, createOrderSchema, loginSchema, rejectSchema, catalogQuerySchema } from '../src/utils/validation.js';
import { sniffImageMime, MAX_PHOTO_BYTES, MIN_PHOTOS, MAX_PHOTOS } from '../src/middleware/upload.js';
import { jpegBuffer, pngBuffer, webpBuffer, invalidBuffer } from './helpers.js';
import { rateLimit } from '../src/middleware/rate-limit.js';
import { errorHandler } from '../src/middleware/errors.js';
import { AppError } from '../src/utils/errors.js';
import type { Request, NextFunction } from 'express';

describe('slugify (D12, URLs publiques)', () => {
  it('transforme un nom en kebab-case', () => {
    assert.equal(slugify('iPhone 13 128 Go'), 'iphone-13-128-go');
  });
  it('enlève les accents', () => {
    assert.equal(slugify('Téléphone À réparer'), 'telephone-a-reparer');
  });
  it('retourne un slug non vide par défaut', () => {
    assert.equal(slugify('!!!'), 'article');
  });
});

describe('formatFCFA (§7.3, montants entiers)', () => {
  it('formate les FCFA sans décimale', () => {
    // Le séparateur fr-FR est l'espace fine \u202f — normaliser.
    const norm = (s: string) => s.replace(/\u202f/g, ' ');
    assert.equal(norm(formatFCFA(250_000)), '250 000');
    assert.equal(norm(formatFCFA(10_000_000)), '10 000 000');
    assert.equal(norm(formatFCFA(0)), '0');
  });
});

describe('RG 7.7 — sérialisation PublicUser (T22 au niveau mapper)', () => {
  it('ne renvoie JAMAIS name/email/phone', () => {
    const out = serializePublicUser(
      { id: 3, display_name: 'Aicha', name: 'Aïcha Koné', email: 'a@x.fr', phone: '+225 07', role: 'user', created_at: new Date('2026-01-15T00:00:00Z') },
      { sales: true },
    );
    assert.deepEqual(Object.keys(out).sort(), ['displayName', 'id', 'memberSince', 'sales']);
    assert.equal(out.displayName, 'Aicha');
    assert.equal(out.memberSince, 2026);
    assert.equal(out.sales, 0);
  });
  it('omet sales si non demandé (acheteur vu par le vendeur)', () => {
    const out = serializePublicUser({ id: 1, display_name: 'X', name: 'Y', email: 'e', phone: 'p', role: 'user', created_at: new Date() });
    assert.ok(!('sales' in out));
  });
});

describe('Validation serveur — register (CA-AUTH01-01)', () => {
  const valid = {
    displayName: 'Aicha123',
    name: 'Aïcha Koné',
    email: 'AICHA@Example.com',
    phone: '+225 07 00 00 00 00',
    password: 'motdepasse123',
    acceptedCgu: true,
  };
  it('accepte un payload valide (email normalisé en minuscules)', () => {
    const out = registerSchema.parse(valid);
    assert.equal(out.email, 'aicha@example.com');
  });
  it('rejette un pseudo avec caractères interdits', () => {
    assert.throws(() => registerSchema.parse({ ...valid, displayName: 'Jean_Kouamé*' }));
  });
  it('rejette un pseudo trop court', () => {
    assert.throws(() => registerSchema.parse({ ...valid, displayName: 'A' }));
  });
  it('rejette un mot de passe < 8 caractères', () => {
    assert.throws(() => registerSchema.parse({ ...valid, password: 'court' }));
  });
  it('rejette acceptedCgu:false (bloquant)', () => {
    assert.throws(() => registerSchema.parse({ ...valid, acceptedCgu: false }));
  });
  it('rejette un téléphone hors format', () => {
    assert.throws(() => registerSchema.parse({ ...valid, phone: '07-00' }));
  });
  it('rejette un e-mail mal formé', () => {
    assert.throws(() => registerSchema.parse({ ...valid, email: 'pas-un-email' }));
  });
});

describe('Validation serveur — produit (RG-PROD-1 / CA-SELL01-01)', () => {
  const valid = {
    name: 'iPhone 13',
    categoryId: '3',
    subcategoryId: '13',
    condition: 'Bon état',
    price: '250000',
    location: 'Abidjan, Cocody',
    description: 'Téléphone très bon état',
  };
  it('accepte les bornes exactes 500 et 10 000 000', () => {
    for (const price of ['500', '10000000']) {
      assert.doesNotThrow(() => productFieldsSchema.parse({ ...valid, price }));
    }
  });
  it('rejette prix < 500', () => {
    assert.throws(() => productFieldsSchema.parse({ ...valid, price: '499' }));
  });
  it('rejette prix > 10 000 000', () => {
    assert.throws(() => productFieldsSchema.parse({ ...valid, price: '10000001' }));
  });
  it('rejette un prix non entier', () => {
    assert.throws(() => productFieldsSchema.parse({ ...valid, price: '2500.5' }));
  });
  it('rejette une description < 10 caractères', () => {
    assert.throws(() => productFieldsSchema.parse({ ...valid, description: 'court' }));
  });
  it('rejette un état hors enum', () => {
    assert.throws(() => productFieldsSchema.parse({ ...valid, condition: 'Impeccable' }));
  });
  it('rejette un nom < 3 caractères', () => {
    assert.throws(() => productFieldsSchema.parse({ ...valid, name: 'A' }));
  });
});

describe('Validation serveur — csvIdList (ids/not_in, SÉC-P3)', () => {
  it('accepte 1..20 entiers positifs, ordre préservé', () => {
    const out = catalogQuerySchema.parse({ ids: '3, 1, 2' });
    assert.deepEqual(out.ids, [3, 1, 2]);
  });
  it('rejette un identifiant > 2^53-1 (arrondi silencieux impossible)', () => {
    assert.throws(() => catalogQuerySchema.parse({ ids: '9007199254740993' }), /Identifiants invalides/);
    assert.throws(() => catalogQuerySchema.parse({ ids: '9007199254740992' }), /Identifiants invalides/); // 2^53 exact
    assert.doesNotThrow(() => catalogQuerySchema.parse({ ids: '9007199254740991' })); // 2^53 - 1 = MAX_SAFE_INTEGER
  });
});

describe('Validation serveur — commande (CA-BUY01)', () => {
  it('paymentMethod par défaut MOBILE_MONEY', () => {
    assert.equal(createOrderSchema.parse({ productId: '42' }).paymentMethod, 'MOBILE_MONEY');
  });
  it('rejette un productId invalide', () => {
    assert.throws(() => createOrderSchema.parse({ productId: '0' }));
    assert.throws(() => createOrderSchema.parse({ productId: '-3' }));
  });
  it('rejette une méthode de paiement hors enum', () => {
    assert.throws(() => createOrderSchema.parse({ productId: '1', paymentMethod: 'BTC' }));
  });
  it('login : identifier vide rejeté', () => {
    assert.throws(() => loginSchema.parse({ identifier: '', password: 'x' }));
  });
  it('reject : motif hors liste fermée rejeté (RG-REFUS)', () => {
    assert.throws(() => rejectSchema.parse({ reason: 'Comme ça' }));
    assert.doesNotThrow(() => rejectSchema.parse({ reason: 'Photos insuffisantes' }));
  });
});

describe('Détection MIME réelle des photos (RG-MEDIA-1, §9.6)', () => {
  it('reconnaît JPEG, PNG, WebP via magic bytes', () => {
    assert.equal(sniffImageMime(jpegBuffer()), 'image/jpeg');
    assert.equal(sniffImageMime(pngBuffer()), 'image/png');
    assert.equal(sniffImageMime(webpBuffer()), 'image/webp');
  });
  it('rejette un contenu non-image', () => {
    assert.equal(sniffImageMime(invalidBuffer), null);
  });
  it('constantes : 5 Mo max par photo, 3 photos min, 4 photos max', () => {
    assert.equal(MAX_PHOTO_BYTES, 5 * 1024 * 1024);
    assert.equal(MIN_PHOTOS, 3);
    assert.equal(MAX_PHOTOS, 4);
  });
});

describe('Rate limiter d’authentification (CA-AUTH02-05)', () => {
  interface FakeReq {
    ip: string;
    /** Miroir de la session express : `role` est posé par auth.routes.ts. */
    session?: { role?: string; user?: { role?: string } };
  }
  interface FakeRes { statusCode: number; body: unknown; headers: Record<string, string> }
  function fakeRes(): FakeRes {
    const r: FakeRes = { statusCode: 0, body: undefined, headers: {} };
    // Le middleware pose `Retry-After` avant le 429 : sans ce stub, le test
    // échouerait sur `setHeader is not a function` et non sur le comportement.
    (r as any).setHeader = (k: string, v: string) => {
      r.headers[k] = v;
      return r;
    };
    (r as any).status = (c: number) => {
      r.statusCode = c;
      return r;
    };
    (r as any).json = (b: unknown) => {
      r.body = b;
      return r;
    };
    return r;
  }
  /**
   * Le middleware appelle `next()` quand il laisse passer, mais TERMINE la
   * réponse (status + json) en cas de blocage — la promesse doit se résoudre
   * dans les deux cas, sinon elle pend indéfiniment (429 → 'Promise pending').
   */
  const fire = (limiter: (req: FakeReq, res: FakeRes, next: () => void) => void | Promise<void>, res: FakeRes, req: FakeReq = { ip: '127.0.0.1' }) =>
    new Promise<void>((resolve) => {
      let done = false;
      const finish = () => {
        if (!done) {
          done = true;
          resolve();
        }
      };
      const proxy: FakeRes = {
        statusCode: 0,
        body: undefined,
        headers: {},
        setHeader: (k: string, v: string) => {
          res.headers[k] = v; // même destination que status/json : le `res` du test
          return proxy;
        },
        status: (c: number) => {
          res.statusCode = c;
          finish();
          return proxy;
        },
        json: (b: unknown) => {
          res.body = b;
          finish();
          return proxy;
        },
      };
      // Le rate-limit est maintenant asynchrone : on attend la promesse
      const result = limiter(req, proxy, finish);
      if (result instanceof Promise) {
        result.then(finish, finish);
      }
    });

  /** Le middleware vérifie NODE_ENV à la CRÉATION (ligne 15) — override temporaire. */
  function withRealEnv<T>(fn: () => T): T {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    try {
      return fn();
    } finally {
      process.env.NODE_ENV = prev;
    }
  }

  it('NODE_ENV=test → désactivé (les suites brûlent la même IP 127.0.0.1)', async () => {
    const limiter = rateLimit({ windowMs: 60_000, max: 2 }) as any;
    const res = fakeRes();
    await fire(limiter, res);
    await fire(limiter, res);
    await fire(limiter, res); // 3e requête > max
    assert.equal(res.statusCode, 0, 'le bypass en test ne doit JAMAIS bloquer');
    assert.equal(res.body, undefined);
  });

  it('max dépassé → 429 RATE_LIMITED “Trop de requêtes, réessayez dans une minute”', async () => {
    const limiter = withRealEnv(() => rateLimit({ windowMs: 60_000, max: 2 }) as any);
    const res = fakeRes();
    await fire(limiter, res);
    await fire(limiter, res);
    assert.equal(res.statusCode, 0, '2 requêtes ≤ max : acceptées');
    const blocked = fakeRes();
    await fire(limiter, blocked);
    assert.equal(blocked.statusCode, 429);
    assert.equal((blocked.body as any).error.code, 'RATE_LIMITED');
    assert.match((blocked.body as any).error.message, /réessayez/i);
    // `Retry-After` doit refléter CETTE fenêtre (60 s ici), pas une constante.
    assert.equal(blocked.headers['Retry-After'], '60', 'Retry-After = secondes restantes');
  });

  it('nouvelle fenêtre → le compteur repart à zéro', async () => {
    const limiter = withRealEnv(() => rateLimit({ windowMs: 1000, max: 1 }) as any);
    const first = fakeRes();
    await fire(limiter, first);
    assert.equal(first.statusCode, 0);
    const second = fakeRes();
    await fire(limiter, second);
    assert.equal(second.statusCode, 429);
    await new Promise((r) => setTimeout(r, 1200)); // fenêtre de 1000 ms écoulée
    const third = fakeRes();
    await fire(limiter, third);
    assert.equal(third.statusCode, 0, 'fenêtre expirée → requête acceptée');
  });

  it('skipAdmin : session.role=admin jamais bloqué, un user reste compté (429 à la 2ᵉ)', async () => {
    const limiter = withRealEnv(() => rateLimit({ windowMs: 60_000, max: 1, skipAdmin: true }) as any);
    // 3 requêtes admin consécutives : toutes passent (non consommées).
    for (let i = 0; i < 3; i += 1) {
      const res = fakeRes();
      await fire(limiter, res, { ip: '127.0.0.1', session: { role: 'admin' } });
      assert.equal(res.statusCode, 0, `admin requête ${i + 1} non bloquée`);
    }
    // Un simple user consomme le jeton unique : la 2e requête non-admin est bloquée.
    const first = fakeRes();
    await fire(limiter, first, { ip: '127.0.0.1', session: { role: 'user' } });
    assert.equal(first.statusCode, 0);
    const second = fakeRes();
    await fire(limiter, second, { ip: '127.0.0.1', session: { role: 'user' } });
    assert.equal(second.statusCode, 429);
  });

  it('skipAdmin lit session.role — le chemin fantôme session.user.role n\'est PAS lu', async () => {
    const limiter = withRealEnv(() => rateLimit({ windowMs: 60_000, max: 1, skipAdmin: true }) as any);
    // Avant correction, `session.user.role = 'admin'` sautait le limiteur :
    // ce « faux admin » doit désormais être compté (bloqué à la 2ᵉ requête).
    const first = fakeRes();
    await fire(limiter, first, { ip: '127.0.0.1', session: { user: { role: 'admin' } } });
    assert.equal(first.statusCode, 0);
    const second = fakeRes();
    await fire(limiter, second, { ip: '127.0.0.1', session: { user: { role: 'admin' } } });
    assert.equal(second.statusCode, 429, 'session.user.role n\'est plus lu → requête comptée');
  });
});

// ---------------------------------------------------------------------------
// Erreurs 5xx : le filet de sécurité ne doit RIEN laisser fuir (§1.1 / SÉC)
//
// Le design system n'a pas de table code → toast : le front affiche
// `error.message` tel quel dans un Toast. Un message technique qui fuite ici
// devient donc du texte affiché à l'utilisateur. Invariant non couvert avant
// ce test : réintroduire `message: err.message` ne cassait aucune suite.
// ---------------------------------------------------------------------------
describe("errorHandler — aucune fuite d'information en 5xx", () => {
  interface Captured { status: number; body: any }
  /** Appelle le vrai handler avec un `res` minimal et récupère la réponse. */
  const handle = (err: unknown): Captured => {
    const out: Captured = { status: 0, body: undefined };
    const res: any = {
      locals: {},
      status(c: number) { out.status = c; return res; },
      json(b: unknown) { out.body = b; return res; },
      setHeader() { return res; },
    };
    errorHandler(err, {} as Request, res, (() => undefined) as NextFunction);
    return out;
  };

  it('erreur interne inconnue → 500 INTERNAL_ERROR, message générique', () => {
    const secret = 'connect ECONNREFUSED 10.0.0.5:5432 (mot de passe=hunter2)';
    const out = handle(new Error(secret));
    assert.equal(out.status, 500);
    assert.equal(out.body.error.code, 'INTERNAL_ERROR');
    assert.equal(out.body.error.message, 'Erreur interne du serveur');
    // Le test ne vaut que si le détail interne est réellement absent.
    assert.equal(JSON.stringify(out.body).includes('hunter2'), false, 'aucun secret dans la réponse');
    assert.equal(JSON.stringify(out.body).includes('5432'), false, 'aucun détail réseau dans la réponse');
  });

  it('erreur PostgreSQL non mappée → 500 sans detail ni nom de contrainte', () => {
    // Le mapping lit `err.constraint` (champ porté par `pg`), pas le message.
    const pg: any = new Error('duplicate key value violates unique constraint "users_email_key"');
    pg.code = '23505';
    pg.constraint = 'users_email_key';
    // users_email_key EST mappée : on vérifie le chemin mappé…
    const mapped = handle(pg);
    assert.equal(mapped.status, 409);
    assert.equal(mapped.body.error.code, 'EMAIL_TAKEN');
    assert.equal(JSON.stringify(mapped.body).includes('violates'), false, 'pas de SQL brut');
    // …et une contrainte inconnue du même SQLSTATE tombe bien en 500 générique.
    const unknown: any = new Error('duplicate key value violates unique constraint "zzz_mystery_key"');
    unknown.code = '23505';
    unknown.constraint = 'zzz_mystery_key';
    const out = handle(unknown);
    assert.equal(out.status, 500);
    assert.equal(out.body.error.code, 'INTERNAL_ERROR');
    assert.equal(JSON.stringify(out.body).includes('zzz_mystery_key'), false, 'pas de nom de contrainte');
  });

  it('AppError applicative → son propre message (le test ci-dessus ne doit pas être vide)', () => {
    const out = handle(new AppError(409, 'PRODUCT_RESERVED', "Cet article vient d'être réservé"));
    assert.equal(out.status, 409);
    assert.equal(out.body.error.code, 'PRODUCT_RESERVED');
    assert.equal(out.body.error.message, "Cet article vient d'être réservé");
  });
});
