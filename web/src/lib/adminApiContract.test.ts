/**
 * Tests de contrat — **dérive client ↔ serveur sur les 9 écrans admin**.
 *
 * Contexte : les listes de filtres du back-office sont des valeurs d'API
 * (`status`, `payout`, `action`). Trois dérives ont été constatées en
 * production de code et **aucune** n'est visible à l'œil :
 *
 * 1. `PRODUCT_STATUS_FILTERS` proposait `APPROVED` — enum inexistant côté
 *    serveur (`AVAILABLE`) → `GET /api/admin/products?status=APPROVED` répond
 *    **400 VALIDATION_ERROR** et l'écran Articles bascule en état d'erreur.
 * 2. Une option « Tous les statuts » (valeur vide) ne peut pas fonctionner :
 *    `listAdminProducts` applique `status = $1` en dur et le schéma zod
 *    **défaut `status` à `PENDING`** → l'API renvoyait secrètement les seuls
 *    articles en attente sous un intitulé « tous ».
 * 3. `ADMIN_ACTION_META` ne couvrait que 5 des 10 `adminActionTypes` :
 *    `product.delete` (écrit par la suppression d'article), `product.received`,
 *    `delivery.started`, `order.delivered`, `order.cancelled` étaient
 *    **infiltrables** depuis l'écran Historique.
 *
 * Ces listes sont donc verrouillées ici contre les enums du serveur, lus
 * directement dans `server/src/utils/validation.ts`. Un test rouge = contrat
 * cassé, pas un style à discuter.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  PRODUCT_STATUS_FILTERS,
  PAYOUT_FILTERS,
  ADMIN_ACTION_FILTERS,
  ADMIN_ACTION_META,
  ORDER_STATUS_LABELS,
} from './constants'
import type { AdminActionKind, ProductStatus } from './types'

/**
 * Source d'autorité des enums : le schéma zod du serveur.
 * Les commentaires sont retirés **avant** parsing : le serveur commente ses
 * enums avec les valeurs qu'il vient d'ajouter (`product.delete`…), et un
 * parseur naïf les compterait comme des membres.
 */
const VALIDATION = readFileSync(
  join(process.cwd(), '..', 'server', 'src', 'utils', 'validation.ts'),
  'utf8',
)
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^[ \t]*\/\/.*$/gm, '')

/** Extrait `export const <nom> = [...] as const` → tableau de chaînes littérales. */
function serverEnum(name: string): string[] {
  const start = VALIDATION.indexOf(`export const ${name} = [`)
  if (start < 0) throw new Error(`Enum serveur introuvable : ${name}`)
  const body = VALIDATION.slice(start, VALIDATION.indexOf('] as const;', start))
  return [...body.matchAll(/'([^']+)'/g)].map((m) => m[1])
}

describe('Enum statuts produit — écran Articles', () => {
  it('chaque option du filtre est une valeur de `productStatuses`', () => {
    const allowed = serverEnum('productStatuses')
    // `value` vide = « tous » : impossible ici (cf. test suivant).
    expect(PRODUCT_STATUS_FILTERS.map((o) => o.value).filter(Boolean)).toEqual(
      expect.arrayContaining(allowed),
    )
  })

  it("ne propose AUCUNE valeur hors enum (pas d'APPROVED fantôme)", () => {
    const allowed = serverEnum('productStatuses')
    const invalid = PRODUCT_STATUS_FILTERS.map((o) => o.value).filter((v) => v && !allowed.includes(v))
    expect(invalid, `valeurs refusées par le serveur (400) : ${invalid.join(', ')}`).toEqual([])
  })

  it("ne propose pas d'option « tous » : l'API l'ignore silencieusement", () => {
    // `adminProductsQuerySchema.status` a un `.default('PENDING')` : sans
    // paramètre, la liste ne contient QUE les articles en attente. Une option
    // « Tous les statuts » afficherait donc un périmètre que la page annonce
    // faux. On vérifie que le comportement serveur n'a pas changé.
    expect(serverEnum('productStatuses')).toContain('PENDING')
    const hasAllOption = PRODUCT_STATUS_FILTERS.some((o) => o.value === '')
    expect(hasAllOption, 'l\'API ne sait pas rendre « tous » : ne pas l\'annoncer').toBe(false)
  })

  it('la liste par défaut de la page est une valeur valide', () => {
    // `AdminArticlesPage` démarre sur `AVAILABLE` : vérifie qu'il existe bien.
    expect(serverEnum('productStatuses')).toContain('AVAILABLE')
  })
})

describe('Enum statuts commande — écran Commandes', () => {
  it('`ORDER_STATUS_FILTERS` couvre les 12 statuts du serveur, sans extra', () => {
    const allowed = serverEnum('orderStatuses')
    const keys = Object.keys(ORDER_STATUS_LABELS)
    expect([...keys].sort()).toEqual([...allowed].sort())
  })
})

describe('Enum paiements vendeurs — écran Paiements', () => {
  it('chaque option est une valeur de `payoutStatuses` (minuscules)', () => {
    const allowed = serverEnum('payoutStatuses')
    // Cas particulier connu : cet enum est en minuscules côté API.
    expect(allowed.every((v) => v === v.toLowerCase())).toBe(true)
    const invalid = PAYOUT_FILTERS.map((o) => o.value).filter((v) => v && !allowed.includes(v))
    expect(invalid, `valeurs refusées par le serveur (400) : ${invalid.join(', ')}`).toEqual([])
  })
})

describe('Actions historisées — écran Historique', () => {
  it('`ADMIN_ACTION_META` couvre EXACTEMENT `adminActionTypes`', () => {
    const allowed = serverEnum('adminActionTypes')
    const known = Object.keys(ADMIN_ACTION_META).sort()
    expect(known).toEqual([...allowed].sort())
  })

  it("aucune action écrite par l'app n'est filtrable « par accident »", () => {
    // Régression du cas `product.delete` : suppression d'article (CA-V5-065).
    for (const action of ['product.delete', 'product.received', 'delivery.started', 'order.delivered', 'order.cancelled'] as AdminActionKind[]) {
      expect(ADMIN_ACTION_FILTERS.map((o) => o.value), `action non filtrable : ${action}`).toContain(action)
    }
  })

  it('le filtre dérive bien de la meta (une seule source de vérité)', () => {
    const values = ADMIN_ACTION_FILTERS.filter((o) => o.value).map((o) => o.value)
    expect([...values].sort()).toEqual([...Object.keys(ADMIN_ACTION_META)].sort())
  })
})

describe('Types — cohérence avec les enums serveur', () => {
  it('`ProductStatus` == `productStatuses`', () => {
    // Contrôle statique : si le type dérive, `Record<ProductStatus, …>` ne
    // compile plus. Ce test verrouille surtout l'intention.
    const allowed: ProductStatus[] = ['PENDING', 'AVAILABLE', 'RESERVED', 'SOLD', 'REJECTED']
    expect([...allowed].sort()).toEqual([...serverEnum('productStatuses')].sort())
  })
})