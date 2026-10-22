import { useEffect, useRef } from 'react'
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

/** `catTile()` (240-246) — tuile de catégorie réelle.
 *
 *  Composition « bento » : la 1re catégorie est la tuile signature (2×2),
 *  les suivantes remplissent la droite en carrés — le rectangle est
 *  entièrement rempli (l'ancienne grille 6 colonnes laissait un vide).
 *  Le sous-titre annonce le nombre de sous-catégories : une information
 *  utile plutôt qu'un simple label décoratif. */
function CatTile({ c, index }: { c: Category; index: number }) {
  const big = index === 0
  const kids = c.children?.length ?? 0
  return (
    <Link
      className={`cat${big ? ' big' : ''} rv`}
      style={{ ['--d' as string]: String(index) }}
      to={`/category/${c.slug}`}
    >
      <SiteImage
        src={categoryPhoto(c.name, c.slug)}
        alt={text(c.name)}
        w={big ? 900 : 600}
        sizes={big ? '(max-width:760px) 100vw, 50vw' : '(max-width:760px) 46vw, 25vw'}
        kind={artKindFor(c.name)}
        col="#4A2F25"
        bg="#E6D6BD"
      />
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

  return (
    <>
      <section className="masthead" id="hero" ref={heroRef}>
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
              Vendre un article
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

      {cats.length > 0 && (
        <section className="section">
          <div className="wrap">
            <SiteHead
              eyebrow="Explorer par univers"
              title="Cinq familles, mille trouvailles"
              sub="Chaque univers rassemble des pièces déjà aimées, prêtes pour une nouvelle histoire."
              link={{ label: 'Tout voir', to: '/search' }}
            />
            <div className="catgrid">
              {cats.map((c, i) => (
                <CatTile key={c.id} c={c} index={i} />
              ))}
            </div>
          </div>
        </section>
      )}

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
      <section className="editorial">
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
            <span className="eyebrow">Notre regard</span>
            <h2>
              Ce qui dort dans un placard <em>attend quelqu'un.</em>
            </h2>
            <p>
              Un manteau qui a déjà tenu chaud, une lampe qui éclaire encore, un téléphone qui fonctionne très bien :
              chaque pièce a une histoire, et la suite vous appartient. Acheter d'occasion, c'est choisir la qualité
              sans le neuf — et offrir une seconde vie à ce que d'autres ont aimé.
            </p>
            <Link className="btn light" to="/search">
              Faire une trouvaille <Ico name="arrow-right" cls="sm" />
            </Link>
          </div>
        </div>
      </section>

      <BudgetSection items={budget} />
    </>
  )
}
