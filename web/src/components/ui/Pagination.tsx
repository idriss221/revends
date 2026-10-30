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
  // `flex-wrap` : à 320–390 px, compteur + 2 boutons labellisés dépassent la
  // largeur utile (672 px de contenu mesurés dans 302 px). Sans retour à la
  // ligne, ce débordement remontait jusqu'à `document.documentElement`
  // (scroll horizontal de 326 px sur /admin/historique). Les boutons passent
  // donc sous le compteur, et se partagent la largeur restante sous 400 px.
  return (
    <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
      <p className="text-sm text-muted">
        {total} {noun} · page {page}/{totalPages}
      </p>
      <div className="flex gap-2 max-[400px]:w-full">
        <button
          type="button"
          className={`${buttonClasses('outline', 'sm')} max-[400px]:flex-1`}
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
          aria-label="Page précédente"
        >
          <Ico name="arrow-left" cls="sm" aria-hidden="true" /> Précédent
        </button>
        <button
          type="button"
          className={`${buttonClasses('outline', 'sm')} max-[400px]:flex-1`}
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