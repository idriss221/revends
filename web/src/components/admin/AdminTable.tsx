import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { Card, EmptyState } from '../ui/States'
import { ErrorMessage } from '../ui/ErrorMessage'
import { TableSkeleton } from '../ui/Loading'
import { Pagination } from '../ui/Pagination'
import { resolveImageUrl } from '../../lib/catalogPhotos'

/**
 * Tableau admin — spec-admin §4.3 (D2). **Point d'entrée unique** des 7 pages à
 * tableau : enveloppe scrollable, `<caption class="sr-only">`, `th scope="col"`,
 * largeur min, squelette/erreur/vide **dans la carte**, pagination.
 *
 * Hauteur de ligne : `py-4` (16) + vignette `h-[50px]` = **82 px** (D13) ; sans
 * vignette, 52 px. Aucune hauteur en dur — la vignette *est* la mesure.
 *
 * `td` en `text-sm` (14 px) et non 16 px : 6 colonnes × 16 px à 1024 px
 * imposeraient un scroll horizontal permanent, contraire à CA-V5-038. Écart
 * assumé (§9.4-1). Pas de zébrage (absent de la maquette), `tr:hover` = `bg-ivory`.
 *
 * Ligne entière cliquable = **bonus**, jamais l'unique chemin d'accès. La 1ʳᵉ
 * cellule rend un vrai `<Link>` **lorsque la page fournit `to`** — cas des
 * **commandes**, seule famille à posséder une route détail
 * (`/admin/commandes/:id`).
 *
 * ⚠️ Les pages **articles** et **articles-en-attente** ne fournissent
 * volontairement **aucun `to`** : il n'existe **pas** de route
 * `/admin/articles/:id`. La fiche produit s'ouvre dans un **panneau**
 * (`AdminProductSheet`) et le chemin **clavier** est le bouton d'action
 * « Voir » de la ligne — pas un lien de cellule. Ne pas ajouter un `to` sans
 * créer la route correspondante (le lien mènerait à un 404).
 */
export interface AdminColumn<T> {
  key: string
  header: string
  align?: 'left' | 'right'
  /** classe de largeur sur la cellule (`w-28`…) — la colonne reste la seule porteuse */
  widthClass?: string
  cell: (row: T) => ReactNode
}

const MIN_W = { sm: 'min-w-[640px]', md: 'min-w-[760px]', lg: 'min-w-[900px]' } as const

export interface AdminTableProps<T> {
  caption: string
  /** nom de la ressource — « articles », « commandes »… (pied de pagination) */
  noun: string
  columns: AdminColumn<T>[]
  rows: T[]
  rowKey: (row: T) => string | number
  onRowClick?: (row: T) => void
  /** classe de la `<tr>` (hiérarchie catégories…) */
  rowClassName?: (row: T) => string | undefined
  /**
   * Étiquette de groupe : chaque valeur distincte devient son **propre `<tbody>`**
   * (spec-admin §6-7 « racine et enfants dans des `<tbody>` distincts »). Sert au
   * compte de lignes annoncé par les lecteurs d'écran. Sans cette prop, un seul
   * `<tbody>` — comportement par défaut des 6 autres pages.
   */
  rowGroup?: (row: T) => string
  minWidth?: keyof typeof MIN_W
  isLoading?: boolean
  skeletonRows?: number
  isRefreshing?: boolean
  isError?: boolean
  error?: unknown
  onRetry?: () => void
  empty?: { title: string; description?: string; action?: { label: string; to: string } }
  page?: number
  totalPages?: number
  total?: number
  onPageChange?: (page: number) => void
}

export function AdminTable<T>({
  caption,
  noun,
  columns,
  rows,
  rowKey,
  onRowClick,
  rowClassName,
  rowGroup,
  minWidth = 'md',
  isLoading = false,
  skeletonRows = 6,
  isRefreshing = false,
  isError = false,
  error,
  onRetry,
  empty,
  page,
  totalPages,
  total,
  onPageChange,
}: AdminTableProps<T>) {
  // Les états.error/vide ne sont rendus qu'une fois la requête terminée (RG-V5-08) :
  // afficher « vide » pendant le chargement ferait clignoter l'écran à chaque filtre.
  if (isLoading) {
    return (
      <Card>
        <TableSkeleton rows={skeletonRows} columns={columns.length} />
      </Card>
    )
  }
  if (isError) {
    return (
      <Card>
        <ErrorMessage error={error} showCode action={onRetry ? { label: 'Réessayer', onClick: onRetry } : undefined} />
      </Card>
    )
  }
  if (rows.length === 0) {
    return (
      <Card>
        <EmptyState
          title={empty?.title ?? 'Aucun résultat'}
          description={empty?.description}
          action={empty?.action}
          variant="panel"
        />
      </Card>
    )
  }

  // Un `<tbody>` par groupe, dans l'ordre d'apparition (racines puis enfants).
  const bodies: { key: string; rows: T[] }[] = rowGroup
    ? [...new Set(rows.map(rowGroup))].map((key) => ({ key, rows: rows.filter((r) => rowGroup(r) === key) }))
    : [{ key: 'all', rows }]

  return (
    <Card>
      <div
        className={`table-scroll max-h-[70vh] max-[968px]:max-h-none overflow-x-auto overscroll-x-contain ${
          isRefreshing ? 'pointer-events-none opacity-60' : ''
        }`}
        role="region"
        aria-label={caption}
        aria-busy={isRefreshing || undefined}
        tabIndex={0}
      >
        <table className={`w-full ${MIN_W[minWidth]} border-collapse`}>
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr>
              {columns.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  className={`sticky top-0 z-10 border-b-2 border-line bg-white px-4 py-4 text-sm font-semibold tracking-wide whitespace-nowrap text-muted uppercase ${
                    c.align === 'right' ? 'text-right' : 'text-left'
                  }`}
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
{bodies.map((body) => (
            <tbody key={body.key}>
              {body.rows.map((row, ri) => {
                // `last:border-0` ne doit viser que la DERNIÈRE ligne du tableau :
                // avec plusieurs `<tbody>`, un `last:` par groupe laisserait une
                // bordure sous chaque racine, pas seulement sous la table.
                const isLastRow = body === bodies[bodies.length - 1] && ri === body.rows.length - 1
                return (
                <tr
                  key={rowKey(row)}
                  onClick={
                    onRowClick
                      ? (e) => {
                          // Un clic sur un contrôle (bouton d'action, lien, champ)
                          // ne doit PAS aussi ouvrir la ligne : sinon « Refuser »
                          // empilait la modale de confirmation **et** la fiche
                          // produit (constaté à l'e2e, 2 `role="dialog"` ouverts).
                          // On ignore donc la propagation issue d'un élément
                          // interactif — la ligne reste cliquable partout ailleurs.
                          const target = e.target as HTMLElement
                          if (target.closest('button, a, input, select, textarea, [role="button"]')) return
                          onRowClick(row)
                        }
                      : undefined
                  }
                  className={`border-b border-line transition-colors duration-300 hover:bg-ivory ${
                    isLastRow ? 'last:border-0' : ''
                  } ${onRowClick ? 'cursor-pointer' : ''} ${rowClassName?.(row) ?? ''}`}
                >
                  {columns.map((c) => (
                    <td
                      key={c.key}
                      className={`px-4 py-4 align-middle text-sm text-ink ${c.widthClass ?? ''} ${
                        c.align === 'right' ? 'text-right' : ''
                      }`}
                    >
                      {c.cell(row)}
                    </td>
                  ))}
                </tr>
              )})}
            </tbody>
          ))}
        </table>
      </div>
      {page !== undefined && totalPages !== undefined && total !== undefined && onPageChange && (
        <Pagination page={page} totalPages={totalPages} total={total} noun={noun} onChange={onPageChange} />
      )}
    </Card>
  )
}

/**
 * Cellule produit — spec-admin §4.3. `flex items-center gap-3`, vignette
 * **50 × 50 px, rayon token `sm` (12 px)** et repli `fa-image` sur `bg-ivory`
 * (pas de `text-[#…]`). `min-w-0` + `truncate` : un nom long ne doit jamais
 * élargir la table ni faire déborder la page (recette §9.3-e).
 */
export function ProductCell({
  name,
  sub,
  to,
  image,
}: {
  name: string
  sub?: string
  to?: string
  image: { url: string } | null
}) {
  const label = (
    <span className="flex min-w-0 flex-1 items-center gap-3">
      {image ? (
        <img
          src={resolveImageUrl(image.url)}
          alt=""
          loading="lazy"
          className="h-[50px] w-[50px] shrink-0 rounded-sm object-cover"
        />
      ) : (
        <span
          aria-hidden="true"
          className="flex h-[50px] w-[50px] shrink-0 items-center justify-center rounded-sm bg-ivory text-faint"
        >
          <i className="fas fa-image" />
        </span>
      )}
      <span className="min-w-0">
        <span className="block truncate font-semibold text-ink">{name}</span>
        {sub && <span className="block truncate text-xs text-muted">{sub}</span>}
      </span>
    </span>
  )

  return to ? (
    <Link to={to} className="block min-w-0 transition-colors hover:text-terracotta-ink">
      {label}
    </Link>
  ) : (
    label
  )
}
