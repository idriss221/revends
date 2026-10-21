import type { NextFunction, Request, Response } from 'express';
import { config } from '../config.js';

const ALLOWED_METHODS = 'GET,POST,PUT,PATCH,DELETE,OPTIONS';
const DEFAULT_ALLOWED_HEADERS = 'Content-Type,Accept,Origin,X-Requested-With';
const MAX_AGE_SECONDS = '600';

/**
 * CORS explicite, sans dépendance externe.
 *
 * - Liste blanche stricte via `CORS_ORIGINS` (repli `SITE_URL`) : on renvoie
 *   l'origine exacte demandée, jamais `*`, car les cookies de session
 *   exigent `Access-Control-Allow-Credentials: true` (incompatible avec `*`).
 * - Les requêtes SANS en-tête `Origin` (same-origin, clients mobiles, tests
 *   HTTP) ne reçoivent aucun en-tête CORS : comportement neutre.
 * - Preflight `OPTIONS` : traité ici même (204) pour ne traverser ni le
 *   session store, ni le rate limiter, ni le routeur.
 */
export function cors(req: Request, res: Response, next: NextFunction): void {
  res.vary('Origin');

  const origin = req.headers.origin;
  if (typeof origin === 'string' && config.corsOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', ALLOWED_METHODS);
    const requested = req.headers['access-control-request-headers'];
    res.setHeader(
      'Access-Control-Allow-Headers',
      typeof requested === 'string' && requested.trim().length > 0 ? requested : DEFAULT_ALLOWED_HEADERS,
    );
    res.setHeader('Access-Control-Max-Age', MAX_AGE_SECONDS);
  }

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  next();
}
