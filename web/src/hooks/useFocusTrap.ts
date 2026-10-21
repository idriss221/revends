import { useEffect, type RefObject } from 'react'

/**
 * Sélecteur des éléments atteignables au clavier — identique à l'ancien
 * `FOCUSABLE` de `Modal.tsx` (aucune sémantique changée).
 */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Piège de focus Tab / Shift+Tab — CA-V5-043 (« la navigation clavier atteint
 * la modale et en sort ») et CA-V5-156-e (focus **piégé** dans un overlay).
 *
 * Source unique partagée par `Modal` (modales d'action, fiche produit) et par
 * le tiroir mobile de `DashboardLayout` : les deux sont des `role="dialog"`
 * `aria-modal`, ils doivent donc se comporter pareil. Échap, scroll-lock et
 * restitution du focus au déclencheur restent gérés par chaque appelant (ils
 * diffèrent : `dismissable`, voile, bouton déclencheur…).
 *
 * Cas couverts : focus hors du conteneur (on y revient), Tab depuis le dernier
 * élément (boucle sur le premier), Shift+Tab depuis le premier (boucle sur le
 * dernier), conteneur vide (le conteneur lui-même reçoit le focus).
 */
export function useFocusTrap(containerRef: RefObject<HTMLElement | null>, active: boolean) {
  useEffect(() => {
    if (!active) return
    const node = containerRef.current

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || !node) return
      const focusables = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      )
      if (focusables.length === 0) {
        e.preventDefault()
        node.focus()
        return
      }
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      const activeElement = document.activeElement
      // Focus sorti du dialogue (overlay, fenêtre du navigateur) : on le
      // rattache, sinon Tab continuerait à circuler derrière le voile.
      if (!node.contains(activeElement)) {
        e.preventDefault()
        ;(e.shiftKey ? last : first).focus()
        return
      }
      if (e.shiftKey && (activeElement === first || activeElement === node)) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && (activeElement === last || activeElement === node)) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [containerRef, active])
}
