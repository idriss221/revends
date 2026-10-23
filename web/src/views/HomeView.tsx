import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { Ico } from '../components/brand/Ico'
import { SiteHead, text } from '../components/site/SiteBits'
import { SiteCardGrid } from '../components/site/SiteCard'
import { SiteImage, artKindFor } from '../components/site/SiteImage'
import { api } from '../lib/api'
import { HERO_PHOTO, categoryPhoto } from '../lib/catalogPhotos'
import type { Category, ProductCardItem } from '../lib/types'

/* ============================================================================
   Accueil — `Home()` de `Bureau/main/assets/app.js` (lignes 248-319) +
   `catTile()` (240-246) + `wireHero()` (1476-1494), markup repris à
   l'identique : `.masthead` (héros éditorial + `.mh-media` parallaxe),
   `.mh-bridge`, `.section` Catégories (`.catgrid`/`.cat`/`.cat.big`),
   `.section` Nouveautés, `.editorial`, `.section` petits prix — cartes via
   `SiteCardGrid`, titres/eyebrows/liens EXACTS de la référence.

   Données réelles (la référence lit `data.js`) :
   · héros : `HERO_PHOTO` = photo du héros de la MAQUETTE hébergée en local
     (`RV.SCENE.hero`) — demande de recette. L'API `banners` (§2.10) n'est
     plus lue ici : elle alimentait le héros faute de carrousel CA-ACC-01,
     absent de cette vague (réintégrée avec le carrousel — journal) ;
   · bloc éditorial : `EDITORIAL_PHOTO` (`RV.SCENE.editorial`) ;
   · tuiles : `api.categories()` — photo via `categoryPhoto(nom)`,
     lien `/category/{slug}` (routes réelles) ;
   · « Les nouveautés » : `api.products({ section:'new' })` ;
   · « Trouvailles à petits prix » : `api.products({ price_max:25000 })`,
     dédupliqué contre les nouveautés affichées.

   Écarts assumés (données réelles) :
   · `.cat.big` : la référence marque `mode`/`tech` (ids démo) — ici les
     DEUX premières catégories réelles sont grandes (rythme de grille 6col) ;
   · `.lbl .n` : le `tag` démo n'existe pas côté API → la flèche seule ;
   · sections produit masquées si vide/erreur (la référence a toujours ses
     8 produits de démo) — aucun squelette mensonger ;
   · le zoom de l'image `.editorial` (`data-zoom` de la référence) repose
     sur `.peek` qui n'est stylé QUE sous `.card` → non rendu ici ;
   · « Faire défiler » pointe vers `/search` comme le lien de la référence
     (qui naviguait vers la boutique).
   ========================================================================== */

/** `catTile()` — tuile de catégorie avec design éditorial premium.
 *
 *  Composition « bento » : la 1re catégorie est la tuile signature (2×2),
 *  les suivantes remplissent la droite en carrés — le rectangle est
 *  entièrement rempli. Le sous-titre annonce le nombre de sous-catégories.
 *  Interactions subtiles : légère élévation au survol, zoom léger de l'image.
 */
function CatTile({ c, index }: { c: Category; index: number }) {
  const big = index === 0
  const kids = c.children?.length ?? 0
  return (
    <Link
      className={`cat${big ? ' big' : ''} rv`}
      style={{ ['--d' as string]: String(index) }}
      to={`/category/${c.slug}`}
      aria-label={`Explorer la catégorie ${text(c.name)}`}
    >
      <div className="cat-media">
        <SiteImage
          src={categoryPhoto(c.name, c.slug)}
          alt={text(c.name)}
          w={big ? 900 : 600}
          sizes={big ? '(max-width:760px) 100vw, 50vw' : '(max-width:760px) 46vw, 25vw'}
          kind={artKindFor(c.name)}
          col="#4A2F25"
          bg="#E6D6BD"
        />
        <div className="cat-overlay" />
      </div>
      <span className="lbl">
        {kids > 0 && (
          <span className="sub">
            {kids} sous-catégorie{kids > 1 ? 's' : ''}
          </span>
        )}
        <span className="t">{text(c.name)}</span>
        <span className="n">
          Explorer <Ico name="arrow-right" cls="sm" />
        </span>
      </span>
    </Link>
  )
}

/** `wireHero()` — parallaxe verticale douce du `.mh-media`. */
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
      media.style.transform = `translate3d(0,${(y * 0.12).toFixed(1)}px,0)`
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

/** Hero entrance animation */
function useHeroEntrance(): { opacity: number; transform: string } {
  const [isVisible, setIsVisible] = useState(false)
  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 100)
    return () => clearTimeout(timer)
  }, [])
  return {
    opacity: isVisible ? 1 : 0,
    transform: isVisible ? 'translateY(0)' : 'translateY(20px)'
  }
}

function BudgetSection({ items }: { items: ProductCardItem[] }) {
  if (items.length === 0) return null
  return (
    <section className="section">
      <div className="wrap">
        <SiteHead
          eyebrow="Sous 25 000 FCFA"
          title="Trouvailles à petits prix"
          link={{ label: 'Voir tout', to: '/search?price_max=25000' }}
        />
        <SiteCardGrid items={items} />
      </div>
    </section>
  )
}

export function HomeView() {
  const heroRef = useRef<HTMLElement>(null)
  useHeroParallax(heroRef)
  const { opacity, transform } = useHeroEntrance()

  const categories = useQuery({ queryKey: ['categories'], queryFn: () => api.categories() })
  const newestQ = useQuery({
    queryKey: ['home-section', 'new'],
    queryFn: () => api.products({ section: 'new', per_page: 8 }),
    staleTime: 60_000,
  })
  const budgetQ = useQuery({
    queryKey: ['home-budget', '25000'],
    queryFn: () => api.products({ price_max: 25000, per_page: 8 }),
    staleTime: 60_000,
  })

  /* Héros : photo de la maquette (`RV.SCENE.hero`), hébergée en local. */
  const heroSrc = HERO_PHOTO

  const cats = categories.data?.categories ?? []

  const newest = (newestQ.data?.items ?? []).slice(0, 8)
  const newIds = new Set(newest.map((p) => p.id))
  const budget = (budgetQ.data?.items ?? []).filter((p) => !newIds.has(p.id)).slice(0, 8)

  const heroStyle: React.CSSProperties = {
    opacity,
    transform,
    transition: 'opacity 0.6s cubic-bezier(0.2, 0.8, 0.2, 1), transform 0.6s cubic-bezier(0.2, 0.8, 0.2, 1)'
  }

  return (
    <>
      <section className="masthead" id="hero" ref={heroRef} style={heroStyle}>
        <div className="mh-media">
          <SiteImage
            className="mh-img"
            src={heroSrc}
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
            SECONDE VIE · NOUVEAU PROPRIÉTAIRE
          </span>
          <h1 className="rv" style={{ ['--d' as string]: '1' }}>
            Donnez une <em>seconde vie</em> à ce qui vous ressemble.
          </h1>
          <p className="lead rv" style={{ ['--d' as string]: '2' }}>
            Des pièces choisies avec soin, qui méritent une nouvelle histoire.
          </p>
          <div className="acts rv" style={{ ['--d' as string]: '3' }}>
            <Link className="btn btn-primary btn-lg" to="/search">
              Explorer la boutique <Ico name="arrow-right" cls="sm" />
            </Link>
          </div>
          <Link className="mh-scroll rv" style={{ ['--d' as string]: '4' }} to="/search">
            Faire défiler <span className="arr" aria-hidden="true">↓</span>
          </Link>
        </div>
      </section>

      {cats.length > 0 && (
        <section className="section categories-section" aria-labelledby="categories-title">
          <div className="wrap">
            <div id="categories-title" className="rv" style={{ ['--d' as string]: '0' }}>
              <SiteHead
                eyebrow="Explorer par univers"
                title="Six univers, mille trouvailles"
                sub="Chaque univers rassemble des pièces déjà aimées, prêtes pour une nouvelle histoire."
                link={{ label: 'Tout voir', to: '/search' }}
              />
            </div>
            <div className="catgrid" role="list">
              {cats.map((c, i) => (
                <CatTile key={c.id} c={c} index={i} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Section de confiance / rassurance — Pourquoi ReVends ? */}
      <section className="section trust-section" aria-labelledby="trust-title">
        <div className="wrap">
          <div className="trust-content rv" style={{ ['--d' as string]: '0' }}>
            <span className="eyebrow">Pourquoi ReVends ?</span>
            <h2 id="trust-title" className="rv">La seconde vie, <em>en toute confiance.</em></h2>
            <ul className="trust-list" role="list">
              <li className="trust-item rv">
                <span className="trust-icon" aria-hidden="true"><Ico name="shield" cls="md" /></span>
                <span className="trust-text"><strong>Articles vérifiés</strong> — chaque pièce est inspectée avant mise en ligne.</span>
              </li>
              <li className="trust-item rv">
                <span className="trust-icon" aria-hidden="true"><Ico name="lock" cls="md" /></span>
                <span className="trust-text"><strong>Paiements sécurisés</strong> — transactions protégées, paiement après réception.</span>
              </li>
              <li className="trust-item rv">
                <span className="trust-icon" aria-hidden="true"><Ico name="truck" cls="md" /></span>
                <span className="trust-text"><strong>Livraison suivie</strong> — suivi en temps réel, remise contre signature.</span>
              </li>
              <li className="trust-item rv">
                <span className="trust-icon" aria-hidden="true"><Ico name="leaf" cls="md" /></span>
                <span className="trust-text"><strong>Éco-responsable</strong> — donner une seconde vie, c'est consommer mieux.</span>
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* Section Vendeur — Vendez simplement */}
      <section className="section seller-section" aria-labelledby="seller-title">
        <div className="wrap">
          <div className="seller-content rv" style={{ ['--d' as string]: '0' }}>
            <span className="eyebrow">Vendre sur ReVends</span>
            <h2 id="seller-title" className="rv">Ce que vous ne portez plus peut devenir le coup de cœur de quelqu'un.</h2>
            <p className="seller-text">
              Ce qui dort dans vos placards mérite une seconde vie. Vendez simplement, sans frais cachés, et laissez vos objets trouver un nouveau propriétaire.
            </p>
            <Link className="btn btn-primary btn-lg" to="/sell">
              Vendre un article <Ico name="arrow-right" cls="sm" />
            </Link>
          </div>
        </div>
      </section>

{newest.length > 0 && (
        <section className="section" style={{ paddingTop: 0 }}>
          <div className="wrap">
            <SiteHead
              eyebrow="Fraîchement arrivées"
              title="Les nouveautés"
              link={{ label: 'Voir tout', to: '/search?section=new' }}
            />
            <SiteCardGrid items={newest} />
          </div>
        </section>
      )}

      {/* Bloc éditorial — texte conservé, image remplacée par la bannière demandée */}
      <section className="editorial" aria-labelledby="editorial-title">
        <div className="wrap">
          <div className="pic rv">
            <SiteImage
              src="/categories/bottom-banner.jpg?v=2026-10-22"
              alt="Découvrez notre sélection coups de cœur"
              w={900}
              sizes="(max-width:1080px) 100vw, 46vw"
              kind="coat"
              col="#6B5A48"
              bg="#E6D6BD"
            />
          </div>
          <div className="rv">
            <span className="eyebrow" id="editorial-title">Notre regard</span>
            <h2>
              Ce qui dort dans un placard <em>attend quelqu'un.</em>
            </h2>
            <p>
              Un manteau qui a déjà tenu chaud, une lampe qui éclaire encore, un téléphone qui fonctionne très bien :
              chaque pièce a une histoire, et la suite vous appartient. Acheter d'occasion, c'est choisir la qualité
              sans le neuf — et offrir une seconde vie à ce que d'autres ont aimé.
            </p>
            <Link className="btn btn-light" to="/search">
              Faire une trouvaille <Ico name="arrow-right" cls="sm" />
            </Link>
          </div>
        </div>
      </section>

      <BudgetSection items={budget} />
    </>
  )
}
