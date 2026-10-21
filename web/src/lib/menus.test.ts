/**
 * Tests unitaires — menus admin (src/lib/menus.ts).
 * Verrouille `adminMenu` (badge dynamique, routes réelles) et
 * `adminMenuLabels` (< 968 px). Aligné sur l'invariant noDeadLinks
 * (les cibles doivent exister).
 */
import { describe, it, expect } from 'vitest'
import { adminMenu, adminMenuLabels, univers } from './menus'

describe('univers (navigation publique)', () => {
  it('contient les 6 univers avec slugs et icônes non vides', () => {
    expect(univers).toHaveLength(6)
    for (const u of univers) {
      expect(typeof u.slug).toBe('string')
      expect(u.slug.length).toBeGreaterThan(0)
      expect(typeof u.label).toBe('string')
      expect(u.label.length).toBeGreaterThan(0)
      expect(typeof u.icon).toBe('string')
      expect(u.icon.length).toBeGreaterThan(0)
    }
  })

  it('slugs distincts et prêts pour /category/:slug', () => {
    const slugs = univers.map((u) => u.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
    for (const s of slugs) expect(s).toMatch(/^[a-z0-9-]+$/)
  })
})

describe('adminMenu(pending) — sidebar back-office', () => {
  it('structure attendue et routes réelles', () => {
    const m = adminMenu(0)
    expect(m).toHaveLength(8)
    expect(m[0]).toMatchObject({ to: '/admin', label: 'Dashboard', exact: true })
    expect(m[1]).toMatchObject({ to: '/admin/articles-en-attente', label: 'Articles en attente', exact: true })
    expect(m[2]).toMatchObject({ to: '/admin/articles', label: 'Articles' })
    expect(m[3]).toMatchObject({ to: '/admin/commandes', label: 'Commandes' })
    expect(m[4]).toMatchObject({ to: '/admin/paiements', label: 'Paiements vendeurs' })
    expect(m[5]).toMatchObject({ to: '/admin/utilisateurs', label: 'Utilisateurs' })
    expect(m[6]).toMatchObject({ to: '/admin/categories', label: 'Catégories' })
    expect(m[7]).toMatchObject({ to: '/admin/historique', label: 'Historique' })
  })

  it('badge « Articles en attente » reflète exactement le compteur', () => {
    expect(adminMenu(0)[1]?.badge).toBe(0)
    expect(adminMenu(1)[1]?.badge).toBe(1)
    expect(adminMenu(42)[1]?.badge).toBe(42)
    // le compteur ne fuite pas sur les autres entrées
    for (let i = 0; i < 8; i++) if (i !== 1) expect(adminMenu(99)[i]?.badge).toBeUndefined()
  })

  it('chaque entrée a icône + label non vides', () => {
    for (const item of adminMenu(3)) {
      expect(typeof item.icon).toBe('string')
      expect(item.icon.length).toBeGreaterThan(0)
      expect(typeof item.label).toBe('string')
      expect(item.label.length).toBeGreaterThan(0)
      expect(typeof item.to).toBe('string')
      expect(item.to.startsWith('/admin')).toBe(true)
    }
  })
})

describe('adminMenuLabels — menu mobile/bas d’écran (< 968 px)', () => {
  it('mappe toutes les cibles du menu vers des libellés', () => {
    const targets = adminMenu(0).map((i) => i.to)
    for (const t of targets) {
      expect(adminMenuLabels[t]).toBeTypeOf('string')
      expect((adminMenuLabels[t] as string).length).toBeGreaterThan(0)
    }
    expect(Object.keys(adminMenuLabels)).toHaveLength(8)
  })

  it('cohérent avec les labels de la sidebar (menu bas d’écran tronqué intentionnellement)', () => {
    const sidebar = Object.fromEntries(adminMenu(0).map((i) => [i.to, i.label]))
    expect(adminMenuLabels['/admin']).toBe(sidebar['/admin'])
    expect(adminMenuLabels['/admin/articles-en-attente']).toBe(sidebar['/admin/articles-en-attente'])
    // Bas d'écran : libellé plus court que la sidebar (DA mobile).
    expect(adminMenuLabels['/admin/paiements']).toBe('Paiements')
    expect(adminMenuLabels['/admin/paiements']).not.toBe(sidebar['/admin/paiements'])
  })
})
