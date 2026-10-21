import { useQuery } from '@tanstack/react-query'
import { Link, Navigate } from 'react-router'
import { Ico } from '../components/brand/Ico'
import { Crumb, SiteHead, fmt, text } from '../components/site/SiteBits'
import { SiteImage, art, artKindFor } from '../components/site/SiteImage'
import { useAuth } from '../context/AuthContext'
import { useCart } from '../context/CartContext'
import { useFavorites } from '../context/FavoritesContext'
import { api } from '../lib/api'
import { orderStatusBadge, productStatusBadge } from '../lib/constants'
import { formatDate } from '../lib/format'
import type { OwnerProduct, OrderSummary } from '../lib/types'

/* ============================================================================
   Mon compte — `Account()` de `Bureau/main/assets/app.js` (lignes 927-987).

   Markup exact : `.crumb` « Accueil / Mon compte », `.head` (eyebrow
   « Votre espace », h1), `.acct` (`.side` sticky : `.who` + nav 4 liens +
   déconnexion), `.stat-grid` (3 `.stat`), `.box` « Mes annonces » et
   « Mes commandes » avec leurs `.empty` de la référence (textes exacts).

   Branchement réel (la référence affiche des vides de démo) :
   · « Mes annonces » → `api.myProducts()` (même source que MyArticlesPage) ;
   · « Mes commandes » → `api.myOrders()` (même source que MyOrdersPage) ;
   · compteurs favoris/panier → `useFavorites()` / `useCart()` (vrais) ;
   · non connecté → redirection `/login?redirect=/profil` (RequireUser le
     ferait aussi, mais la vue doit tenir debout montée seule).

   Écarts assumés (données réelles) :
   · listes honnêtes en `.line` (markup de la référence, lignes 639-652) —
     la maquette n'a jamais de liste (toujours vide) ;
   · un « Voir tout » `.linkbtn` ferme chaque liste non tronquée (CSS porté) ;
   · l'avatar affiche l'initiale du nom affiché, comme la référence ;
   · les cartes infos de l'ancienne ProfilePage (sécurité, préférences…)
     restent sur `/profil` — le lien « Profil » de la nav y mène.
   ========================================================================== */

const EMPTY_STYLE = { background: 'var(--white)', padding: '38px 20px' } as const

/** Une ligne `.line` (markup Cart lignes 639-652) pour une annonce. */
function ProductLine({ p }: { p: OwnerProduct }) {
  const to = `/catalogue/${p.slug}`
  const badge = productStatusBadge(p.status)
  const img = p.images[0]?.url
  return (
    <div className="line">
      <Link className="t" to={to} aria-label={`Voir ${text(p.name)}`}>
        {img ? (
          <SiteImage src={img} alt={text(p.name)} w={300} sizes="120px" kind={artKindFor(p.category?.name)} />
        ) : (
          art(artKindFor(p.category?.name))
        )}
      </Link>
      <div>
        <div className="nm">
          <Link to={to}>{text(p.name)}</Link>
        </div>
        <div className="sub">
          {badge.label} · {formatDate(p.createdAt)}
        </div>
      </div>
      <div className="pr">{fmt(p.price)}</div>
    </div>
  )
}

/** Une ligne `.line` pour une commande. */
function OrderLine({ o }: { o: OrderSummary }) {
  const to = `/mes-commandes/${o.id}`
  const badge = orderStatusBadge(o.status)
  const img = o.product.image?.url
  return (
    <div className="line">
      <Link className="t" to={to} aria-label={`Voir la commande ${o.orderNumber}`}>
        {img ? (
          <SiteImage src={img} alt={text(o.product.name)} w={300} sizes="120px" kind={artKindFor()} />
        ) : (
          art(artKindFor())
        )}
      </Link>
      <div>
        <div className="nm">
          <Link to={to}>{o.orderNumber}</Link>
        </div>
        <div className="sub">
          {badge.label} · {formatDate(o.createdAt)}
        </div>
      </div>
      <div className="pr">{fmt(o.amount)}</div>
    </div>
  )
}

export function AccountView() {
  const { user, isLoading, logout } = useAuth()
  const { count: favCount } = useFavorites()
  const { count: cartCount } = useCart()

  const products = useQuery({ queryKey: ['my-products'], queryFn: () => api.myProducts(), enabled: !!user })
  const orders = useQuery({ queryKey: ['my-orders'], queryFn: () => api.myOrders(), enabled: !!user })

  if (!isLoading && !user) {
    return <Navigate to="/login?redirect=/profil" replace />
  }

  const displayName = user ? user.name || user.email : 'Invité·e'
  const initial = (displayName.trim()[0] || 'R').toUpperCase()
  const sub = user ? user.email : ''

  const myItems = products.data?.items ?? []
  const orderItems = orders.data?.items ?? []

  return (
    <div className="wrap">
      <Crumb items={[{ label: 'Mon compte' }]} />
      <div className="section tight">
        <SiteHead eyebrow="Votre espace" title="Mon compte" level={1} />

        <div className="acct">
          <div className="side">
            <div className="who">
              <div className="av">{initial}</div>
              <b>{displayName}</b>
              <span>{sub}</span>
            </div>
            <nav aria-label="Sections du compte">
              <Link className="on" to="/profil">
                <Ico name="user" cls="sm" />
                Profil
              </Link>
              <Link to="/favoris">
                <Ico name="heart" cls="sm" />
                Favoris
              </Link>
              <Link to="/panier">
                <Ico name="bag" cls="sm" />
                Panier
              </Link>
              <Link to="/mes-articles">
                <Ico name="plus-circle" cls="sm" />
                Mes annonces
              </Link>
            </nav>
            <button
              className="btn ghost sm"
              type="button"
              onClick={() => void logout()}
              style={{ marginTop: '10px', justifyContent: 'center' }}
            >
              Se déconnecter
            </button>
          </div>

          <div>
            <div className="stat-grid">
              <div className="stat">
                <div className="n">{favCount}</div>
                <div className="l">Favoris enregistrés</div>
              </div>
              <div className="stat">
                <div className="n">{cartCount}</div>
                <div className="l">Articles dans le panier</div>
              </div>
              <div className="stat">
                <div className="n">{products.data ? products.data.counts.available : '…'}</div>
                <div className="l">Annonces publiées</div>
              </div>
            </div>

            <div className="box" style={{ marginBottom: 18 }}>
              <h3>Mes annonces</h3>
              {products.isPending && (
                <div className="note info" aria-live="polite">
                  Chargement de vos annonces…
                </div>
              )}
              {products.isError && (
                <div className="note warn" role="alert">
                  Impossible de charger vos annonces. Réessayez plus tard.
                </div>
              )}
              {products.isSuccess && myItems.length === 0 && (
                <div className="empty" style={EMPTY_STYLE}>
                  <Ico name="plus-circle" />
                  <h2 style={{ fontSize: 24 }}>Aucune annonce pour l'instant</h2>
                  <p>Publiez votre premier article : vos annonces actives et vendues apparaîtront ici.</p>
                  <Link className="btn" to="/sell">
                    Vendre un article
                  </Link>
                </div>
              )}
              {products.isSuccess && myItems.length > 0 && (
                <>
                  {myItems.slice(0, 5).map((p) => (
                    <ProductLine key={p.id} p={p} />
                  ))}
                  {myItems.length > 5 && (
                    <Link className="linkbtn" to="/mes-articles" style={{ marginTop: '14px' }}>
                      Voir toutes mes annonces <Ico name="arrow-right" cls="sm" />
                    </Link>
                  )}
                </>
              )}
            </div>

            <div className="box">
              <h3>Mes commandes</h3>
              {orders.isPending && (
                <div className="note info" aria-live="polite">
                  Chargement de vos commandes…
                </div>
              )}
              {orders.isError && (
                <div className="note warn" role="alert">
                  Impossible de charger vos commandes. Réessayez plus tard.
                </div>
              )}
              {orders.isSuccess && orderItems.length === 0 && (
                <div className="empty" style={EMPTY_STYLE}>
                  <Ico name="bag" />
                  <h2 style={{ fontSize: 24 }}>Aucune commande</h2>
                  <p>Le paiement en ligne n'est pas encore activé, aucune commande passée n'apparaîtra ici pour le moment.</p>
                  <Link className="btn ghost" to="/panier">
                    Voir mon panier
                  </Link>
                </div>
              )}
              {orders.isSuccess && orderItems.length > 0 && (
                <>
                  {orderItems.slice(0, 5).map((o) => (
                    <OrderLine key={o.id} o={o} />
                  ))}
                  {orderItems.length > 5 && (
                    <Link className="linkbtn" to="/mes-commandes" style={{ marginTop: '14px' }}>
                      Voir toutes mes commandes <Ico name="arrow-right" cls="sm" />
                    </Link>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
