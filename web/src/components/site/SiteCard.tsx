import { Link } from 'react-router'
import { Ico } from '../brand/Ico'
import { SiteImage, artKindFor } from './SiteImage'
import { ZoomButton } from './Lightbox'
import { catLabel, fmt, text } from './SiteBits'
import { formatDiscountPct } from '../../lib/format'
import { useFavorites } from '../../context/FavoritesContext'
import type { ProductCardItem } from '../../lib/types'

/* ============================================================================
   Carte produit — `card()` de `Bureau/main/assets/app.js` (lignes 202-236).

   Reproduite à l'identique, avec 3 écarts dictés par les données réelles :
   · `href="#/p/{id}"`  → `href="/catalogue/{slug}"` (routes React) ;
   · `p.im[1]` (image de survol) : `ProductCardItem` n'en expose qu'UNE →
     pas de demi-mensonge, la classe `.alt` n'est pas posée ;
   · `.by « Vendu par X »` : le champ `seller` n'existe PAS sur la liste de
     l'API (§3.2 docs/api.md) → l'élément n'est pas rendu, il ne dit rien.
   ========================================================================== */

const SIZES = '(max-width:760px) 46vw, (max-width:1080px) 30vw, 30vw'

function heartIcon(on: boolean) {
  return (
    <Ico name={on ? 'heart' : 'heart-o'} cls={on ? 'fill' : undefined} />
  )
}

export function SiteCard({ product, index = 0 }: { product: ProductCardItem; index?: number }) {
  const { isFavorite, toggleFavorite } = useFavorites()
  const fav = isFavorite(product.id)
  const pct = formatDiscountPct(product.price, product.oldPrice ?? null)
  const url = product.image?.url ?? ''
  const alt = text(product.name)

  const entry = {
    slug: product.slug,
    name: product.name,
    price: product.price,
    oldPrice: product.oldPrice ?? null,
    location: product.location,
    condition: product.condition,
    categoryName: catLabel(product.category),
    imageUrl: product.image?.url ?? null,
  }

  return (
    <article className="card rv" style={{ ['--d' as string]: String(index % 4) }}>
      <div className="im">
        {pct ? <span className="flag">−{pct} %</span> : null}
        <Link to={`/catalogue/${product.slug}`} aria-label={`Voir ${alt}`} tabIndex={-1}>
          <SiteImage
            src={url}
            alt={alt}
            w={800}
            sizes={SIZES}
            kind={artKindFor(product.category?.name)}
          />
        </Link>
        <button
          className="fav"
          type="button"
          aria-pressed={fav}
          aria-label={fav ? `Retirer des favoris : ${alt}` : `Ajouter aux favoris : ${alt}`}
          onClick={() => toggleFavorite(product.id, entry)}
        >
          {heartIcon(fav)}
        </button>
        {url ? <ZoomButton src={url} alt={alt} /> : null}
      </div>
      <div className="body">
        <span className="cat-lbl">{catLabel(product.category)}</span>
        <h3 className="name">
          <Link to={`/catalogue/${product.slug}`}>{alt}</Link>
        </h3>
        <div className="meta">
          {product.condition} · {product.location}
        </div>
        <div className="price">
          {fmt(product.price)}
          {pct ? <s>{fmt(product.oldPrice!)}</s> : null}
        </div>
      </div>
    </article>
  )
}

/** `grid()` — grille de cartes. **JAMAIS** de classe Tailwind ici. */
export function SiteCardGrid({ items, three = false }: { items: ProductCardItem[]; three?: boolean }) {
  return (
    <div className={`rv-grid${three ? ' three' : ''}`}>
      {items.map((p, i) => (
        <SiteCard key={p.id} product={p} index={i} />
      ))}
    </div>
  )
}
