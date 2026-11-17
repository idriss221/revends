/**
 * Smoke SSR — les nouveaux composants V8 rendent sans lever d'exception.
 * (Pas de testing-library dans le projet : `react-dom/server` suffit à
 * prouver que le premier rendu ne crash pas — les interactions sont
 * couvertes par la recette Playwright.)
 */
import { describe, expect, it } from 'vitest'
import { renderToString } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ToastProvider } from './lib/toast'
import { SellerBadge } from './components/storefront/SellerBadge'
import { StorefrontHero } from './components/storefront/StorefrontHero'
import { BrandingPanel } from './components/storefront/BrandingPanel'
import { StatsPanel } from './components/storefront/StatsPanel'
import { PaymentReferenceFields } from './components/storefront/PaymentReferenceFields'

const queryClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } })
const wrap = (node: React.ReactNode) =>
  renderToString(
    <QueryClientProvider client={queryClient()}>
      <ToastProvider>{node}</ToastProvider>
    </QueryClientProvider>,
  )

describe('SellerBadge — rendu conditionnel (CA-V8-025)', () => {
  it('null / undefined / inconnu ⇒ chaîne vide', () => {
    expect(renderToString(<SellerBadge badge={null} />)).toBe('')
    expect(renderToString(<SellerBadge badge={undefined} />)).toBe('')
  })
  it('les 3 paliers rendent un libellé textuel + aria-label complet', () => {
    expect(renderToString(<SellerBadge badge="boutique" />)).toContain('Boutique')
    expect(renderToString(<SellerBadge badge="verifiee" />)).toContain('Boutique Vérifiée')
    expect(renderToString(<SellerBadge badge="pro" />)).toContain('Boutique Pro')
    expect(renderToString(<SellerBadge badge="pro" />)).toContain('aria-label="Vendeur Atelier — boutique Boutique Pro"')
  })
})

describe('StorefrontHero — branding optionnel', () => {
  it('sans branding : aucun logo/bannière rendus (page V7 inchangée)', () => {
    const html = renderToString(<StorefrontHero displayName="Aïcha" memberSince={2024} listingCount={3} slug="a-shop" />)
    expect(html).toContain('Aïcha')
    expect(html).not.toContain('rv-shop-banner')
    expect(html).not.toContain('rv-shop-logo')
  })
  it('avec branding : logo accessible, bannière décorative (alt=""), description échappée', () => {
    const html = renderToString(
      <StorefrontHero
        displayName="Aïcha"
        memberSince={2024}
        listingCount={3}
        slug="a-shop"
        logoUrl="https://blob.example/logo.png"
        bannerUrl="https://blob.example/banner.jpg"
        publicDescription="Mode éthique à Dakar"
        sellerBadge="pro"
      />,
    )
    expect(html).toContain('alt="Logo de la boutique Aïcha"')
    expect(html).toMatch(/alt=""[^>]*aria-hidden="true"/)
    expect(html).toContain('Mode éthique à Dakar')
    expect(html).toContain('Boutique Pro')
  })
})

describe('BrandingPanel — états vide/prévisualisation/actif', () => {
  it('profil null : « Ajouter un logo », « Ajouter une bannière », aucune image active', () => {
    const html = wrap(<BrandingPanel profile={null} />)
    expect(html).toContain('Ajouter un logo')
    expect(html).toContain('Ajouter une bannière')
    expect(html).toContain('Adresse de collecte (secrète)')
  })
  it('profil actif : images serveur + boutons Supprimer', () => {
    const html = wrap(
      <BrandingPanel
        profile={{ logoUrl: '/uploads/storefront/l.png', bannerUrl: '/uploads/storefront/b.jpg', publicDescription: 'Texte', collecteAddressSet: true }}
      />,
    )
    expect(html).toContain('/uploads/storefront/l.png')
    expect(html).toContain('/uploads/storefront/b.jpg')
    expect(html).toContain('Supprimer')
    expect(html).toContain('Adresse renseignée')
  })
})

describe('StatsPanel — rendu en absence de données (pending)', () => {
  it('affiche l’état de chargement sans crash', () => {
    const html = wrap(<StatsPanel slug="a-shop" planName="Atelier" priceFcfa={10000} activatedAt={null} endsAt={null} />)
    expect(html).toContain('Statistiques')
    expect(html).toContain('Chargement')
  })
})

describe('PaymentReferenceFields', () => {
  it('rend les 2 champs requis + libellés FR', () => {
    const html = renderToString(
      <PaymentReferenceFields idPrefix="t" method="" reference="" onMethodChange={() => {}} onReferenceChange={() => {}} errors={{}} />,
    )
    expect(html).toContain('Mode de paiement')
    expect(html).toContain('Référence de paiement')
    expect(html).toContain('Wave')
    expect(html).toContain('Orange Money')
    expect(html).toContain('aria-required="true"')
  })
  it('erreurs affichées en rôle alert', () => {
    const html = renderToString(
      <PaymentReferenceFields
        idPrefix="t"
        method=""
        reference=""
        onMethodChange={() => {}}
        onReferenceChange={() => {}}
        errors={{ paymentMethod: 'Choisissez votre mode de paiement : Wave, Orange Money ou virement.' }}
      />,
    )
    expect(html).toContain('role="alert"')
  })
})
