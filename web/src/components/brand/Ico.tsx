import type { SVGProps } from 'react'

/**
 * Icône du sprite SVG (cf. `IconSprite.tsx`, copie à l'identique de
 * `Bureau/main/index.html`). Le markup de la maquette est
 * `<svg class="i"><use href="#i-…"/></svg>` — ce composant le reproduit.
 *
 * Note : les icônes ne sont PAS des Font Awesome sur le site public ; le CSS
 * de référence cible `.i` (taille, couleur, alignement).
 */
export function Ico({ name, cls, ...rest }: { name: string; cls?: string } & Omit<SVGProps<SVGSVGElement>, 'className'>) {
  return (
    <svg className={`i${cls ? ` ${cls}` : ''}`} aria-hidden="true" {...rest}>
      <use href={`#i-${name}`} />
    </svg>
  )
}
