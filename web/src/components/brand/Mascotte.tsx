import { Boucle } from './Boucle'

/**
 * Mascotte « la Boucle » — même glyphe que le logo (spec §2).
 * SEULE apparition autorisée : états vides (§3.12) et écran 404.
 * 64 px, une seule rotation de 8° au montage en 600 ms, puis immobile.
 * Jamais de boucle d'animation ; neutralisée par `prefers-reduced-motion`.
 *
 * Utilise les jetons de design system (pas de Tailwind).
 */
export function Mascotte({
  tone = 'terracotta',
  className = '',
}: {
  tone?: 'terracotta' | 'champagne' | 'positive'
  className?: string
}) {
  const colorClass = {
    terracotta: 'text-accent',
    champagne: 'text-champagne-deep',
    positive: 'text-positive',
  }[tone]

  return <Boucle className={`mascotte-nod mx-auto h-16 w-16 shrink-0 ${colorClass} ${className}`} />
}