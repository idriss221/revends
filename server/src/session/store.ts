import type session from 'express-session';
import { RedisStore } from 'connect-redis';
import { config } from '../config.js';
import { getRedisClient } from '../cache/redis.js';

/** Durée de vie des sessions en Redis (secondes) — 7 jours, alignée sur `maxAge`. */
const TTL_SECONDS = Math.floor(config.sessionMaxAgeMs / 1000);

export interface SessionStoreChoice {
  kind: 'redis' | 'pg';
  store: session.Store | undefined;
}

export function buildSessionStore(): SessionStoreChoice {
  if (config.sessionStore === 'redis') {
    const client = getRedisClient();
    if (client) {
      const store = new RedisStore({
        client,
        prefix: `${config.redis.prefix}sess:`,
        // ⚠️ connect-redis v10 déduit sinon le TTL de `sess.cookie.expires`.
        // Si cette date est absente/dans le passé, `set()` part dans sa
        // branche `return this.destroy(sid, cb)` : la session est SUPPRIMÉE et
        // le callback est rappelé SANS erreur (donc `err = null`).
        // Effet observé : `POST /auth/register` → 201 + cookie valide, puis
        // `/auth/me` → 401 sur environ une inscription sur deux (la clé avait
        // été écrite puis détruite). Fixer le TTL ici rend le comportement
        // déterministe et indépendant de l'état du cookie au moment du save.
        ttl: () => TTL_SECONDS,
      });
      return { kind: 'redis', store };
    }
  }
  return { kind: 'pg', store: undefined };
}

export async function closeSessionStore(): Promise<void> {
  // RedisStore fermé via closeRedis
  return Promise.resolve();
}
