/**
 * V8.1 — « Contrôle boutique » (web) — tests de câblage minimal.
 *
 * Deux invariants vérifiés par lecture source (même approche que
 * `adminApiContract.test.ts` / `sellerDeleteRemoved.test.ts`) :
 *
 *  1. `/admin/abonnements` câble EXACTEMENT les deux routes Contrôle boutique
 *     (`deactivate` réversible / `delete` définitif) — jamais l'une pour
 *     l'autre — avec la règle de statut (« Désactiver » : ACTIVE seulement ;
 *     « Supprimer définitivement » : ACTIVE ou CANCELLED) ;
 *  2. `MyArticlesPage` affiche la confirmation « Supprimer » et traduit le
 *     409 `PRODUCT_ORDER_ACTIVE` en toast **warning** humain (jamais de code
 *     machine affiché).
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SRC = fileURLToPath(new URL('../', import.meta.url))
const read = (rel: string) => readFileSync(join(SRC, rel), 'utf8')

describe('V8.1 « Contrôle boutique » — câblage web', () => {
  it('Abonnements : routes admin `deactivate`/`delete` câblées avec la règle de statut', () => {
    const page = read('pages/admin/Abonnements.tsx')
    const client = read('lib/storefront.ts')

    // Le client expose les deux routes (POST, corps {}).
    expect(client).toContain('/deactivate')
    expect(client).toContain('/delete')
    expect(client).toContain('adminDeactivate')
    expect(client).toContain('adminDelete')

    // La page appelle bien les DEUX actions (jamais la désactivation branchée sur /delete).
    expect(page).toContain('storefrontApi.adminDeactivate')
    expect(page).toContain('storefrontApi.adminDelete')

    // Règle de statut : « Désactiver » réservée aux ACTIVE, « Supprimer » aux ACTIVE + CANCELLED.
    expect(page).toContain("row.status === 'ACTIVE'")
    expect(page).toContain("row.status === 'CANCELLED'")

    // Confirmation à deux temps pour la suppression définitive (saisie « Supprimer »).
    expect(page).toContain("deleteWord.trim() !== 'Supprimer'")
  })

  it('Mes articles : confirmation « Supprimer l’article ? » + 409 PRODUCT_ORDER_ACTIVE humanisé (warning)', () => {
    const page = read('pages/MyArticlesPage.tsx')
    const toast = read('lib/toast.tsx')

    // Confirmation à deux temps.
    expect(page).toContain("Supprimer l'article ?")
    expect(page).toContain("deleteWord.trim() !== 'Supprimer'")

    // Le 409 est humanisé et passé en toast warning (jamais de code machine affiché).
    expect(page).toContain('PRODUCT_ORDER_ACTIVE')
    expect(page).toContain('Cet article est impliqué dans une commande en cours')
    expect(page).toContain("toast('warning'")

    // Le type ToastKind expose bien `warning` (icône triangle-exclamation).
    expect(toast).toContain("'warning'")
    expect(toast).toContain("warning: 'triangle-exclamation'")
  })
})
