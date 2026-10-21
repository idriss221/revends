import { Fragment, type ReactNode } from 'react'
import { Link } from 'react-router'

/**
 * En-tête de page admin — spec-admin §4.1 (remplace `DashboardHeader` sur les
 * 9 écrans).
 *
 * · `h1` 28 px/700 aligné sur le bord gauche du contenu, `mb-6` (24) ;
 * · `subtitle` = **contexte** en `text-sm text-muted`, jamais l'action — l'action
 *   vit dans `actions`, alignée en bas à droite (D1) ;
 * · `meta` = badges + date, rangée sous le titre (utilisé par le détail commande
 *   et la modération) ;
 * · fil d'Ariane : lien **orange + icône** (D8 — un lien orange 14 px seul
 *   échouerait AA, la forme compense), séparateur `fa-chevron-right` décoratif.
 */
export interface AdminPageHeaderProps {
  title: string
  subtitle?: string
  actions?: ReactNode
  breadcrumb?: { label: string; to: string }[]
  meta?: ReactNode
}

export function AdminPageHeader({ title, subtitle, actions, breadcrumb, meta }: AdminPageHeaderProps) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        {breadcrumb && breadcrumb.length > 0 && (
          <nav aria-label="Fil d’Ariane" className="mb-2 flex flex-wrap items-center gap-2 text-sm text-muted">
            {breadcrumb.map((crumb, i) => (
              <Fragment key={crumb.to}>
                <Link
                  to={crumb.to}
                  className="font-semibold text-terracotta-ink transition-colors hover:text-terracotta-deep hover:underline"
                >
                  {crumb.label}
                </Link>
                {i < breadcrumb.length - 1 && (
                  <i className="fas fa-chevron-right text-[10px]" aria-hidden="true" />
                )}
              </Fragment>
            ))}
          </nav>
        )}
        <h1 className="text-[28px] font-bold leading-tight text-ink">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
        {meta && <div className="mt-2 flex flex-wrap items-center gap-2">{meta}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
    </header>
  )
}
