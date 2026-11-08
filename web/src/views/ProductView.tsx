import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { ApiError, api } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import { useCart } from '../context/CartContext'
import { useFavorites } from '../context/FavoritesContext'
import { useToast } from '../lib/toast'
import { formatCountdown, formatDiscountPct } from '../lib/format'
import { pushRecentId } from '../lib/recentViews'
import { categoryPhoto, resolveImageUrl } from '../lib/catalogPhotos'
import { Ico } from '../components/brand/Ico'
import { SiteImage, artKindFor } from '../components/site/SiteImage'
import { SiteCardGrid } from '../components/site/SiteCard'
import { Crumb, SiteEmpty, SiteHead, catLabel, fmt, text } from '../components/site/SiteBits'
import { openZoom } from '../components/site/Lightbox'
import type { ProductDetail } from '../lib/types'

/* ============================================================================
   Fiche produit — `Product(id)` + `wireProduct(id)` de
   `Bureau/main/assets/app.js` (lignes 516-597 et 1147-1166).

   Markup repris à l'identique : `.crumb`, `.pd` > `.gallery` (`.main`
   cliquable → visionneuse + `.thumbs` à `aria-current`) + `.buy`
   (`.micro-eyebrow`, `.buy-top`, `.buy-price`, `.desc`, `.actions`,
   `.confbox`, `.spec`, `.seller`, `.note`), puis la section
   « Dans le même esprit » (`.head.rv` + grille de cartes).

   Écarts assumés (données réelles / pas de bouton mort) :
   · « Faire une offre » : aucun endpoint d'offre dans l'API → BOUTON RETIRÉ ;
   · « Vendeur vérifié » / « N articles en vente » : ni flag `verified` ni
     filtre vendeur sur GET /api/products → non affichés (mensonge sinon) ;
     à la place : « Membre depuis … » + le compteur `sales` s'il est présent ;
   · la ligne démo « paiement en ligne bientôt disponible » est fausse ici
     (checkout Mobile Money réel) : `.confbox` reformulé honnêtement ;
   · `.tips` / `.stat` : cités par le lot mais absents de `Product()` dans la
     référence → non rendus (signalés au rapport).
   ========================================================================== */

const GAL_SIZES = '(max-width:1080px) 100vw, 55vw'

/** Disponibilité lue dans `status` (le stock exact n'existe pas sur la fiche). */
function availabilityLabel(p: ProductDetail): string {
  switch (p.status) {
    case 'AVAILABLE':
      return 'Disponible'
    case 'RESERVED':
      return p.reservedUntil ? `Réservé · ${formatCountdown(p.reservedUntil)}` : 'Réservé'
    case 'SOLD':
      return 'Vendu'
    default:
      return 'Indisponible'
  }
}

/** Galerie — `.gallery` (lignes 538-545) + swap animé de `wireProduct` (1147-1166). */
function Gallery({ p }: { p: ProductDetail }) {
  const [active, setActive] = useState(0)
  const mainRef = useRef<HTMLDivElement>(null)
  const timerRef = useRef<number | null>(null)
  const kind = artKindFor(p.category?.name)
  // Produit sans photo : photo d'illustration de catégorie (jamais un src vide,
  // qui ne déclencherait pas `onError` ni le repli illustration de SiteImage).
  const src = p.images[active]?.url ?? categoryPhoto(p.category?.name ?? '', p.category?.slug)

  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    },
    [],
  )

  // La classe `swapping` (opacité 0 + léger zoom) part après le commit React :
  // l'effet tourne une fois l'image nouvelle peinte, comme le rAF de la maquette.
  useEffect(() => {
    mainRef.current?.classList.remove('swapping')
  }, [active])

  /** Choix d'une vignette — transition 200 ms (respect de reduced-motion). */
  const pick = (i: number) => {
    if (i === active) return
    const el = mainRef.current
    const reduce =
      typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (!el || reduce) {
      setActive(i)
      return
    }
    el.classList.add('swapping')
    if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => setActive(i), 200)
  }

  const zoom = () => openZoom(resolveImageUrl(src), text(p.name))

  return (
    <div className="gallery">
      <div className="main" id="galMain" ref={mainRef}>
        <SiteImage
          src={src}
          alt={text(p.name)}
          w={1100}
          sizes={GAL_SIZES}
          kind={kind}
          eager
          data-zoom=""
          role="button"
          tabIndex={0}
          aria-label={`Agrandir l'image : ${text(p.name)}`}
          onClick={zoom}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              zoom()
            }
          }}
        />
      </div>
      {p.images.length > 1 ? (
        <div className="thumbs" role="group" aria-label="Photos de l'article">
          {p.images.map((im, i) => (
            <button
              key={im.id}
              type="button"
              aria-current={i === active ? 'true' : 'false'}
              aria-label={`Afficher la photo ${i + 1}`}
              onClick={() => pick(i)}
            >
              <SiteImage src={im.url} alt={`${p.name} — photo ${i + 1}`} w={300} sizes="120px" kind={kind} />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

export function ProductView() {
  const { slug = '' } = useParams()
  const { user } = useAuth()
  const { add, items: cartItems } = useCart()
  const { isFavorite, toggleFavorite } = useFavorites()
  const toast = useToast()
  const [justAdded, setJustAdded] = useState(false)
  const resetTimer = useRef<number | null>(null)

  const product = useQuery({
    queryKey: ['product', slug],
    queryFn: () => api.productBySlug(slug),
    enabled: slug !== '',
  })

  // Vues récentes (CA-ACC-58/59) — même comportement que l'ancienne fiche.
  useEffect(() => {
    if (product.isSuccess) pushRecentId(product.data.id)
  }, [product.isSuccess, product.data])

  useEffect(() => () => {
    if (resetTimer.current !== null) window.clearTimeout(resetTimer.current)
  }, [])

  // Articles similaires : même catégorie, article courant exclu (not_in).
  const similar = useQuery({
    queryKey: ['similar-products', product.data?.id],
    queryFn: () =>
      api.products({ category_id: product.data!.category.id, not_in: [product.data!.id], per_page: 5 }),
    enabled: product.isSuccess,
  })

  if (slug === '' || (product.isError && product.error instanceof ApiError && product.error.status === 404)) {
    const code = product.error instanceof ApiError ? product.error.code : 'PRODUCT_NOT_FOUND'
    return (
      <div className="wrap">
        <Crumb items={[{ label: 'Article' }]} />
        <div className="section tight">
          <SiteEmpty
            role="alert"
            icon="search"
            title="Article introuvable"
            action={{ label: 'Découvrir le catalogue', to: '/shop' }}
          >
            Cet article n'existe plus ou a été retiré du catalogue. ({code})
          </SiteEmpty>
        </div>
      </div>
    )
  }

  if (product.isPending) {
    return (
      <div className="wrap">
        <Crumb items={[{ label: 'Article' }]} />
        <div className="section tight">
          <SiteEmpty icon="refresh" title="Chargement de l'article…" />
        </div>
      </div>
    )
  }

  if (product.isError) {
    return (
      <div className="wrap">
        <Crumb items={[{ label: 'Article' }]} />
        <div className="section tight">
          <SiteEmpty
            icon="refresh"
            title="Impossible de charger l'article"
            action={{ label: 'Réessayer', onClick: () => void product.refetch() }}
          >
            {product.error instanceof Error ? product.error.message : 'Une erreur est survenue.'}
          </SiteEmpty>
        </div>
      </div>
    )
  }

  const p = product.data
  const disc = formatDiscountPct(p.price, p.oldPrice ?? null)
  const inCart = cartItems.some((l) => l.id === p.id)
  const isFav = isFavorite(p.id)
  const isOwner = user?.id === p.seller.id
  const canBuy = p.status === 'AVAILABLE' && !isOwner

  const favEntry = {
    slug: p.slug,
    name: p.name,
    price: p.price,
    oldPrice: p.oldPrice ?? null,
    location: p.location,
    condition: p.condition,
    categoryName: p.category.name,
    imageUrl: p.images[0]?.url ?? null,
  }

  const addToCart = () => {
    add(p)
    toast('success', `« ${p.name} » ajouté au panier.`)
    setJustAdded(true)
    if (resetTimer.current !== null) window.clearTimeout(resetTimer.current)
    resetTimer.current = window.setTimeout(() => setJustAdded(false), 1600)
  }

  const onToggleFav = () => {
    const adding = toggleFavorite(p.id, favEntry)
    toast(adding ? 'success' : 'info', adding ? 'Ajouté aux favoris' : 'Retiré des favoris')
  }

  // `.spec` : uniquement les lignes que les données réelles remplissent.
  const specs: Array<[string, string]> = []
  const characteristics = [p.brand, p.model, p.ageYears != null ? `${p.ageYears} an${p.ageYears > 1 ? 's' : ''}` : null]
    .filter(Boolean)
    .join(' · ')
  if (characteristics) specs.push(['Caractéristiques', characteristics])
  specs.push(['État', p.condition])
  if (p.defects) specs.push(['Défauts', p.defects])
  if (p.accessories) specs.push(['Accessoires', p.accessories])
  specs.push(['Disponibilité', availabilityLabel(p)])
  specs.push(['Ville', p.location])

  const similarItems = (similar.data?.items ?? []).filter((it) => it.id !== p.id).slice(0, 4)

  return (
    <div className="wrap">
      <Crumb
        items={[
          { label: catLabel(p.category), to: `/shop?c=${p.category.id}` },
          { label: text(p.name) },
        ]}
      />
      <div className="pd">
        <Gallery p={p} />

        <div className="buy">
          <span className="micro-eyebrow">REVENDS · Selected piece · 1 of 1</span>
          <div className="buy-top">
            <span className="cat-lbl">{catLabel(p.category)}</span>
            <span className="tag">{text(p.condition)}</span>
          </div>
          <h1>{text(p.name)}</h1>
          <div className="buy-price">
            <span className="price">
              {fmt(p.price)}
              {disc ? <s>{fmt(p.oldPrice!)}</s> : null}
            </span>
            {disc ? <span className="save">Économisez {fmt(p.oldPrice! - p.price)}</span> : null}
          </div>
          <p className="desc">{text(p.description)}</p>

          <div className="actions">
            {canBuy ? (
              <button
                className={`btn terra${justAdded ? ' added' : ''}`}
                type="button"
                onClick={addToCart}
              >
                {inCart ? (
                  <>
                    <Ico name="check" cls="sm" />
                    Dans le panier
                  </>
                ) : (
                  <>
                    <Ico name="bag" cls="sm" />
                    Ajouter au panier
                  </>
                )}
              </button>
            ) : null}
            <button
              className="btn ghost"
              type="button"
              aria-pressed={isFav}
              aria-label={isFav ? 'Retirer des favoris' : 'Ajouter aux favoris'}
              onClick={onToggleFav}
            >
              <Ico name={isFav ? 'heart' : 'heart-o'} cls={isFav ? 'fill' : undefined} />
              <span>Favori</span>
            </button>
          </div>

          {/* Panneaux d'honnêteté quand l'achat est impossible (vendu / réservé / sien). */}
          {!canBuy ? (
            <div className="note warn" style={{ marginBottom: 18 }}>
              {isOwner
                ? 'Cet article vous appartient : il ne peut pas être ajouté à votre propre panier.'
                : p.status === 'SOLD'
                  ? 'Cet article a été vendu.'
                  : 'Cet article est actuellement réservé.'}
            </div>
          ) : null}

          <div className="confbox">
            <div className="row">
              <Ico name="truck" cls="sm" />
              <span>
                <b>Livraison ou remise en main propre</b> — à convenir directement avec le vendeur.
              </span>
            </div>
            <div className="row">
              <Ico name="shield" cls="sm" />
              <span>
                <b>Paiement à la commande</b> — réglez en Mobile Money à l'étape suivante, sans débit anticipé.
              </span>
            </div>
          </div>

          <dl className="spec">
            {specs.map(([label, value]) => (
              <div key={label} style={{ display: 'contents' }}>
                <dt>{label}</dt>
                <dd>{text(value)}</dd>
              </div>
            ))}
          </dl>

          <div className="seller">
            <span className="av">{text(p.seller.displayName).charAt(0)}</span>
            <div>
              <span className="who-name">{text(p.seller.displayName)}</span>
              <div className="meta-line">Membre depuis {p.seller.memberSince}</div>
              {p.seller.sales !== undefined ? (
                <div className="facts">
                  <span>
                    <b>{p.seller.sales}</b> vente{p.seller.sales > 1 ? 's' : ''}
                  </span>
                </div>
              ) : null}
            </div>
          </div>
          <p className="note">Les photos montrent l'article tel quel, défauts compris.</p>
        </div>
      </div>

      {similarItems.length > 0 ? (
        <section className="section">
          <SiteHead
            eyebrow="Dans le même esprit"
            title="Vous aimerez aussi"
            link={{ label: 'Voir la catégorie', to: `/shop?c=${p.category.id}` }}
          />
          <SiteCardGrid items={similarItems} />
        </section>
      ) : null}
    </div>
  )
}
