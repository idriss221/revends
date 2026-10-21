import type { ReactNode } from 'react'

/**
 * Bandeau contextuel — spec-admin D10.
 *
 * Un seul composant pour les 4 tons (les 6 bandeaux du détail commande étaient
 * recopiés à la main). `role="status"` : l'information est contextuelle, pas
 * bloquante — les erreurs bloquantes passent par `ErrorMessage` (`role="alert"`).
 *
 * Palette : uniquement des tokens REVENDS (§3.5) — « en attente / attention »
 * = champagne-soft + chocolate (jamais d'ambre, DA §9.5).
 */
export type NoticeTone = 'info' | 'warning' | 'danger' | 'success'

const TONES: Record<NoticeTone, { box: string; icon: string }> = {
  info: { box: 'bg-champagne-soft text-chocolate', icon: 'fa-circle-info' },
  warning: { box: 'bg-champagne-soft text-chocolate', icon: 'fa-triangle-exclamation' },
  danger: { box: 'bg-danger-soft text-danger', icon: 'fa-circle-exclamation' },
  success: { box: 'bg-positive-soft text-positive', icon: 'fa-circle-check' },
}

export function Notice({ tone, children, className }: { tone: NoticeTone; children: ReactNode; className?: string }) {
  return (
    <div
      role="status"
      className={`flex items-start gap-3 rounded-sm px-4 py-3.5 text-sm ${TONES[tone].box} ${className ?? ''}`}
    >
      <i className={`fas ${TONES[tone].icon} mt-0.5 shrink-0`} aria-hidden="true" />
      <div className="min-w-0">{children}</div>
    </div>
  )
}
