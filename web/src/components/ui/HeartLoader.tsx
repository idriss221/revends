import { HeartMark } from './HeartMark'

/**
 * Loader de contenu — le cœur ReVends (« le cœur couture »), jamais un spinner
 * anonyme.
 *
 * · `lg` : chargement de page / de fiche (au centre d'une zone) ;
 * · `md` : bloc liste (panier, annonces, commandes) ;
 * · `sm` : chargement local (à côté d'un libellé).
 *
 * `role="status"` + `aria-live="polite"` : le lecteur d'écran annonce le
 * chargement, et le libellé reste visible (pas de texte que en `.sr-only`).
 */
export function HeartLoader({ label = 'Chargement en cours…', size = 'md', className }: {
  label?: string
  size?: 'sm' | 'md' | 'lg'
  className?: string
}) {
  return (
    <div className={`rv-heartloader ${size}${className ? ` ${className}` : ''}`} role="status" aria-live="polite">
      <HeartMark />
      <span className="rv-heartloader__label">{label}</span>
    </div>
  )
}
