import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Ico } from '../brand/Ico'

/**
 * Button — design-system-revends-v5 §3.1.
 *
 * Contrat : `variant` × `size` × `block` × `loading` (+ `icon` / `iconRight`).
 * · Utilise les classes CSS `.btn` de `bureau-fixes.css` (pas de Tailwind) pour le PUBLIC.
 * · Variantes publiques : primary | secondary | outline | ghost
 * · Variantes admin (legacy Tailwind) : positive | danger — conservées pour .market-admin
 * · `sm` = 36 px au repos, **≥ 44 px sous 768 px** — DA §8 ;
 * · `loading` : spinner `.spinner` + `aria-busy`, **le texte est conservé** ;
 * · `buttonClasses()` reste exporté : partagé avec les `<Link>` stylés bouton.
 * · Micro-interactions : hover translateY(-1px), press scale(.98), focus-visible ring.
 * · Respecte `prefers-reduced-motion` (désactive translate/scale via CSS).
 */
export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'positive' | 'danger'
export type ButtonSize = 'sm' | 'md' | 'lg'

const TAILWIND_VARIANTS: Record<'positive' | 'danger', string> = {
  positive: 'bg-positive text-white hover:bg-positive-dark',
  danger: 'bg-danger text-white hover:bg-danger-dark',
}

const TAILWIND_BASE = 'inline-flex cursor-pointer items-center justify-center gap-2 rounded-md font-bold transition-all duration-200 select-none active:scale-[0.98] active:shadow-xs disabled:pointer-events-none disabled:opacity-45'
const TAILWIND_SIZES: Record<ButtonSize, string> = {
  sm: 'h-9 px-4 text-sm max-md:min-h-[44px]',
  md: 'h-11 px-6 text-base',
  lg: 'h-[52px] px-8 text-[17px]',
}

/** Classes CSS pour un bouton — source unique partagée `<Button>` / `<Link>` (D1). */
export function buttonClasses(
  variant: ButtonVariant = 'primary',
  size: ButtonSize = 'md',
  block = false,
  extra?: string,
): string {
  // Variantes publiques → classes CSS .btn
  if (['primary', 'secondary', 'outline', 'ghost'].includes(variant)) {
    return ['btn', `btn-${variant}`, `btn-${size}`, block ? 'btn-block' : '', extra ?? ''].filter(Boolean).join(' ')
  }
  // Variantes admin (legacy) → classes Tailwind
  return [TAILWIND_BASE, TAILWIND_VARIANTS[variant as 'positive' | 'danger'], TAILWIND_SIZES[size], block ? 'w-full' : '', extra ?? ''].filter(Boolean).join(' ')
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  block?: boolean
  loading?: boolean
  /** icône à gauche (nom du sprite SVG), décorative */
  icon?: string
  iconRight?: string
  children?: ReactNode
}

export function Button({
  variant = 'primary',
  size = 'md',
  block = false,
  loading = false,
  icon,
  iconRight,
  className,
  children,
  disabled,
  type = 'button',
  ...rest
}: ButtonProps) {
  const isPublicVariant = ['primary', 'secondary', 'outline', 'ghost'].includes(variant)

  return (
    <button
      type={type}
      className={buttonClasses(variant, size, block, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading && (
        <span className={isPublicVariant ? 'spinner spinner-sm' : 'fas fa-spinner fa-spin'} aria-hidden="true" />
      )}
      {/* Les noms `fa-…` viennent de l'admin (Font Awesome), les autres du
          sprite public (`Ico`, `#i-…`). Avant, seul le variant décidait :
          `Button variant="outline" icon="fa-rotate-left"` cherchait donc
          `#i-fa-rotate-left`, inexistant → icône vide. Le préfixe est la
          seule information fiable, indépendante du shell. */}
      {icon && !loading && (icon.startsWith('fa-')
        ? <i className={`fas ${icon}`} aria-hidden="true" />
        : <Ico name={icon} cls="sm" aria-hidden="true" />
      )}
      {children}
      {iconRight && !loading && (iconRight.startsWith('fa-')
        ? <i className={`fas ${iconRight}`} aria-hidden="true" />
        : <Ico name={iconRight} cls="sm" aria-hidden="true" />
      )}
    </button>
  )
}