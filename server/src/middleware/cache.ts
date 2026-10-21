import type { NextFunction, Request, Response } from 'express';

/**
 * Politique `Cache-Control` (V5 / PO-V5-07, variante (b) ACTÉE par le chef de
 * projet le 28/09/2026 — CA-V5-094, DET-05).
 *
 * Décision, et sa justification :
 * - **défaut `private, no-store`** sur TOUTE l'API. Une réponse d'API
 *   REVENDS est liée à la session (`connect.sid`) : la mettre en cache public
 *   exposerait le contenu d'un utilisateur à un autre. `no-store` est le
 *   choix sûr, et c'est aussi le choix CORRECT ici : un cache public mal
 *   conçu servirait des produits périmés après modération (un produit
 *   `PENDING`/`REJECTED` ou supprimé logiquement réapparaîtrait en cache) ;
 * - **exception limitée à deux jeux de données stables et non personnelles**,
 *   publics par nature et quasi immuables entre deux publications :
 *   `/api/categories` (arbre des catégories, modifié par un admin) et
 *   `/api/banners` (bannières du carrousel). `max-age=60` +
 *   `stale-while-revalidate=120` : le client rafraîchit en arrière-plan sans
 *   jamais attendre le réseau, et la fenêtre de 3 minutes est assez courte
 *   pour qu'une modification soit vue rapidement.
 *
 * Règle de non-régression : cet en-tête ne modifie AUCUNE forme de réponse
 * (ni statut, ni corps, ni ordre). Seul l'en-tête change ; les tests
 * existants, qui ne le lisent pas, restent verts.
 */

/** Chemins dont la réponse peut être mise en cache public (comparaison exacte ou préfixe). */
const CACHEABLE_PREFIXES = ['/api/categories', '/api/banners'] as const;

const NO_STORE = 'private, no-store';
const PUBLIC_SHORT = 'public, max-age=60, stale-while-revalidate=120';

export function cacheControl(req: Request, res: Response, next: NextFunction): void {
  // ⚠️ `req.path` est RELATIF au point de montage : dans `app.use('/api', …)`
  // il vaut `/categories`, pas `/api/categories`. Utiliser `req.originalUrl`
  // (qui inclut le préfixe et la query) est la seule façon de comparer aux
  // chemins complets de la PO. La query est retirée avant comparaison.
  const path = (req.originalUrl || req.url).split('?')[0]!;
  const isCacheable = CACHEABLE_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );
  res.setHeader('Cache-Control', isCacheable ? PUBLIC_SHORT : NO_STORE);
  next();
}
