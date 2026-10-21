/**
 * Anti-dérive — icônes FontAwesome (vague 1).
 *
 * Pourquoi ce test : la migration FA5 → FA6 avait laissé 21 classes
 * inexistantes (`fa-clock-rotate-left`, `fa-th-large`…) qui rendent un carré
 * **vide** en production — aucune erreur TS, aucun échec de build. Le seul
 * moyen de ne pas dériver encore est de **vérifier le nom de chaque icône
 * utilisée contre le paquet installé** à chaque exécution de la suite.
 *
 * Source de vérité : `metadata/icons.yml` du paquet `@fortawesome/fontawesome-free`
 * installé (même source que la feuille CSS importée par l'app) — pas une liste
 * recopiée à la main.
 *
 * Le test couvre `src/**` : composants, pages, **et `src/lib/constants.ts`**
 * (les libellés d'icônes des menus et des métadonnées admin y vivent).
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const SRC = join(process.cwd(), 'src')

/**Familles autorisées → préfixes utilisés dans le code. */
const FAMILIES: Record<string, string[]> = {
  solid: ['fas', 'fa-solid'],
  regular: ['far', 'fa-regular'],
  brands: ['fab', 'fa-brands'],
}

/**
 * 1. Jeu d'icônes réellement installées, par famille.
 *
 * `metadata/icons.yml` du paquet est une map `'<nom>': { styles: [solid…] }` :
 * on lit la clé pour le nom et chaque entrée de `styles` pour la famille.
 */
function installedIcons(): Map<string, Set<string>> {
  const yml = readFileSync(require.resolve('@fortawesome/fontawesome-free/metadata/icons.yml'), 'utf8')
  const byFamily = new Map<string, Set<string>>()
  for (const family of Object.keys(FAMILIES)) byFamily.set(family, new Set())

  let current: string | null = null
  for (const line of yml.split('\n')) {
    // clé YAML : `camera-retro:` ou `'0':` (noms numériques cités)
    const key = /^'?([a-z0-9-]+)'?:\s*$/.exec(line)
    if (key) {
      current = key[1]
      continue
    }
    const style = /^\s{4}-\s(solid|regular|brands)\s*$/.exec(line)
    if (style && current) byFamily.get(style[1])!.add(current)
  }
  return byFamily
}

/** 2. Toutes les classes d'icônes utilisées dans `src/**`. */
function usedIcons(): { file: string; family: string; icon: string }[] {
  const files: string[] = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) walk(full)
      else if (/\.tsx?$/.test(entry) && !entry.endsWith('.test.ts')) files.push(full)
    }
  }
  walk(SRC)

  const prefixToFamily = new Map<string, string>()
  for (const [family, prefixes] of Object.entries(FAMILIES)) {
    for (const prefix of prefixes) prefixToFamily.set(prefix, family)
  }

  const found: { file: string; family: string; icon: string }[] = []
  for (const file of files) {
    const content = readFileSync(file, 'utf8')
    for (const m of content.matchAll(/\b(fas|far|fab|fa-solid|fa-regular|fa-brands)[ "'\n\t]+fa-([a-z0-9-]+)/g)) {
      found.push({
        file: file.replace(`${process.cwd()}/`, ''),
        family: prefixToFamily.get(m[1])!,
        icon: m[2],
      })
    }
  }
  return found
}

const icons = installedIcons()
const used = usedIcons()

describe('icônes FontAwesome installées (§ anti-dérive)', () => {
  it('le jeu de référence a bien été chargé (garde-fou du parseur)', () => {
    expect(icons.get('solid')!.size).toBeGreaterThan(1000)
    expect(icons.get('regular')!.size).toBeGreaterThan(100)
    expect(icons.get('brands')!.size).toBeGreaterThan(50)
  })

  it('le code source utilise des icônes qui existent dans la famille appelée', () => {
    expect(used.length).toBeGreaterThan(50)
    const missing = used
      .filter((u) => !icons.get(u.family)!.has(u.icon))
      .map((u) => `${u.file} → ${u.family}: fa-${u.icon}`)
    expect([...new Set(missing)]).toEqual([])
  })
})
