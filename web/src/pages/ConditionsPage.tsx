import { LegalPage, CONDITIONS_SECTIONS } from '../components/layout/LegalPage'

/**
 * `/conditions` — page statique.
 */
export function ConditionsPage() {
  return (
    <LegalPage
      title="Conditions générales"
      updated="septembre 2026"
      intro="Les règles d'utilisation de la place de marché ReVends : ce que chaque partie s'engage à respecter lorsqu'elle achète, vend ou échange un article."
      sections={CONDITIONS_SECTIONS}
    />
  )
}
