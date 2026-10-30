import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { Ico } from '../components/brand/Ico'

/**
 * Toast — reproduction du `toast(msg, icon)` de `Bureau/main/app.js` §Toast.
 *
 * Ce que dit la maquette (source de vérité visuelle) :
 * · UN SEUL bandeau `#toast`, **toujours monté** dans le DOM, fixé en bas au
 *   centre (`position:fixed; left:50%; bottom:28px`), opacité 0 par défaut ;
 * · il devient visible en recevant la classe `.on` (transition .24s) ;
 * · l'icône est le sprite SVG `<svg class="i sm"><use href="#i-…"/></svg>` —
 *   donc `Ico`, **jamais** une classe Font Awesome ;
 * · disparition automatique après 2600 ms, sans bouton de fermeture.
 *
 * L'API publique (`toast(kind, message)`) est inchangée : elle est appelée par
 * 40 sites (public ET admin).
 *
 * Conteneur : le toast est monté à la racine (`main.tsx`), donc **hors**
 * `.market-site` (celui-ci n'est posé que par `SiteShell`, absent des routes
 * admin). On enveloppe donc le bandeau dans un `<div class="market-site">`
 * vide — la règle racine ne déclare que des variables CSS et ne pose aucun
 * fond ni dimension, l'enveloppe reste donc invisible et de hauteur nulle
 * (l'enfant est `position:fixed`), tout en permettant à `bureau.css` de
 * s'appliquer. Sans cette enveloppe, `.toast` ne serait jamais stylé.
 *
 * `IconSprite` est monté à la racine de `main.tsx` (comme dans
 * `index.html`) : les `<use href="#i-…">` doivent résorber sur **toutes**
 * les routes, admin comprise.
 */
type ToastKind = 'success' | 'error' | 'info'

interface ToastItem {
  id: number
  kind: ToastKind
  message: string
}

const ToastContext = createContext<(kind: ToastKind, message: string) => void>(() => {})

/** Icônes du sprite SVG (jeu DA : `circle-check`, `circle-info`, `triangle-exclamation`). */
const KIND_ICON: Record<ToastKind, string> = {
  success: 'circle-check',
  error: 'triangle-exclamation',
  info: 'circle-info',
}

/** Durée d'affichage de la maquette (`app.js` : `setTimeout(…, 2600)`). */
const VISIBLE_MS = 2600
/** Délai avant démontage, une fois le fondu `.on` → opacité 0 terminé (`--t` = .24s). */
const REMOVE_MS = VISIBLE_MS + 300

export function ToastProvider({ children }: { children: ReactNode }) {
  const [item, setItem] = useState<ToastItem | null>(null)
  const [shown, setShown] = useState(false)
  const nextId = useRef(1)
  const timers = useRef<number[]>([])
  const raf = useRef(0)

  const clearTimers = () => {
    timers.current.forEach((t) => window.clearTimeout(t))
    timers.current = []
    if (raf.current) {
      window.cancelAnimationFrame(raf.current)
      raf.current = 0
    }
  }

  const push = useCallback((kind: ToastKind, message: string) => {
    clearTimers()
    // Un seul bandeau : le nouveau remplace l'ancien (comme `#toast` unique).
    setShown(false)
    setItem({ id: nextId.current++, kind, message })
  }, [])

  // Après rendu du nouveau message : on bascule sur `.on` au frame suivant,
  // sinon la transition d'entrée ne se rejoue pas (il faut un frame où
  // l'élément est encore à opacité 0 avant de passer à 1).
  useEffect(() => {
    if (!item) return
    raf.current = window.requestAnimationFrame(() => setShown(true))
    timers.current.push(window.setTimeout(() => setShown(false), VISIBLE_MS))
    timers.current.push(window.setTimeout(() => setItem(null), REMOVE_MS))
    return clearTimers
  }, [item])

  return (
    <ToastContext.Provider value={push}>
      {children}
      {/* Enveloppe : voir le commentaire de module ci-dessus. */}
      <div className="market-site rv-toastlayer">
        <div className={`toast${shown ? ' on' : ''}`} id="toast" role="status" aria-live="polite">
          {item ? (
            <>
              <Ico name={KIND_ICON[item.kind]} cls="sm" />
              {item.message}
            </>
          ) : null}
        </div>
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  return useContext(ToastContext)
}
