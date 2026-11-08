/**
 * ============================================================================
 * ReVends — point d'entrée serverless Vercel (Express zéro-config)
 * ============================================================================
 *
 * POURQUOI UN FICHIER `app.ts` À LA RACINE
 * -----------------------------------------
 * Vercel sait exécuter n'importe quelle application Express : si un fichier
 * `app.ts` (à la racine du projet) importe `express` et exporte l'application
 * en `export default`, Vercel crée UNE fonction qui répond à TOUTES les
 * requêtes du site, avec `req.url` inchangé.
 *
 * C'est le point clé du déploiement : aucune magie de catch-all n'est
 * nécessaire. Avec un fichier `api/[...path].ts`, la plateforme ne génère
 * qu'une route à un seul segment (`^/api/([^/]+)$`) et les routes métier à
 * deux segments (`/api/auth/login`, `/api/products/:id`, …) tombent en 404.
 * En mode zéro-config, `req.url` conserve le chemin ORIGINAL : les routes
 * `/api/...` de l'app métier fonctionnent donc telles quelles.
 *
 * RÉFLEXE "ISOLATION MULTI-TENANT"
 * --------------------------------
 * Un projet Vercel = une app = un `req.url`. La fonction reçoit tout
 * `/api/*` **et** les routes du SPA (fallback `index.html`). Le chemin
 * original est préservé dans `req.url` : les routes `/api/...` de l'app
 * métier fonctionnent donc sans réécriture.
 *
 * RÔLE
 * ----
 * Ce fichier ne réécrit PAS l'application métier : `createApp()`
 * (server/src/app.ts) construit exactement la même app Express que le
 * serveur Node classique (docker-compose, Render). On ne fait que :
 *   1. initialiser l'async (Redis) UNE fois par instance chaude ;
 *   2. déléguer (req, res) à cette app.
 *
 * POURQUOI UN WRAPPER EXPRESS AUTOUR DE L'APP MÉTIER
 * --------------------------------------------------
 * Exporter directement `createApp()` poserait deux problèmes :
 *   • `createApp()` est synchrone, alors que la connexion Redis est asynchrone
 *     et doit précéder la construction du store de sessions ;
 *   • la construction de l'app ferait partie du chargement du module, donc
 *     elle échouerait à l'import (module invalidé) si Redis est injoignable.
 * Le wrapper permet un démarrage paresseux : la 1re requête déclenche
 * l'init, les suivantes réutilisent l'instance (warm start).
 * ============================================================================
 */

import express from 'express';
import type { NextFunction, Request, Response } from 'express';

import { createApp } from './server/src/app.js';
import { connectRedis } from './server/src/cache/redis.js';
import { seedBannersIfEmpty } from './server/src/db/seed.js';
import { logger } from './server/src/utils/logger.js';

// ---------------------------------------------------------------------------
// Cycle de vie de l'instance
// ---------------------------------------------------------------------------

/** App métier prête à traiter une requête (null tant que le boot n'a pas fini). */
let instance: express.Express | null = null;
/** Boot en cours (évite N boots concurrents sur les requêtes simultanées). */
let booting: Promise<express.Express> | null = null;

async function boot(): Promise<express.Express> {
  // 1) Bannières du carrousel : seed idempotent (ne fait rien si la table est
  //    déjà remplie). NON bloquant — la 1re requête ne doit pas attendre la BDD
  //    pour cette opération décorative.
  void seedBannersIfEmpty().catch((err: unknown) => {
    logger.error('seed bannières ignoré', { errorMessage: (err as Error).message });
  });

  // 2) Redis (cache + rate-limit + sessions si SESSION_STORE=redis).
  //    DOIT être résolu AVANT `createApp()` : le store de sessions est choisi
  //    au moment de la construction de l'app, à partir du client Redis.
  //    En cas d'échec on continue : le store bascule sur PostgreSQL
  //    (connect-pg-simple), ce qui reste correct sur un déploiement
  //    serverless puisque la base est elle aussi partagée entre instances.
  await connectRedis().catch((err: unknown) => {
    logger.error('connexion Redis échouée — repli PostgreSQL', {
      errorMessage: (err as Error).message,
    });
  });

  // 3) App métier (identique au serveur Node classique).
  return createApp();
}

function getApp(): Promise<express.Express> {
  if (!booting) booting = boot();
  return booting;
}

// ---------------------------------------------------------------------------
// Normalisation du corps de requête
// ---------------------------------------------------------------------------
// Le runtime Vercel peut exposer `req.body` soit comme une propriété
// inexistante, soit comme un getter (parse paresseuse), soit comme une valeur
// déjà parsée. Or `express.json()` (body-parser) AFFECTE `req.body` :
//   • si `body` est un getter sans setter, l'affectation échoue et le corps
//     est perdu (symptôme : POST /api/auth/login répond « email/mot de passe
//     manquants » alors que le client a bien envoyé le JSON) ;
//   • si le corps a déjà été parsé par Vercel, le flux est consommé et
//     body-parser ne peut plus le relire.
//
// On normalise donc AVANT toute couche Express :
//   • corps déjà parsé  → on pose `_body` (body-parser saute alors la
//     relecture et conserve l'objet parsé) ;
//   • sinon             → on définit une propriété `body` inscriptible qui
//     masque un éventuel getter, sans toucher au flux (multer et body-parser
//     continuent de lire le flux brut).
// ---------------------------------------------------------------------------

function normalizeRequestBody(req: Request): void {
  const target = req as unknown as Record<string, unknown>;
  const descriptor = Object.getOwnPropertyDescriptor(req, 'body');
  const alreadyParsed =
    descriptor !== undefined &&
    'value' in descriptor &&
    descriptor.value !== undefined &&
    descriptor.value !== null;

  if (alreadyParsed) {
    // Vercel a déjà consommé et parsé le corps : on empêche body-parser de
    // tenter une relecture (qui échouerait sur un flux épuisé).
    target['_body'] = true;
    return;
  }

  // Masque un éventuel getter `body` du runtime par une propriété
  // inscriptible : Express/multer restent les seuls consommateurs du flux.
  try {
    Object.defineProperty(req, 'body', {
      value: undefined,
      writable: true,
      configurable: true,
      enumerable: true,
    });
  } catch {
    // Certain runtimes figent `req` : on continue, le comportement par
    // défaut du runtime s'applique.
  }
}

// ---------------------------------------------------------------------------
// Application wrapper
// ---------------------------------------------------------------------------

const app = express();
app.disable('x-powered-by');

app.use((req: Request, _res: Response, next: NextFunction) => {
  normalizeRequestBody(req);
  next();
});

// Délégation vers l'app métier. Les erreurs de boot (Redis + Postgres) sont
// transmises au gestionnaire d'erreurs Express plutôt que de faire échouer
// silencieusement la requête.
app.use((req: Request, res: Response, next: NextFunction) => {
  void getApp()
    .then((ready) => ready(req, res, next))
    .catch((err: unknown) => {
      logger.error('initialisation de l\'API impossible', {
        errorMessage: (err as Error).message,
      });
      next(err);
    });
});

export default app;
