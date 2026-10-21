import { Router } from 'express';
import { isRedisReady } from '../cache/redis.js';
import { rateLimitBackend } from '../middleware/rate-limit.js';
import { config } from '../config.js';

const router = Router();
const startedAt = Date.now();

/**
 * `GET /health` / `GET /api/health` renvoient déjà `{"status":"ok"}`.
 * Cette probe fournit le détail d'exploitation (observabilité) : cache Redis,
 * backend de rate limiting, pool PostgreSQL unique.
 */
router.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
    redis: { used: config.cacheEnabled, ready: isRedisReady() },
    rateLimit: { backend: rateLimitBackend() },
    cache: { enabled: config.cacheEnabled, ttlSeconds: config.redis.cacheTtlSeconds },
    db: { singlePool: true },
  });
});

export const systemRouter = router;
