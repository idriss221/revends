/**
 * Tests unitaires — constantes métier & badges (src/lib/constants.ts).
 * Verrouille les listes fermées (conditions, paiements, motifs de refus RG-REFUS)
 * et les mapping statuts → badge (design-system §3.9).
 */
import { describe, it, expect } from 'vitest'
import {
  CONDITIONS,
  PAYMENT_METHODS,
  REJECTION_REASONS,
  productStatusBadge,
  orderStatusBadge,
  availabilityBadge,
  payoutStatusBadge,
  PAYOUT_STATUS_LABELS,
  EMPTY_COPY,
} from './constants'
import type { StatusBadgeKind, EmptyCopyKey } from './constants'

describe('Listes fermées (RG-REFUS, §2.6 du contrat)', () => {
  it('expose exactement les 5 conditions de l’API', () => {
    expect(CONDITIONS).toEqual(['Neuf', 'Très bon état', 'Bon état', 'Correct', 'À réparer'])
  })
  it('expose les 4 méthodes de paiement avec leurs libellés', () => {
    expect(PAYMENT_METHODS).toEqual([
      { value: 'MOBILE_MONEY', label: 'Mobile Money' },
      { value: 'CASH', label: 'Espèces' },
      { value: 'BANK_TRANSFER', label: 'Virement bancaire' },
      { value: 'OTHER', label: 'Autre' },
    ])
  })
  it('motifs de refus = liste fermée serveur (zod reprod. inverse)', () => {
    // Doit rester ALIGNÉ sur `rejectSchema` du backend (docs/api.md §3.6).
    expect(REJECTION_REASONS).toEqual([
      'Photos insuffisantes',
      'Description incorrecte',
      'Article en trop mauvais état',
      'Produit interdit',
      'Informations incomplètes',
      'Prix incohérent',
    ] as const)
  })
})

describe('productStatusBadge / orderStatusBadge (design-system §3.9)', () => {
  it('mappe chaque statut PRODUIT vers le bon badge', () => {
    expect(productStatusBadge('PENDING')).toEqual({ kind: 'pending', label: 'En attente' })
    expect(productStatusBadge('AVAILABLE')).toEqual({ kind: 'approved', label: 'Publié' })
    // `reserved` est un kind À PART ENTIER (vague 1) : « réservé » ≠ « en attente ».
    expect(productStatusBadge('RESERVED')).toEqual({ kind: 'reserved', label: 'Réservé' })
    expect(productStatusBadge('SOLD')).toEqual({ kind: 'sold', label: 'Vendu' })
    expect(productStatusBadge('REJECTED')).toEqual({ kind: 'rejected', label: 'Refusé' })
  })
  it('mappe chaque statut COMMANDE V3 (garantit l’exhaustivité du Record TS)', () => {
    expect(orderStatusBadge('CREATED')).toEqual({ kind: 'pending', label: 'Commande créée' })
    expect(orderStatusBadge('PAYMENT_PENDING')).toEqual({ kind: 'pending', label: 'Paiement en attente' })
    expect(orderStatusBadge('PAID')).toEqual({ kind: 'approved', label: 'Payée' })
    expect(orderStatusBadge('PRODUCT_WAITING')).toEqual({ kind: 'pending', label: 'À récupérer' })
    expect(orderStatusBadge('PRODUCT_RECEIVED')).toEqual({ kind: 'approved', label: 'Article reçu' })
    expect(orderStatusBadge('PREPARING')).toEqual({ kind: 'pending', label: 'En préparation' })
    expect(orderStatusBadge('SHIPPED')).toEqual({ kind: 'pending', label: 'Prête / Expédiée' })
    expect(orderStatusBadge('IN_DELIVERY')).toEqual({ kind: 'pending', label: 'En livraison' })
    expect(orderStatusBadge('DELIVERED')).toEqual({ kind: 'approved', label: 'Livrée' })
    expect(orderStatusBadge('COMPLETED')).toEqual({ kind: 'approved', label: 'Terminée' })
    expect(orderStatusBadge('PAYMENT_FAILED')).toEqual({ kind: 'rejected', label: 'Paiement échoué' })
    expect(orderStatusBadge('CANCELLED')).toEqual({ kind: 'rejected', label: 'Annulée' })
  })
  it('payoutStatusBadge : 3 états du paiement vendeur (PENDING → DUE → PAID)', () => {
    expect(PAYOUT_STATUS_LABELS).toEqual({ PENDING: 'En attente', DUE: 'À payer', PAID: 'Payé' })
    expect(payoutStatusBadge('PENDING')).toEqual({ kind: 'pending', label: 'En attente' })
    expect(payoutStatusBadge('DUE')).toEqual({ kind: 'pending', label: 'À payer' })
    expect(payoutStatusBadge('PAID')).toEqual({ kind: 'approved', label: 'Payé' })
  })
  it('n’utilise QUE les 6 kinds de StatusBadge (anti-dérive DA §3.5)', () => {
    const allowed: StatusBadgeKind[] = ['pending', 'approved', 'sold', 'rejected', 'reserved', 'neutral']
    const kinds: StatusBadgeKind[] = [
      productStatusBadge('PENDING').kind,
      productStatusBadge('AVAILABLE').kind,
      productStatusBadge('RESERVED').kind,
      productStatusBadge('SOLD').kind,
      productStatusBadge('REJECTED').kind,
      orderStatusBadge('COMPLETED').kind,
      orderStatusBadge('CANCELLED').kind,
      payoutStatusBadge('DUE').kind,
      availabilityBadge('SOLD').kind,
    ]
    for (const kind of kinds) expect(allowed).toContain(kind)
    // garde-fou : le mapping reste discriminant (≥ 3 kinds distincts)
    expect(new Set(kinds).size).toBeGreaterThanOrEqual(3)
  })
  it('availabilityBadge : lisible même sur un produit RESERVED', () => {
    expect(availabilityBadge('RESERVED')).toEqual({ kind: 'reserved', label: 'Réservé' })
    expect(availabilityBadge('SOLD')).toEqual({ kind: 'sold', label: 'Vendu' })
    expect(availabilityBadge('AVAILABLE')).toEqual({ kind: 'approved', label: 'Disponible' })
  })
})
/**
 * `EMPTY_COPY` — DA §3.12 / §9.4 : **source unique** des états vides.
 * Un état vide sans message, ou deux écrans qui partagent le même texte, sont
 * des défauts de cohérence : ce test verrouille les deux.
 */
describe('EMPTY_COPY (DA §3.12 — source unique des états vides)', () => {
  const keys = Object.keys(EMPTY_COPY) as EmptyCopyKey[]

  it('chaque clé a un titre et une description non vides', () => {
    for (const key of keys) {
      const copy = EMPTY_COPY[key]
      expect(copy.title.length, `titre manquant pour « ${key} »`).toBeGreaterThan(0)
      expect(copy.description.length, `description manquante pour « ${key} »`).toBeGreaterThan(0)
      // Une phrase, pas un mot : l'utilisateur doit comprendre quoi faire ensuite.
      expect(copy.description.length, `description trop courte pour « ${key} »`).toBeGreaterThan(30)
    }
  })

  it('les titres sont tous DISTINCTS (spec-admin §7 : message spécifique par écran)', () => {
    const titles = keys.map((k) => EMPTY_COPY[k].title)
    // Seule exception tolérée : `admin` est le résumé du dashboard, réutilisé
    // explicitement par AdminDashboardPage — il doit donc rester unique aussi.
    expect(new Set(titles).size).toBe(titles.length)
  })

  it('couvre les 8 clés publiques + les 10 écrans du back-office', () => {
    expect(keys).toHaveLength(18)
    for (const key of [
      'search',
      'favorites',
      'orders',
      'sales',
      'cart',
      'notifications',
      'admin',
      'notFound',
      'adminPending',
      'adminArticles',
      'adminArticlesFiltered',
      'adminOrders',
      'adminOrdersFiltered',
      'adminPayments',
      'adminUsers',
      'adminUsersFiltered',
      'adminCategories',
      'adminHistory',
    ] satisfies EmptyCopyKey[]) {
      expect(keys, `clé « ${key} » manquante`).toContain(key)
    }
  })
})
