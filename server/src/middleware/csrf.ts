import type { NextFunction, Request, Response } from 'express';
import crypto from 'node:crypto';
import { config } from '../config.js';

/**
 * Protection CSRF par **double soumission de jeton** (sans dépendance : `csurf`
 * est déprécié et non maintenu).
 *
 * Contrat (aligné sur le client front unique — `web/src/lib/api.ts`) :
 *  - le serveur pose un cookie **lisible** `csrf_token` (jamais `HttpOnly`,
 *    sinon le SPA ne peut pas le relire), avec un `maxAge` aligné sur la
 *    session (`config.sessionMaxAgeMs` = 7 j glissants) ;
 *  - le client relit ce cookie À CHAQUE requête mutante et renvoie le jeton
 *    dans l'en-tête `X-CSRF-Token` ;
 *  - le serveur exige l'**égalité** (comparaison à temps constant) pour toute
 *    méthode mutante (POST/PUT/PATCH/DELETE).
 *
 * Défense en profondeur : un cookie `SameSite=Lax` bloque déjà l'envoi du
 * cookie de session sur une requête inter-site ; on ajoute
 *  1. un contrôle d'`Origin`/`Referer` (liste blanche `CORS_ORIGINS` +
 *     même-hôte) — bloque une requête forgée même si le jeton a fuité ;
 *  2. la double soumission ci-dessus.
 *
 * Règles :
 *  - Bypass total en `NODE_ENV=test` (comme le rate-limit) : figé à la création.
 *  - Cookie CSRF **obligatoire** sur toute méthode mutante : cookie absent →
 *    `403 CSRF_INVALID`, même si `Origin` est absent ou autorisé. Un client non
 *    navigateur doit d'abord effectuer une requête sûre (GET/HEAD/OPTIONS),
 *    qui lui remet le jeton — c'est le parcours réel du SPA.
 *  - Le cookie n'est (re)posé que sur les requêtes sûres : rafraîchir le jeton
 *    d'une mutation rejetée n'aurait aucun sens. Sur ces méthodes sûres il est
 *    RENOUVELÉ à chaque requête (nouveau `randomBytes`, nouveau `maxAge`),
 *    en alignement avec la session `rolling: true` — un onglet actif plus de
 *    7 j sans rechargement ne se retrouve jamais « session valide + CSRF off ».
 */

export const CSRF_COOKIE = 'csrf_token';
export const CSRF_HEADER = 'x-csrf-token';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export interface CsrfOptions {
  /** Force l'application même en `NODE_ENV=test` (tests unitaires du middleware). */
  enforce?: boolean;
  /** Origines autorisées. Défaut : `config.corsOrigins`. */
  origins?: readonly string[];
  /** Flag `Secure` du cookie CSRF. Défaut : `config.cookieSecure`. */
  cookieSecure?: boolean;
}

/** Décodage tolérant : un couple mal encodé (`%zz`) ne doit jamais lever de 500. */
function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** Découpe `Cookie: a=1; b=2` en objet (sans `cookie-parser`). */
function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq <= 0) continue;
    const key = part.slice(0, eq).trim();
    if (key) out[key] = safeDecodeURIComponent(part.slice(eq + 1).trim());
  }
  return out;
}

/** Égalité à temps constant (longueurs différentes ⇒ `false`, jamais d'exception). */
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/** `true` si l'origine est autorisée (liste blanche OU même hôte que la requête). */
function isAllowedOrigin(value: string, origins: readonly string[], req: Request): boolean {
  let origin: string;
  try {
    origin = new URL(value).origin;
  } catch {
    return false;
  }
  if (origins.includes(origin)) return true;
  const host = req.get('host');
  if (host) {
    try {
      if (new URL(origin).host === host) return true;
    } catch {
      /* ignore */
    }
  }
  return false;
}

function reject(res: Response): void {
  res.status(403).json({
    error: {
      code: 'CSRF_INVALID',
      message: 'Jeton CSRF manquant ou invalide',
    },
  });
}

/** Crée le middleware CSRF. Le bypass `NODE_ENV=test` est figé à la création. */
export function createCsrfProtection(opts: CsrfOptions = {}) {
  const enforce = opts.enforce ?? process.env.NODE_ENV !== 'test';
  const origins = opts.origins ?? config.corsOrigins;
  const secure = opts.cookieSecure ?? config.cookieSecure;

  return function csrfProtection(req: Request, res: Response, next: NextFunction): void {
    if (!enforce) {
      next();
      return;
    }

    const cookies = parseCookies(req.headers.cookie);
    const cookieToken = cookies[CSRF_COOKIE];

    if (SAFE_METHODS.has(req.method)) {
      // Pose/renouvelle le jeton lisible (double soumission) pour la suite.
      // Renouvelé À CHAQUE requête sûre, comme la session `rolling: true` :
      // un onglet actif en continu voit son cookie rafraîchi avant toute échéance.
      res.cookie(CSRF_COOKIE, crypto.randomBytes(32).toString('hex'), {
        httpOnly: false,
        sameSite: 'lax',
        secure,
        path: '/',
        // Aligné sur la session (`connect.sid`) : 7 j glissants, pour qu'un
        // onglet ouvert ne se retrouve jamais « session valide + CSRF off ».
        maxAge: config.sessionMaxAgeMs,
      });
      next();
      return;
    }

    // Méthode mutante : le cookie CSRF est OBLIGATOIRE, même si l'origine est
    // absente ou autorisée — un client sans jeton commence par un GET sûr.
    if (!cookieToken) {
      reject(res);
      return;
    }

    // 1) Contrôle d'origine (bloque une requête forgée même avec un jeton volé).
    const origin = req.get('origin') ?? req.get('referer');
    if (origin && !isAllowedOrigin(origin, origins, req)) {
      reject(res);
      return;
    }

    // 2) Double soumission : égalité à temps constant en-tête/cookie.
    const header = req.get(CSRF_HEADER);
    if (!header || !safeEqual(header, cookieToken)) {
      reject(res);
      return;
    }

    next();
  };
}
