import { Crumb, SiteHead } from '../site/SiteBits'
import { Ico } from '../brand/Ico'

export interface LegalSection {
  id: string
  title: string
  /** au moins un paragraphe OU une liste — évite une section vide à l'écran */
  paragraphs?: string[]
  list?: string[]
}

/**
 * Gabarit partagé des pages légales — `/conditions` et `/confidentialite`
 * (PO-V5-20 point 3, CA-V5-142).
 *
 * Ces deux pages sont **exigées** parce que le footer les rend comme liens
 * réels : un lien vers une route inexistante est un lien mort, interdit par
 * RG-V5-08. Contenu **générique** (le cahier demande des pages statiques, pas
 * un texte juridique validé) mais structuré en vraies sections titrées.
 *
 * Accessibilité : un seul `h1` par page, sections en `h2`, mesure de ligne
 * limitée pour rester lisible, sommaire `aria-label`, liens d'ancrage réels.
 * Composant mutualisé : un gabarit utilisé par 2 écrans vit une seule fois ici
 * (design-system §9.7 — pas de duplication dans les pages).
 *
 * Restylé avec le vocabulaire Bureau/main : `.wrap` + `Crumb` + `SiteHead`
 * (h1 niveau 1) + `.box` (sommaire) + `.spec` (liste de définitions) — aucune
 * classe utilitaire Tailwind, uniquement les jetons de la maquette.
 */
export function LegalPage({
  title,
  intro,
  updated,
  sections,
}: {
  title: string
  intro: string
  updated: string
  sections: LegalSection[]
}) {
  return (
    <div className="wrap">
      <Crumb items={[{ label: title }]} />
      <main>
        <SiteHead level={1} title={title} sub={intro} />

        <p className="muted rv-legal-updated">
          Dernière mise à jour : {updated}
        </p>

        <nav aria-label="Sommaire" className="box">
          <p className="eyebrow">Sommaire</p>
          <ol className="rv-legal-toc">
            {sections.map((s, i) => (
              <li key={s.id}>
                <span className="rv-legal-num">{i + 1}.</span>{' '}
                <a href={`#${s.id}`}>
                  {s.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="rv-legal-body">
          {sections.map((s, i) => (
            <section key={s.id} id={s.id} aria-labelledby={`${s.id}-titre`}>
              <h2 id={`${s.id}-titre`}>
                <span className="rv-legal-num">{i + 1}.</span> {s.title}
              </h2>
              {(s.paragraphs ?? []).map((p) => (
                <p key={p} className="muted">
                  {p}
                </p>
              ))}
              {s.list && (
                <ul>
                  {s.list.map((li) => (
                    <li key={li} className="muted">
                      <Ico name="check" cls="sm" />
                      <span>{li}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>

        <p className="muted rv-legal-foot">
          Une question ? Écrivez-nous à{' '}
          <a href="mailto:contact@revends.ci">
            contact@revends.ci
          </a>
          .
        </p>
      </main>
    </div>
  )
}

/** Contenu des pages légales — isolé pour rester lisible et testable. */
export const CONDITIONS_SECTIONS: LegalSection[] = [
  {
    id: 'objet',
    title: 'Objet des conditions',
    paragraphs: [
      "Les présentes conditions décrivent les règles applicables à l'utilisation du site ReVends, place de marché qui met en relation des acheteurs et des vendeurs particuliers.",
      "Toute utilisation du site vaut acceptation pleine et entière de ces règles. Elles complètent les dispositions légales applicables et ne s'y substituent pas.",
    ],
  },
  {
    id: 'role-revends',
    title: 'Le rôle de ReVends',
    paragraphs: [
      "ReVends est un intermédiaire. Le site n'est ni le vendeur, ni l'acheteur, ni le transporteur : la vente est conclue directement entre le vendeur et l'acheteur.",
      "Nous moderons les annonces, traitons les paiements et le suivi de commande, et signalons les manquements constatés. Nous n intervenons pas sur la qualité intrinsèque des articles échangés.",
    ],
  },
  {
    id: 'annonces',
    title: 'Règles de publication des annonces',
    list: [
      "Chaque article doit être décrit de façon fidèle, avec des photos récentes et représentatives.",
      "Les catégories interdites à la vente (produits contrefaisants, produits dangereux, contenus illicites) ne peuvent être publiées.",
      "Les prix sont exprimés en francs CFA et ne peuvent être modifiés après une réservation, sauf accord des deux parties.",
    ],
    paragraphs: [
      "Toute annonce manifestement trompeuse peut être retirée du catalogue, sans que cela ouvre droit à une indemnisation.",
    ],
  },
  {
    id: 'commande',
    title: 'Commande, paiement et livraison',
    list: [
      "La commande est conclue lorsque le paiement est confirmé et que le vendeur accepte la réservation.",
      "Les frais de livraison sont convenus entre les parties et affichés avant la validation de la commande.",
      "Un numéro de suivi est communiqué dès l'expédition lorsque le transporteur en fournit un.",
    ],
    paragraphs: [
      "La commission affichée à la publication de l'annonce s'applique aux ventes conclues sur la plateforme. Aucun frais supplémentaire n'est prélevé par ReVends auprès de l'acheteur.",
    ],
  },
  {
    id: 'litiges',
    title: 'Annulation et litiges',
    paragraphs: [
      "En cas d'article non conforme, non reçu ou endommagé, contactez-nous dans les meilleurs délais : nous ouvrons une enquête auprès des deux parties.",
      "Si une résolution amiable est impossible, l'affaire relève des tribunaux compétents selon les règles de droit applicables. Nous fournissons alors les informations de commande utiles à l'examen du dossier.",
    ],
  },
  {
    id: 'donnees',
    title: 'Données personnelles',
    paragraphs: [
      "Les données nécessaires au traitement d'une commande sont partagées entre l'acheteur et le vendeur, uniquement dans la mesure où elles sont utiles à la livraison et au suivi.",
      "Chaque partie dispose de la page « Confidentialité » pour connaître la liste des données collectées et les droits dont elle dispose.",
    ],
  },
]

export const PRIVACY_SECTIONS: LegalSection[] = [
  {
    id: 'principe',
    title: 'Principe',
    paragraphs: [
      "ReVends traite les données personnelles pour faire fonctionner la place de marché : créer un compte, publier une annonce, passer une commande, assurer la livraison et le suivi.",
      "Nous ne vendons pas vos données et nous ne les utilisons pas à des fins publicitaires tierces.",
    ],
  },
  {
    id: 'donnees-collectees',
    title: 'Données collectées',
    list: [
      "Compte : nom, adresse e-mail, numéro de téléphone.",
      "Annonces : photos, description, prix, localisation, état de l'article.",
      "Commandes : adresse de livraison, moyen de paiement, historique de commande.",
    ],
  },
  {
    id: 'partage',
    title: 'Partage entre acheteurs et vendeurs',
    paragraphs: [
      "Pour qu'une commande se déroule, certaines informations sont transmises entre l'acheteur et le vendeur : coordonnées de livraison d'un côté, informations de retrait de l'autre.",
      "Aucune coordonnée privée d'un tiers n'est communiquée : un acheteur ne voit jamais les coordonnées d'un autre acheteur, et un vendeur ne voit pas l'adresse d'un acheteur tant que la commande n'est pas en cours.",
    ],
  },
  {
    id: 'duree',
    title: 'Durée de conservation',
    paragraphs: [
      "Les données de compte sont conservées tant que le compte est actif. Après suppression du compte, les informations sont conservées le temps nécessaire aux obligations comptables et probatoires, puis supprimées.",
    ],
  },
  {
    id: 'droits',
    title: 'Vos droits',
    paragraphs: [
      "Vous pouvez à tout moment modifier les informations de votre profil, exporter vos données ou demander la suppression de votre compte.",
      "Pour toute demande, écrivez à contact@revends.ci : nous répondons dans les meilleurs délais.",
    ],
  },
  {
    id: 'securite',
    title: 'Sécurité',
    paragraphs: [
      "Les mots de passe sont stockés sous forme chiffrée et ne sont jamais communiqués. Les paiements transitent par des prestataires agréés : aucun numéro de carte bancaire n'est conservé par ReVends.",
    ],
  },
]
