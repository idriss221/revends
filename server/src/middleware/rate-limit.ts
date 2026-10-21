import type { NextFunction, Request, Response } from 'express';
import { config } from '../config.js';
import { getRedisClient, isRedisReady } from '../cache/redis.js';

/**
 * Rate limiting distribué (fenêtre FIXE par IP + scope).
 *
 * Backend :
 *  • `redis` (défaut, `RATE_LIMIT_BACKEND=redis`) : compteur partagé entre
 *    instances via `INCR` / `PEXPIRE` — un seul compteur partagé, quelle que
 *    soit l'instance qui reçoit la requête ;
 *  • `memory` : repli automatique (Redis indisponible, tests unitaires purs).
 *    Le compteur mémoire est **propre à chaque instance de middleware** : le
 *    partage inter-instances est le rôle de Redis, et deux limiteurs distincts
 *    (auth vs global) ne doivent jamais se contaminer.
 *
 * Clés Redis : `rl:<scope>:<ip>` (le scope isole les buckets : `auth` vs
 * `default`, faute de quoi le limiteur de connexion, plus strict, corromprait
 * le limiteur global — cf. app.ts D8). Sans scope, on retombe sur `default`.
 *
 * Deux règles impératives :
 *  1. **Bypass intégral en `NODE_ENV=test`** (toutes les suites viennent de
 *     127.0.0.1 : le bucket saturerait et ferait échouer les tests en cascade).
 *     Le test est évalué à la CRÉATION du middleware (cf. tests unitaires).
 *  2. Le repli mémoire est **synchrone** (le backend Redis est asynchrone) :
 *     `limiter(req, res, next)` bloque immédiatement quand Redis est absent.
 */

/** Corps d'erreur renvoyé en cas de dépassement (contrat API uniforme). */
const RATE_LIMITED_CODE = 'RATE_LIMITED';
const RATE_LIMITED_MESSAGE = 'Trop de requêtes, réessayez dans une minute';

/** Purge opportuniste du repli mémoire (une fois par minute). */
const SWEEP_INTERVAL_MS = 60_000;

export interface RateLimitOptions {
  /** Durée de la fenêtre fixe, en millisecondes. */
  windowMs: number;
  /** Nombre maximal de requêtes autorisées par fenêtre et par IP. */
  max: number;
  /** Bucket logique : `auth`, `global`, `admin`, … (défaut : `default`). */
  scope?: string;
  /** Message personnalisé (optionnel). */
  message?: string;
  /** Code d'erreur personnalisé (optionnel). */
  code?: string;
  /** Ignorer pour les admins (défaut: false) - utile pour les actions admin lourdes. */
  skipAdmin?: boolean;
}

/** Entrée du repli mémoire (fenêtre fixe). */
interface MemoryEntry {
  count: number;
  resetAt: number;
}

interface ConsumeResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

/** Middleware Express compatible (sync pour la mémoire, async pour Redis). */
export type RateLimitMiddleware = (req: Request, res: Response, next: NextFunction) => void | Promise<void>;

/** Réponse 429 uniforme (+ en-tête `Retry-After`). */
function reject(res: Response, retryAfterSeconds: number): void {
  res.setHeader('Retry-After', String(retryAfterSeconds));
  res.status(429).json({
    error: {
      code: RATE_LIMITED_CODE,
      message: RATE_LIMITED_MESSAGE,
    },
  });
}

/**
 * Crée un middleware de rate limiting.
 * Le bypass (`NODE_ENV=test`) est figé au moment de la création.
 */
export function rateLimit(options: RateLimitOptions): RateLimitMiddleware {
  const { windowMs, max, scope = 'default', message = RATE_LIMITED_MESSAGE, code = RATE_LIMITED_CODE, skipAdmin = false } = options;

  // Bypass total (tests + configuration explicite) : jamais de blocage.
  if (process.env.NODE_ENV === 'test' || config.rateLimit.disabled) {
    return (_req, _res, next) => {
      next();
    };
  }

  // Repli mémoire PROPRE à cette instance de limiteur.
  const memoryStore = new Map<string, MemoryEntry>();
  let lastSweep = 0;

  function sweep(now: number): void {
    if (now - lastSweep < SWEEP_INTERVAL_MS) return;
    lastSweep = now;
    for (const [key, entry] of memoryStore) {
      if (now >= entry.resetAt) memoryStore.delete(key);
    }
  }

  /** Consomme un jeton dans le repli mémoire (synchrone, fenêtre fixe). */
  function consumeMemory(key: string, now: number): ConsumeResult {
    sweep(now);
    const entry = memoryStore.get(key);
    if (!entry || now >= entry.resetAt) {
      memoryStore.set(key, { count: 1, resetAt: now + windowMs });
      return { allowed: true, retryAfterSeconds: 0 };
    }
    entry.count += 1;
    if (entry.count > max) {
      const retryAfterSeconds = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
      return { allowed: false, retryAfterSeconds };
    }
    return { allowed: true, retryAfterSeconds: 0 };
  }

  /** Consomme un jeton dans Redis (asynchrone, fenêtre fixe partagée). */
  async function consumeRedis(
    client: NonNullable<ReturnType<typeof getRedisClient>>,
    key: string,
  ): Promise<ConsumeResult> {
    const count = await client.incr(key);
    if (count === 1) {
      await client.pExpire(key, windowMs);
    }
    if (count > max) {
      const ttlMs = await client.pTTL(key);
      const retryAfterSeconds = Math.max(1, Math.ceil((ttlMs > 0 ? ttlMs : windowMs) / 1000));
      return { allowed: false, retryAfterSeconds };
    }
    return { allowed: true, retryAfterSeconds: 0 };
  }

  const redisKeyPrefix = `rl:${scope}`;

  // Helper pour vérifier si l'utilisateur est admin.
  // La session porte `userId` / `role` (posé par `auth.routes.ts`, cf.
  // `middleware/auth.ts`) — il n'existe AUCUN `session.user` dans l'app.
  const isAdmin = (req: Request): boolean => {
    const session = (req as Request & { session?: { role?: string } }).session;
    return session?.role === 'admin';
  };

  return (req, res, next) => {
    // Skip rate limiting for admins if configured
    if (skipAdmin && isAdmin(req)) {
      return next();
    }

    const ip = req.ip ?? 'unknown';

    const client = getRedisClient();
    if (config.rateLimit.backend === 'redis' && client && isRedisReady()) {
      return consumeRedis(client, `${redisKeyPrefix}:${ip}`)
        .then((result) => {
          if (result.allowed) next();
          else reject(res, result.retryAfterSeconds);
        })
        .catch(() => {
          // Redis en erreur en cours de route → repli mémoire, jamais de 5xx.
          const result = consumeMemory(ip, Date.now());
          if (result.allowed) next();
          else reject(res, result.retryAfterSeconds);
        });
    }

    // Repli mémoire synchrone (Redis absent/indisponible).
    const result = consumeMemory(ip, Date.now());
    if (result.allowed) {
      next();
      return;
    }
    // Rejet avec message/code personnalisés
    res.setHeader('Retry-After', String(result.retryAfterSeconds));
    res.status(429).json({
      error: {
        code,
        message,
      },
    });
  };
}

/**
 * Backend de rate limiting effectivement actif — exposé par la probe
 * `/api/system/health` (`rateLimit.backend`).
 */
export function rateLimitBackend(): 'redis' | 'memory' | 'disabled' {
  if (config.rateLimit.disabled) return 'disabled';
  if (config.rateLimit.backend === 'redis' && isRedisReady()) return 'redis';
  return 'memory';
}
