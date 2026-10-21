/**
 * Test d'invariant — « zéro lien mort » (CA-V5-137, CA-V5-142, RG-V5-08).
 *
 * On parcourt les FICHIERS SOURCE (pas le DOM) et on vérifie que chaque cible
 * de navigation statique déclarée dans un composant/page correspond à une
 * route de `App.tsx`. C'est le test qui attrape un `<Link to="/favoris">`
 * ajouté dans le footer ou la bottom nav sans route derrière — le défaut le
 * plus facile à introduire et le plus visible pour l'utilisateur.
 *
 * Les routes à paramètre (`/category/:slug`) sont tolérées : la cible statique
 * correspond si elle commence par le segment littéral de la route.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const SRC = fileURLToPath(new URL('../', import.meta.url))
const APP = join(SRC, 'App.tsx')

/** Tous les `.tsx` de `src/`, récursivement. */
function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) return tsxFiles(full)
    return full.endsWith('.tsx') ? [full] : []
  })
}

/** Routes déclarées : `path="/…"` de App.tsx, sans le `*` ni les paramètres. */
function declaredRoutes(): string[] {
  const src = readFileSync(APP, 'utf8')
  return [...src.matchAll(/<Route\s+path="([^"]+)"/g)].map((m) => m[1])
}

/** Cibles statiques : `to="/x"` et le préfixe statique de `to={`/x/${…}`}`. */
function staticTargets(): Array<{ target: string; file: string }> {
  const out: Array<{ target: string; file: string }> = []
  for (const file of tsxFiles(SRC)) {
    const src = readFileSync(file, 'utf8')
    for (const m of src.matchAll(/\bto=(?:"([^"]+)"|\{`([^`]*)`\})/g)) {
      const raw = (m[1] ?? m[2] ?? '').trim()
      // On ne garde que la partie littérale AVANT la première interpolation.
      const target = raw.split('${')[0].trim()
      if (target.startsWith('/')) out.push({ target, file: relative(SRC, file) })
    }
  }
  return out
}

/** `true` si une route déclarée sert la cible (params et query ignorés). */
function routeServes(route: string, target: string): boolean {
  // La query string ne change pas la route : `/search?section=new` est servi
  // par `/search`, pas par une route « `/search?section=new` ».
  const path = target.split('?')[0]
  if (route === path) return true
  if (!route.includes(':')) return false
  // `/category/:slug` sert `/category` et `/category/mode`
  const prefix = route.split('/:')[0]
  return path === prefix || path.startsWith(`${prefix}/`)
}

describe('Invariant « zéro lien mort » (RG-V5-08)', () => {
  const routes = declaredRoutes()

  it('App.tsx déclare bien les routes attendues', () => {
    // Garde-fou : si le parsing de routes se cassait, les tests suivants
    // passeraient à vide et ne prouveraient plus rien.
    expect(routes.length).toBeGreaterThan(25)
    expect(routes).toContain('/')
  })

  it('toutes les cibles de navigation statiques ont une route', () => {
    const orphans = staticTargets()
      .filter(({ target }) => !routes.some((route) => routeServes(route, target)))
      .map(({ target, file }) => `${target}  (${file})`)
    expect(orphans, `Liens sans route déclarée :\n${orphans.join('\n')}`).toEqual([])
  })

  it("aucune cible de navigation ne pointe vers l'ancien routeur hash (/#/…)", () => {
    // L'ancienne interface utilisateur (vue « Bureau » vanilla, routeur hash
    // `#/shop`, `#/login`, `#/sell`…) a été supprimée : plus aucune cible ne
    // doit pointer vers `/#/…`, sinon c'est un lien mort vers une vue disparue.
    const hashTargets = staticTargets()
      .filter(({ target }) => target.startsWith('/#'))
      .map(({ target, file }) => `${target}  (${file})`)
    expect(hashTargets, `Cibles hash résiduelles :\n${hashTargets.join('\n')}`).toEqual([])
  })

  it('les 6 univers publics et le menu admin sont tous routés', () => {
    // La navigation publique suit désormais `Bureau/main` : `univers` (les six
    // univers de `nav.cats`) pointe vers `/category/:slug`, et `adminMenu`
    // vers le back-office. Chaque cible doit être servie par une route.
    const menus = readFileSync(join(SRC, 'lib/menus.ts'), 'utf8')

    const slugs = [...menus.matchAll(/slug: '([^']+)'/g)].map((m) => m[1])
    expect(slugs.length).toBe(6)
    for (const s of new Set(slugs)) {
      const target = `/category/${s}`
      expect(routes.some((route) => routeServes(route, target)), `univers : ${target} sans route`).toBe(true)
    }

    const adminTargets = [...menus.matchAll(/to: '([^']+)'/g)].map((m) => m[1].split('?')[0])
    expect(adminTargets.length).toBeGreaterThanOrEqual(8)
    for (const t of new Set(adminTargets)) {
      expect(routes.some((route) => routeServes(route, t)), `adminMenu : ${t} sans route`).toBe(true)
    }
  })

  it('les 4 liens légaux/exspace client du footer sont routés', () => {
    // Ces 4 cibles ont toutes existé en lien mort avant la vague 1.
    for (const t of ['/favoris', '/category', '/conditions', '/confidentialite']) {
      expect(routes.some((route) => routeServes(route, t)), `${t} sans route`).toBe(true)
    }
  })
})
