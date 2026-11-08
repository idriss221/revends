import { LegalPage, PRIVACY_SECTIONS } from '../components/layout/LegalPage'

/**
 * `/confidentialite` — page statique.
 */
export function PrivacyPage() {
  return (
    <LegalPage
      title="Confidentialité"
      updated="septembre 2026"
      intro="Quelles données ReVends collecte, pourquoi, combien de temps elles sont conservées et comment exercer vos droits."
      sections={PRIVACY_SECTIONS}
    />
  )
}
