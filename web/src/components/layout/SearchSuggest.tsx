import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { Ico } from '../brand/Ico'

/**
 * Recherche à suggestions — docs/design-system-revends-v5.md §3.2 + CA-V5-136.
 *
 * Contrat opposable :
 * (a) **debounce ≥ 200 ms** (250 ms) et **annulation** des réponses obsolètes :
 *     une réponse arrivée après une frappe plus récente est IGNORÉE (`AbortController`
 *     + compteur de séquence — jamais seulement l'abort, qui peut arriver trop tard) ;
 * (b) **clavier complet** : ↓/↑ parcourent, `Entrée` ouvre l'élément actif,
 *     `Échap` ferme et **rend le focus au champ**, `Tab` sort du panneau ;
 * (c) chaque suggestion est un **`<Link>` réel** (navigation sans JS) ;
 * (d) **aucune requête** pour une chaîne de 1 caractère (seuil `minChars = 2`) ;
 * (e) **aucun résultat → message explicite**, jamais un panneau vide muet (CA-V5-143) ;
 * (f) le panneau est annoncé : `role="listbox"` + `aria-activedescendant` ;
 * (g) `Entrée` **ne soumet pas** le formulaire quand une suggestion est active.
 *
 * Le panneau présente les **trois groupes** du contrat (articles, catégories,
 * marques) sous des en-têtes non interactifs, mais expose UNE liste plate
 * `listbox` : l'index clavier et `aria-activedescendant` restent contigus.
 *
 * **Fidélité (Option A)** : le champ rend le markup de
 * `Bureau/main/index.html` (`<form class="search">` + `<svg class="i">` +
 * `<label class="sr">` + `<input id="q">`), stylé par `bureau.css`. La
 * maquette n'a pas de suggestions (statique) : le panneau est habillé par
 * `src/styles/bureau-fixes.css`, écrit à la main avec les jetons du site.
 */
export interface Suggestion {
  type: 'product' | 'category' | 'brand'
  /** libellé principal */
  label: string
  /** route réelle — jamais un `href="#"` */
  to: string
  /** produit : prix formaté ; catégorie/marque : rien (le contrat ne renvoie pas de compteur) */
  meta?: string
  imageUrl?: string | null
}

export type SuggestLoader = (query: string, signal: AbortSignal) => Promise<Suggestion[]>

export interface SearchSuggestProps {
  value: string
  onChange: (value: string) => void
  /** `Entrée` sans suggestion active → soumission du formulaire */
  onSubmit: () => void
  load: SuggestLoader
  minChars?: number
  debounceMs?: number
  max?: number
  placeholder?: string
  /** identifiant LITERAL du champ (la maquette expose `#q`) */
  id?: string
}

const DEBOUNCE_MS = 250
const MIN_CHARS = 2
/**
 * Plafond du panneau = plafond global du contrat serveur (api.md v2.4 §3.2) :
 * 6 articles + 2 catégories + 2 marques = 10. Le « 6 max » du DA §3.2
 * précédent l'endpoint 3 groupes tronquerait catégories et marques : la
 * borne du contrat l'emporte, la répartition restant appliquée par le loader.
 */
const MAX_ITEMS = 10

/** En-têtes de groupe — ordre = ordre d'affichage (articles d'abord). */
const GROUPS = [
  { type: 'product', label: 'Articles' },
  { type: 'category', label: 'Catégories' },
  { type: 'brand', label: 'Marques' },
] as const satisfies ReadonlyArray<{ type: Suggestion['type']; label: string }>

export function SearchSuggest({
  value,
  onChange,
  onSubmit,
  load,
  minChars = MIN_CHARS,
  debounceMs = DEBOUNCE_MS,
  max = MAX_ITEMS,
  placeholder = 'Rechercher une pièce, une marque…',
  id,
}: SearchSuggestProps) {
  const reactId = useId()
  // `id` fournit = identifiant LITERAL du champ (la maquette expose `#q`) ;
  // sans `id`, on retombe sur un id React stable. Le listbox en dérive.
  const inputId = id ?? `${reactId}-input`
  const listboxId = `${inputId}-listbox`

  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<Suggestion[]>([])
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'empty' | 'error'>('idle')
  const [active, setActive] = useState(-1)

  const navigate = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const seq = useRef(0)
  const abortRef = useRef<AbortController | null>(null)

  const query = value.trim()
  const longEnough = query.length >= minChars

  /* ── Chargement : debounce + annulation des réponses obsolètes ───── */
  useEffect(() => {
    if (!longEnough) {
      abortRef.current?.abort()
      abortRef.current = null
      seq.current += 1
      setItems([])
      setStatus('idle')
      setActive(-1)
      setOpen(false)
      return
    }

    setStatus('loading')
    setOpen(true)
    setActive(-1)

    const timer = window.setTimeout(() => {
      const controller = new AbortController()
      abortRef.current?.abort()
      abortRef.current = controller
      const mySeq = ++seq.current

      load(query, controller.signal)
        .then((results) => {
          // Réponse OBSOLETE (une frappe plus récente a eu lieu) → ignorée.
          if (mySeq !== seq.current) return
          const capped = results.slice(0, max)
          setItems(capped)
          setStatus(capped.length === 0 ? 'empty' : 'ready')
        })
        .catch((err: unknown) => {
          if (mySeq !== seq.current) return
          if (err instanceof DOMException && err.name === 'AbortError') return
          setItems([])
          setStatus('error')
        })
    }, debounceMs)

    return () => {
      window.clearTimeout(timer)
      abortRef.current?.abort()
    }
  }, [query, longEnough, debounceMs, max, load])

  const close = useCallback(
    (returnFocus = false) => {
      setOpen(false)
      setActive(-1)
      if (returnFocus) inputRef.current?.focus()
    },
    [],
  )

  /* ── Clic extérieur → fermeture ─────────────────────────────────── */
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) close()
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open, close])

  /* ── Clavier : ↑ ↓ Entrée Échap Tab ────────────────────────────── */
  const onKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      if (open) {
        e.preventDefault()
        close(true)
      }
      return
    }
    if (!open || (status !== 'ready' && status !== 'empty')) {
      // `preventDefault` : sinon la soumission implicite du formulaire double
      // l'appel (onSubmit() + event submit) → deux navigations identiques.
      if (e.key === 'Enter') {
        e.preventDefault()
        onSubmit()
      }
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => (items.length === 0 ? -1 : (a + 1) % items.length))
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => (items.length === 0 ? -1 : (a <= 0 ? items.length - 1 : a - 1)))
      return
    }
    if (e.key === 'Enter') {
      // (g) pas de soumission quand une suggestion est active → on navigue.
        if (active >= 0 && items[active]) {
        e.preventDefault()
        close()
        navigate(items[active].to)
        return
      }
      e.preventDefault()
      onSubmit()
      return
    }
    if (e.key === 'Tab') close()
  }

  const shown = open && longEnough
  const activeId = active >= 0 ? `${listboxId}-opt-${active}` : undefined

  return (
    <div ref={wrapRef} className="search">
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault()
          onSubmit()
        }}
      >
        {/* Markup identique à `<form class="search">` de Bureau/main :
            icône sprite + label visually-hidden + champ `#q`. */}
        <Ico name="search" />
        <label htmlFor={inputId} className="sr">
          Rechercher un article
        </label>
        <input
          ref={inputRef}
          id={inputId}
          type="search"
          name="q"
          role="combobox"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => longEnough && setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          autoComplete="off"
          aria-expanded={shown}
          aria-controls={shown ? listboxId : undefined}
          aria-autocomplete="list"
          aria-activedescendant={activeId}
          aria-busy={status === 'loading'}
        />
      </form>

      {shown && (
        <div id={listboxId} role="listbox" aria-label="Suggestions de recherche" className="sug">
          {status === 'loading' && (
            <div aria-hidden="true">
              {[0, 1, 2].map((i) => (
                <div key={i} className="sug-skel">
                  <i />
                  <b>
                    <span />
                    <span />
                  </b>
                </div>
              ))}
            </div>
          )}

          {status === 'error' && (
            <div className="sug-note" role="alert">
              <strong>Recherche momentanément indisponible.</strong>
              <span>Réessayez dans un instant.</span>
            </div>
          )}

          {/* (e) jamais un panneau vide muet — CA-V5-143 */}
          {status === 'empty' && (
            <div className="sug-note">
              <strong>Aucun article ne correspond à « {query} ».</strong>
              <span>Élargissez votre recherche ou explorez une autre catégorie.</span>
              <Link to="/search" onClick={() => close()}>
                Voir tous les articles
              </Link>
            </div>
          )}

          {status === 'ready' && items.length > 0 && (
            <ul>
              {GROUPS.map((group) => {
                // Index PLAT de chaque option : indispensable pour que
                // `aria-activedescendant` et la navigation ↑/↓ restent justes
                // malgré les en-têtes de groupe intercalés.
                const groupItems = items
                  .map((s, i) => ({ s, i }))
                  .filter(({ s }) => s.type === group.type)
                if (groupItems.length === 0) return null
                return (
                  <li key={group.type} role="presentation">
                    <p role="presentation" className="sug-group">
                      {group.label}
                    </p>
                    <ul role="presentation">
                      {groupItems.map(({ s, i }) => (
                        <li key={`${s.type}-${s.to}`} role="none">
                          <Link
                            id={`${listboxId}-opt-${i}`}
                            to={s.to}
                            role="option"
                            aria-selected={i === active}
                            onClick={() => close()}
                            // Le survol NE vole pas le focus : seule la navigation
                            // clavier change l'élément actif (ARIA APG combobox).
                            onMouseEnter={() => setActive(i)}
                            className={`sug-opt${i === active ? ' on' : ''}`}
                          >
                            <span className="sug-thumb">
                              {s.imageUrl ? (
                                <img src={s.imageUrl} alt="" />
                              ) : (
                                <Ico
                                  name={
                                    s.type === 'product'
                                      ? 'image'
                                      : s.type === 'category'
                                        ? 'tag'
                                        : 'store'
                                  }
                                  cls="sm"
                                />
                              )}
                            </span>
                            <span className="sug-body">
                              <span className="sug-label">{s.label}</span>
                              {s.meta ? <span className="sug-meta">{s.meta}</span> : null}
                            </span>
                            {s.type !== 'product' && (
                              <span className="sug-type">{s.type === 'category' ? 'Catégorie' : 'Marque'}</span>
                            )}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </li>
                )
              })}
            </ul>
          )}

          {/* Annonce lisible par lecteur d'écran, sans doublon visuel */}
          <p className="sr" aria-live="polite">
            {status === 'loading'
              ? 'Recherche en cours.'
              : status === 'empty'
                ? `Aucun résultat pour ${query}.`
                : status === 'ready'
                  ? `${items.length} suggestion${items.length > 1 ? 's' : ''} disponible${items.length > 1 ? 's' : ''}. Utilisez les flèches haut et bas.`
                  : ''}
          </p>
        </div>
      )}
    </div>
  )
}
