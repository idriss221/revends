import { createClient, type RedisClientType } from 'redis';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

let client: RedisClientType | null = null;
let connecting: Promise<void> | null = null;

function makeKey(key: string): string {
  return `${config.redis.prefix}cache:${key}`;
}

export function getRedisClient(): RedisClientType | null {
  if (!config.cacheEnabled) return null;
  return client;
}

export async function connectRedis(): Promise<void> {
  if (!config.cacheEnabled) return;
  if (client && client.isOpen) return;
  if (connecting) {
    await connecting;
    return;
  }
  connecting = (async () => {
    const c = createClient({
      url: config.redis.url,
      // Redis protégé par `requirepass` (cf. docker-compose) : la variable
      // `REDIS_PASSWORD` doit être transmise explicitement au client, sinon
      // toute commande échoue par `NOAUTH` (cache, sessions, rate-limit).
      password: config.redis.password.length > 0 ? config.redis.password : undefined,
      socket: {
        connectTimeout: config.redis.connectTimeoutMs,
      },
    });
    c.on('error', (err) => {
      logger.error('client Redis en erreur', { errorMessage: err.message });
    });
    await c.connect();
    client = c;
    connecting = null;
  })();
  await connecting;
}

export async function closeRedis(): Promise<void> {
  if (client) {
    try {
      await client.quit();
    } catch {
      try {
        await client.disconnect();
      } catch {
        /* ignore */
      }
    }
    client = null;
  }
  connecting = null;
}

export function isRedisReady(): boolean {
  if (!client) return false;
  return client.isReady === true || client.isOpen === true;
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  if (!config.cacheEnabled) return null;
  const c = getRedisClient();
  if (!c || !isRedisReady()) return null;
  try {
    const raw = await c.get(makeKey(key));
    if (raw == null) return null;
    return JSON.parse(raw) as T;
  } catch (e) {
    logger.error('cache get échoué', { errorMessage: (e as Error).message });
    return null;
  }
}

export async function cacheSet<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
  if (!config.cacheEnabled) return;
  const c = getRedisClient();
  if (!c || !isRedisReady()) return;
  try {
    const ttl = ttlSeconds ?? config.redis.cacheTtlSeconds;
    await c.set(makeKey(key), JSON.stringify(value), { EX: ttl });
  } catch (e) {
    logger.error('cache set échoué', { errorMessage: (e as Error).message });
  }
}

export async function cacheDel(keys: string | string[]): Promise<void> {
  if (!config.cacheEnabled) return;
  const c = getRedisClient();
  if (!c || !isRedisReady()) return;
  try {
    const ks = Array.isArray(keys) ? keys.map(makeKey) : [makeKey(keys)];
    if (ks.length === 0) return;
    await c.del(ks);
  } catch (e) {
    logger.error('cache del échoué', { errorMessage: (e as Error).message });
  }
}

export async function getOrSet<T>(key: string, ttlSeconds: number, loader: () => Promise<T>): Promise<T> {
  if (!config.cacheEnabled) {
    return loader();
  }
  try {
    const cached = await cacheGet<T>(key);
    if (cached !== null) return cached;
    const val = await loader();
    await cacheSet(key, val, ttlSeconds);
    return val;
  } catch {
    return loader();
  }
}
