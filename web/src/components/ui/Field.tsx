import type { ReactNode } from 'react'

/**
 * Champ label/valeur des fiches de détail (spec-admin §6-8).
 * `label` = `text-xs font-semibold uppercase tracking-wide text-muted`,
 * valeur `mt-0.5 text-sm font-medium text-ink`, espacement 12 px.
 */
export function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <dt className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-1 text-sm font-medium text-ink">{children}</dd>
    </div>
  )
}

/** Grille de champs : 1 col < 1024, 2 col ≥ 1024 (spec-admin §6-8). */
export function FieldGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <dl className={`grid gap-3 ${className ?? ''}`}>{children}</dl>
}
