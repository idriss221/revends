/**
 * Tests unitaires — RBAC des routes protégées (CA-AUTH04-05, CA-V5-153).
 *
 * `guardDecision` est une fonction PURE : on teste donc la règle elle-même,
 * sans DOM ni rendu. Les 4 issues exigées sont verrouillées :
 *   anonyme sur `/admin/*`   → page de connexion ;
 *   non-admin sur `/admin/*` → accueil ;
 *   admin                    → autorisé ;
 *   aucun 404, aucune boucle de redirection.
 */
import { describe, it, expect } from 'vitest'
import { guardDecision, loginRedirect, FORBIDDEN_REDIRECT } from '../../lib/access'
import type { SelfUser } from '../../lib/types'

function user(role: SelfUser['role']): SelfUser {
  return {
    id: 1,
    displayName: role === 'admin' ? 'Admin' : 'Idrissa',
    name: role === 'admin' ? 'Admin' : 'Idrissa',
    email: `${role}@example.com`,
    phone: '+221770000000',
    role,
    memberSince: 1_767_225_600_000,
    createdAt: '2026-01-01T00:00:00.000Z',
  }
}

const resolved = { loading: false, user: null as SelfUser | null }

describe('Espace admin (RequireAdmin)', () => {
  it('session en cours de résolution → chargement, PAS de redirection', () => {
    // Bug classique : sans cette branche, un admin déjà connecté voit
    // « /login » clignoter à chaque rafraîchissement de page.
    expect(guardDecision('admin', { loading: true, user: user('admin') })).toBe('loading')
    expect(guardDecision('admin', { loading: true, user: null })).toBe('loading')
  })

  it('anonyme → anonymous (la composante redirige vers /login?next=…)', () => {
    expect(guardDecision('admin', resolved)).toBe('anonymous')
  })

  it('utilisateur connecté non-admin → forbidden → accueil', () => {
    expect(guardDecision('admin', { loading: false, user: user('user') })).toBe('forbidden')
    expect(FORBIDDEN_REDIRECT).toBe('/')
  })

  it('admin → autorisé', () => {
    expect(guardDecision('admin', { loading: false, user: user('admin') })).toBe('ok')
  })
})

describe('Espace utilisateur (RequireUser)', () => {
  it('anonyme → anonymous', () => {
    expect(guardDecision('user', resolved)).toBe('anonymous')
  })

  it('utilisateur connecté → autorisé', () => {
    expect(guardDecision('user', { loading: false, user: user('user') })).toBe('ok')
  })

  it('l\'admin est ADMIS sur les pages utilisateur (il a un profil)', () => {
    expect(guardDecision('user', { loading: false, user: user('admin') })).toBe('ok')
  })

  it('un rôle inconnu est traité comme forbidden (fail-closed)', () => {
    const ghost = { ...user('user'), role: 'superuser' as unknown as SelfUser['role'] }
    expect(guardDecision('user', { loading: false, user: ghost })).toBe('forbidden')
    expect(guardDecision('admin', { loading: false, user: ghost })).toBe('forbidden')
  })
})

describe('Redirection vers la connexion — la destination est conservée', () => {
  // La connexion est une route React (`/login`) : `loginRedirect` renvoie donc
  // `/login?next=…`. Le `next` reste la destination d'origine, encodée.
  it('un chemin est encodé dans `next`', () => {
    expect(loginRedirect('/admin/commandes/42')).toBe('/login?next=%2Fadmin%2Fcommandes%2F42')
  })

  it('la query string est conservée (filtres, onglet)', () => {
    expect(loginRedirect('/admin/commandes', '?status=PAID')).toBe(
      '/login?next=%2Fadmin%2Fcommandes%3Fstatus%3DPAID',
    )
  })

  it('un chemin déjà encodé ne casse pas la query string', () => {
    const target = loginRedirect('/catalogue/velo-rouge')
    const params = new URLSearchParams(target.split('?')[1])
    expect(params.get('next')).toBe('/catalogue/velo-rouge')
  })
})

describe('Aucune boucle de redirection', () => {
  it('la destination n\'est jamais /login elle-même', () => {
    // Si `next` pouvait valoir /login, la garde pourrait renvoyer vers
    // /login?next=/login en boucle infinie.
    for (const path of ['/', '/admin', '/mes-commandes', '/profil', '/vendre']) {
      const next = new URLSearchParams(loginRedirect(path).split('?')[1]).get('next')
      expect(next).toBe(path)
      expect(next).not.toBe('/login')
    }
  })

  it('la destination refusée est l\'accueil, jamais une route admin (pas de ping-pong)', () => {
    expect(FORBIDDEN_REDIRECT).toBe('/')
    expect(FORBIDDEN_REDIRECT.startsWith('/admin')).toBe(false)
  })
})
