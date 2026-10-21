import type { SelfUser } from './types'

/**
 * Règle de RBAC des routes protégées — module **pur** (ni React, ni fetch,
 * ni `react-router`) : la règle est donc testable directement, sans DOM
 * (`routeGuards.test.ts`).
 *
 * Contrat (CA-AUTH04-05, CA-V5-153, RG-V5-08) :
 * · **anonyme** sur une route protégée → page de connexion, destination
 *   conservée dans `next` (un admin déconnecté ne perd pas son contexte) ;
 * · **utilisateur non-admin** sur `/admin/*` → accueil : une URL d'admin ne
 *   doit jamais rester dans l'historique ni être partageable ;
 * · **admin** sur une route utilisateur → **admis** (le compte admin a aussi
 *   un profil et ses propres pages) ;
 * · **aucune boucle** : rien ne redirige jamais vers `/login?next=/login`, et
 *   le refus pointe vers l'accueil, jamais vers une route admin.
 */

/** Ce que la garde autorise à rendre. */
export type GuardDecision =
  /** session pas encore résolue → splash, jamais une redirection prématurée */
  | 'loading'
  /** pas de session → page de connexion en conservant la destination */
  | 'anonymous'
  /** connecté mais droit insuffisant */
  | 'forbidden'
  /** autorisé */
  | 'ok'

/** Espace protégé. `user` = session valide (admin inclus) ; `admin` = rôle admin. */
export type GuardSpace = 'user' | 'admin'

/** Destination d'un accès refusé : l'accueil, en `replace` (pas d'historique). */
export const FORBIDDEN_REDIRECT = '/'

/**
 * Décide de l'accès à une route protégée.
 *
 * `loading` passe **en premier** : tant que `GET /api/auth/me` n'a pas
 * répondu, on ne statue pas — sans quoi un admin déjà connecté verrait
 * « /login » clignoter à chaque rafraîchissement de page.
 *
 * Un rôle inconnu est traité comme `forbidden` (**fail-closed**) : ajouter un
 * rôle côté serveur ne doit jamais ouvrir un espace par inadvertance.
 */
export function guardDecision(
  space: GuardSpace,
  state: { loading: boolean; user: SelfUser | null },
): GuardDecision {
  if (state.loading) return 'loading'
  if (!state.user) return 'anonymous'
  if (space === 'admin' && state.user.role !== 'admin') return 'forbidden'
  if (space === 'user' && state.user.role !== 'user' && state.user.role !== 'admin') return 'forbidden'
  return 'ok'
}

/** Destination de connexion : la page courante, encodée dans `next`. */
export function loginRedirect(pathname: string, search = ''): string {
  return `/login?next=${encodeURIComponent(`${pathname}${search}`)}`
}
