import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router'
import { Crumb, SiteEmpty } from '../components/site/SiteBits'
import { HeartLoader } from '../components/ui/HeartLoader'
import { Notice } from '../components/ui/Notice'
import { Ico } from '../components/brand/Ico'
import { StorefrontHero } from '../components/storefront/StorefrontHero'
import { StorefrontListingCard } from '../components/storefront/StorefrontListingCard'
import { ContactForm } from '../components/storefront/ContactForm'
import { storefrontApi, storefrontError } from '../lib/storefront'
import { useAuth } from '../context/AuthContext'
import { ApiError } from '../lib/apiClient'

/* ============================================================================
   `/boutique/:slug` — boutique publique (design §2, contrat v2.7 §7.5/§7.6).

   · Publique : aucune session requise ; un visiteur anonyme reçoit exactement
     la même page (CA-V7-023) ;
   · 404 UNIQUE pour slug inconnu / PENDING / EXPIRED / CANCELLED
     (CA-V7-024) : `SiteEmpty` identique dans les 4 cas, aucune mention
     d’existence ;
   · `items[]` = annonces boutique uniquement (CA-V7-025) — mêmes `id` que le
     catalogue (CA-V7-035) ;
   · ZÉRO coordonnée personnelle (CA-V7-026) : nom d’affichage + formulaire
     interne uniquement ;
   · Contact : le formulaire n’est rendu QUE si le visiteur connecté n’est
     PAS le vendeur de la boutique ; un visiteur anonyme voit un verrou doux.
   ========================================================================== */

export function Boutique() {
  const { slug = '' } = useParams<{ slug: string }>()
  const { user } = useAuth()

  // Vue propriétaire : sert UNIQUEMENT à savoir si le visiteur est le vendeur
  // (le formulaire de contact est interdit au vendeur — CONTACT_SELF).
  const me = useQuery({
    queryKey: ['my-subscription'],
    queryFn: () => storefrontApi.mySubscription(),
    enabled: Boolean(user),
    staleTime: 30_000,
    retry: false,
  })

  const shop = useInfiniteQuery({
    queryKey: ['storefront', slug],
    queryFn: ({ pageParam }) => storefrontApi.getPublic(slug, { page: pageParam as number }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page < last.totalPages ? last.page + 1 : undefined),
    enabled: slug.length > 0,
    retry: false,
    staleTime: 15_000,
  })

  const first = shop.data?.pages[0]
  const items = shop.data?.pages.flatMap((p) => p.items) ?? []
  const count = first?.total ?? 0
  const isOwner = Boolean(user && me.data?.subscription && me.data.subscription.slug === slug)

  // ── Chargement ──────────────────────────────────────────────────────────
  if (shop.isPending) {
    return (
      <div className="wrap">
        <Crumb items={[{ label: 'Boutique' }]} />
        <div className="section tight">
          <HeartLoader size="lg" label="Ouverture de la boutique…" />
        </div>
      </div>
    )
  }

  // ── Erreur ─────────────────────────────────────────────────────────────
  if (shop.isError) {
    const err = shop.error
    const unknown = err instanceof ApiError && err.code === 'NOT_FOUND'
    if (unknown) {
      // 404 unique — identique pour slug inconnu / PENDING / EXPIRED / CANCELLED.
      return (
        <div className="wrap">
          <Crumb items={[{ label: 'Boutique' }]} />
          <div className="section tight">
            <SiteEmpty
              icon="search"
              level={1}
              role="status"
              title="Cette boutique n’existe pas"
              action={{ label: 'Voir tout le catalogue', to: '/shop' }}
              style={{ maxWidth: '640px', marginInline: 'auto' }}
            >
              Le lien est peut-être erroné, ou la boutique n’est pas ouverte pour le moment.
            </SiteEmpty>
          </div>
        </div>
      )
    }
    return (
      <div className="wrap">
        <Crumb items={[{ label: 'Boutique' }]} />
        <div className="section tight">
          <SiteEmpty
            icon="triangle-exclamation"
            level={1}
            role="alert"
            title="Impossible d’ouvrir cette boutique"
            action={{ label: 'Réessayer', onClick: () => void shop.refetch() }}
            style={{ maxWidth: '640px', marginInline: 'auto' }}
          >
            {storefrontError(err, 'Réessayez dans un instant.')}
          </SiteEmpty>
        </div>
      </div>
    )
  }

  const displayName = first?.storefront.displayName ?? ''
  const memberSince = first?.storefront.memberSince

  return (
    <div className="wrap">
      <Crumb items={[{ label: displayName }]} />

      <StorefrontHero displayName={displayName} memberSince={memberSince} listingCount={count} slug={slug} />

      <div className="section tight rv-shop-layout">
        {/* ── Annonces boutique uniquement (CA-V7-025) ─────────────────── */}
        <section aria-labelledby="shop-listings-title">
          <h2 id="shop-listings-title" className="rv-shop-h2">
            Les annonces de la boutique
          </h2>
          <hr className="rv-shop-rule" />

          {count === 0 ? (
            <SiteEmpty
              icon="store"
              title="Cette boutique prépare sa première pièce"
              action={{ label: 'Voir tout le catalogue', to: '/shop' }}
            >
              Revenez très vite — ou parcourez le catalogue en attendant.
            </SiteEmpty>
          ) : (
            <>
              <div className="rv-grid">
                {items.map((item, index) => (
                  <StorefrontListingCard key={item.id} item={item} index={index} />
                ))}
              </div>
              {shop.hasNextPage && (
                <div style={{ display: 'flex', justifyContent: 'center', marginTop: 28 }}>
                  <button type="button" className="btn quiet" onClick={() => void shop.fetchNextPage()} disabled={shop.isFetchingNextPage} aria-busy={shop.isFetchingNextPage}>
                    {shop.isFetchingNextPage ? 'Chargement…' : 'Charger plus'}
                  </button>
                </div>
              )}
            </>
          )}
        </section>

        {/* ── Contact boutique (jamais un mur d’erreur) ─────────────────── */}
        <aside className="rv-shop-aside" aria-label="Contacter la boutique">
          <div className="box" id="contact">
            {!user ? (
              <div className="rv-shop-lock">
                <Notice tone="info">
                  <strong>Connectez-vous pour écrire à la boutique.</strong>
                  <br />
                  Un message, pas un numéro.
                </Notice>
                <div className="rv-shop-hero-acts" style={{ marginTop: 0 }}>
                  <Link className="btn ghost" to={`/login?redirect=${encodeURIComponent(`/boutique/${slug}`)}`}>
                    <Ico name="login" cls="sm" />
                    Se connecter
                  </Link>
                  <Link className="link-arrow" to="/register">
                    Créer un compte <Ico name="arrow-right" cls="sm" />
                  </Link>
                </div>
              </div>
            ) : isOwner ? (
              <Notice tone="info">
                Vous êtes le vendeur de cette boutique — ce formulaire sert aux visiteurs. Vos annonces se gèrent
                depuis <Link className="link-arrow" to="/mon-abonnement">Mon abonnement</Link>.
              </Notice>
            ) : (
              <ContactForm slug={slug} />
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}
