import { buttonClasses } from './Button'
import { Ico } from '../brand/Ico'

interface PaginationProps {
  page: number
  totalPages: number
  total: number
  /** nom de la ressource — « articles », « commandes », « utilisateurs »… (CA-V5-044) */
  noun: string
  onChange: (page: number) => void
}

/**
 * Pagination en pied de carte (DA §3.10) : `border-t border-line pt-5`, compteur
 * `{total} {noun} · page {p}/{n}`, boutons `outline sm` désactivés aux bornes,
 * `aria-label` contextuel sur les deux boutons.
 * Utilise Ico au lieu de Font Awesome.
 */
export function Pagination({ page, totalPages, total, noun, onChange }: PaginationProps) {
  if (totalPages <= 1) return null
  return (
    <div className="mt-6 flex items-center justify-between gap-4 border-t border-line pt-5">
      <p className="text-sm text-muted">
        {total} {noun} · page {page}/{totalPages}
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          className={buttonClasses('outline', 'sm')}
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
          aria-label="Page précédente"
        >
          <Ico name="arrow-left" cls="sm" aria-hidden="true" /> Précédent
        </button>
        <button
          type="button"
          className={buttonClasses('outline', 'sm')}
          disabled={page >= totalPages}
          onClick={() => onChange(page + 1)}
          aria-label="Page suivante"
        >
          Suivant <Ico name="arrow-right" cls="sm" aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}