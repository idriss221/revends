import type { ButtonHTMLAttributes, ReactNode } from 'react'

/**
 * Button — design-system-revends-v5 §3.1.
 *
 * Contrat : `variant` × `size` × `block` × `loading` (+ `icon` / `iconRight`).
 * · `sm` = 36 px au repos, **≥ 44 px sous 768 px** (`max-md:min-h-[44px]`) — DA §8 ;
 * · `loading` : spinner + `aria-busy`, **le texte est conservé** (pas de saut de
 *   largeur, DA §3.1) ;
 * · `buttonClasses()` reste exporté : partagé avec les `<Link>` stylés bouton.
 */
export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'positive' | 'danger'
export type ButtonSize = 'sm' | 'md' | 'lg'

const BASE =
  'inline-flex cursor-pointer items-center justify-center gap-2 rounded-md font-bold transition-all duration-200 select-none active:scale-[0.98] active:shadow-xs disabled:pointer-events-none disabled:opacity-45'

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-terracotta-strong text-white shadow-cta hover:bg-terracotta-deep',
  secondary: 'bg-chocolate text-white hover:bg-ink',
  outline:
    'border-[1.5px] border-line-strong bg-white text-ink hover:border-terracotta-strong hover:bg-terracotta-wash hover:text-terracotta-ink hover:-translate-y-px',
  ghost: 'text-ink hover:bg-ink/5',
  positive: 'bg-positive text-white hover:bg-positive-dark',
  danger: 'bg-danger text-white hover:bg-danger-dark',
}

const SIZES: Record<ButtonSize, string> = {
  // 36 px au repos, 44 px sous 768 px (cible tactile, DA §8)
  sm: 'h-9 px-4 text-sm max-md:min-h-[44px]',
  md: 'h-11 px-6 text-base',
  lg: 'h-[52px] px-8 text-[17px]',
}

/** Classes d'un bouton — source unique partagée `<Button>` / `<Link>` (D1). */
export function buttonClasses(
  variant: ButtonVariant = 'primary',
  size: ButtonSize = 'md',
  block = false,
  extra?: string,
): string {
  return [BASE, VARIANTS[variant], SIZES[size], block ? 'w-full' : '', extra ?? ''].filter(Boolean).join(' ')
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  block?: boolean
  loading?: boolean
  /** icône à gauche (`fa-*`), décorative */
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
  return (
    <button
      type={type}
      className={buttonClasses(variant, size, block, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading && <i className="fas fa-spinner fa-spin" aria-hidden="true" />}
      {icon && !loading && <i className={`fas ${icon}`} aria-hidden="true" />}
      {children}
      {iconRight && <i className={`fas ${iconRight}`} aria-hidden="true" />}
    </button>
  )
}
