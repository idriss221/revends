/**
 * Symbole « La Boucle » — docs/design-system-revends-v5.md §2.
 *
 * Deux primitives EXACTES sur `viewBox="0 0 24 24"`, `currentColor` :
 *   1. ARC  — boucle ouverte de 290°, rayon 7, centre (12,12), ouverture 70° à droite
 *   2. TÊTE — triangle plein (base 5.5, pointe 3.7 en avant de la tangente)
 *
 * Géométrie vérifiée par @design : bbox 3.80,3.80 → 19.99,20.20 (16.19 × 16.40),
 * centre optique (11.89, 12.00). Zone de protection = 8 unités sur les 4 côtés.
 * Aucune modification des coordonnées : le glyphe ne se recolore jamais par
 * dégradé et n'a pas de version « plate » à 1 couleur hors favicon.
 */
export interface BoucleProps {
  /** classe de TAILLE (`h-6 w-6`…) et de COULEUR — le glyphe hérite de `currentColor` */
  className?: string
  /** trait plus gras : réservé au favicon, où le triangle est supprimé (lisibilité 16 px) */
  strokeWidth?: number
  /** favicon : triangle omis (trait plein seul) */
  withoutHead?: boolean
  /** accessible : nom du symbole ; `undefined` = décoratif (`aria-hidden`) */
  title?: string
}

export function Boucle({ className = 'h-8 w-8', strokeWidth = 2.4, withoutHead = false, title }: BoucleProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} role={title ? 'img' : undefined} aria-hidden={title ? undefined : true}>
      {title ? <title>{title}</title> : null}
      <path
        d="M 17.73 7.98 A 7 7 0 1 0 17.73 16.02"
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
      {withoutHead ? null : <path d="M 19.86 12.98 L 19.99 17.59 L 15.48 14.44 Z" fill="currentColor" />}
    </svg>
  )
}
