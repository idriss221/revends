import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { api, ApiError } from '../lib/api'
import { Crumb, SiteEmpty, SiteHead, catLabel, fmt } from '../components/site/SiteBits'
import { SiteCardGrid } from '../components/site/SiteCard'
import { Ico } from '../components/brand/Ico'
import {
  EMPTY_PEND,
  CONDITIONS,
  activeCount,
  buildSp,
  pendFrom,
  pendToFilters,
  priceCeilFor,
  readFilters,
  sortLabel,
  toApiParams,
  toggleOne,
  type PendFilters,
  type ShopFilters,
  type ShopSort,
} from './shop/state'
import {
  FilterPanel,
  ShopPagination,
  ShopSkeleton,
  SortSheet,
  type FacetDef,
} from './shop/panels'

/* ============================================================================
   Vue Shop — `Shop(qs)` de `Bureau/main/assets/app.js` (lignes 471-515) et son
   câblage `wireShop(qs)` (1054-1146), convertis en React.

   Reproduite à l'identique (markup, classes, aria) avec les décisions dictées
   par les données réelles :
   · URL = état (`useSearchParams`) — lit noms de référence ET anciens noms du
     projet, écrit avec les noms de la référence ;
   · facettes Catégorie · État · Marque · Localisation (sélection unique) +
     Prix + Tri : taille/matière/couleur n'existent pas côté API (§3.2) —
     on n'affiche jamais ce qui ne peut pas être vrai ;
   · facettes servies par l'API (`api.categories()`, `api.productLocations()`,
     `api.products`) : jamais de données fabriquées ;
   · desktop = application immédiate au clic ; sheet mobile = brouillon `pend`
     appliqué par « Voir les N articles », exactement comme `wireShop()`.
   ========================================================================== */

export function ShopView() {
  const [sp, setSp] = useSearchParams()
  const f = useMemo(() => readFilters(sp), [sp])

  /* ── Données ──────────────────────────────────────────────────────────── */
  const categoriesQ = useQuery({ queryKey: ['categories'], queryFn: () => api.categories() })
  const locationsQ = useQuery({ queryKey: ['locations'], queryFn: () => api.productLocations() })
  const productsQ = useQuery({
    queryKey: ['products', 'shop', toApiParams(f)],
    queryFn: () => api.products(toApiParams(f)),
    // Les données précédentes restent affichées pendant le refiltre (la
    // référence est synchrone : pas de flash de squelette à chaque clic).
    placeholderData: keepPreviousData,
  })
  // Brouillon du panneau mobile : compte les résultats AVANT d'appliquer
  // (`matchProducts(Object.assign({}, f, pend))` de la référence).
  const [sheet, setSheet] = useState<'filters' | 'sort' | null>(null)
  const [pend, setPend] = useState<PendFilters>(() => pendFrom(f))
  const pendCountQ = useQuery({
    queryKey: ['products', 'shop-pend', { ...toApiParams(f), ...pend }],
    queryFn: () => api.products({ ...toApiParams(pendToFilters(f, pend)), per_page: 1 }),
    enabled: sheet === 'filters',
  })

  /* ── Facettes servies par l'API ───────────────────────────────────────── */
  const catNames = useMemo(() => {
    const m = new Map<string, string>()
    for (const c of categoriesQ.data?.categories ?? []) {
      m.set(String(c.id), c.name)
      for (const s of c.children ?? []) m.set(String(s.id), s.name)
    }
    return m
  }, [categoriesQ.data])
  const catOpts = useMemo(() => {
    const out: { v: string; t: string }[] = []
    for (const c of categoriesQ.data?.categories ?? []) {
      out.push({ v: String(c.id), t: c.name })
      for (const s of c.children ?? []) out.push({ v: String(s.id), t: s.name })
    }
    return out
  }, [categoriesQ.data])
  // Marques : dérivées du jeu retourné (comme la référence les dérive de ses
  // données) — la marque active reste listée pour pouvoir être retirée.
  const brands = useMemo(() => {
    const set = new Set<string>()
    for (const it of productsQ.data?.items ?? []) if (it.brand) set.add(it.brand)
    if (f.brand) set.add(f.brand)
    return [...set].sort((a, b) => a.localeCompare(b, 'fr'))
  }, [productsQ.data, f.brand])
  const locationOpts = useMemo(
    () => (locationsQ.data?.locations ?? []).map((l) => ({ v: l, t: l })),
    [locationsQ.data],
  )

  const defs: FacetDef[] = useMemo(
    () => [
      { k: 'c', label: 'Catégorie', one: true, opts: catOpts },
      { k: 'e', label: 'État', one: true, opts: CONDITIONS.map((v) => ({ v, t: v })) },
      { k: 'brand', label: 'Marque', one: true, opts: brands.map((b) => ({ v: b, t: b })) },
      { k: 'location', label: 'Localisation', one: true, opts: locationOpts },
    ],
    [catOpts, brands, locationOpts],
  )

  /* ── URL = état ───────────────────────────────────────────────────────── */
  /** `location.hash = buildQuery(f, patch)` — applique un patch, remet à la page 1. */
  const apply = useCallback(
    (patch: Partial<ShopFilters>) => {
      const next: ShopFilters = { ...f, ...patch }
      if (patch.page === undefined) next.page = 1
      setSp(buildSp(next))
    },
    [f, setSp],
  )

  /* ── Feuilles mobiles (wireShop) ──────────────────────────────────────── */
  const topRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const rangeRef = useRef<HTMLInputElement>(null)
  const [rangeDrag, setRangeDrag] = useState<number | null>(null)

  const scrollToGroup = useCallback((key: string) => {
    requestAnimationFrame(() => {
      const scroller = scrollRef.current
      if (!scroller) return
      const g = scroller.querySelector<HTMLElement>(`.fgroup[data-group="${key}"]`)
      if (g) scroller.scrollTop = g.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop
    })
  }, [])

  const closeSheet = useCallback((focus: boolean) => {
    setSheet(null)
    setRangeDrag(null)
    if (focus) document.querySelector<HTMLElement>('[data-open-filters]')?.focus()
  }, [])

  const openSheet = useCallback(
    (kind: 'filters' | 'sort', facetKey?: string) => {
      closeSheet(false)
      setPend(pendFrom(f))
      setSheet(kind)
      if (facetKey) scrollToGroup(facetKey)
    },
    [closeSheet, f, scrollToGroup],
  )

  // `lock()` de la référence : le body ne défile plus sous une feuille.
  useEffect(() => {
    if (!sheet) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [sheet])

  // Échap ferme la feuille ouverte (accessibilité des bottom sheets).
  useEffect(() => {
    if (!sheet) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeSheet(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [sheet, closeSheet])

  /* ── Slider prix (input → affichage, change → application) ────────────── */
  const priceCeil = useMemo(
    () => priceCeilFor(productsQ.data?.items.reduce((m, p) => Math.max(m, p.price), 0)),
    [productsQ.data],
  )
  const rawPrice = (sheet === 'filters' ? pend.priceMax : f.priceMax) ?? priceCeil
  const priceValue = Math.min(rangeDrag ?? rawPrice, priceCeil)

  // L'événement `change` natif du range ne se déclenche qu'en fin de glisse :
  // c'est là que la référence met l'URL (desktop) ou le brouillon (mobile).
  useEffect(() => {
    const el = rangeRef.current
    if (!el) return
    const onNativeChange = () => {
      const v = Number(el.value)
      setRangeDrag(null)
      if (sheet === 'filters') setPend((p) => ({ ...p, priceMax: v }))
      else apply({ priceMax: v >= priceCeil ? null : v })
    }
    el.addEventListener('change', onNativeChange)
    return () => el.removeEventListener('change', onNativeChange)
  }, [sheet, apply, priceCeil])

  const onRangeInput = (v: number) => {
    setRangeDrag(v)
    if (sheet === 'filters') setPend((p) => ({ ...p, priceMax: v }))
  }

  /* ── Actions facettes ─────────────────────────────────────────────────── */
  const onToggle = (k: string, v: string) => {
    if (sheet === 'filters') {
      setPend((p) => ({ ...p, [k]: toggleOne(String(p[k as keyof PendFilters] ?? ''), v) }))
      return
    }
    const key = k as 'c' | 'e' | 'brand' | 'location'
    apply({ [key]: toggleOne(f[key], v) } as Partial<ShopFilters>)
  }

  const onSort = (v: ShopSort) => apply({ sort: v })
  const onSortSheet = (v: ShopSort) => {
    apply({ sort: v })
    closeSheet(false)
  }
  const onApply = () => {
    setSp(buildSp({ ...pendToFilters(f, pend), page: 1 }))
    closeSheet(false)
  }
  const onPage = (p: number) => {
    apply({ page: p })
    topRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  /* ── Rendu ────────────────────────────────────────────────────────────── */
  const total = productsQ.data?.total ?? 0
  const n = activeCount(f)
  const catName = f.c ? catNames.get(f.c) : undefined
  const title = f.q ? `Résultats pour « ${f.q} »` : catName ? catName : f.c ? catLabel(null) : 'Découvrir'

  // `activeChipsHtml()` — chaque chip retire son filtre.
  const chips: { key: string; label: string; onRemove: () => void }[] = []
  if (f.q) chips.push({ key: 'q', label: `« ${f.q} »`, onRemove: () => apply({ q: '' }) })
  if (f.c) chips.push({ key: 'c', label: catName ?? f.c, onRemove: () => apply({ c: '' }) })
  if (f.e) chips.push({ key: 'e', label: f.e, onRemove: () => apply({ e: '' }) })
  if (f.brand) chips.push({ key: 'brand', label: f.brand, onRemove: () => apply({ brand: '' }) })
  if (f.location) chips.push({ key: 'location', label: f.location, onRemove: () => apply({ location: '' }) })
  if (f.priceMax !== null)
    chips.push({ key: 'price', label: `≤ ${fmt(f.priceMax)}`, onRemove: () => apply({ priceMax: null }) })
  if (f.priceMin !== null)
    chips.push({ key: 'price_min', label: `≥ ${fmt(f.priceMin)}`, onRemove: () => apply({ priceMin: null }) })

  // Valeurs actives : brouillon du sheet s'il est ouvert, sinon l'URL.
  const cur: ShopFilters | PendFilters = sheet === 'filters' ? pend : f
  const selectedOf = (k: string): string[] => {
    const v = (cur as PendFilters)[k as keyof PendFilters]
    return typeof v === 'string' && v ? [v] : []
  }

  // `facetChip()` — chips de facettes de la barre mobile.
  const facetChips = defs.map((def) => {
    const sel = selectedOf(def.k)
    let label = def.label
    if (sel.length === 1) label = def.opts.find((o) => o.v === sel[0])?.t ?? sel[0]
    else if (sel.length > 1) label = `${def.label} · ${sel.length}`
    return (
      <button
        key={def.k}
        type="button"
        className={`cbtn facet${sel.length ? ' on' : ''}`}
        data-open-filters
        data-facet={def.k}
        onClick={() => openSheet('filters', def.k)}
      >
        {label}
        <Ico name="chevron-down" cls="sm" />
      </button>
    )
  })

  const pendTotal = pendCountQ.data?.total ?? 0
  const errorMessage =
    productsQ.error instanceof ApiError
      ? productsQ.error.readableMessage()
      : 'Impossible de charger les articles pour le moment.'

  return (
    <div className="wrap" ref={topRef}>
      <Crumb items={[{ label: title }]} />
      <div className="section tight">
        <SiteHead level={1} eyebrow={productsQ.data ? `${total} article${total > 1 ? 's' : ''}` : undefined} title={title} />
        {/* Catégories en erreur : les facettes et le titre de catégorie sont
            inconnus — on l'annonce (recette « erreur 500 → alerte + Réessayer »)
            plutôt que d'afficher un panneau de facettes silencieusement vide. */}
        {categoriesQ.isError && (
          <SiteEmpty
            role="alert"
            icon="circle-info"
            title="Catégories indisponibles"
            action={{ label: 'Réessayer', onClick: () => void categoriesQ.refetch() }}
          >
            Impossible de charger les catégories pour le moment.
          </SiteEmpty>
        )}
        {chips.length > 0 && (
          <div className="active-f">
            {chips.map((chip) => (
              <button
                key={chip.key}
                type="button"
                className="chip on"
                aria-label={`Retirer le filtre : ${chip.label}`}
                onClick={chip.onRemove}
              >
                {chip.label} <span className="x"><Ico name="x" cls="sm" /></span>
              </button>
            ))}
          </div>
        )}
        <div className="shop">
          <FilterPanel
            n={n}
            defs={defs}
            selected={selectedOf}
            onToggle={onToggle}
            price={{ value: priceValue, ceil: priceCeil, onChange: onRangeInput }}
            rangeRef={rangeRef}
            scrollRef={scrollRef}
            sort={f.sort}
            onSort={onSort}
            onClear={() => setPend(EMPTY_PEND)}
            onApply={onApply}
            onClose={() => closeSheet(true)}
            applyLabel={pendTotal ? `Voir les ${pendTotal} article${pendTotal > 1 ? 's' : ''}` : 'Aucun résultat'}
          />
          <div className="shop-main">
            <div className="result-bar">
              <span className="result-count">{sortLabel(f.sort)}</span>
              <span className="result-hint">{productsQ.data ? `${total} résultat${total > 1 ? 's' : ''}` : ''}</span>
            </div>
            <div className="chipbar" role="group" aria-label="Filtres et tri">
              <button type="button" className="cbtn primary" data-open-filters onClick={() => openSheet('filters')}>
                <Ico name="sliders" cls="sm" />
                Filtrer
                {n ? <span className="cbadge">{n}</span> : null}
              </button>
              <button type="button" className="cbtn" data-open-sort onClick={() => openSheet('sort')}>
                <Ico name="chevron-down" cls="sm" />
                {sortLabel(f.sort)}
              </button>
              <span className="cbar-sep" aria-hidden="true" />
              {facetChips}
            </div>

            {productsQ.isPending ? (
              <ShopSkeleton />
            ) : productsQ.isError ? (
              <SiteEmpty
                icon="circle-info"
                title="Une erreur est survenue"
                action={{ label: 'Réessayer', onClick: () => void productsQ.refetch() }}
              >
                {errorMessage}
              </SiteEmpty>
            ) : total === 0 ? (
              <SiteEmpty title="Aucun article ne correspond" action={{ label: 'Voir tout le catalogue', to: '/shop' }}>
                Nous n'avons rien trouvé{f.q ? ` pour « ${f.q} »` : ''}. Élargissez la recherche ou retirez un filtre.
              </SiteEmpty>
            ) : (
              <>
                <SiteCardGrid items={productsQ.data!.items} three />
                <ShopPagination page={productsQ.data!.page} totalPages={productsQ.data!.totalPages} onPage={onPage} />
              </>
            )}
          </div>
        </div>
      </div>
      <div className="fback" id="fback" data-close-sheets hidden={sheet === null} onClick={() => closeSheet(true)} />
      <SortSheet sort={f.sort} onSort={onSortSheet} onClose={() => closeSheet(true)} />
    </div>
  )
}
