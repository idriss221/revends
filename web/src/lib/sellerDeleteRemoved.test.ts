/**
 * V8.1 — « Contrôle boutique » : la suppression d'article propriétaire est
 * désormais OUVERTE côté web, mais reste **strictement encadrée**.
 *
 * Historique : CA-V5-054/055 réservaient la suppression à l'admin ; le contrat
 * V8.1 (DELETE /api/me/products/:id, `requireAuth`, owner-only) ouvre la
 * suppression au PROPRIÉTAIRE. Ce fichier verrouille les invariants V8.1 :
 *
 *  1. aucune méthode cliente littérale composée des mots « delete »+« Product »
 *     (l'admin garde ses routes ; le vendeur passe UNIQUEMENT par
 *     `deleteOwnerProduct`) ;
 *  2. `MyArticlesPage` câble la suppression propriétaire via
 *     `api.deleteOwnerProduct` — jamais une route `/api/admin/...` ;
 *  3. la confirmation est à DEUX TEMPS (saisie « Supprimer ») ;
 *  4. la page garde l'accès à la vente (« /vendre »).
 *
 * Le nom recherché est assemblé à l'exécution pour que ce fichier ne se
 * détecte pas lui-même.
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

describe('Suppression d’article propriétaire — invariants V8.1', () => {
  it(`aucune occurrence de « ${FORBIDDEN_METHOD} » dans web/src`, () => {
    const offenders = sourceFiles(SRC)
      .filter((f) => readFileSync(f, 'utf8').includes(FORBIDDEN_METHOD))
      .map((f) => relative(SRC, f))
    expect(offenders, `Occurrences interdites :\n${offenders.join('\n')}`).toEqual([])
  })

  it('MyArticlesPage câble la suppression PROPRIÉTAIRE ; la route vit dans lib/api.ts', () => {
    const page = readFileSync(join(SRC, 'pages/MyArticlesPage.tsx'), 'utf8')
    const client = readFileSync(join(SRC, 'lib/api.ts'), 'utf8')
    expect(page).toContain('deleteOwnerProduct')
    expect(page).not.toContain('/api/admin/')
    expect(client).toContain('/api/me/products/')
    expect(client).toContain("method: 'DELETE'")
  })

  it('MyArticlesPage : confirmation à deux temps (saisie « Supprimer »)', () => {
    const page = readFileSync(join(SRC, 'pages/MyArticlesPage.tsx'), 'utf8')
    expect(page).toContain('Supprimer')
    expect(page).toContain('placeholder="Supprimer"')
  })

  it('MyArticlesPage laisse toujours l’accès à la vente (modifier / re-soumettre)', () => {
    const page = readFileSync(join(SRC, 'pages/MyArticlesPage.tsx'), 'utf8')
    expect(page).toContain('/vendre')
  })
})
