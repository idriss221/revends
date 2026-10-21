/**
 * Photos d'illustration — HÉBERGÉES EN LOCAL (web/public/categories/).
 *
 * Pourquoi en local : les URLs externes (images.unsplash.com,
 * i.pinimg.com) échouent sur certains réseaux → icône d'image cassée.
 * Servi par `/categories/...` :
 *  - dev : Vite sert `web/public/`
 *  - prod : Express/nginx sert `web/dist/` (le build copie `public/` dedans)
 *
 * **Les fichiers = les photos DE LA RÉFÉRENCE** (`Bureau/main`), reproduites
 * à l'identique (`fidelite-maquette`) :
 *  - `hero.jpg`      ← `RV.SCENE.hero`      (image Hero fournie, pinimg) ;
 *  - `auth.jpg`      ← `RV.SCENE.auth`      (fond connexion fourni, pinimg) ;
 *  - `editorial.jpg` ← `RV.SCENE.editorial` (portant : chapeau et vestes) ;
 *  - tuiles          ← `RV.CAT_IMG` (Unsplash) : mode, chaussures, sacs,
 *    tech (= `electronique.jpg`/`technologie.jpg`), maison, loisirs.
 *
 * Le dossier ne contient QUE ces 10 photos de la maquette : les 10 photos de
 * l'ancienne interface (`femme`, `meuble`, `telephone`, `electromenager`…)
 * ont été retirées — toute catégorie réelle de l'API est ramenée sur l'une
 * des 6 photos `RV.CAT_IMG` par `CATEGORY_PHOTOS` (voir le tableau).
 *
 * Utilisées pour les tuiles de catégories, le héros, l'art de la connexion,
 * le bloc éditorial ET comme photo de secours des cartes produit sans image.
 */

/**
 * Version des photos de la maquette, en query-string.
 *
 * Pourquoi : les URLs `/categories/*.jpg` existaient déjà sous l'ancienne
 * interface (avec d'autres contenus) et nginx les sert en
 * `Cache-Control: public, immutable, max-age=1 an`. Sans version, le
 * navigateur garde l'ANCIENNE photo un an et ne voit jamais la maquette.
 * Le `?v=` force le rechargement (coût nul : même fichier). Toute future
 * rotation de photo doit avancer cette version.
 */
export const PHOTO_VERSION = '2026-10-21'

/** Chemin versionné d'une photo de la maquette (`hero` → `/categories/hero.jpg?v=…`). */
const photo = (name: string): string => `/categories/${name}.jpg?v=${PHOTO_VERSION}`

/**
 * **Slugs de catégorie → visuel dédié.** Table de correspondance EXACTE :
 * les 22 catégories réelles (`002_seed_categories.sql`) ont chacune sa photo
 * (`web/public/categories/<slug>.jpg`). La clé est le **slug** (sans accent,
 * stable) et non le nom affiché — « Cuisine & arts de la table » ou
 * « Téléphones & tablettes » ne se déduisent pas d'un mot-clé de nom.
 */
const SLUG_PHOTOS: Record<string, string> = {
  // Catégories mères
  mode: photo('mode'),
  maison: photo('maison'),
  electronique: photo('electronique'),
  electromenager: photo('electromenager'),
  loisirs: photo('loisirs'),
  // Sous-catégories Mode
  'mode-vetements': photo('mode-vetements'),
  'mode-chaussures': photo('mode-chaussures'),
  'mode-sacs': photo('mode-sacs'),
  'mode-montres': photo('mode-montres'),
  // Sous-catégories Maison
  'maison-mobilier': photo('maison-mobilier'),
  'maison-decoration': photo('maison-decoration'),
  'maison-cuisine': photo('maison-cuisine'),
  // Sous-catégories Électronique
  'electronique-telephones': photo('electronique-telephones'),
  'electronique-ordinateurs': photo('electronique-ordinateurs'),
  'electronique-audio': photo('electronique-audio'),
  'electronique-photo': photo('electronique-photo'),
  // Sous-catégories Électroménager
  'electromenager-gros': photo('electromenager-gros'),
  'electromenager-petit': photo('electromenager-petit'),
  // Sous-catégories Loisirs
  'loisirs-livres': photo('loisirs-livres'),
  'loisirs-jeux': photo('loisirs-jeux'),
  'loisirs-sport': photo('loisirs-sport'),
  'loisirs-instruments': photo('loisirs-instruments'),
}

/**
 * Visuels des catégories mères, réutilisés pour les sous-catégories qui
 * n'auraient pas de slug connu (robustesse : jamais d'image cassée).
 */
const PARENT_PHOTOS: Record<string, string> = {
  mode: photo('mode'),
  maison: photo('maison'),
  electronique: photo('electronique'),
  electromenager: photo('electromenager'),
  loisirs: photo('loisirs'),
}

/**
 * Repli par mot-clé, pour les catégories **hors référentiel** (créées plus
 * tard par l'admin). L'ordre compte : premier match gagne, donc les clés les
 * plus spécifiques sont en tête. Une catégorie inconnue → `FALLBACK_PHOTO`.
 */
const CATEGORY_PHOTOS: Array<[string, string]> = [
  ['chaussure', photo('mode-chaussures')],
  ['sac', photo('mode-sacs')],
  ['montre', photo('mode-montres')],
  ['bijou', photo('mode-montres')],
  ['vetement', photo('mode-vetements')],
  ['mode', photo('mode')],
  ['mobilier', photo('maison-mobilier')],
  ['meuble', photo('maison-mobilier')],
  ['decoration', photo('maison-decoration')],
  ['cuisine', photo('maison-cuisine')],
  ['maison', photo('maison')],
  ['telephone', photo('electronique-telephones')],
  ['tablette', photo('electronique-telephones')],
  ['ordinateur', photo('electronique-ordinateurs')],
  ['audio', photo('electronique-audio')],
  ['photo', photo('electronique-photo')],
  ['technologie', photo('electronique')],
  ['electronique', photo('electronique')],
  ['electromenager', photo('electromenager')],
  ['livre', photo('loisirs-livres')],
  ['jouet', photo('loisirs-jeux')],
  ['jeu', photo('loisirs-jeux')],
  ['sport', photo('loisirs-sport')],
  ['instrument', photo('loisirs-instruments')],
  ['musique', photo('loisirs-instruments')],
  ['loisir', photo('loisirs')],
  // alias historiques (plus en base, mais robustes)
  ['femme', photo('mode')],
  ['enfant', photo('mode')],
]

export const FALLBACK_PHOTO = photo('hero')

/** Photo du héros de l'accueil — `RV.SCENE.hero` de la référence. */
export const HERO_PHOTO = photo('hero')

/** Visuel `aside.art` de la page connexion — `RV.SCENE.auth` de la référence. */
export const AUTH_PHOTO = photo('auth')

/** Bloc `.editorial` de l'accueil — `RV.SCENE.editorial` de la référence. */
export const EDITORIAL_PHOTO = photo('editorial')

/** Base API (VITE_API_URL) si le front est déployé séparément du backend. */
const API_BASE = (import.meta.env.VITE_API_URL as string | undefined ?? '').replace(/\/+$/, '')

/**
 * Résout l'URL d'une image en URL absolue utilisable par <img>.
 * - déjà absolue (http…) → inchangée ;
 * - `/uploads/...` (photos postées par les vendeurs) → préfixée par VITE_API_URL
 *   quand le front vit sur une autre origine (sinon relatif = même origine, correct) ;
 * - `/categories/...` (images locales hébergées dans public/) → inchangée.
 */
export function resolveImageUrl(url: string): string {
  if (!url) return url
  // Protocole réel uniquement : `startsWith('http')` acceptait `httpfoo`
  // (inoffensif : chemin relatif) mais surtout `//evil.com` — URL
  // protocol-relative qui charge une ressource d'une AUTRE origine en
  // `<img src>`. On la réécrit en chemin même-origine.
  if (/^https?:\/\//i.test(url)) return url
  if (url.startsWith('//')) return `/${url.replace(/^\/+/, '')}`
  if (API_BASE && url.startsWith('/uploads/')) return `${API_BASE}${url}`
  return url
}

/** normalise : minuscules, sans accents (Électronique → electronique). */
function normalize(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

/**
 * Photo d'illustration d'une catégorie.
 *
 * Résolution en 3 temps (du plus fiable au plus permissif) :
 *   1. **slug exact** (`mode-chaussures`) → visuel dédié ;
 *   2. repli par **mot-clé du nom** (catégorie créée par l'admin) ;
 *   3. `FALLBACK_PHOTO` (jamais d'image cassée).
 */
export function categoryPhoto(nameOrSlug: string, slug?: string): string {
  // 1. slug exact (ou le nom si l'appelant n'a que ça)
  const s = (slug ?? nameOrSlug).trim().toLowerCase()
  if (SLUG_PHOTOS[s]) return SLUG_PHOTOS[s]
  // 2. repli par mot-clé de nom
  const n = normalize(nameOrSlug)
  const hit = CATEGORY_PHOTOS.find(([key]) => n.includes(key))
  if (hit) return hit[1]
  // 2b. catégorie « mode-xxx » inconnue → visuel de la catégorie mère
  const parent = s.split('-')[0]
  if (PARENT_PHOTOS[parent]) return PARENT_PHOTOS[parent]
  // 3. repli final
  return FALLBACK_PHOTO
}

/**
 * Photo d'illustration d'une catégorie, par son id dans une liste.
 * Utilise le slug quand il est fourni (mapping exact), sinon le nom.
 */
export function categoryPhotoById(
  id: number,
  categories: { id: number; name: string; slug?: string }[],
): string {
  const c = categories.find((cat) => cat.id === id)
  return c ? categoryPhoto(c.name, c.slug) : FALLBACK_PHOTO
}