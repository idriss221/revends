import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Invariant — verrou CA-V5-070 (et CA-V7-004) : le CTA « Vendre » n'est JAMAIS
 * conditionné par un statut, un rôle, un compteur ni un abonnement. Le code
 * ne doit pas lire une donnée d'abonnement ni de quota pour afficher /sell.
 */
const NAVBAR = join(process.cwd(), 'src', 'components', 'layout', 'Navbar.tsx')

describe('CA-V7-004 — CTA « Vendre » toujours présent (verrou CA-V5-070)', () => {
  const src = readFileSync(NAVBAR, 'utf8')

  it('les deux points d’entrée « Vendre » (desktop + mobile) existent et pointent sur /sell', () => {
    expect(src).toContain('to="/sell"')
    expect(src).toContain('hide-m') // desktop
    expect(src).toContain('className="mcta"')  // menu mobile
  })

  it('aucun bouton Vendre n’est conditionné par abonnement/quota/statut', () => {
    const sellContexts = src.split('\n').filter((l) => /\/sell/.test(l))
    expect(sellContexts.length).toBeGreaterThan(0)
    for (const line of sellContexts) {
      expect(line).not.toMatch(/subscription|abonnement|storefront|quota|status|pending|active/i)
    }
  })

  it('aucune lecture d’abonnement dans le composant Navbar', () => {
    expect(src).not.toMatch(/subscription|abonnement|storefront|useSubscription|ReactQuery.*storefront/i)
  })
})
