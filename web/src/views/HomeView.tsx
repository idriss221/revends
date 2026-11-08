import { useEffect, useRef } from 'react'
import { Link } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { Ico } from '../components/brand/Ico'
import { SiteHead, text } from '../components/site/SiteBits'
import { SiteCardGrid } from '../components/site/SiteCard'
import { SiteImage } from '../components/site/SiteImage'
import { api } from '../lib/api'
import { HERO_PHOTO } from '../lib/catalogPhotos'
import type { Category, ProductCardItem } from '../lib/types'

/* ============================================================================
   Accueil — ordre des sections imposé par la recette :

     1. en-tête + 2. barre de recherche  → `Navbar` / `SiteShell` (collés)
     3. héros éditorial                  → `.masthead` (image de la maquette)
     4. navigation catégories            → rail TEXTUEL défilable
     5. produits en vedette              → `section=discover`
     6. découvrir / les plus demandés     → `section=popular`
     7. articles à bas prix              → `price_max=25000`
     8. vendre sur ReVends               → bloc éditorial + CTA
     9. pied de page                     → `Footer` (dans la coquille)

   Données 100 % réelles (API) ; une section vide est MASQUÉE plutôt que
   d'afficher un squelette mensonger. Les identifiants déjà montrés plus haut
   sont exclus des sections suivantes (`not_in` côté client, l'API renvoyant
   une page suffisamment large).
   ========================================================================== */

/** `wireHero()` (1476-1494) — parallaxe verticale douce du `.mh-media`. */
function useHeroParallax(ref: React.RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const root = ref.current
    if (!root) return
    if (window.matchMedia('(prefers-reduced-motion:reduce)').matches) return
    const media = root.querySelector<HTMLElement>('.mh-media')
    if (!media) return

    let raf = 0
    const apply = () => {
      raf = 0
      const y = Math.min(window.scrollY, root.offsetHeight + 200)
      media.style.transform = `translate3d(0,${(y * 0.16).toFixed(1)}px,0)`
    }
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(apply)
    }
    apply()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [ref])
}

/** Navigation catégories — TEXTE uniquement (pas de tuiles photo).
 *
 *  · desktop : aligné sur la grille du site ;
 *  · mobile/tablette : rail à défilement horizontal, contenu DANS la barre
 *    (aucun débordement de page) ;
 *  · le compteur de sous-catégories est une information réelle (API). */
function CatRail({ cats }: { cats: Category[] }) {
  return (
    <section className="section tight catrail-sec" aria-labelledby="catrail-title">
      <div className="wrap">
        <div className="cr-head rv">
          <div>
            <span className="eyebrow">Explorer par univers</span>
            <h2 id="catrail-title">Trouvez votre famille d’objets</h2>
          </div>
          <Link className="link-arrow cr-all" to="/search">
            Tout voir <Ico name="arrow-right" cls="sm" />
          </Link>
        </div>
        <div className="catrail" role="list" aria-label="Catégories principales">
          {cats.map((c, i) => {
            const kids = c.children?.length ?? 0
            return (
              <Link
                key={c.id}
                role="listitem"
                className="catlink rv"
                style={{ ['--d' as string]: String(i) }}
                to={`/category/${c.slug}`}
              >
                <span className="cn">{text(c.name)}</span>
                <span className="cm">
                  {kids > 0 ? `${kids} rayon${kids > 1 ? 's' : ''}` : 'Découvrir'}
                </span>
                <Ico name="arrow-right" cls="sm" />
              </Link>
            )
          })}
        </div>
      </div>
    </section>
  )
}

/** Bloc « Vendre sur ReVends » — reprend la bannière éditoriale réelle. */
function SellSection() {
  return (
    <section className="editorial sell-cta" id="vendre">
      <div className="wrap">
        <div className="pic rv">
          <SiteImage
            src="/categories/bottom-banner.jpg?v=2026-10-22"
            alt="Pièces de seconde main mises en scène"
            w={900}
            sizes="(max-width:1080px) 100vw, 46vw"
            kind="coat"
            col="#6B5A48"
            bg="#E6D6BD"
          />
        </div>
        <div className="rv">
          <span className="eyebrow">Vendre sur ReVends</span>
          <h2>
            Ce qui dort dans un placard <em>attend quelqu’un.</em>
          </h2>
          <p>
            Un manteau qui a déjà tenu chaud, une lampe qui éclaire encore, un téléphone qui fonctionne très bien :
            chaque pièce a une histoire, et la suite vous appartient. Publiez en quelques minutes, fixez votre prix,
            vendez à quelqu’un qui cherchait exactement ça.
          </p>
          <Link className="btn terra" to="/sell">
            Vendre un article <Ico name="arrow-right" cls="sm" />
          </Link>
        </div>
      </div>
    </section>
  )
}

function ProductSection({
  items,
  eyebrow,
  title,
  to,
  ivory = false,
}: {
  items: ProductCardItem[]
  eyebrow: string
  title: string
  to: string
  ivory?: boolean
}) {
  if (items.length === 0) return null
  return (
    <section className={`section${ivory ? ' ivory' : ''}`}>
      <div className="wrap">
        <SiteHead eyebrow={eyebrow} title={title} link={{ label: 'Voir tout', to }} />
        <SiteCardGrid items={items} />
      </div>
    </section>
  )
}

export function HomeView() {
  const heroRef = useRef<HTMLElement>(null)
  useHeroParallax(heroRef)

  const categories = useQuery({ queryKey: ['categories'], queryFn: () => api.categories() })

  const featuredQ = useQuery({
    queryKey: ['home-section', 'discover'],
    queryFn: () => api.products({ section: 'discover', per_page: 4 }),
    staleTime: 60_000,
  })
  const popularQ = useQuery({
    queryKey: ['home-section', 'popular'],
    queryFn: () => api.products({ section: 'popular', per_page: 12 }),
    staleTime: 60_000,
  })
  const budgetQ = useQuery({
    queryKey: ['home-budget', '25000'],
    queryFn: () => api.products({ price_max: 25000, per_page: 12 }),
    staleTime: 60_000,
  })

  const cats = categories.data?.categories ?? []

  const featured = (featuredQ.data?.items ?? []).slice(0, 4)
  const featuredIds = new Set(featured.map((p) => p.id))
  const popular = (popularQ.data?.items ?? []).filter((p) => !featuredIds.has(p.id)).slice(0, 8)
  const shownIds = new Set([...featuredIds, ...popular.map((p) => p.id)])
  const budget = (budgetQ.data?.items ?? []).filter((p) => !shownIds.has(p.id)).slice(0, 8)

  return (
    <>
      <section className="masthead" id="hero" ref={heroRef}>
        <div className="mh-media">
          <SiteImage
            className="mh-img"
            src={HERO_PHOTO}
            alt="Mise en scène mode de seconde main"
            w={1600}
            sizes="100vw"
            eager
            kind="coat"
            col="#463738"
            bg="#E8E1D8"
          />
        </div>
        <div className="mh-in wrap">
          <span className="eyebrow rv" style={{ ['--d' as string]: '0' }}>
            Seconde vie · Nouveau propriétaire
          </span>
          <h1 className="rv" style={{ ['--d' as string]: '1' }}>
            Donnez une <em>seconde vie</em> à ce qui vous ressemble.
          </h1>
          <p className="lead rv" style={{ ['--d' as string]: '2' }}>
            Des pièces uniques, choisies avec soin, qui méritent une nouvelle histoire. Achetez mieux, revendez
            simplement et trouvez ce qui vous ressemble vraiment.
          </p>
          <div className="acts rv" style={{ ['--d' as string]: '3' }}>
            <Link className="btn terra" to="/search">
              Explorer la boutique <Ico name="arrow-right" cls="sm" />
            </Link>
            <Link className="btn ghost-light" to="/sell">
              Vendre un article <Ico name="arrow-right" cls="sm" />
            </Link>
          </div>
          <Link className="mh-scroll rv" style={{ ['--d' as string]: '4' }} to="/search">
            Faire défiler <span className="arr" aria-hidden="true">↓</span>
          </Link>
        </div>
      </section>

      <section className="mh-bridge">
        <div className="wrap br-in">
          <p className="br-line rv">
            La seconde vie, <em>sans compromis.</em>
          </p>
          <Link className="link-arrow rv" to="/search">
            Parcourir la sélection <Ico name="arrow-right" cls="sm" />
          </Link>
        </div>
      </section>

      {cats.length > 0 && <CatRail cats={cats} />}

      <ProductSection
        items={featured}
        eyebrow="Sélection de la maison"
        title="Produits en vedette"
        to="/search?section=discover"
      />

      <ProductSection
        items={popular}
        eyebrow="Le plus demandé"
        title="Découvrir les pièces convoitées"
        to="/search?section=popular"
        ivory
      />

      <ProductSection
        items={budget}
        eyebrow="Sous 25 000 FCFA"
        title="Trouvailles à petits prix"
        to="/search?price_max=25000"
      />

      <SellSection />
    </>
  )
}
