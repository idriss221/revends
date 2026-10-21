import type { StatusBadgeKind } from '../../lib/constants'

/**
 * Badge de statut — design-system-revends-v5 §3.5.
 *
 * · 6 kinds, TOUS en tokens REVENDS : aucun `blue` / `purple` / `green`
 *   décoratif (interdit §9.5) ;
 * · `dot` (pastille 8 px) : l'information ne repose JAMAIS sur la couleur
 *   seule (WCAG 1.4.1). `dot` est forcé dans l'admin, laissé `false` sur le
 *   front public pour ne rien changer aux écrans déjà livrés.
 */
const KINDS: Record<StatusBadgeKind, string> = {
  pending: 'bg-champagne-soft text-chocolate',
  approved: 'bg-positive-soft text-positive',
  sold: 'bg-ink text-on-dark',
  rejected: 'bg-danger-soft text-danger',
  reserved: 'bg-terracotta-soft text-terracotta-ink',
  neutral: 'bg-ivory text-muted',
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
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1 text-[12px] font-bold ${KINDS[kind]} ${className ?? ''}`}
    >
      {dot && <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-current" />}
      {label}
    </span>
  )
}
