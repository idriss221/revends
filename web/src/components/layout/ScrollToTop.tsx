import { useEffect } from 'react'
import { useLocation } from 'react-router'

/**
 * Remet la page en haut à chaque changement de route.
 *
 * Sans ce comportement, React Router conserve la position de défilement de la
 * page précédente : ouvrir une fiche produit depuis le bas du catalogue
 * affichait directement le bas de la fiche.
 *
 * On écoute uniquement `pathname` (pas `search`) : changer un filtre ou une
 * page du catalogue ne doit PAS remonter la page — la vue Shop gère elle-même
 * son ancrage.
 */
export function ScrollToTop() {
  const { pathname } = useLocation()

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])

  return null
}
