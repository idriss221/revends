/**
 * Invariant C4 / CA-V5-054 / CA-V5-055 — la suppression d'article est
 * **réservée à l'administration**.
 *
 * CA-V5-055 : `grep -rn` du nom de méthode de suppression vendeur dans
 * `web/src/` ne doit retourner **aucune** occurrence, et `MyArticlesPage` ne
 * doit plus proposer l'action « Supprimer ». Ce test parcourt les FICHIERS
 * SOURCE (même approche que `noDeadLinks.test.ts`) : il échoue si une
 * suppression vendeur réintroduit une méthode cliente ou une UI.
 *
 * Le nom recherché est assemblé à l'exécution (`['delete','Product'].join('')`)
 * pour que ce fichier ne se détecte pas lui-même.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const SRC = fileURLToPath(new URL('../', import.meta.url))
const FORBIDDEN_METHOD = ['delete', 'Product'].join('')

/** Tous les `.ts` / `.tsx` de `src/`, récursivement. */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) return sourceFiles(full)
    return /\.(ts|tsx)$/.test(full) ? [full] : []
  })
}

describe('Suppression d’article réservée à l’admin (C4, CA-V5-054/055)', () => {
  it(`aucune occurrence de « ${FORBIDDEN_METHOD} » dans web/src`, () => {
    const offenders = sourceFiles(SRC)
      .filter((f) => readFileSync(f, 'utf8').includes(FORBIDDEN_METHOD))
      .map((f) => relative(SRC, f))
    expect(offenders, `Occurrences interdites :\n${offenders.join('\n')}`).toEqual([])
  })

  it('MyArticlesPage ne propose aucune action de suppression', () => {
    const page = readFileSync(join(SRC, 'pages/MyArticlesPage.tsx'), 'utf8')
    expect(page).not.toContain('toDelete')
    expect(page).not.toContain('Supprimer')
  })

  it('MyArticlesPage laisse toujours l’accès à la vente (modifier / re-soumettre)', () => {
    const page = readFileSync(join(SRC, 'pages/MyArticlesPage.tsx'), 'utf8')
    expect(page).toContain('/vendre')
  })
})
