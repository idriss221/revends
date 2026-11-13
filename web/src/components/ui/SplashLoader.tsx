import { useEffect, useState } from 'react'
import { HeartMark } from './HeartMark'

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
        <HeartMark />
        <span className="rv-splash__cap">ReVends</span>
      </div>
    </div>
  )
}
