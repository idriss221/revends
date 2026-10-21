import { useEffect, useRef } from 'react'

/**
 * Révélation au défilement — `observeReveals()` de `Bureau/main/assets/app.js`.
 *
 * La maquette ajoute `.on` aux `.rv` déjà visibles, puis observe les autres
 * (délai `calc(var(--d)*70ms)` = décalage en cascade). Ici on garde la même
 * règle, plus un observateur de mutations : les vues React remplissent leur
 * grille **après** le montage (React Query), la maquette, elle, écrivait tout
 * en une passe.
 *
 * Sans ce hook, tout élément `.rv` resterait à `opacity:0` (`.rv{opacity:0}`).
 */
export function useReveals(ref: React.RefObject<HTMLElement | null>): void {
  const ioRef = useRef<IntersectionObserver | null>(null)

  useEffect(() => {
    const root = ref.current
    if (!root) return

    const supported = typeof IntersectionObserver !== 'undefined'
    if (supported && !ioRef.current) {
      ioRef.current = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (!entry.isIntersecting) continue
            entry.target.classList.add('on')
            ioRef.current?.unobserve(entry.target)
          }
        },
        { rootMargin: '0px 0px -6% 0px', threshold: 0.01 },
      )
    }

    const scan = () => {
      const items = root.querySelectorAll<HTMLElement>('.rv:not(.on)')
      items.forEach((el) => {
        const io = ioRef.current
        if (!io) {
          // Pas d'IntersectionObserver → tout visible immédiatement.
          el.classList.add('on')
          return
        }
        if (el.getBoundingClientRect().top < window.innerHeight) el.classList.add('on')
        else io.observe(el)
      })
    }

    // Après la prochaine peinture : le DOM de la vue courante est monté.
    const raf = requestAnimationFrame(scan)
    // Les grilles arrivent après le montage (données async) → rescans.
    const mo = new MutationObserver(scan)
    mo.observe(root, { childList: true, subtree: true })

    return () => {
      cancelAnimationFrame(raf)
      mo.disconnect()
      ioRef.current?.disconnect()
      ioRef.current = null
    }
  }, [ref])
}
