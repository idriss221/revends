import { useEffect, useState } from 'react'

/**
 * Splash d'ouverture « Le Cœur couture » — repris de `Bureau/main/index.html`
 * (loader signature). Visible dès le premier rendu public, retiré dès que la
 * vue est prête (durée mini courte + filet de sécurité).
 *
 * `prefers-reduced-motion` : disparition immédiate (pas de fondu), et
 * l'animation du cœur est neutralisée par `index.css`.
 */
const MIN_VISIBLE_MS = 650
const SAFETY_MS = 2600
const FADE_MS = 620

export function SplashLoader() {
  const [out, setOut] = useState(false)
  const [gone, setGone] = useState(false)

  useEffect(() => {
    const reduce =
      typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const shownAt = typeof performance !== 'undefined' && performance.now ? performance.now() : 0

    const dismiss = () => setOut(true)
    const timers = [
      window.setTimeout(dismiss, reduce ? 0 : Math.max(0, MIN_VISIBLE_MS - shownAt)),
      window.setTimeout(dismiss, SAFETY_MS),
    ]
    return () => timers.forEach((t) => window.clearTimeout(t))
  }, [])

  useEffect(() => {
    if (!out) return
    const reduce =
      typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const timer = window.setTimeout(() => setGone(true), reduce ? 0 : FADE_MS)
    return () => window.clearTimeout(timer)
  }, [out])

  if (gone) return null

  return (
    <div
      className={`rv-splash${out ? ' is-out' : ''}`}
      role="status"
      aria-live="polite"
      aria-label="Chargement de ReVends"
    >
      <div className="rv-splash__box">
        <svg className="rv-heart" viewBox="0 0 120 112" aria-hidden="true">
          <path
            className="hp"
            d="M60 100 C 18 70 10 42 30 27 C 46 15 60 28 60 40 C 60 28 74 15 90 27 C 110 42 102 70 60 100 Z"
          />
          <path className="shine" d="M34 38 C 42 30 52 30 58 38" />
        </svg>
        <span className="rv-splash__cap">ReVends</span>
      </div>
    </div>
  )
}
