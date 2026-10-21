import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { Ico } from '../brand/Ico'
import { formatFcfa } from '../../lib/format'
import type { MiniCategory } from '../../lib/types'

/* ============================================================================
   Briques de mise en page du site — `fmt` / `catLabel` / `head` / `grid` /
   `empty` / `.crumb` de `Bureau/main/assets/app.js`, converties en JSX.

   Toutes les classes viennent de `src/styles/bureau.css` (généré, scopé
   `market-site`) : **aucun Tailwind** dans ces primitives.
   ========================================================================== */

/** `fmt()` — 12000 → « 12 000 FCFA » (espaces normaux, comme la référence). */
export function fmt(amount: number): string {
  return formatFcfa(amount).replace(/[\u202f\u00a0]/g, ' ')
}

/** `catLabel()` — nom de catégorie, ou « Article » si absente. */
export function catLabel(category: Pick<MiniCategory, 'name'> | null | undefined): string {
  return category?.name || 'Article'
}

/** Remplace `esc()` : un texte JSX n'est jamais interprété comme du HTML. */
export function text(value: unknown): string {
  return value == null ? '' : String(value)
}

/** `head()` — titre de section + lien flèche. */
export function SiteHead({
  eyebrow,
  title,
  sub,
  link,
  level = 2,
}: {
  eyebrow?: ReactNode
  title: ReactNode
  sub?: ReactNode
  link?: { label: string; to: string }
  level?: 1 | 2
}) {
  const H = level === 1 ? 'h1' : 'h2'
  return (
    <div className="head rv">
      <div>
        {eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}
        <H>{title}</H>
        {sub ? <p className="sub">{sub}</p> : null}
      </div>
      {link ? (
        <Link className="link-arrow" to={link.to}>
          {link.label} <Ico name="arrow-right" cls="sm" />
        </Link>
      ) : null}
    </div>
  )
}

/** `empty()` — état vide / erreur, toujours le même gabarit `.empty`. */
export function SiteEmpty({
  icon = 'search',
  title,
  children,
  action,
  style,
  className,
  role,
  level = 2,
}: {
  icon?: string
  title: ReactNode
  children?: ReactNode
  action?: { label: string; to?: string; onClick?: () => void }
  style?: React.CSSProperties
  className?: string
  /** `alert` quand l'état annonce une erreur (recette e2e : `role="alert"`). */
  role?: 'alert' | 'status'
  /** `1` quand c'est LE titre de la page (une page = un `<h1>`). */
  level?: 1 | 2
}) {
  const H = level === 1 ? 'h1' : 'h2'
  return (
    <div className={`empty${className ? ` ${className}` : ''}`} style={style} role={role}>
      <Ico name={icon} />
      <H>{title}</H>
      {children ? <p>{children}</p> : null}
      {action?.onClick ? (
        <button className="btn" type="button" onClick={action.onClick}>
          {action.label}
        </button>
      ) : action ? (
        <Link className="btn" to={action.to ?? '/shop'}>
          {action.label}
        </Link>
      ) : null}
    </div>
  )
}

export interface CrumbItem {
  label: ReactNode
  to?: string
}

/** `.crumb` — fil d'Ariane : `Accueil / Catégorie / Article`. */
export function Crumb({ items }: { items: CrumbItem[] }) {
  return (
    <nav className="crumb" aria-label="Fil d'Ariane">
      <Link to="/">Accueil</Link>
      {items.map((item, i) => (
        <span key={i} style={{ display: 'contents' }}>
          <span className="sep">/</span>
          {item.to ? <Link to={item.to}>{item.label}</Link> : <span>{item.label}</span>}
        </span>
      ))}
    </nav>
  )
}

/** `.grid` de la référence — renommé `.rv-grid` pour éviter la collision avec Tailwind. */
export function SiteGrid({ children, three = false }: { children: ReactNode; three?: boolean }) {
  return <div className={`rv-grid${three ? ' three' : ''}`}>{children}</div>
}

/** `.wrap` + `.section tight` : conteneur standard des pages intérieures. */
export function SitePage({ children, tight = true }: { children: ReactNode; tight?: boolean }) {
  return (
    <div className="wrap">
      <div className={`section${tight ? ' tight' : ''}`}>{children}</div>
    </div>
  )
}
