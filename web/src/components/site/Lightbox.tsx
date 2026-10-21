import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Ico } from '../brand/Ico'

/* ============================================================================
   Visionneuse — reprise exacte de `<div class="lightbox" id="lightbox">`
   de `Bureau/main/index.html` (markup, classes, `hidden` + `.on`,
   `body.locked`, restitution du focus).

   La référence ouvre depuis une délégation `[data-zoom]` au document ;
   ici l'ouverture est EXPLICITE : `openZoom(src, alt)`. Montée UNE fois par
   `SiteShell` (public uniquement — l'admin n'est jamais touché).
   ========================================================================== */

interface ZoomPayload {
  src: string
  alt: string
}

const EVENT = 'rv:zoom'

/** Ouvre la visionneuse — équivalent de `openZoom(el)` de la référence. */
export function openZoom(src: string, alt: string): void {
  window.dispatchEvent(new CustomEvent<ZoomPayload>(EVENT, { detail: { src, alt } }))
}

export function Lightbox() {
  const [payload, setPayload] = useState<ZoomPayload | null>(null)
  const [on, setOn] = useState(false)
  const closeRef = useRef<HTMLButtonElement>(null)
  const returnTo = useRef<HTMLElement | null>(null)
  const timer = useRef<number | null>(null)

  /** Sortie animée : `.on` retiré → transition 260 ms → démontage. */
  const close = () => {
    setOn(false)
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setPayload(null), 260)
  }

  useEffect(() => {
    const onOpen = (e: Event) => {
      if (timer.current) window.clearTimeout(timer.current)
      returnTo.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
      setPayload((e as CustomEvent<ZoomPayload>).detail)
      setOn(false)
      requestAnimationFrame(() => setOn(true))
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener(EVENT, onOpen)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener(EVENT, onOpen)
      window.removeEventListener('keydown', onKey)
      if (timer.current) window.clearTimeout(timer.current)
    }
  }, [])

  // `body.locked{overflow:hidden}` + focus sur « Fermer » (comme la référence).
  useEffect(() => {
    if (!payload) return
    document.body.classList.add('locked')
    closeRef.current?.focus()
    return () => {
      document.body.classList.remove('locked')
      const el = returnTo.current
      if (el && document.contains(el)) el.focus()
      returnTo.current = null
    }
  }, [payload])

  if (!payload) return null
  const src = payload.src

  return (
    <div
      id="lightbox"
      className={`lightbox${on ? ' on' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label="Aperçu de l'image"
      onClick={(e) => {
        if (e.target === e.currentTarget) close()
      }}
    >
      <button className="close" ref={closeRef} type="button" onClick={close} aria-label="Fermer l'aperçu">
        <Ico name="x" />
      </button>
      <img src={src} alt={payload.alt} />
      <p className="cap">{payload.alt}</p>
    </div>
  )
}

/**
 * Bouton « Aperçu » — markup `.peek` de la référence (carte et galerie).
 * Toujours un `<button>` : aucun `href="#"`.
 */
export function ZoomButton({
  src,
  alt,
  label = 'Aperçu',
  children,
}: {
  src: string
  alt: string
  label?: string
  children?: ReactNode
}) {
  return (
    <button
      type="button"
      className="peek"
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        openZoom(src, alt)
      }}
      aria-label={`Aperçu de ${alt}`}
    >
      <Ico name="search" cls="sm" />
      {children ?? <span>{label}</span>}
    </button>
  )
}
