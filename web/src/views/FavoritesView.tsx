import { Crumb, SiteEmpty, SiteHead } from '../components/site/SiteBits'
import { SiteCardGrid } from '../components/site/SiteCard'
import { useFavorites, type FavoriteEntry } from '../context/FavoritesContext'
import type { ProductCardItem } from '../lib/types'

/* ============================================================================
   Favoris — `Favorites()` de `Bureau/main/assets/app.js` (lignes 603-618) :
   `.crumb` « Accueil / Favoris », `.section.tight`, `.head.rv` (eyebrow
   « N pièce(s) » + h1), puis `SiteCardGrid` ou `.empty` (cœur).

   Les entrées viennent de `useFavorites().entries` (instantanés locaux ou
   serveur) et sont converties en `ProductCardItem` pour `SiteCard` — qui
   appelle lui-même `useFavorites()` : le bouton cœur fonctionne donc déjà.

   Champs neutres ( FavoriteEntry n'a pas l'équivalent ) :
   · `createdAt`  → `''` : jamais affiché par `SiteCard` (pas de faux badge) ;
   · `category`   → id 0 / slug '' : seul `category.name` est lu (libellé) ;
   · `subcategory`→ id 0 / nom vide : jamais lu par la carte.
   ========================================================================== */

/** Instantané favori → shape `ProductCardItem` attendue par `SiteCard`. */
function toCardItem(entry: FavoriteEntry): ProductCardItem {
  return {
    id: entry.id,
    name: entry.name,
    slug: entry.slug,
    price: entry.price,
    oldPrice: entry.oldPrice ?? null,
    location: entry.location,
    condition: entry.condition as ProductCardItem['condition'],
    // Valeur neutre : `SiteCard` n'affiche rien à partir de cette date.
    createdAt: '',
    image: entry.imageUrl ? { id: entry.id, url: entry.imageUrl } : null,
    category: { id: 0, name: entry.categoryName || 'Article', slug: '' },
    subcategory: { id: 0, name: '', slug: '' },
  }
}

export function FavoritesView() {
  const { entries } = useFavorites()
  const n = entries.length

  return (
    <div className="wrap">
      <Crumb items={[{ label: 'Favoris' }]} />
      <div className="section tight">
        <SiteHead eyebrow={`${n} pièce${n > 1 ? 's' : ''}`} title="Vos favoris" level={1} />
        {n > 0 ? (
          <SiteCardGrid items={entries.map(toCardItem)} />
        ) : (
          <SiteEmpty
            icon="heart"
            title="Aucun favori pour l'instant"
            action={{ label: 'Découvrir le catalogue', to: '/shop' }}
          >
            Touchez le cœur sur un article pour le garder ici et le retrouver plus tard.
          </SiteEmpty>
        )}
      </div>
    </div>
  )
}
