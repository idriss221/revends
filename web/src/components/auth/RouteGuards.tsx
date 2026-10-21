import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'
import { useAuth } from '../../context/AuthContext'
import { PageLoader } from '../ui/Loading'
import { SiteEmpty } from '../site/SiteBits'
import {
  guardDecision,
  loginRedirect,
  FORBIDDEN_REDIRECT,
  type GuardDecision,
  type GuardSpace,
} from '../../lib/access'

/**
 * Garde de route « accès refusé » (spec §6.3 / CA-AUTH04-05).
 *
 * Visuel : gabarit `.empty` de `Bureau/main` (`SiteEmpty`), comme les autres
 * écrans d'état du site — icône du sprite, `<h1>` de page, paragraphe, une
 * seule action. L'écran d'échec reste VISUEL et lisible (CA-V5-143), pas une
 * modale muette ni une page vide. Ce n'est PAS une carte Tailwind centrée :
 * ce composant est rendu dans `SiteShell` (espace `.market-site`), le CSS de
 * la maquette s'applique donc directement.
 *
 * `RequireAdmin` n'utilise JAMAIS cet écran (un non-admin est redirigé
 * vers `FORBIDDEN_REDIRECT`) : il n'est donc exposé qu'aux comptes dont le
 * rôle n'est ni `user` ni `admin` (fail-closed de `guardDecision`).
 */
export function ForbiddenPage() {
  return (
    <div className="wrap">
      <div className="section">
        <SiteEmpty
          icon="shield"
          level={1}
          role="alert"
          title="Accès refusé"
          action={{ label: "Retour à l'accueil", to: '/' }}
          style={{ maxWidth: '640px', marginInline: 'auto' }}
        >
          Cet espace est réservé aux administrateurs. Votre compte ne dispose pas des droits nécessaires.
        </SiteEmpty>
      </div>
    </div>
  )
}

/**
 * Routes /mes-*, /vendre, /profil, /notifications : réservées aux `user`.
 * Un admin connecté y est ADMIS (il possède aussi un profil) : on ne le bloque
 * que sur la route *interdite* — le compte admin a bien ses propres pages.
 */
export function RequireUser({ children }: { children: ReactNode }) {
  const location = useLocation()
  const { user, loading } = useAuth()

  switch (guardDecision('user', { loading, user })) {
    case 'loading':
      return <PageLoader />
    case 'anonymous':
      return <Navigate to={loginRedirect(location.pathname, location.search)} replace />
    case 'forbidden':
      return <ForbiddenPage />
    default:
      return <>{children}</>
  }
}

/**
 * Routes `/admin*` : réservées à l'admin (CA-AUTH04-05).
 *
 * · utilisateur **connecté non admin** → redirection vers l'accueil `replace`
 *   (une URL d'admin ne doit jamais rester dans l'historique ni être
 *   partageable) ;
 * · **anonyme** → page de connexion en conservant la destination (`next`),
 *   sinon un admin déconnecté perd son contexte de travail.
 */
export function RequireAdmin({ children }: { children: ReactNode }) {
  const location = useLocation()
  const { user, loading } = useAuth()

  switch (guardDecision('admin', { loading, user })) {
    case 'loading':
      return <PageLoader />
    case 'anonymous':
      return <Navigate to={loginRedirect(location.pathname, location.search)} replace />
    case 'forbidden':
      return <Navigate to={FORBIDDEN_REDIRECT} replace />
    default:
      return <>{children}</>
  }
}

/* La règle RBAC elle-même vit dans `lib/access.ts` (module pur, testable sans
   DOM) ; on la ré-exporte ici pour que les gardes restent l'unique point
   d'entrée du RBAC côté composants. */
export { guardDecision, loginRedirect, FORBIDDEN_REDIRECT }
export type { GuardDecision, GuardSpace }
