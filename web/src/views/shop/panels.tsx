import type { RefObject } from 'react'
import { Link } from 'react-router'
import { Ico } from '../../components/brand/Ico'
import { fmt } from '../../components/site/SiteBits'
import { PRICE_FLOOR, PRICE_STEP, SORTS, type ShopSort } from './state'

/* ============================================================================
   Panneaux de la vue Shop — `facetGroupHtml()` (391-404), `filterPanel()`
   (425-455), `sortSheet()` (456-470) et le squelette de chargement, en JSX.

   Markup, classes et aria repris tels quels de `Bureau/main/assets/app.js` ;
   les `<a href="#/…">` deviennent des `<button>` ou un `<Link>` (jamais de
   `href="#"`). Aucune classe Tailwind : uniquement les classes du CSS de
   référence (porté dans `src/styles/bureau.css`).
   ========================================================================== */

export interface FacetOption {
  v: string
  t: string
}

export interface FacetDef {
  /** clé de facette — `c` / `e` / `brand` / `location` (groupes `data-group`) */
  k: string
  label: string
  /** sélection unique (l'API n'accepte qu'une valeur) → option « Tout » en tête */
  one: true
  opts: FacetOption[]
}

/** `facetGroupHtml()` — groupe `.fgroup` + options `.opt` (aria-pressed). */
function FacetGroup({
  def,
  selected,
  onToggle,
}: {
  def: FacetDef
  selected: string[]
  onToggle: (k: string, v: string) => void
}) {
  const opts = def.one ? [{ v: '', t: 'Tout' }, ...def.opts] : def.opts
  return (
    <div className="fgroup" data-group={def.k}>
      <h3>{def.label}</h3>
      <div className="opts">
        {opts.map((o) => {
          const on = selected.includes(o.v)
          return (
            <button
              key={o.v || '(all)'}
              type="button"
              className={`opt${on ? ' on' : ''}`}
              data-facet={def.k}
              data-value={o.v}
              aria-pressed={on}
              onClick={() => onToggle(def.k, o.v)}
            >
              {o.t}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export interface FilterPanelProps {
  /** `activeCount(f)` — badge de la feuille « Filtres (n) » */
  n: number
  defs: FacetDef[]
  /** valeurs actives (brouillon du sheet si ouvert, sinon URL) */
  selected: (k: string) => string[]
  onToggle: (k: string, v: string) => void
  /** slider prix — valeur affichée, plafond, et application */
  price: { value: number; ceil: number; onChange: (v: number) => void }
  rangeRef: RefObject<HTMLInputElement | null>
  scrollRef: RefObject<HTMLDivElement | null>
  sort: ShopSort
  onSort: (v: ShopSort) => void
  onClear: () => void
  onApply: () => void
  onClose: () => void
  /** libellé du bouton d'application : « Voir les N articles » / « Aucun résultat » */
  applyLabel: string
}

/** `filterPanel()` — `<aside class="filters">` (sticky desktop / sheet mobile). */
export function FilterPanel({
  n,
  defs,
  selected,
  onToggle,
  price,
  rangeRef,
  scrollRef,
  sort,
  onSort,
  onClear,
  onApply,
  onClose,
  applyLabel,
}: FilterPanelProps) {
  return (
    <aside className="filters" id="filters" aria-label="Filtres">
      <div className="fx-head">
        <span className="grab" aria-hidden="true" />
        <h3>
          Filtres{n ? <> <span className="fx-n">{n}</span></> : null}
        </h3>
        <button className="fx-x" type="button" data-close-sheets aria-label="Fermer les filtres" onClick={onClose}>
          <Ico name="x" />
        </button>
      </div>
      <div className="fx-scroll" ref={scrollRef}>
        {defs.map((def) => (
          <FacetGroup key={def.k} def={def} selected={selected(def.k)} onToggle={onToggle} />
        ))}
        <div className="fgroup" data-group="max">
          <h3>Prix maximum</h3>
          <div className="frow">
            <span className="flabel">Jusqu'à</span>
            <b id="fMaxVal">{fmt(price.value)}</b>
          </div>
          <input
            ref={rangeRef}
            id="fM"
            type="range"
            min={PRICE_FLOOR}
            max={price.ceil}
            step={PRICE_STEP}
            value={price.value}
            aria-label="Prix maximum"
            onInput={(e) => price.onChange(Number(e.currentTarget.value))}
          />
        </div>
        <div className="fgroup" data-group="s">
          <h3>Trier par</h3>
          <label className="fld">
            <span className="sr">Trier par</span>
            <select className="sel" id="fS" value={sort} onChange={(e) => onSort(e.currentTarget.value as ShopSort)}>
              {SORTS.map((o) => (
                <option key={o.v} value={o.v}>
                  {o.t}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
      <div className="fx-foot">
        <button className="btn ghost" type="button" data-filters-clear onClick={onClear}>
          Effacer
        </button>
        <button className="btn terra" type="button" data-filters-apply onClick={onApply}>
          {applyLabel}
        </button>
      </div>
      <Link className="btn ghost fx-reset" to="/shop">
        Réinitialiser
      </Link>
    </aside>
  )
}

/** `sortSheet()` — bottom-sheet de tri (mobile uniquement, `display:none` desktop). */
export function SortSheet({
  sort,
  onSort,
  onClose,
}: {
  sort: ShopSort
  onSort: (v: ShopSort) => void
  onClose: () => void
}) {
  return (
    <div className="sheet" id="sortSheet" aria-label="Trier par">
      <div className="fx-head">
        <span className="grab" aria-hidden="true" />
        <h3>Trier par</h3>
        <button className="fx-x" type="button" data-close-sheets aria-label="Fermer" onClick={onClose}>
          <Ico name="x" />
        </button>
      </div>
      <div className="fx-scroll">
        <div className="sorts">
          {SORTS.map((o) => (
            <button
              key={o.v}
              type="button"
              className={`sopt${sort === o.v ? ' on' : ''}`}
              data-sort={o.v}
              role="radio"
              aria-checked={sort === o.v}
              onClick={() => onSort(o.v)}
            >
              <span>{o.t}</span>
              {sort === o.v ? <Ico name="check" cls="sm" /> : null}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

/** Squelette de chargement — silhouette d'une `SiteCardGrid` en 3 colonnes. */
export function ShopSkeleton({ count = 6 }: { count?: number }) {
  const bar = (w: string, mt = 0) => (
    <div
      aria-hidden="true"
      style={{
        width: w,
        height: 10,
        marginTop: mt,
        borderRadius: 4,
        background: 'var(--line-2)',
      }}
    />
  )
  return (
    <div className="rv-grid three" role="status" aria-label="Chargement des articles">
      {Array.from({ length: count }).map((_, i) => (
        <article key={i} className="card" aria-hidden="true">
          <div className="im" style={{ background: 'var(--line-2)' }} />
          <div className="body">
            {bar('38%')}
            {bar('72%', 12)}
            {bar('30%', 10)}
          </div>
        </article>
      ))}
    </div>
  )
}

/**
 * Pagination — la référence n'en a pas (catalogue de démo), mais l'API
 * pagine : sans elle, la moitié des articles serait inaccessible.
 * Barre discrète aux couleurs du site (`.btn ghost sm` + icônes du sprite).
 */
export function ShopPagination({
  page,
  totalPages,
  onPage,
}: {
  page: number
  totalPages: number
  onPage: (p: number) => void
}) {
  if (totalPages <= 1) return null
  return (
    <nav
      aria-label="Pagination"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
        flexWrap: 'wrap',
        marginTop: 36,
        paddingTop: 20,
        borderTop: '1px solid var(--line-2)',
      }}
    >
      <button
        type="button"
        className="btn ghost sm"
        disabled={page <= 1}
        aria-label="Page précédente"
        onClick={() => onPage(page - 1)}
      >
        <Ico name="arrow-left" cls="sm" /> Précédent
      </button>
      <span
        style={{
          font: '600 12.5px/1 var(--sans)',
          letterSpacing: '.08em',
          textTransform: 'uppercase',
          color: 'var(--muted)',
        }}
      >
        Page {page} sur {totalPages}
      </span>
      <button
        type="button"
        className="btn ghost sm"
        disabled={page >= totalPages}
        aria-label="Page suivante"
        onClick={() => onPage(page + 1)}
      >
        Suivant <Ico name="arrow-right" cls="sm" />
      </button>
    </nav>
  )
}
