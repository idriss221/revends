/**
 * Cœur ReVends — le loader signature du site.
 *
 * Reproduit le cœur du splash d'ouverture (`Bureau/main/index.html` :
 * `<svg class="rv-heart">` + traits `hp` / `shine`, animés par
 * `bureau.css` → `@keyframes rvHeart`). Tout chargement de contenu réutilise
 * **ce** signe, jamais un spinner générique : un « refresh » gris au milieu
 * d'une page ne ressemble à rien (et ne dit rien de la marque).
 *
 * `aria-hidden` : le texte du loader (label) porte l'information.
 */
export function HeartMark() {
  return (
    <svg className="rv-heart" viewBox="0 0 120 112" aria-hidden="true">
      <path
        className="hp"
        d="M60 100 C 18 70 10 42 30 27 C 46 15 60 28 60 40 C 60 28 74 15 90 27 C 110 42 102 70 60 100 Z"
      />
      <path className="shine" d="M34 38 C 42 30 52 30 58 38" />
    </svg>
  )
}
