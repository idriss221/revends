import type { ReactNode } from 'react'
import { Button } from '../ui/Button'

/**
 * Barre de filtres admin — spec-admin §4.2 / D11.
 *
 * **Sans carte**, posée directement sur le fond de page : la table reste la
 * seule surface blanche de la zone de données (D11 — sinon `.card` et la barre
 * se disputent le même padding). Hiérarchie : en-tête → barre → carte.
 *
 * Largeurs fixées **ici** (288/256 px) et non dans les pages : c'est la fin des
 * `!w-64` dispersés. `resultCount` en `aria-live="polite"` pour que le
 * lecteur d'écran annonce le nombre de résultats après chaque frappe/filtre.
 */
export interface AdminFilterBarProps {
  search?: {
    value: string
    onChange: (value: string) => void
    placeholder: string
    label: string
  }
  select?: {
    value: string
    onChange: (value: string) => void
    label: string
    options: { value: string; label: string }[]
  }
  actions?: ReactNode
  resultCount?: { total: number; noun: string }
  onReset?: () => void
}

export function AdminFilterBar({ search, select, actions, resultCount, onReset }: AdminFilterBarProps) {
  return (
    <div className="mb-6 flex flex-wrap items-center gap-3">
      {search && (
        <div className="relative w-72 max-w-full">
          <i
            className="fas fa-magnifying-glass pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-sm text-muted"
            aria-hidden="true"
          />
          <input
            type="search"
            aria-label={search.label}
            placeholder={search.placeholder}
            value={search.value}
            onChange={(e) => search.onChange(e.target.value)}
            className="field-input pl-11"
          />
        </div>
      )}
      {select && (
        <div className="w-64 max-w-full">
          <select
            aria-label={select.label}
            value={select.value}
            onChange={(e) => select.onChange(e.target.value)}
            className="field-input cursor-pointer"
          >
            {select.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      )}
      {onReset && (
        <Button variant="outline" size="sm" onClick={onReset} icon="fa-rotate-left">
          Réinitialiser
        </Button>
      )}
      {actions}
      {resultCount && (
        <p aria-live="polite" className="ml-auto text-sm text-muted">
          {resultCount.total} {resultCount.noun}
        </p>
      )}
    </div>
  )
}
