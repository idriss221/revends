import { Link } from 'react-router'
import { Ico } from '../brand/Ico'
import { SiteImage } from '../site/SiteImage'
import { ZoomButton } from '../site/Lightbox'
import { useFavorites } from '../../context/FavoritesContext'
import { fmt, text } from '../site/SiteBits'
import { SellerBadge } from './SellerBadge'
import type { StorefrontItemPublic } from '../../lib/storefront.types'

/* ============================================================================
   Carte « annonce de boutique » — ÉCART ASSUMÉ vs `SiteCard`.

   Pourquoi pas `SiteCard` : le sérialiseur public V7 expose UNIQUEMENT
   `id, name, price, primaryPhotoUrl, effectiveStatus` — ni `slug`, ni
   `condition`, ni `location`, ni `category`. `SiteCard` exige ces champs ;
   les fabriquer (valeur vide factice) casserait sa méta (« · ») et la
   fidélité CA-V7-035. L'hydratation via `/api/products?ids=…` est exclue :
   ce mode IGNORE les articles non `AVAILABLE` — les annonces `RESERVED` /
   `PENDING` disparaîtraient silencieusement (violation CA-V7-025).

   La carte ci-dessous reprend donc le même gabarit CSS `.card` (classes
   .im / .fav / .body / .cat-lbl / .name / .price), le même lien et les
   mêmes favoris que le catalogue — données réelles uniquement. Le lien
   produit pointe `/catalogue/:id` (le backend accepte l'id numérique).
   `categoryName` du favori est la chaîne vide : le panier de favoris affiche
   « Article » (repli existant).
   ========================================================================== */

const STATUS_LABEL: Record<StorefrontItemPublic['effectiveStatus'], string> = {
  AVAILABLE: 'Disponible',
  RESERVED: 'Réservé',
  PENDING: 'En attente',
}

function heartIcon(on: boolean) {
  return <Ico name={on ? 'heart' : 'heart-o'} cls={on ? 'fill' : undefined} />
}

const SIZES = '(max-width:760px) 46vw, (max-width:1080px) 30vw, 24vw'

export function StorefrontListingCard({ item, index = 0 }: { item: StorefrontItemPublic; index?: number }) {
  const { isFavorite, toggleFavorite } = useFavorites()
  const fav = isFavorite(item.id)
  const url = item.primaryPhotoUrl ?? ''
  const name = text(item.name)

  const entry = {
    slug: String(item.id), // la fiche résout l'id numérique — aucune donnée inventée
    name,
    price: item.price,
    oldPrice: null,
    location: '',
    condition: '',
    categoryName: '',
    imageUrl: url || null,
  }

  return (
    <article className="card rv" style={{ ['--d' as string]: String(index % 4) }}>
      <div className="im">
        <Link to={`/catalogue/${item.id}`} aria-label={`Voir ${name}`} tabIndex={-1}>
          <SiteImage src={url} alt={name} w={800} sizes={SIZES} kind="coat" />
        </Link>
        <button
          className="fav"
          type="button"
          aria-pressed={fav}
          aria-label={fav ? `Retirer des favoris : ${name}` : `Ajouter aux favoris : ${name}`}
          onClick={() => toggleFavorite(item.id, entry)}
        >
          {heartIcon(fav)}
        </button>
        {url ? <ZoomButton src={url} alt={name} /> : null}
      </div>
      <div className="body">
        <span className="cat-lbl">{STATUS_LABEL[item.effectiveStatus]}</span>
        <h3 className="name">
          <Link to={`/catalogue/${item.id}`}>{name}</Link>
        </h3>
        <div className="price">{fmt(item.price)}</div>
        {item.sellerBadge ? (
          <div className="card-badge-row">
            <SellerBadge badge={item.sellerBadge} />
          </div>
        ) : null}
      </div>
    </article>
  )
}
