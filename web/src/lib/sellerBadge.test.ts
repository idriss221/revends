import { describe, expect, it } from 'vitest'
import { SELLER_BADGES, normalizeSellerBadge } from './sellerBadge'

describe('SellerBadge — libellés contractuels (CA-V8-020/026)', () => {
  it('Découverte → « Boutique », Boutique → « Boutique Vérifiée », Atelier → « Boutique Pro »', () => {
    expect(SELLER_BADGES.boutique.label).toBe('Boutique')
    expect(SELLER_BADGES.verifiee.label).toBe('Boutique Vérifiée')
    expect(SELLER_BADGES.pro.label).toBe('Boutique Pro')
  })
  it('aria-label complet cohérent (CA-V8-027)', () => {
    for (const spec of Object.values(SELLER_BADGES)) {
      expect(spec.ariaLabel).toContain(spec.tier)
      expect(spec.ariaLabel).toContain(spec.label)
    }
  })
  it('palier associé par entrée', () => {
    expect(SELLER_BADGES.boutique.tier).toBe('Découverte')
    expect(SELLER_BADGES.verifiee.tier).toBe('Boutique')
    expect(SELLER_BADGES.pro.tier).toBe('Atelier')
  })
})

describe('normalizeSellerBadge', () => {
  it('accepte les 3 valeurs contractuelles', () => {
    expect(normalizeSellerBadge('pro')).toBe('pro')
    expect(normalizeSellerBadge('verifiee')).toBe('verifiee')
    expect(normalizeSellerBadge('boutique')).toBe('boutique')
  })
  it('null / undefined / inconnu → null (jamais de badge fantôme — CA-V8-025)', () => {
    expect(normalizeSellerBadge(null)).toBeNull()
    expect(normalizeSellerBadge(undefined)).toBeNull()
    expect(normalizeSellerBadge('gold')).toBeNull()
    expect(normalizeSellerBadge(42)).toBeNull()
  })
})
