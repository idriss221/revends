import path from 'node:path';
import fs from 'node:fs';
import express, { type NextFunction, type Request, type Response } from 'express';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import * as helmetModule from 'helmet';
import { pool } from './db/pool.js';
import { config } from './config.js';
import { buildSessionStore } from './session/store.js';
import { instanceId } from './middleware/instance-id.js';
import { requestId } from './middleware/request-id.js';
import { cors } from './middleware/cors.js';
import { createCsrfProtection } from './middleware/csrf.js';
import { errorHandler, notFoundHandler } from './middleware/errors.js';
import { rateLimit } from './middleware/rate-limit.js';
import { cacheControl } from './middleware/cache.js';
import { systemRouter } from './routes/system.routes.js';
import { authRouter } from './routes/auth.routes.js';
import { productsRouter } from './routes/products.routes.js';
import { bannersRouter } from './routes/banners.routes.js';
import { ordersRouter } from './routes/orders.routes.js';
import { meRouter } from './routes/me.routes.js';
import { adminRouter } from './routes/admin.routes.js';
import { cartRouter } from './routes/cart.routes.js';
import { favoritesRouter } from './routes/favorites.routes.js';
import { listPublicCategories } from './services/categories.service.js';

/**
 * `helmet` est publié en CommonJS avec un `export default` (déclarations
 * `.d.cts`). Selon le mode de compilation du fichier hôte — ESM strict
 * (serveur Node, `module: NodeNext`) ou interop CommonJS (bundleur de la
 * plateforme Vercel) — le type du `default` est vu tantôt comme la fonction,
 * tantôt comme l'espace de noms du module. On normalise donc le type ici, et
 * on s'appuie sur le fait que `helmet.default === helmet` à l'exécution
 * (vérifié) : le comportement est identique dans les deux modes.
 */
type HelmetFactory = (options?: Record<string, unknown>) => express.RequestHandler;
const helmet = ((helmetModule as unknown as { default?: HelmetFactory }).default ??
  (helmetModule as unknown as HelmetFactory)) as HelmetFactory;

export function createApp(): express.Express {
  const app = express();
  app.disable('x-powered-by');

  // Protection CSRF (instanciée une fois : bypass NODE_ENV=test figé).
  const csrfProtection = createCsrfProtection();

  // ⚠️ INDISPENSABLE derrière nginx (reverse proxy) — sans ça :
  //   1. `req.ip` vaut l'IP du proxy : TOUS les visiteurs partagent un même
  //      bucket de rate-limiting (le premier venu fait sauter la limite de tout
  //      le monde) ;
  //   2. `req.secure` est toujours false : express-session refuse d'émettre un
  //      cookie `Secure`, donc AUCUNE session n'est créée derrière un L7 HTTP.
  // `1` = on ne fait confiance qu'au premier saut (le proxy maîtrisé).
  app.set('trust proxy', 1);

  // Identité de l'instance distribuée : X-Instance-Id sur TOUTE réponse
  // (monté en PREMIER, avant helmet/express.json, pour que même les
  // 429/503 portent l'en-tête).
  app.use(instanceId);
  // Identifiant de corrélation par requête (CA-V5-090) : posé tôt pour que
  // TOUTE erreur (même sur une route inconnue) soit traçable.
  app.use(requestId);
  // les photos `/uploads` à être chargées par le web/mobile sur une autre origine.
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          baseUri: ["'self'"],
          fontSrc: ["'self'", 'https:', 'data:'],
          formAction: ["'self'"],
          frameAncestors: ["'self'"],
          // Autorise les images Pinterest pour les tuiles de catégories
          imgSrc: ["'self'", 'data:', 'https://i.pinimg.com'],
          objectSrc: ["'none'"],
          scriptSrc: ["'self'"],
          scriptSrcAttr: ["'none'"],
          styleSrc: ["'self'", 'https:', "'unsafe-inline'"],
          upgradeInsecureRequests: [],
        },
      },
    }),
  );

  // CORS à liste blanche (CORS_ORIGINS / SITE_URL), monté après helmet pour que
  // les réponses preflight portent aussi les en-têtes de sécurité, et AVANT
  // session/rate-limit pour ne pas les solliciter inutilement sur OPTIONS.
  app.use(cors);

  // Protection CSRF (double soumission, cf. `middleware/csrf.ts`) : pose le
  // cookie lisible `csrf_token` et exige l'en-tête `X-CSRF-Token` correspondant
  // sur toute méthode mutante sous `/api`. Bypass en NODE_ENV=test.
  app.use('/api', csrfProtection);

  app.use(express.json({ limit: '2mb' }));

  // Politique `Cache-Control` (V5/PO-V5-07) : `private, no-store` par défaut,
  // court cache public sur `/api/categories` et `/api/banners` uniquement.
  // Monté sur `/api` pour ne concerner ni les photos statiques ni le SPA.
  app.use('/api', cacheControl);

  // Sessions serveur : store Redis partagé (connect-redis) en distribué,
  // connect-pg-simple en repli (SESSION_STORE=pg, tests mono-nœud).
  const sessionChoice = buildSessionStore();
  const sessionStore =
    sessionChoice.kind === 'redis'
      ? sessionChoice.store
      : new (connectPgSimple(session))({
          pool,
          tableName: 'session',
          createTableIfMissing: false,
          pruneSessionInterval: 60,
        });
  app.use(
    session({
      store: sessionStore,
      secret: config.sessionSecret,
      name: 'connect.sid',
      resave: false,
      saveUninitialized: false,
      rolling: true,
      cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: config.cookieSecure,
        maxAge: config.sessionMaxAgeMs,
      },
    }),
  );

  // Santé (probe déploiement / orchestration) — api.md §3.7 : répond 200 même
  // si la BDD est injoignable (un échec du serveur → 500). Alias /health et
  // /api/health (contrat §3.7 + exigence d'implémentation).
  //
  // ⚠️ DÉCLARÉ AVANT le limiteur global (D8 / CA-V5-084) : ces deux probes ne
  // sont JAMAIS limitées. Les enregistrer ici n'est pas cosmétique — Express
  // parcourt les middlewares dans l'ordre d'enregistrement, donc `res.json()`
  // termine la réponse et le limiteur global (monté plus bas sur `/api`) n'est
  // jamais atteint. Un test dédié verrouille ce comportement.
  const healthHandler = (_req: Request, res: Response) => {
    res.json({ status: 'ok' });
  };
  app.get('/api/health', healthHandler);
  app.get('/health', healthHandler);

  // Probe enrichie (Redis, rate-limit, pool) — montée avant le limiteur global.
  app.use('/api/system', systemRouter);

  // Défense de la connexion (CA-AUTH02-05, plafond par défaut : 20 / 10 min / IP).
  // ⚠️ Le limiteur « auth » ne cible QUE les routes qui manipulent des
  // identifiants : register / login / forgot-password / reset-password.
  // Les routes OAuth (`/google`, `/facebook`, leurs callbacks), `/me` et
  // `/logout` en sont EXCLUES : une redirection OAuth ou un `/me` au chargement
  // d'une page ne doit jamais consommer le quota (sinon un utilisateur légitime
  // reçoit « RATE_LIMITED » — bug corrigé). `scope: 'auth'` garde une clé Redis
  // propre (`rl:auth:<ip>`), jamais partagée avec le limiteur global (D8).
  const authLimiter = rateLimit({
    windowMs: config.rateLimit.authWindowMs,
    max: config.rateLimit.authMax,
    scope: 'auth',
  });
  app.use('/api/auth/register', authLimiter);
  app.use('/api/auth/login', authLimiter);
  app.use('/api/auth/forgot-password', authLimiter);
  app.use('/api/auth/reset-password', authLimiter);
  app.use('/api/auth', authRouter);

  // Rate limit GLOBAL (V5/CA-V5-084) : 300 req/min/IP, fenêtre fixe, monté sur
  // `/api` SEULEMENT (D8) → `/uploads` (statique) et le fallback SPA ne sont
  // pas concernés. Bypass intégral en NODE_ENV=test, fourni par rate-limit.ts.
  app.use(
    '/api',
    rateLimit({
      windowMs: config.rateLimit.globalWindowMs,
      max: config.rateLimit.globalMax,
      scope: 'global',
    }),
  );

  // Rate limit ADMIN (plus strict) : 60 req/min/IP pour les mutations admin
  // Skip pour les admins (skipAdmin=true) — les admins légitimes ne doivent pas
  // être limités dans leurs actions de gestion.
  app.use(
    '/api/admin',
    rateLimit({
      windowMs: 60_000, // 1 minute
      max: 60, // 60 req/min
      scope: 'admin',
      message: 'Trop d\'actions admin, réessayez dans une minute',
      code: 'ADMIN_RATE_LIMITED',
      skipAdmin: true, // Les admins légitimes ne sont pas limités
    }),
  );

  // Photos publiques : /uploads/products/<uuid>.<ext> (dotfiles ignorés, §9.6)
  app.use(
    '/uploads',
    express.static(path.resolve(config.uploadDir, '..'), {
      dotfiles: 'ignore',
      index: false,
      fallthrough: true,
    }),
  );

  // API publique + authentifiée
  app.get('/api/categories', async (_req: Request, res: Response) => {
    res.json(await listPublicCategories());
  });
  app.use('/api/products', productsRouter);
  app.use('/api/banners', bannersRouter);
  app.use('/api/orders', ordersRouter);
  app.use('/api/me', meRouter);
  app.use('/api/cart', cartRouter);
  app.use('/api/favorites', favoritesRouter);
  app.use('/api/admin', adminRouter);

  // 404 JSON pour les routes API inconnues (contrat §1.1)
  app.use('/api', notFoundHandler);

  // SPA (build front dist) si présent — sinon 404 JSON
  if (fs.existsSync(config.webDistDir) && fs.existsSync(path.join(config.webDistDir, 'index.html'))) {
    app.use(express.static(config.webDistDir));
    app.use((req: Request, res: Response, next: NextFunction) => {
      if (req.method === 'GET') {
        res.sendFile(path.join(config.webDistDir, 'index.html'));
        return;
      }
      next();
    });
  }

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}