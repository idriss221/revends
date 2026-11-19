/**
 * V9 « Wave Checkout » — tests web (SSR + invariants source).
 *
 * Environnement `node` (pas de jsdom) : `react-dom/server` prouve le premier
 * rendu ; les comportements non cliquables (navigation, absence de secret,
 * absence d'écriture sur les pages retour) sont prouvés par lecture source,
 * comme les autres suites d'invariants du projet.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { renderToString } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router'
import { WaveCheckoutPanel } from './components/storefront/WaveCheckoutPanel'
import { SubscriptionStatusPanel } from './components/storefront/SubscriptionStatusPanel'
import { WaveSucces } from './pages/WaveSucces'
import { WaveEchec } from './pages/WaveEchec'
import { WAVE_HOSTED_LINKS, waveAdminStatus } from './lib/wave'
import type { Subscription } from './lib/storefront.types'
import type { WaveAdminEvent } from './lib/wave'

const SRC = fileURLToPath(new URL('./', import.meta.url))
const read = (rel: string) => readFileSync(join(SRC, rel), 'utf8')
const wrap = (node: React.ReactNode) =>
  renderToString(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>{node}</MemoryRouter>
    </QueryClientProvider>,
  )

const subscription = (status: Subscription['status'], wavePaymentPending?: boolean): Subscription => ({
  id: 42,
  status,
  slug: 'boutique-test',
  plan: { id: 1, name: 'Découverte', priceFcfa: 2000, quota: 10, durationDays: 30 },
  supersedesId: null,
  startedAt: null,
  endsAt: null,
  daysRemaining: 0,
  activatedBy: null,
  activatedAt: null,
  createdAt: '2026-01-01T10:00:00.000Z',
  ...(wavePaymentPending === undefined ? {} : { wavePaymentPending }),
})

const allSourceFiles = (dir: string): string[] =>
  readdirSync(join(SRC, dir), { withFileTypes: true }).flatMap((entry) => {
    const rel = `${dir}/${entry.name}`
    return entry.isDirectory() ? allSourceFiles(rel) : /\.(ts|tsx)$/.test(entry.name) ? [rel] : []
  })

describe('V9 — service et configuration Wave', () => {
  it('les 3 liens hébergés sont statiques, exacts, et ne portent aucun calcul de prix', () => {
    expect(WAVE_HOSTED_LINKS).toEqual([
      {
        label: 'Découverte — 2 000 FCFA',
        href: 'https://pay.wave.com/m/M_sn_nLXzUBh809Au/c/sn/?amount=2000',
      },
      {
        label: 'Boutique — 5 000 FCFA',
        href: 'https://pay.wave.com/m/M_sn_nLXzUBh809Au/c/sn/?amount=5000',
      },
      {
        label: 'Atelier — 10 000 FCFA',
        href: 'https://pay.wave.com/m/M_sn_nLXzUBh809Au/c/sn/?amount=10000',
      },
    ])
    const service = read('lib/wave.ts')
    expect(service.match(/\?amount=/g)).toHaveLength(3)
    expect(service).not.toMatch(/parseInt|Number\(|parseFloat/)
  })

  it('mapping admin : attente / confirmé / échoué / absent, sans fuite de données', () => {
    const ev = (status: string, activated = false): WaveAdminEvent => ({
      id: 1,
      subscriptionId: 42,
      status,
      activated,
    })
    expect(waveAdminStatus(undefined)).toBe('none')
    expect(waveAdminStatus(ev('SESSION_CREATED'))).toBe('pending')
    expect(waveAdminStatus(ev('PROCESSING'))).toBe('pending')
    expect(waveAdminStatus(ev('COMPLETED'))).toBe('confirmed')
    expect(waveAdminStatus(ev('PAYMENT_FAILED'))).toBe('failed')
    expect(waveAdminStatus(ev('FAILED'))).toBe('failed')
    expect(waveAdminStatus(ev('IGNORED'))).toBe('none')
    expect(waveAdminStatus(ev('COMPLETED', true))).toBe('confirmed')
  })
})

describe('V9 — E1 : fail-closed du bouton', () => {
  it('waveEnabled:false ⇒ aucun bouton dans le DOM, 3 liens et repli manuel présents', () => {
    const html = wrap(<WaveCheckoutPanel waveEnabled={false} subscription={subscription('PENDING', true)} />)
    expect(html).not.toContain('Payer avec Wave')
    expect(html).not.toContain('Ouverture de Wave…')
    expect(html).toContain('Paiement Wave')
    expect(html).toContain('Ou payer depuis un lien Wave')
    expect(html).toContain('Découverte — 2 000 FCFA')
    expect(html).toContain('Boutique — 5 000 FCFA')
    expect(html).toContain('Atelier — 10 000 FCFA')
    expect(html).toContain("Après votre paiement, utilisez le formulaire ci-dessous pour indiquer la référence.")
    expect(html).toContain('target="_blank"')
    expect(html).toContain('rel="noopener noreferrer"')
  })

  it('éligible (PENDING + wavePaymentPending) ⇒ bouton rendu', () => {
    const html = wrap(<WaveCheckoutPanel waveEnabled subscription={subscription('PENDING', true)} />)
    expect(html).toContain('Payer avec Wave')
    expect(html).toContain("Vous allez quitter ReVendsen pour régler votre abonnement sur Wave.")
    expect(html).toContain('Ces liens sont un repli manuel')
  })

  it('waveEnabled:true mais non éligible ⇒ pas de bouton, note neutre', () => {
    for (const sub of [subscription('PENDING'), subscription('EXPIRED', true), subscription('PENDING', false)]) {
      const html = wrap(<WaveCheckoutPanel waveEnabled subscription={sub} />)
      expect(html).not.toContain('Payer avec Wave')
      expect(html).toContain('Ou payer depuis un lien Wave')
    }
  })

  it('un clic navigue en top-level et aucun mode d’affichage embarqué n’est utilisé', () => {
    const panel = read('components/storefront/WaveCheckoutPanel.tsx')
    expect(panel).toContain('window.location.assign(result.waveLaunchUrl)')
    expect(panel).not.toMatch(/if[r]ame|web[v]iew|inapp[b]rowser/i)
    expect(panel).not.toContain('amount=')
  })
})

describe('V9 — E2 : libellé Wave strictement conditionnel', () => {
  it('PENDING + wavePaymentPending ⇒ badge long + paragraphe exact', () => {
    const html = wrap(<SubscriptionStatusPanel subscription={subscription('PENDING', true)} />)
    expect(html).toContain('Wave — en attente de confirmation du paiement')
    expect(html).toContain('Votre boutique est en attente d’activation')
    expect(html).toContain('Votre paiement Wave est en cours de vérification.')
    expect(html).toContain('aria-live="polite"')
    expect(html).not.toContain('Voir ma boutique')
  })

  it('OM / virement / legacy ⇒ libellé historique mot pour mot, aucun mot Wave', () => {
    for (const sub of [subscription('PENDING'), subscription('PENDING', false)]) {
      const html = wrap(<SubscriptionStatusPanel subscription={sub} />)
      expect(html).toContain('En attente d&#x27;activation')
      expect(html).not.toContain('Wave')
      expect(html).not.toContain('en attente de confirmation du paiement')
    }
  })
})

describe('V9 — E3/E4 : pages retour sans effet de bord', () => {
  for (const file of ['pages/WaveSucces.tsx', 'pages/WaveEchec.tsx']) {
    it(`${file} : lecture seule, aucune query, aucune écriture`, () => {
      const source = read(file)
      expect(source).toContain('storefrontApi.mySubscription()')
      expect(source).not.toMatch(/useSearchParams|location\.search|URLSearchParams|req\.query/)
      expect(source).not.toMatch(/\bPOST\b|createCheckoutSession|adminActivate|adminReject/)
      expect(source).not.toMatch(/if[r]ame|web[v]iew|inapp[b]rowser/i)
      expect(source).not.toContain('Paiement reçu')
      // Rendu SSR : état de chargement annoncé, sans crash.
      const Page = file.includes('Succes') ? WaveSucces : WaveEchec
      const html = wrap(<Page />)
      expect(html).toContain('Vérification de votre abonnement…')
      expect(html).toContain('aria-live="polite"')
    })
  }

  it('E3 : libellés exacts', () => {
    const source = read('pages/WaveSucces.tsx')
    expect(source).toContain('Retour de Wave')
    expect(source).toContain(
      'Votre paiement est en attente de confirmation de la part de Wave. Votre abonnement reste en attente : il sera activé automatiquement dès que le paiement sera confirmé.',
    )
    expect(source).toContain("Vous pouvez fermer cette page. Aucune action de votre part n'est nécessaire pour l'activation.")
    expect(source).toContain('Voir mon abonnement')
    expect(source).toContain('Retour au catalogue')
  })

  it('E4 : libellés exacts, contact unique, pas d’allégation de non-débit', () => {
    const source = read('pages/WaveEchec.tsx')
    expect(source).toContain('Le paiement Wave n’a pas abouti')
    expect(source).toContain(
      'Wave n’a pas confirmé ce paiement. Votre abonnement reste en attente et aucune activation n’a été effectuée.',
    )
    expect(source).toContain('role="alert"')
    expect(source).toContain('Choisissez votre repli')
    expect(source).toContain('Voir le paiement manuel')
    expect(source).toContain('Si le montant a été débité, écrivez à revendsen@gmail.com en précisant la référence de votre paiement.')
    expect(source).not.toMatch(/mailto:|tel:/)
    expect(source).not.toContain('aucun montant n’a été débité')
  })
})

describe('V9 — câblage, administration et invariants globaux', () => {
  it('routes de retour ajoutées dans App.tsx, gardées par RequireUser', () => {
    const app = read('App.tsx')
    expect(app).toContain('<Route path="/paiement-wave/succes" element={<RequireUser><WaveSucces /></RequireUser>} />')
    expect(app).toContain('<Route path="/paiement-wave/echec" element={<RequireUser><WaveEchec /></RequireUser>} />')
  })

  it('MonAbonnement interroge la config en fail-closed et insère 3 panneaux', () => {
    const page = read('pages/MonAbonnement.tsx')
    expect(page).toContain("queryKey: ['wave-config']")
    expect(page).toContain('waveApi.config()')
    expect(page).toContain('waveConfig.data?.waveEnabled === true')
    expect(page.match(/<WaveCheckoutPanel /g)).toHaveLength(3)
  })

  it('admin : colonne additive, statuts traduits, aucune donnée sensible affichée', () => {
    const page = read('pages/admin/Abonnements.tsx')
    expect(page).toContain("header: 'Paiement Wave'")
    expect(page).toContain('waveAdminStatus(event)')
    expect(page).toContain('aria-busy={list.isFetching || waveEvents.isFetching}')
    expect(page).toContain('Activé par {activatedByLabel(row.activatedBy)}')
    for (const forbidden of ['client_reference', 'eventId', 'sessionId', 'rawBody', 'event_id', 'session_id']) {
      expect(page).not.toContain(forbidden)
    }
  })

  it('aucun secret, aucun mode d’affichage embarqué, aucun mot proscrit dans le code source', () => {
    for (const file of allSourceFiles('.')) {
      const source = read(file)
      expect(source, file).not.toMatch(/WAVE_API[_]KEY|WAVE_WEBHOOK[_]SECRET|sk[_][A-Za-z0-9]/)
      expect(source, file).not.toMatch(/if[r]ame|web[v]iew|inapp[b]rowser/i)
      expect(source, file).not.toMatch(/r[an]ga/i)
    }
  })

  it('tokens et CSS V9 : une seule déclaration Wave, contraste, 44/48 px, mouvement réduit', () => {
    const index = read('index.css')
    expect(index.match(/--color-wave:/g)).toHaveLength(1)
    expect(index).toContain('--color-wave: #1DC8FF')
    expect(index).toContain('--color-on-wave: #1A1714')
    const css = read('styles/storefront.css')
    expect(css).toContain('.wave-status-badge { min-width: 0; max-width: 100%; white-space: normal;')
    expect(css).toContain('min-height: 48px')
    expect(css).toContain('min-height: 44px')
    expect(css).toContain('@media (prefers-reduced-motion: reduce)')
  })
})
