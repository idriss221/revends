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
import { PaymentReferenceFields } from './components/storefront/PaymentReferenceFields'
import { SubscriptionStatusPanel } from './components/storefront/SubscriptionStatusPanel'
import { WaveSucces } from './pages/WaveSucces'
import { WaveEchec } from './pages/WaveEchec'
import { WAVE_HOSTED_LINKS, waveAdminStatus } from './lib/wave'
import type { MySubscriptionResponse, Subscription } from './lib/storefront.types'
import type { WaveAdminEvent } from './lib/wave'

const SRC = fileURLToPath(new URL('./', import.meta.url))
const read = (rel: string) => readFileSync(join(SRC, rel), 'utf8')
const wrap = (node: React.ReactNode) =>
  renderToString(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>{node}</MemoryRouter>
    </QueryClientProvider>,
  )

/** Rendu SSR avec `/me` déjà résolu — permet de prouver un état ACTIVE réel. */
const wrapWithMe = (node: React.ReactNode, subscription: Subscription | null) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const data: MySubscriptionResponse = { subscription, usage: null, listings: [], plans: [] }
  qc.setQueryData(['my-subscription'], data)
  return renderToString(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{node}</MemoryRouter>
    </QueryClientProvider>,
  )
}

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

describe('V9.1 — CA-V9.1-004 : référence masquée pour Wave, requise pour OM/virement', () => {
  const fields = (method: string, errors: Record<string, string> = {}) =>
    renderToString(
      <PaymentReferenceFields
        idPrefix="abo"
        method={method}
        reference=""
        onMethodChange={() => {}}
        onReferenceChange={() => {}}
        errors={errors}
      />,
    )

  it('Wave : ni input ni label de référence, note d’auto-confirmation, 3 options de moyen', () => {
    const html = fields('wave')
    expect(html).not.toContain('name="paymentReference"')
    expect(html).not.toContain('Référence de paiement')
    expect(html).toContain('Paiement Wave : aucune référence à saisir.')
    expect(html).toContain('Votre abonnement sera activé automatiquement dès que le paiement sera confirmé.')
    expect(html).toContain('role="status"')
    for (const [value, label] of [
      ['wave', 'Wave'],
      ['orange_money', 'Orange Money'],
      ['virement', 'Virement bancaire'],
    ]) {
      expect(html).toMatch(new RegExp(`<option value="${value}"(?: selected="")?>`))
      expect(html).toContain(`>${label}</option>`)
    }
  })

  it('Orange Money et virement : input présent, required, libellé et hint inchangés', () => {
    for (const method of ['orange_money', 'virement']) {
      const html = fields(method)
      const inputTag = html.match(/<input\b[^>]*>/)?.[0] ?? ''
      expect(inputTag).toContain('name="paymentReference"')
      expect(inputTag).toContain('required=""')
      expect(html).toContain('aria-required="true"')
      expect(html).toContain('Référence de paiement')
      expect(html).toContain('La référence de votre paiement')
      expect(html).not.toContain('aucune référence à saisir')
    }
  })

  it('OM/virement : aria-invalid, aria-describedby et role="alert" conservés sur erreur', () => {
    const html = fields('virement', {
      paymentReference: 'Indiquez la référence de votre paiement (obligatoire).',
    })
    expect(html).toContain('aria-invalid="true"')
    expect(html).toContain('aria-describedby="abo-payment-reference-hint abo-payment-reference-err"')
    expect(html).toContain('role="alert"')
    expect(html).toContain('Indiquez la référence de votre paiement (obligatoire).')
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
    // V9.1 (revue F2) : le texte ne renvoie plus vers le champ référence (masqué pour Wave).
    expect(html).toContain('Après votre paiement via ces liens')
    expect(html).toContain('vérifiera la transaction dans le portail Wave')
    expect(html).not.toContain('indiquer la référence')
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

  // F3 revue 20/11 : le badge « en attente » était rendu même quand /me
  // répondait ACTIVE — contradiction visible avec le message « à jour ».
  it('E3 : /me ACTIVE ⇒ aucun badge « en attente » ni pastille pulsée', () => {
    const html = wrapWithMe(<WaveSucces />, subscription('ACTIVE'))
    expect(html).toContain('Votre abonnement est à jour. Retrouvez votre boutique depuis « Mon abonnement ».')
    expect(html).not.toContain('Wave — en attente de confirmation du paiement')
    expect(html).not.toContain('wave-status-badge')
    expect(html).toContain('Voir mon abonnement')
  })

  it('E3 : /me PENDING Wave ⇒ badge « en attente » et pastille pulsée présents', () => {
    const html = wrapWithMe(<WaveSucces />, subscription('PENDING', true))
    expect(html).toContain('Wave — en attente de confirmation du paiement')
    expect(html).toContain('wave-status-badge')
    expect(html).toContain(
      'Votre paiement est en attente de confirmation de la part de Wave. Votre abonnement reste en attente : il sera activé automatiquement dès que le paiement sera confirmé.',
    )
  })

  it('E3 : /me sans abonnement ⇒ aucun badge « en attente »', () => {
    const html = wrapWithMe(<WaveSucces />, null)
    expect(html).toContain('Aucun abonnement en cours.')
    expect(html).not.toContain('Wave — en attente de confirmation du paiement')
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

describe('V9 — CA-V9-070 : bundle livré sans secret', () => {
  it('le build web existe et ne contient aucune clé, aucun secret ni identifiant de session', () => {
    const dist = join(SRC, '../dist/assets')
    const files = readdirSync(dist).filter((name) => /\.(js|css)$/.test(name))
    expect(files.length).toBeGreaterThan(0)
    // Pattern assemblé à l'exécution : ce fichier de test est lui-même scanné
    // par le test « aucun secret dans le code source » plus haut.
    const apiKey = ['WAVE', 'API', 'KEY'].join('_')
    const webhookSecret = ['WAVE', 'WEBHOOK', 'SECRET'].join('_')
    const secretPattern = new RegExp(`${apiKey}|${webhookSecret}|wave_sn_|sk_[A-Za-z0-9]{8,}`)
    for (const file of files) {
      const content = readFileSync(join(dist, file), 'utf8')
      expect(content, file).not.toMatch(secretPattern)
      expect(content, file).not.toMatch(/client_reference|rawBody|Wave-Signature/)
    }
  })
})
