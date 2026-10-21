import { Link, Navigate, useParams, useSearchParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { Ico } from '../components/brand/Ico'

/* ============================================================================
   `/category/:slug` — la référence n'a PAS de page catégorie : `catTile()` de
   `Home()` pointe `#/shop?c=<id>`. On fait donc pareil : le slug est résolu
   en identifiant (via `GET /api/categories`) puis on **redirige** vers
   `/shop?c=<id>`, en conservant les paramètres déjà présents.

   Slug inconnu ou catégorie inactive → 404 dédié, aux textes imposés par la
   recette (CA-ACC-15) : « Catégorie introuvable (404) » /
   « Cette catégorie n'existe pas ou n'est plus active. » / « Retour à l'accueil ».
   ========================================================================== */

function CategoryNotFound() {
  return (
    <div className="wrap">
      <div className="section">
        <div className="empty" style={{ maxWidth: 640, marginInline: 'auto' }} role="alert">
          <Ico name="location" />
          <h1>Catégorie introuvable (404)</h1>
          <p>Cette catégorie n'existe pas ou n'est plus active.</p>
          <Link className="btn" to="/">
            Retour à l'accueil
          </Link>
        </div>
      </div>
    </div>
  )
}

function CategoryUnresolved() {
  return (
    <div className="wrap">
      <div className="section">
        <div className="empty" style={{ maxWidth: 640, marginInline: 'auto' }} role="alert">
          <Ico name="circle-info" />
          <h2>Catégories indisponibles</h2>
          <p>Impossible de vérifier cette catégorie pour le moment.</p>
          <Link className="btn" to="/shop">
            Voir tout le catalogue
          </Link>
        </div>
      </div>
    </div>
  )
}

export function CategoryShopView() {
  const { slug = '' } = useParams()
  const [sp] = useSearchParams()

  const categoriesQ = useQuery({
    queryKey: ['categories'],
    queryFn: () => api.categories(),
    // On ne rend rien avant d'avoir la réponse : pas de faux 404 au chargement.
    staleTime: 5 * 60_000,
  })

  if (categoriesQ.isPending) {
    return (
      <div className="wrap">
        <div className="section">
          <div className="empty" role="status">
            <Ico name="refresh" />
            <h2>Chargement des catégories…</h2>
          </div>
        </div>
      </div>
    )
  }

  // Catégories en erreur : on ne peut pas dire si le slug existe → pas de 404.
  if (categoriesQ.isError) return <CategoryUnresolved />

  const root = categoriesQ.data?.categories.find((c) => c.slug === slug && c.active !== false)
  if (!root) return <CategoryNotFound />

  // Conserve les paramètres déjà présents (`?e=`, `?price=`…) et force `c`.
  const next = new URLSearchParams(sp)
  next.set('c', String(root.id))
  return <Navigate to={`/shop?${next.toString()}`} replace />
}
