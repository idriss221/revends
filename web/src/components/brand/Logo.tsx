import { Link } from 'react-router'
import { Boucle } from './Boucle'

/**
 * Logo REVENDS 2026 — docs/design-system-revends-v5.md §2.
 *
 * Le logotype est du **texte stylé par tokens** (net à toute densité,
 * accessible, localisable) ; seul le symbole est un SVG. Le « V » de
 * « ReVends » est la **seule** couleur du logotype.
 *
 * 4 compositions (§2) × 2 variantes de surface :
 *
 * ┌────────────┬──────────────────────────────┬──────────────┬───────────────────────┐
 * │ variante   │ composition                   │ symbole      │ V                      │
 * ├────────────┼──────────────────────────────┼──────────────┼───────────────────────┤
 * │ `navbar`   │ symbole 32 (28 mobile) +     │ ink          │ terracotta            │
 * │            │ wordmark font-display 24/19px │              │                       │
 * │ `footer`   │ symbole 40 + wordmark 28px    │ champagne    │ on-dark-accent        │
 * │ `sidebar`  │ symbole 32 + « REVENDS » sans │ champagne    │ on-dark-accent        │
 * │            │ 800 tracking 0.14em 20px      │              │                       │
 * │ `auth`     │ symbole 56 centré + wordmark │ ink          │ terracotta            │
 * │            │ 34px                          │              │                       │
 * └────────────┴──────────────────────────────┴──────────────┴───────────────────────┘
 *
 * `surface="dark"` = fond sombre (footer, sidebar admin) → symboles clairs,
 * anneau de focus `on-dark`. `surface="light"` = fond clair (navbar, connexion).
 *
 * Le logo est le SEUL porteur du nom de la marque en navigation (§8) : il est
 * un lien vers `/` avec `aria-label`.
 */
export type LogoVariant = 'navbar' | 'footer' | 'sidebar' | 'auth'

export interface LogoProps {
  variant?: LogoVariant
  /** fond sur lequel le logo est posé — pilote la couleur du symbole et du V */
  surface?: 'light' | 'dark'
  /** le logo est-il un lien vers l'accueil ? (`false` dans AuthLayout, déjà dans le lien) */
  linked?: boolean
  className?: string
}

/** Classes de TAILLE du symbole par composition (§2) — motifs Tailwind natifs. */
const SYMBOL: Record<LogoVariant, string> = {
  navbar: 'h-8 w-8 md:h-8 md:w-8',
  footer: 'h-10 w-10',
  sidebar: 'h-8 w-8',
  auth: 'h-14 w-14',
}

/** Classes de TAILLE +style* du logotype par composition (§1.6 + §2). */
const WORDMARK: Record<LogoVariant, string> = {
  navbar: 'text-[19px] md:text-2xl',                       // 19 px mobile → 24 px desktop
  footer: 'text-[28px]',
  sidebar: 'text-xl font-extrabold tracking-[0.14em] uppercase', // REVENDS sans 800, 20 px
  auth: 'text-[34px]',
}

export function Logo({ variant = 'navbar', surface = 'light', linked = true, className = '' }: LogoProps) {
  const dark = surface === 'dark'
  const symbolColor = dark ? 'text-champagne' : 'text-ink'
  const vColor = dark ? 'text-on-dark-accent' : 'text-terracotta'
  const ring = dark ? 'on-dark' : ''

  // « ReVends » : le V capital est la seule couleur du logotype.
  // Sidebar : « REVENDS » en capitales, gras + interlettrage (pas de serif).
  const wordmark =
    variant === 'sidebar' ? (
      <>
        RE<span className={vColor}>V</span>ENDS
      </>
    ) : (
      <>
        Re<span className={vColor}>V</span>ends
      </>
    )

  const wordmarkClass = [
    variant === 'sidebar' ? 'font-extrabold uppercase' : 'font-display',
    'leading-none',
    variant === 'auth' ? 'text-center' : '',
    WORDMARK[variant],
    dark ? 'text-on-dark' : 'text-ink',
  ]
    .filter(Boolean)
    .join(' ')

  const inner = (
    <>
      <Boucle className={`${SYMBOL[variant]} shrink-0 ${symbolColor}`} />
      <span className={wordmarkClass}>{wordmark}</span>
    </>
  )

  const layout =
    variant === 'auth'
      ? 'flex flex-col items-center gap-3'
      : variant === 'sidebar'
        ? 'flex items-center gap-2.5'
        : 'flex items-center gap-2.5'

  const body = <span className={`${layout} ${className}`}>{inner}</span>

  if (!linked) return body

  return (
    <Link
      to="/"
      aria-label="ReVends — retour à l'accueil"
      className={`inline-flex rounded-md ${ring} transition-opacity duration-200 hover:opacity-80`}
    >
      {body}
    </Link>
  )
}
