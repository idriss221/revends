import { Ico } from '../brand/Ico'

/**
 * Hero boutique (design §2.1, `StorefrontHero`).
 *
 * Données : `displayName` + `memberSince` (année, exposée depuis le fix du
 * 17/11/2026) + slug + nombre d'annonces. Jamais l'e-mail, le nom complet ni
 * d'annonces (`total` de l'API). RIEN d'autre — aucun `sales`, aucune ville
 * (non exposée), aucun badge. `memberSince` est désormais renvoyé par la
 * réponse v2.7 (fix du 17/11/2026) : la ligne s'affiche, sinon omise — jamais
 * un placeholder ni une année devinée.
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
}: {
  displayName: string
  memberSince?: number
  listingCount: number
  slug: string
}) {
  const focusContact = () => {
    const contact = document.getElementById('contact')
    const target =
      contact?.querySelector<HTMLElement>('#shop-message, button, a[href], textarea, input') ?? null
    target?.focus({ preventScroll: false })
  }

  return (
    <header className="rv-shop-hero">
      <span className="eyebrow">Boutique</span>
      <h1>{displayName}</h1>
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
    </header>
  )
}
