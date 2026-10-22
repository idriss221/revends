import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { logger } from './utils/logger.js';

// Charge .env localement (dev) — silencieux si absent (prod : env déjà injecté).
try {
  process.loadEnvFile(path.resolve(process.cwd(), '.env'));
} catch {
  /* pas de fichier .env */
}

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),

  // PostgreSQL (source de vérité unique — plus de sharding/réplication)
  DATABASE_URL: z.string().optional(),
  DB_HOST: z.string().default('localhost'),
  DB_PORT: z.coerce.number().int().positive().default(5432),
  DB_USER: z.string().default('postgres'),
  DB_PASSWORD: z.string().default(''),
  DB_NAME: z.string().default('postgres'),
  // Taille du pool de connexions unique.
  PG_POOL_MAX: z.coerce.number().int().positive().default(10),
  // Budget max d'une requête côté serveur (ms) : au-delà, PostgreSQL l'annule.
  DB_STATEMENT_TIMEOUT_MS: z.coerce.number().int().positive().default(15_000),
  // Transaction laissée ouverte (ms) : au-delà, la connexion est tuée.
  DB_IDLE_TX_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
  // TLS vers PostgreSQL. Non renseigné ⇒ déduit de `sslmode` dans l'URL.
  PG_SSL: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),

  SESSION_SECRET: z.string().default('dev-only-insecure-secret-change-me-42-char-min'),
  UPLOAD_DIR: z.string().default('./uploads/products'),
  COMMISSION_RATE: z.coerce.number().min(0).max(1).default(0.1),
  RESERVATION_DAYS: z.coerce.number().int().min(1).default(5),
  DISABLE_CRON: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  ADMIN_EMAIL: z.string().default('admin@revends.com'),
  ADMIN_PASSWORD: z.string().default(''),
  WEB_DIST: z.string().default('../web/dist'),
  MIGRATIONS_DIR: z.string().default('./migrations'),

  // Mail
  MAIL_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  MAIL_HOST: z.string().default(''),
  MAIL_PORT: z.coerce.number().int().positive().default(587),
  MAIL_SECURE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  MAIL_USER: z.string().default(''),
  MAIL_PASSWORD: z.string().default(''),
  MAIL_FROM: z.string().default(''),
  SITE_URL: z.string().default('http://localhost:5173'),

  // CORS : liste d'origines séparées par des virgules. Vide ⇒ [SITE_URL].
  // `*` est ignoré (incompatible avec `credentials: true`).
  CORS_ORIGINS: z.string().default(''),

  // Distribué
  INSTANCE_ID: z.string().default(''),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  REDIS_PASSWORD: z.string().default(''),
  REDIS_PREFIX: z.string().default('revends:'),
  REDIS_CONNECT_TIMEOUT_MS: z.coerce.number().int().nonnegative().default(2000),
  REDIS_CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(60),
  CACHE_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  SESSION_STORE: z.enum(['redis', 'pg']).default('redis'),
  RATE_LIMIT_BACKEND: z.enum(['redis', 'memory']).default('redis'),
  RATE_LIMIT_DISABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  // Réglages fins du rate limiting (fenêtre fixe + plafond par scope).
  // Le limiteur « auth » ne s'applique QU'aux routes qui manipulent des
  // identifiants (register/login/forgot/reset) — jamais aux redirections OAuth,
  // /me ni /logout (cf. app.ts). Le limiteur « global » couvre le reste de /api.
  RATE_LIMIT_AUTH_WINDOW_MS: z.coerce.number().int().positive().default(600_000),
  RATE_LIMIT_AUTH_MAX: z.coerce.number().int().positive().default(20),
  RATE_LIMIT_GLOBAL_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  RATE_LIMIT_GLOBAL_MAX: z.coerce.number().int().positive().default(300),
  RUN_MIGRATIONS: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  // Force le flag `Secure` du cookie de session (défaut = NODE_ENV=production).
  // Indispensable pour un L7 HTTP-only (démo Docker) : sans HTTPS au bord,
  // express-session n'émet JAMAIS un cookie `Secure`, donc pas de session.
  COOKIE_SECURE: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),

  // Postgres (pour docker-compose)
  POSTGRES_PASSWORD: z.string().default(''),

  // OAuth
  GOOGLE_CLIENT_ID: z.string().default(''),
  GOOGLE_CLIENT_SECRET: z.string().default(''),
  GOOGLE_CALLBACK_URL: z.string().optional(),
  FACEBOOK_APP_ID: z.string().default(''),
  FACEBOOK_APP_SECRET: z.string().default(''),
  FACEBOOK_CALLBACK_URL: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  // On ne journalise QUE le chemin et le message de chaque problème : jamais la
  // valeur reçue (pourrait contenir un secret).
  logger.error('configuration invalide', {
    issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message, code: i.code })),
  });
  process.exit(1);
}
const env = parsed.data;

export const PUBLIC_SESSION_SECRETS = [
  'dev-only-insecure-secret-change-me-42-char-min',
  'change-me-with-a-long-random-secret',
  'dev-secret-change-me-42-characters-minimum-ok',
];

const WEAK_SESSION_PATTERNS = [
  /^dev/i,
  /^change/i,
  /^test/i,
];

const WEAK_ADMIN_PATTERNS = [
  /^dev/i,
  /^change/i,
  /^test/i,
  /^admin$/i,
  /^password$/i,
  /^123456/i,
];

const WEAK_DB_PASSWORD_PATTERNS = [
  /^revends_dev_password$/i,
];

function validateSessionSecret(secret: string): string | null {
  if (secret.length < 32) {
    return 'SESSION_SECRET doit faire au moins 32 caractères';
  }
  if (PUBLIC_SESSION_SECRETS.includes(secret)) {
    return 'SESSION_SECRET ne doit pas être une valeur par défaut/démo';
  }
  for (const pattern of WEAK_SESSION_PATTERNS) {
    if (pattern.test(secret)) {
      return 'SESSION_SECRET ne doit pas contenir de motif faible (dev, change, test)';
    }
  }
  return null;
}

function validateAdminPassword(password: string): string | null {
  if (password.length < 12) {
    return 'ADMIN_PASSWORD doit faire au moins 12 caractères';
  }
  for (const pattern of WEAK_ADMIN_PATTERNS) {
    if (pattern.test(password)) {
      return 'ADMIN_PASSWORD ne doit pas contenir de motif faible (dev, change, test, admin, password, 123456)';
    }
  }
  return null;
}

function validateDbPassword(password: string): string | null {
  if (password.length < 12) {
    return 'DB_PASSWORD / POSTGRES_PASSWORD doit faire au moins 12 caractères';
  }
  for (const pattern of WEAK_DB_PASSWORD_PATTERNS) {
    if (pattern.test(password)) {
      return 'DB_PASSWORD / POSTGRES_PASSWORD ne doit pas être la valeur par défaut (revends_dev_password)';
    }
  }
  return null;
}

// Validation en TOUS environnements (pas seulement production)
const sessionSecretError = validateSessionSecret(env.SESSION_SECRET);
if (sessionSecretError) {
  logger.error(sessionSecretError);
  process.exit(1);
}

const adminPasswordError = validateAdminPassword(env.ADMIN_PASSWORD);
if (adminPasswordError) {
  logger.error(adminPasswordError);
  process.exit(1);
}

// DB_PASSWORD ou POSTGRES_PASSWORD (le premier non-vide gagne)
const effectiveDbPassword = env.DB_PASSWORD || env.POSTGRES_PASSWORD || '';
const dbPasswordError = validateDbPassword(effectiveDbPassword);
if (dbPasswordError) {
  logger.error(dbPasswordError);
  process.exit(1);
}

if (env.NODE_ENV === 'production') {
  if (env.MAIL_ENABLED) {
    const missing = (
      [
        ['MAIL_HOST', env.MAIL_HOST],
        ['MAIL_USER', env.MAIL_USER],
        ['MAIL_PASSWORD', env.MAIL_PASSWORD],
        ['MAIL_FROM', env.MAIL_FROM],
      ] as const
    )
      .filter(([, value]) => value.length === 0)
      .map(([name]) => name);

    if (missing.length > 0) {
      logger.error('configuration mail incomplète en production (MAIL_ENABLED=true)', { missing });
      process.exit(1);
    }
  }
}

const databaseUrl =
  env.DATABASE_URL ??
  `postgres://${encodeURIComponent(env.DB_USER)}:${encodeURIComponent(env.DB_PASSWORD)}@${env.DB_HOST}:${env.DB_PORT}/${env.DB_NAME}`;

const uploadDir = path.resolve(process.cwd(), env.UPLOAD_DIR);
const migrationsDir = path.resolve(process.cwd(), env.MIGRATIONS_DIR);

// Front web — deux emplacements possibles :
//  · local / Docker : le build Vite, pointé par WEB_DIST ;
//  · Vercel (fonction serverless) : le dossier `public/` n'est PAS à la
//    racine de la fonction. Le build y est embarqué dans `server/public/`
//    et résolu ici par une RÉFÉRENCE STATIQUE : c'est elle qui fait
//   .include par le traceur de fichiers de Vercel (nft) le dossier entier.
//    Sans ce repli, la racine `/` tombait sur le 404 JSON de la fonction.
const cwdWebDist = path.resolve(process.cwd(), env.WEB_DIST);
const bundledWebDist = fileURLToPath(new URL('../public', import.meta.url));
// Le traceur de fichiers de Vercel (nft) n'embarque un dossier que s'il
// détecte une lecture de son contenu : on liste donc explicitement le
// dossier du front embarqué, sinon les assets (JS/CSS/images) sont
// absents de la fonction.
try {
  fs.readdirSync(bundledWebDist);
} catch {
  /* front non embarqué (local/Docker) : WEB_DIST est utilisé */
}
const webDistDir = fs.existsSync(path.join(cwdWebDist, 'index.html')) ? cwdWebDist : bundledWebDist;

const instanceId = env.INSTANCE_ID && env.INSTANCE_ID.trim().length > 0 ? env.INSTANCE_ID.trim() : os.hostname();

const siteUrl = env.SITE_URL.replace(/\/+$/, '');

/**
 * Origines autorisées pour le CORS. `*` est ignoré : `Access-Control-Allow-
 * Origin: *` est interdit avec `credentials: true`. Si la liste est vide, on
 * retombe sur `SITE_URL` (front web par défaut).
 */
function parseCorsOrigins(raw: string, fallback: string): readonly string[] {
  const list = raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s !== '*');
  return list.length > 0 ? list : [fallback];
}

// TLS vers PostgreSQL : explicite via PG_SSL, sinon déduit de l'URL
// (`sslmode=require|verify-*`). Indispensable pour les bases managées
// (Supabase, Render) ; inutile pour le Postgres local docker.
const dbSsl = env.PG_SSL ?? /[?&]sslmode=(require|verify-ca|verify-full)/.test(databaseUrl);

export const config = {
  nodeEnv: env.NODE_ENV,
  isProduction: env.NODE_ENV === 'production',
  port: env.PORT,
  databaseUrl,
  // Pool & timeouts (source de vérité unique).
  pgPoolMax: env.PG_POOL_MAX,
  dbStatementTimeoutMs: env.DB_STATEMENT_TIMEOUT_MS,
  dbIdleTxTimeoutMs: env.DB_IDLE_TX_TIMEOUT_MS,
  dbSsl,
  sessionSecret: env.SESSION_SECRET,
  sessionMaxAgeMs: 7 * 24 * 60 * 60 * 1000,
  cookieSecure: env.COOKIE_SECURE ?? env.NODE_ENV === 'production',
  uploadDir,
  migrationsDir,
  webDistDir,
  commissionRate: env.COMMISSION_RATE,
  reservationDays: env.RESERVATION_DAYS,
  disableCron: env.DISABLE_CRON,
  adminEmail: env.ADMIN_EMAIL,
  adminPassword: env.ADMIN_PASSWORD,
  siteUrl,
  corsOrigins: parseCorsOrigins(env.CORS_ORIGINS, siteUrl),
  mail: {
    enabled: env.MAIL_ENABLED,
    host: env.MAIL_HOST,
    port: env.MAIL_PORT,
    secure: env.MAIL_SECURE,
    user: env.MAIL_USER,
    password: env.MAIL_PASSWORD,
    from: env.MAIL_FROM,
  },
  instanceId,
  sessionStore: env.SESSION_STORE,
  cacheEnabled: env.CACHE_ENABLED,
  redis: {
    url: env.REDIS_URL,
    password: env.REDIS_PASSWORD,
    prefix: env.REDIS_PREFIX,
    connectTimeoutMs: env.REDIS_CONNECT_TIMEOUT_MS,
    cacheTtlSeconds: env.REDIS_CACHE_TTL_SECONDS,
  },
  rateLimit: {
    backend: env.RATE_LIMIT_BACKEND,
    disabled: env.RATE_LIMIT_DISABLED,
    authWindowMs: env.RATE_LIMIT_AUTH_WINDOW_MS,
    authMax: env.RATE_LIMIT_AUTH_MAX,
    globalWindowMs: env.RATE_LIMIT_GLOBAL_WINDOW_MS,
    globalMax: env.RATE_LIMIT_GLOBAL_MAX,
  },
  runMigrations: env.RUN_MIGRATIONS,
  oauth: {
    google: {
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      callbackUrl: env.GOOGLE_CALLBACK_URL ?? `${siteUrl}/api/auth/google/callback`,
    },
    facebook: {
      appId: env.FACEBOOK_APP_ID,
      appSecret: env.FACEBOOK_APP_SECRET,
      callbackUrl: env.FACEBOOK_CALLBACK_URL ?? `${siteUrl}/api/auth/facebook/callback`,
    },
  },
} as const;

export type Config = typeof config;