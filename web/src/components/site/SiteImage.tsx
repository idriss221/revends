import { useState, type ImgHTMLAttributes } from 'react'
import { resolveImageUrl } from '../../lib/catalogPhotos'

/* ============================================================================
   Image du site — reprise EXACTE de `img()` de `Bureau/main/assets/app.js`
   (jeu de sources responsif, `data-k/col/bg`, illustration de secours).

   La référence pointe vers Unsplash ; ici la source est l'API (`image.url`),
   résolue par `resolveImageUrl`. Le MEilleur candidat au survol (`alt` de la
   référence) n'existe pas sur `ProductCardItem` (une seule image) : on
   l'omet plutôt que d'afficher un mensonge.
   ========================================================================== */

export type ArtKind = 'coat' | 'shoe' | 'bag' | 'phone' | 'lamp' | 'cam'

/**
 * Illustration SVG de secours — `art()` de la référence, copie littérale.
 * Jamais de rectangle gris ni d'image cassée.
 */
export function art(kind: ArtKind, col = '#4A2F25', bg = '#EFE6D6', label = 'Illustration') {
  const g = `art-${kind}`
  const shapes: Record<ArtKind, string> = {
    coat:
      '<path d="M66 44l34-14 34 14 30 20-15 104H51L36 64z" fill="' +
      col +
      '"/><path d="M100 30v138M66 44l34 30 34-30" stroke="#0004" stroke-width="2" fill="none"/><circle cx="104" cy="96" r="2.5" fill="#0006"/><circle cx="104" cy="124" r="2.5" fill="#0006"/>',
    shoe:
      '<path d="M26 134c0-32 8-54 8-54l32 10 42 24c22 8 44 8 56 22v12H26z" fill="' +
      col +
      '"/><path d="M26 152h172" stroke="#0005" stroke-width="7"/><path d="M70 90l12 18M84 96l12 18" stroke="#0004" stroke-width="3"/>',
    bag:
      '<path d="M72 72c0-38 56-38 56 0" stroke="' +
      col +
      '" stroke-width="9" fill="none"/><path d="M46 72h108l14 90H32z" fill="' +
      col +
      '"/><path d="M46 72h108" stroke="#0004" stroke-width="3"/>',
    phone:
      '<rect x="66" y="30" width="68" height="134" rx="13" fill="' +
      col +
      '"/><rect x="72" y="40" width="56" height="106" rx="5" fill="#fff3"/><circle cx="100" cy="154" r="3" fill="#fff6"/>',
    lamp:
      '<path d="M100 38l44 64H56z" fill="' +
      col +
      '"/><path d="M100 102v52" stroke="#2b2a28" stroke-width="5"/><ellipse cx="100" cy="158" rx="30" ry="6" fill="#2b2a28"/>',
    cam:
      '<rect x="36" y="64" width="128" height="86" rx="9" fill="' +
      col +
      '"/><rect x="70" y="52" width="34" height="14" fill="' +
      col +
      '"/><circle cx="100" cy="106" r="28" fill="#d9d3c8"/><circle cx="100" cy="106" r="17" fill="#171513"/><circle cx="100" cy="106" r="7" fill="#3a5a8a" opacity=".6"/>',
  }
  return (
    <svg
      viewBox="0 0 200 250"
      width="100%"
      height="100%"
      preserveAspectRatio="xMidYMid slice"
      role="img"
      aria-label={label}
      style={{ display: 'block' }}
    >
      <defs>
        <radialGradient id={g} cx=".3" cy=".2" r="1">
          <stop offset="0" stopColor="#fff" stopOpacity=".55" />
          <stop offset="1" stopColor={bg} />
        </radialGradient>
      </defs>
      <rect width="200" height="250" fill={bg} />
      <rect width="200" height="250" fill={`url(#${g})`} />
      <ellipse cx="100" cy="196" rx="62" ry="8" fill="#0002" />
      <g transform="translate(0,22)">{shapes[kind]}</g>
    </svg>
  )
}

/** Gabarit de secours par catégorie (les champs `k/col/bg` du demo n'existent pas côté API). */
const KIND_BY_CATEGORY: Record<string, ArtKind> = {
  mode: 'coat',
  'vêtements': 'coat',
  chaussures: 'shoe',
  'pointures': 'shoe',
  sacs: 'bag',
  maroquinerie: 'bag',
  tech: 'phone',
  'électronique': 'phone',
  téléphone: 'phone',
  maison: 'lamp',
  'décoration': 'lamp',
  loisirs: 'cam',
}

export function artKindFor(categoryName?: string | null): ArtKind {
  const n = (categoryName ?? '').toLowerCase()
  for (const [key, kind] of Object.entries(KIND_BY_CATEGORY)) if (n.includes(key)) return kind
  return 'coat'
}

export interface SiteImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'srcSet'> {
  /** URL (relative API, `/categories/…` ou absolue) — résolue par `resolveImageUrl`. */
  src: string
  alt: string
  /**
   * @deprecated Conservés pour ne pas casser les appelants : il n'existe pas de
   * variantes redimensionnées côté stockage, donc ni `srcset` ni `sizes` ne
   * peuvent être émis honnêtement (voir le commentaire dans le composant).
   */
  w?: number
  sizes?: string
  /** gabarit d'illustration de secours si le fichier charge en erreur */
  kind?: ArtKind
  col?: string
  bg?: string
  eager?: boolean
}

/**
 * `<img>` avec le jeu de sources de la référence + repli automatique sur
 * l'illustration SVG (les vendeurs peuvent supprimer une photo : jamais de
 * rectangle gris).
 */
export function SiteImage({
  src,
  alt,
  w: _w = 800,
  sizes: _sizes = '(max-width:760px) 50vw, 24vw',
  kind = 'coat',
  col = '#4A2F25',
  bg = '#EFE6D6',
  eager = false,
  className,
  ...rest
}: SiteImageProps) {
  const [failed, setFailed] = useState(false)

  /* Aucune source (photo supprimée/absente) : on ne rend JAMAIS `<img src="">`
     — le navigateur y voit l'URL de la page, déclenche une requête inutile
     puis affiche l'icône cassée le temps du `onError`. On affiche directement
     l'état « sans photo » dessiné (illustration au trait, jamais une fausse
     photo produit), avec le nom réel de l'article en libellé accessible. */
  const hasSrc = Boolean(src && src.trim())
  if (failed || !hasSrc) {
    return (
      <span className={className} style={{ display: 'block' }}>
        {art(kind, col, bg, alt || 'Photo indisponible')}
      </span>
    )
  }

  const href = resolveImageUrl(src)

  /* Pas de `srcset` tant qu'il n'existe pas de vraies variantes redimensionnées.
     L'ancien code répétait **la même URL** en 480w/800w/1200w : le navigateur
     croyait disposer de trois largeurs intrinsèques, en déduisait une densité
     absurde et, pour les petites images (photos uploadées 1×1 des fixtures),
     finissait avec `naturalWidth = 0` — l'image n'était plus rendue alors que
     le fichier répondait 200. Un `srcset` doit décrire des fichiers distincts,
     sinon il dégrade l'affichage. */
  return (
    <img
      {...rest}
      className={className}
      src={href}
      alt={alt}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      onError={() => setFailed(true)}
    />
  )
}
