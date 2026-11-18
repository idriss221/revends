import { Ico } from '../brand/Ico'
import { SellerBadge } from './SellerBadge'
import { resolveImageUrl } from '../../lib/catalogPhotos'
import type { SellerBadgeKind } from '../../lib/sellerBadge'

/**
 * Hero boutique (design §2.1, `StorefrontHero`).
 *
 * Données : `displayName` + `memberSince` + slug + nombre d'annonces.
 * RIEN d'autre — aucun champ personnel (CA-V7-026). Le bloc branding (E2,
 * v2.8 — logo/bannière/description) est rendu UNIQUEMENT si fourni (present
 * uniquement quand l'abonnement est ACTIVE côté serveur) : sinon la page V7
 * est rendue à l'identique. Le badge de palier (`sellerBadge`) est lui aussi
 * optionnel — jamais rendu si null (CA-V8-025).
 *
 * ÉCART CONSIGNÉ (E2) : la réponse boutique publique n'expose pas le badge au
 * niveau boutique — `Boutique.tsx` le dérive des annonces (`items[]`, même
 * vendeur ⇒ même badge) ; boutique vide ⇒ aucun badge affiché.
 *
 * L'ancre « Écrivez à la boutique » déplace le focus dans `#contact`
 * (le saut au clavier doit atterrir quelque part d'utile, pas seulement
 * faire défiler la page).
 */
export function StorefrontHero({
  displayName,
  memberSince,
  listingCount,
  slug,
  logoUrl,
  bannerUrl,
  publicDescription,
  sellerBadge,
}: {
  displayName: string
  memberSince?: number
  listingCount: number
  slug: string
  logoUrl?: string | null
  bannerUrl?: string | null
  publicDescription?: string | null
  sellerBadge?: SellerBadgeKind | null
}) {
  const focusContact = () => {
    const contact = document.getElementById('contact')
    const target =
      contact?.querySelector<HTMLElement>('#shop-message, button, a[href], textarea, input') ?? null
    target?.focus({ preventScroll: false })
  }

  const banner = bannerUrl ? resolveImageUrl(bannerUrl) : null
  const logo = logoUrl ? resolveImageUrl(logoUrl) : null
  const hasBranding = Boolean(banner || logo || publicDescription)

  return (
    <header className={`rv-shop-hero${hasBranding ? ' rv-shop-hero--branded' : ''}`}>
      {banner ? <img className="rv-shop-banner" src={banner} alt="" aria-hidden="true" /> : null}

      <div className="rv-shop-hero-row">
        {logo ? (
          <img className="rv-shop-logo" src={logo} alt={`Logo de la boutique ${displayName}`} width={96} height={96} />
        ) : null}

        <div className="rv-shop-hero-body">
          <span className="eyebrow">Boutique</span>
          <h1>{displayName}</h1>
          {sellerBadge ? <SellerBadge badge={sellerBadge} className="rv-shop-hero-badge" /> : null}
          <p className="rv-shop-baseline">La seconde vie a de la valeur.</p>
          <p className="rv-shop-meta">
            {memberSince ? <span>Membre depuis {memberSince}</span> : null}
            <span>/boutique/{slug}</span>
            <span>
              {listingCount} annonce{listingCount > 1 ? 's' : ''}
            </span>
          </p>
          <div className="rv-shop-hero-acts">
            <a className="btn ghost" href="#contact" onClick={focusContact}>
              <Ico name="store" cls="sm" />
              Écrivez à la boutique
            </a>
            <p className="rv-shop-priv">Aucune coordonnée personnelle n’est affichée.</p>
          </div>
        </div>
      </div>

      {publicDescription ? <p className="rv-shop-desc">{publicDescription}</p> : null}
    </header>
  )
}
