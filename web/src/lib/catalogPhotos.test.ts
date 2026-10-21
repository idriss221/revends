/**
 * `resolveImageUrl` — M4 de la revue : seul un VRAI `http(s)://` est absolu.
 * Avant correctif, `startsWith('http')` acceptait `httpfoo` (pseudo-scheme
 * laissé tel quel dans `<img src>`) et surtout `//evil.com` (protocol-relative
 * → ressource tierce chargée comme image). Cas limites verrouillés ici.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import { AUTH_PHOTO, EDITORIAL_PHOTO, HERO_PHOTO, PHOTO_VERSION, categoryPhoto, resolveImageUrl } from './catalogPhotos'

describe('resolveImageUrl — protocoles', () => {
  it('conserve un URL http(s) absolu', () => {
    expect(resolveImageUrl('https://cdn.exemple.org/a.jpg')).toBe('https://cdn.exemple.org/a.jpg')
    expect(resolveImageUrl('http://cdn.exemple.org/a.jpg')).toBe('http://cdn.exemple.org/a.jpg')
  })
  it('httpfoo n’est PAS traité comme un absolu (chemin relatif inchangé)', () => {
    // inoffensif en `<img src>` : reste un chemin même-origine
    expect(resolveImageUrl('httpfoo')).toBe('httpfoo')
    expect(/^https?:\/\//i.test(resolveImageUrl('httpfoo'))).toBe(false)
  })
  it('réécrit l’URL protocol-relative //evil.com en chemin même-origine', () => {
    expect(resolveImageUrl('//evil.com/x.png')).toBe('/evil.com/x.png')
  })
  it('préfixe /uploads/ par VITE_API_URL et laisse /categories/ relatif', () => {
    expect(resolveImageUrl('/uploads/u/1.jpg')).toMatch(/\/uploads\/u\/1\.jpg$/)
    expect(resolveImageUrl('/categories/x.png')).toBe('/categories/x.png')
  })
  it('chaîne vide identique', () => {
    expect(resolveImageUrl('')).toBe('')
  })
})

/* ---------------------------------------------------------------------------
 * Photos de la MAQUETTE hébergées en local (fidelite-maquette).
 * Recette : les 3 visuels signalés (héros d'accueil, art de connexion,
 * tuiles de catégories) + le bloc éditorial doivent être les photos de
 * `Bureau/main` et être réellement présents sur disque (pas de lien mort,
 * pas de suppression accidentelle du dossier `public/categories/`).
 * ------------------------------------------------------------------------- */
describe('assets Bureau/main — web/public/categories/', () => {
  // Les URLs publiques sont versionnées (`?v=…`) pour casser le cache
  // immutable 1 an de nginx (mêmes URLs que l'ancienne interface).
  const cat = (name: string) => `/categories/${name}.jpg?v=${PHOTO_VERSION}`
  // Les 22 visuels dédiés aux 22 catégories réelles (5 mères + 17 sous-cat.).
  const categorySlugs = [
    'mode', 'maison', 'electronique', 'electromenager', 'loisirs',
    'mode-vetements', 'mode-chaussures', 'mode-sacs', 'mode-montres',
    'maison-mobilier', 'maison-decoration', 'maison-cuisine',
    'electronique-telephones', 'electronique-ordinateurs', 'electronique-audio', 'electronique-photo',
    'electromenager-gros', 'electromenager-petit',
    'loisirs-livres', 'loisirs-jeux', 'loisirs-sport', 'loisirs-instruments',
  ]
  const required = [
    HERO_PHOTO, // RV.SCENE.hero
    AUTH_PHOTO, // RV.SCENE.auth
    EDITORIAL_PHOTO, // RV.SCENE.editorial
    ...categorySlugs.map(cat), // les 22 visuels de catégories
  ]
  // Le fichier sur disque n'a pas de query-string.
  const abs = (p: string) => fileURLToPath(new URL(`../../public${p.split('?')[0]}`, import.meta.url))

  it('toutes les constantes sont des chemins locaux versionnés (aucune URL externe)', () => {
    for (const p of [HERO_PHOTO, AUTH_PHOTO, EDITORIAL_PHOTO]) {
      expect(p).toMatch(/^\/categories\/[a-z]+\.jpg\?v=\d{4}-\d{2}-\d{2}$/)
    }
    expect(HERO_PHOTO).toBe(cat('hero'))
    expect(AUTH_PHOTO).toBe(cat('auth'))
    expect(EDITORIAL_PHOTO).toBe(cat('editorial'))
  })

  it.each(required)('%s : fichier présent, JPEG valide, > 10 Ko', (p) => {
    const file = abs(p)
    expect(existsSync(file), `${p} manquant dans web/public/`).toBe(true)
    const buf = readFileSync(file)
    expect([...buf.subarray(0, 3)], `${p} n'est pas un JPEG`).toEqual([0xff, 0xd8, 0xff])
    expect(buf.byteLength, `${p} trop petit = placeholder`).toBeGreaterThan(10_000)
  })

  it('toutes les catégories réelles (22) → un visuel dédié et distinct', () => {
    // Slugs réels en base (`002_seed_categories.sql`), avec leur nom affiché.
    const dbCategories: Array<{ name: string; slug: string }> = [
      { name: 'Mode', slug: 'mode' },
      { name: 'Maison', slug: 'maison' },
      { name: 'Électronique', slug: 'electronique' },
      { name: 'Électroménager', slug: 'electromenager' },
      { name: 'Loisirs', slug: 'loisirs' },
      { name: 'Vêtements', slug: 'mode-vetements' },
      { name: 'Chaussures', slug: 'mode-chaussures' },
      { name: 'Sacs & accessoires', slug: 'mode-sacs' },
      { name: 'Montres & bijoux', slug: 'mode-montres' },
      { name: 'Mobilier', slug: 'maison-mobilier' },
      { name: 'Décoration', slug: 'maison-decoration' },
      { name: 'Cuisine & arts de la table', slug: 'maison-cuisine' },
      { name: 'Téléphones & tablettes', slug: 'electronique-telephones' },
      { name: 'Ordinateurs', slug: 'electronique-ordinateurs' },
      { name: 'Audio & vidéo', slug: 'electronique-audio' },
      { name: 'Appareils photo', slug: 'electronique-photo' },
      { name: 'Gros électroménager', slug: 'electromenager-gros' },
      { name: 'Petit électroménager', slug: 'electromenager-petit' },
      { name: 'Livres & BD', slug: 'loisirs-livres' },
      { name: 'Jeux & jouets', slug: 'loisirs-jeux' },
      { name: 'Sport & fitness', slug: 'loisirs-sport' },
      { name: 'Instruments de musique', slug: 'loisirs-instruments' },
    ]
    const seen = new Set<string>()
    for (const { name, slug } of dbCategories) {
      // Le slug (fourni par l'API) prime : visuel dédié.
      const photo = categoryPhoto(name, slug)
      expect(photo, `${slug} → ${photo}`).toBe(cat(slug))
      // Chaque visuel est DISTINCT (plus de 6 photos partagées pour 22 catég.).
      seen.add(photo)
    }
    expect(seen.size, 'les 22 catégories doivent avoir 22 visuels distincts').toBe(22)
  })

  it('pièges d’ordre : repli par mot-clé quand il n’y a pas de slug ; inconnu → héros', () => {
    // Sans slug (catégorie créée par l'admin), repli par mot-clé du nom.
    expect(categoryPhoto('Mode & Prêt-à-porter')).toBe(cat('mode'))
    expect(categoryPhoto('Chaussures')).toBe(cat('mode-chaussures'))
    expect(categoryPhoto('Sacs & maroquinerie')).toBe(cat('mode-sacs'))
    // « décoration » est plus spécifique que « maison » → visuel dédié à la
    // sous-catégorie (comportement voulu : le repli prend le mot le plus précis).
    expect(categoryPhoto('Maison & décoration')).toBe(cat('maison-decoration'))
    expect(categoryPhoto('Maison')).toBe(cat('maison'))
    expect(categoryPhoto('Loisirs')).toBe(cat('loisirs'))
    expect(categoryPhoto('Électronique')).toBe(cat('electronique'))
    expect(categoryPhoto('Électroménager')).toBe(cat('electromenager'))
    expect(categoryPhoto('Appareils photo')).toBe(cat('electronique-photo'))
    expect(categoryPhoto('Jeux & jouets')).toBe(cat('loisirs-jeux'))
    expect(categoryPhoto('Instruments de musique')).toBe(cat('loisirs-instruments'))
    // alias historiques
    expect(categoryPhoto('Femme')).toBe(cat('mode'))
    expect(categoryPhoto('Téléphone')).toBe(cat('electronique-telephones'))
    // Sous-catégorie inconnue « mode-xxx » → visuel de la catégorie mère.
    expect(categoryPhoto('Autre', 'mode-inexistant')).toBe(cat('mode'))
    // Nom hors base → fallback = héros de la maquette.
    expect(categoryPhoto('Catégorie inconnue')).toBe(cat('hero'))
  })
})

/* ---------------------------------------------------------------------------
 * Catalogue démo (`server/scripts/seed-data/011_seed_demo_catalog.sql`) —
 * les 44 photos produits de la maquette hébergées dans `web/public/catalog/`.
 * Verrou : tout chemin `/catalog/*.jpg` cité par le seed DOIT exister sur
 * disque (sinon fiche produit à image cassée en démo), et le seed ne doit
 * plus référencer la moindre photo distante (Unsplash) — décision
 * « photos locales same-origin » (CSP `img-src 'self'`).
 * ------------------------------------------------------------------------- */
describe('photos produits du catalogue démo — web/public/catalog/', () => {
  const seedSql = readFileSync(
    fileURLToPath(
      new URL('../../../server/scripts/seed-data/011_seed_demo_catalog.sql', import.meta.url),
    ),
    'utf8',
  )
  const paths = [...seedSql.matchAll(/'(\/catalog\/[^']+\.jpg)'/g)].map((m) => m[1] as string)
  const distinct = [...new Set(paths)].sort()
  const abs = (p: string) => fileURLToPath(new URL(`../../public${p}`, import.meta.url))

  it('aucune photo distante dans le seed', () => {
    expect(seedSql).not.toMatch(/https?:\/\//i)
  })

  it('100 références (50 insertion + 50 rattrapage) → 36 visuels maquette distincts', () => {
    // Chaque chemin est cité 2 fois : 3.a (insertion) + 3.b (rattrapage).
    expect(paths).toHaveLength(100)
    expect(distinct).toHaveLength(36)
  })

  it.each(distinct)('%s : présent, JPEG valide, > 20 Ko', (p) => {
    const file = abs(p)
    expect(existsSync(file), `${p} manquant dans web/public/catalog/`).toBe(true)
    const buf = readFileSync(file)
    expect([...buf.subarray(0, 3)], `${p} n'est pas un JPEG`).toEqual([0xff, 0xd8, 0xff])
    expect(buf.byteLength, `${p} trop petit = placeholder`).toBeGreaterThan(20_000)
  })

  it('les 44 photos de la maquette sont hébergées (dont 3 looks sans article démo)', () => {
    const hosted = readdirSync(fileURLToPath(new URL('../../public/catalog', import.meta.url))).filter(
      (f) => f.endsWith('.jpg'),
    )
    expect(hosted).toHaveLength(44)
    // Répartition structurelle de la maquette : 5 looks mode / 4 articles démo,
    // 4 looks chaussures / 3, 3 looks sacs / 2 → 3 looks hébergés sans article
    // démo équivalent. Ils restent servis (fichiers présents) pour un réutili-
    // sable ultérieur ; le seed ne les référence pas.
    const unusedLooks = ['baskets-rouges', 'sac-cabas-bordeaux', 'veste-en-cuir']
    for (const look of unusedLooks) {
      expect(distinct.some((d) => d.includes(look)), `${look} ne doit pas être référencé`).toBe(false)
      expect(hosted.filter((f) => f.startsWith(look)), `${look} doit rester hébergé (2 photos)`).toHaveLength(2)
    }
  })
})
