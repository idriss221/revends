import type { StatusBadgeKind } from '../../lib/constants'

/**
 * Badge de statut — design-system-revends-v5 §3.5.
 *
 * · 6 kinds, TOUS en tokens REVENDS : aucun `blue` / `purple` / `green`
 *   décoratif (interdit §9.5) ;
 * · `dot` (pastille 8 px) : l'information ne repose JAMAIS sur la couleur
 *   seule (WCAG 1.4.1). `dot` est forcé dans l'admin, laissé `false` sur le
 *   front public pour ne rien changer aux écrans déjà livrés.
 * · Utilise les jetons de design system pour les couleurs, inline styles pour le layout.
 */
const KINDS: Record<StatusBadgeKind, { bg: string; color: string }> = {
  pending: { bg: 'var(--champagne-soft)', color: 'var(--champagne)' },
  approved: { bg: 'var(--positive-soft)', color: 'var(--positive)' },
  sold: { bg: 'var(--ink)', color: 'var(--on-dark)' },
  rejected: { bg: 'var(--danger-soft)', color: 'var(--danger)' },
  reserved: { bg: 'var(--terracotta-soft)', color: 'var(--terracotta-ink)' },
  neutral: { bg: 'var(--ivory)', color: 'var(--muted)' },
}

export function StatusBadge({
  kind,
  label,
  dot = false,
  className,
}: {
  kind: StatusBadgeKind
  label: string
  /** pastille 8 px — la couleur n'est jamais seule (1.4.1) */
  dot?: boolean
  className?: string
}) {
  const { bg, color } = KINDS[kind]
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1 text-[12px] font-bold ${className ?? ''}`}
      style={{ backgroundColor: bg, color } as React.CSSProperties}
    >
      {dot && <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: 'currentColor', flexShrink: 0 }} />}
      {label}
    </span>
  )
}