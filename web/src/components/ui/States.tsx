import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { buttonClasses } from './Button'
import { Mascotte } from '../brand/Mascotte'

/**
 * États & cartes — design-system-revends-v5 §3.9 / §3.12.
 *
 * D1 (spec-admin) : `.card` (CSS, `index.css`) est l'unique source de style,
 * `Card` (ce composant) est l'unique point d'entrée JSX. Aucun `<div className="card">`
 * brut, aucun `!p-*` dans les pages.
 *
 * `EmptyState` : mascotte 64 px (« la Boucle »), `h3 text-[19px] font-bold`,
 * `p max-w-md text-sm text-muted`, action `primary sm` — **toujours** une action
 * (DA §3.12), sinon `Réessayer` côté erreur.
 * `variant="panel"` : état vide **dans** une carte existante (pas de surface
 * supplémentaire, pas de `!p-10`).
 */
export type EmptyStateVariant = 'card' | 'panel'

interface EmptyStateProps {
  title: string
  description?: string
  action?: { label: string; to?: string; onClick?: () => void }
  variant?: EmptyStateVariant
  className?: string
}

export function EmptyState({ title, description, action, variant = 'panel', className }: EmptyStateProps) {
  return (
    <div
      className={`${variant === 'card' ? 'card p-10 text-center shadow-sm' : 'py-10 text-center'} ${className ?? ''}`}
    >
      <Mascotte />
      <h3 className="mt-6 text-[19px] font-bold text-ink">{title}</h3>
      {description && <p className="mx-auto mt-2 max-w-md text-sm text-muted">{description}</p>}
      {action && (
        <>
          {action.to ? (
            <Link to={action.to} className={`${buttonClasses('primary', 'sm')} mt-6`}>
              {action.label}
            </Link>
          ) : (
            <button type="button" onClick={action.onClick} className={`${buttonClasses('primary', 'sm')} mt-6`}>
              {action.label}
            </button>
          )}
        </>
      )}
    </div>
  )
}

/**
 * Carte — `.card` = `rounded-md bg-white p-6 shadow-sm` (rayon token `md` 16 px,
 * DA §1.5/§3.9). Aucun rayon arbitraire ici : le rayon vit dans `index.css`.
 */
export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={`card ${className ?? ''}`}>{children}</div>
}

/** En-tête de carte — `mb-5 flex items-center justify-between` (DA §3.9). */
export function CardHeader({ title, viewAll }: { title: string; viewAll?: { label: string; to: string } }) {
  return (
    <div className="mb-5 flex items-center justify-between">
      <h3 className="text-[19px] font-bold text-ink">{title}</h3>
      {viewAll && (
        <Link
          to={viewAll.to}
          className="inline-flex items-center gap-1.5 text-sm font-bold text-terracotta-ink transition-colors hover:text-terracotta-deep"
        >
          {viewAll.label}
          <i className="fas fa-arrow-right text-[10px]" aria-hidden="true" />
        </Link>
      )}
    </div>
  )
}
