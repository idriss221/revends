import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useFocusTrap } from '../../hooks/useFocusTrap'

export type ModalSize = 'sm' | 'md' | 'lg' | 'xl'

/** largeurs du spec-admin §4.4 : confirmation · action · détail · dossier produit */
const SIZES: Record<ModalSize, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
}

interface ModalProps {
  open: boolean
  /** `undefined` quand la modale rend son propre titre (fiche produit) */
  title?: string
  onClose: () => void
  children: ReactNode
  size?: ModalSize
  /** empêcher la fermeture par Échap / clic overlay (formulaires, action en cours) */
  dismissable?: boolean
}

/**
 * Modale accessible — DA §3.9 + §8 / spec-admin CA-V5-043.
 *
 * · `role="dialog"` + `aria-modal` + **`aria-labelledby`** sur le `h2` ;
 * · focus déplacé sur le conteneur à l'ouverture, **piégé** (Tab / Shift+Tab,
 *   via `useFocusTrap` — logique partagée avec le tiroir admin) ;
 * · `Échap` ferme (sauf `dismissable={false}`) ;
 * · focus **restauré au déclencheur** à la fermeture ;
 * · `body` scroll verrouillé ;
 * · **sous 768 px → feuille basse** (DA §5.8) : `rounded-t-lg` + poignée +
 *   `animate-sheet-up`, `max-h-[88vh]`, débordement interne maîtrisé.
 */
export function Modal({ open, title, onClose, children, size = 'md', dismissable = true }: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLElement | null>(null)
  const titleId = useId()

  // Piège Tab/Shift+Tab : logique partagée avec le tiroir de `DashboardLayout`
  // (CA-V5-043) — avant extraction, elle vivait dans l'`onKey` ci-dessous.
  useFocusTrap(dialogRef, open)

  useEffect(() => {
    if (!open) return
    triggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const node = dialogRef.current
    node?.focus()

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || !dismissable) return
      e.stopPropagation()
      onClose()
    }

    document.addEventListener('keydown', onKey)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = previousOverflow
      triggerRef.current?.focus()
    }
  }, [open, onClose, dismissable])

  if (!open) return null

  // Le titre estOptionnel côté appelant quand le contenu porte déjà son propre
  // en-tête (ex. AdminProductSheet rend le nom de l'article + statut) : on
  // n'affiche alors pas de `<h2>` dupliqué, mais le dialogue reste étiqueté.
  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 max-md:items-end max-md:p-0">
      <div
        className="absolute inset-0 bg-overlay"
        onClick={dismissable ? onClose : undefined}
        aria-hidden="true"
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-label={title ? undefined : 'Fiche article'}
        tabIndex={-1}
        className={`relative z-[10] w-full ${SIZES[size]} animate-pop-in rounded-lg bg-white p-7 shadow-lg outline-none max-md:max-h-[88vh] max-md:animate-sheet-up max-md:overflow-y-auto max-md:rounded-b-none max-md:rounded-t-lg max-md:p-6`}
      >
        {/* Poignée — feuille basse mobile uniquement (DA §5.8) */}
        <div aria-hidden="true" className="mx-auto mb-3 mt-1 hidden h-1 w-10 rounded-full bg-line max-md:block" />
        <div className="mb-5 flex items-start justify-between gap-4">
          {title ? (
            <h2 id={titleId} className="text-[19px] font-extrabold text-ink">
              {title}
            </h2>
          ) : (
            <span />
          )}
          {dismissable && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Fermer"
              className="-mt-1 flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted transition-colors hover:bg-ink/5 hover:text-ink"
            >
              <i className="fas fa-xmark" aria-hidden="true" />
            </button>
          )}
        </div>
        {children}
      </div>
    </div>,
    document.body,
  )
}
