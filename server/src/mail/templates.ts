import { config } from '../config.js';

/**
 * Templates transactionnels (C1 / US-V5-01, CA-V5-007 → CA-V5-009).
 *
 * Règles non négociables appliquées ici, pas dans les appelants :
 *
 * - **DEUX versions par email** : `html` (balisage simple, mise en page de
 *   base, AUCUN CSS externe, AUCUNE image distante, AUCUN script) et `text`
 *   (contenu équivalent, aucun balisage) — CA-V5-007 ;
 * - **ÉCHAPPEMENT HTML** : toute donnée issue de la base (nom de produit,
 *   numéro de commande, motif de refus) passe par `escapeHtml`. C'est ce qui
 *   rend les emails injection-safe (CA-V5-018) : un nom de produit contenant
 *   `<script>` est affiché littéralement, jamais interprété ;
 * - **version texte : le texte ÉCHAPPÉ n'est PAS réutilisé tel quel** —
 *   `&amp;` afficherait un `&` parasite. On applique donc `unescapeHtml`
 *   symétriquement pour retrouver le texte réel du côté plain-text ;
 * - **aucune donnée sensible** (CA-V5-008) : ni mot de passe, ni hash, ni
 *   jeton de session, ni téléphone, ni adresse postale, ni nom complet privé
 *   (`users.name`). Seuls l'identifiant de commande, le nom du produit, des
 *   montants en FCFA, un statut et un lien interne au site sont autorisés ;
 * - **un seul lien sortant, toujours interne** (CA-V5-009) : il pointe vers
 *   `SITE_URL`. Aucune adresse email de tiers, aucun lien de désinscription.
 */

/** Échappe les 5 caractères HTML sensibles + neutralise les sauts de ligne. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Opération inverse de `escapeHtml`, pour la version texte brut. */
function unescapeHtml(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

export interface MailContent {
  subject: string;
  text: string;
  html: string;
}

/** Les déclencheurs d'email — l'identifiant est aussi la clé de test. */
export type MailEvent =
  | 'welcome'
  | 'product_approved'
  | 'product_rejected'
  | 'order_created_buyer'
  | 'payment_confirmed_buyer'
  | 'payment_confirmed_seller'
  | 'order_shipped'
  | 'order_delivered'
  | 'payout_available'
  | 'payout_paid'
  | 'reservation_expired_buyer'
  | 'reservation_expired_seller'
  | 'article_reserved'
  | 'order_product_received'
  | 'order_cancelled'
  | 'order_completed_buyer'
  | 'password_reset';

export interface TemplateVars {
  /**
   * Nom du produit — donnée métier, jamais un nom d'utilisateur.
   * ⚠️ VALEUR BRUTE : elle est échappée ICI, par `renderTemplate`. Les
   * appelants ne doivent PAS pré-échapper (double échappement → `&amp;lt;`
   * visible dans le mail). Centraliser l'échappement dans le seul endroit qui
   * produit du HTML rend l'injection impossible à oublier (CA-V5-018).
   */
  productName?: string;
  orderNumber?: string;
  amountFcfa?: number;
  reason?: string;
  /** Chemin interne, ex. `/orders/CMD-000123`. Relié à SITE_URL. Jamais absolu. */
  linkPath?: string;
}

const MONEY = new Intl.NumberFormat('fr-FR').format;

/** Montant en FCFA, format lisible (« 100 000 FCFA »). */
function money(amountFcfa: number): string {
  return `${MONEY(amountFcfa)} FCFA`;
}

/**
 * Lien interne : `SITE_URL` + chemin. Jamais de lien externe (CA-V5-009).
 *
 * Garde-fous, dans l'ordre :
 *  1. **idempotence** : un appelant ayant déjà joint `SITE_URL` ne subit pas un
 *     second préfixe (sinon lien mort) ;
 *  2. **frontière d'origine** : le préfixe n'est retiré que si ce qui suit est
 *     bien un chemin — `SITE_URL.evil.com` ne désigne PAS ce site ;
 *  3. toute autre URL absolue → **aucun lien** émis ;
 *  4. **assainissement** : seuls les caractères d'un vrai path web survivent, et
 *     un `//` de tête (qui ferait de `//evil.com` un autre hôte) est neutralisé.
 *
 * Le résultat est échappé comme le reste du mail.
 */
function internalLink(linkPath: string | undefined): string | null {
  if (!linkPath) return null;
  const site = config.siteUrl;
  let candidate = linkPath.trim();

  if (candidate.startsWith(site)) {
    const rest = candidate.slice(site.length);
    if (rest !== '' && !rest.startsWith('/')) return null;
    candidate = rest || '/';
  }

  if (/^https?:\/\//i.test(candidate)) return null;

  const cleaned = candidate.replace(/[^\w\-./?=&#%]/g, '').replace(/^\/+/, '/');
  return escapeHtml(`${site}${cleaned}`);
}

/**
 * Corps de message. Le `layout` est volontairement minimaliste : une table
 * d'une seule colonne, des balises inline, aucun `class`, aucun `style`
 * externe, aucune image, aucun script.
 */
function layout(heading: string, paragraphs: string[], link: string | null): { html: string; text: string } {
  const htmlLink =
    link === null
      ? ''
      : `<p><a href="${escapeHtml(link)}">Ouvrir dans ReVends</a></p>`;
  const textLink = link === null ? '' : `\n\nOuvrir dans ReVends : ${link}\n`;
  return {
    html:
      '<!doctype html><html lang="fr"><head><meta charset="utf-8">' +
      `<title>${escapeHtml(heading)}</title></head>` +
      '<body style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#1a1a2e;">' +
      `<h1 style="font-size:20px;margin:0 0 16px;">${escapeHtml(heading)}</h1>` +
      paragraphs.map((p) => `<p style="margin:0 0 12px;">${p}</p>`).join('') +
      htmlLink +
      '<hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0 12px;">' +
      '<p style="font-size:12px;color:#6b7280;margin:0;">' +
      'Message automatique ReVends. Vous recevez cet e-mail car vous avez un compte actif sur la plateforme.</p>' +
      '</body></html>',
    text: `${heading}\n\n${paragraphs.map(unescapeHtml).join('\n\n')}${textLink}\n--\nMessage automatique ReVends.`,
  };
}

function para(...chunks: string[]): string {
  return chunks.join(' ');
}

/**
 * Construit le contenu d'un email à partir de son événement.
 * L'objet est TOUJOURS non vide (CA-V5-007) ; l'adresse d'expédition est posée
 * par le mailer (unique source : `MAIL_FROM`).
 */
export function renderTemplate(event: MailEvent, rawVars: TemplateVars): MailContent {
  // ÉCHAPPEMENT UNIQUE (CA-V5-018) : toute donnée base est échappée ici, une
  // seule fois, avant toute interpolation. `amountFcfa` est un nombre (aucun
  // échappement nécessaire), `linkPath` est un chemin interne construit par le
  // code — il est validé ci-dessous plutôt qu'échappé, pour qu'un chemin
  // exotique soit rejeté à la source.
  const vars: TemplateVars = {
    productName: rawVars.productName === undefined ? undefined : escapeHtml(rawVars.productName),
    orderNumber: rawVars.orderNumber === undefined ? undefined : escapeHtml(rawVars.orderNumber),
    reason: rawVars.reason === undefined ? undefined : escapeHtml(rawVars.reason),
    amountFcfa: rawVars.amountFcfa,
    linkPath: rawVars.linkPath,
  };
  const product = vars.productName ?? 'votre article';
  const order = vars.orderNumber ?? '';
  const link = internalLink(vars.linkPath);

  switch (event) {
    case 'password_reset': {
      // Le lien est construit par le code (`resetLink()`), pas par l'utilisateur :
      // il est validé par `internalLink` comme les autres chemins.
      const { html, text } = layout(
        'Réinitialisation de votre mot de passe',
        [
          para('Vous avez demandé à réinitialiser votre mot de passe ReVends.'),
          para('Ce lien est valable une heure et ne peut être utilisé qu\'une seule fois.'),
          para('Si vous n\'êtes pas à l\'origine de cette demande, ignorez simplement ce message : votre mot de passe actuel reste valable.'),
        ],
        link ?? internalLink('/'),
      );
      return { subject: 'Réinitialisation de votre mot de passe', html, text };
    }

    case 'welcome': {
      const { html, text } = layout(
        'Bienvenue sur ReVends',
        [
          para(
            'Votre compte est créé. Vous pouvez maintenant publier vos articles et acheter auprès de la communauté.',
          ),
        ],
        link ?? internalLink('/dashboard'),
      );
      return { subject: 'Bienvenue sur ReVends', html, text };
    }

    case 'product_approved': {
      const { html, text } = layout(
        'Votre article est approuvé',
        [
          para('Bonne nouvelle : votre article est validé et visible sur le catalogue.'),
          para('Article :', `<strong>${product}</strong>`),
        ],
        link ?? internalLink('/dashboard/articles'),
      );
      return { subject: 'Votre article est approuvé', html, text };
    }

    case 'product_rejected': {
      // Le MOTIF est une donnée métier légitime : il est échappé comme le reste
      // (CA-V5-018) et n'expose aucune donnée personnelle.
      const motif = vars.reason ? ` Motif indiqué : ${vars.reason}` : '';
      const { html, text } = layout(
        'Votre article a été refusé',
        [
          para(`Votre article n'a pas pu être accepté par la modération.${motif}`),
          para('Article :', `<strong>${product}</strong>`),
          para('Vous pouvez modifier l\'article et le soumettre à nouveau.'),
        ],
        link ?? internalLink('/dashboard/articles'),
      );
      return { subject: 'Votre article a été refusé', html, text };
    }

    case 'payment_confirmed_buyer': {
      const { html, text } = layout(
        'Votre paiement est confirmé',
        [
          para('Le paiement de votre commande a été validé. Le vendeur prépare votre article.'),
          order ? para('Commande :', `<strong>${order}</strong>`) : '',
          vars.amountFcfa !== undefined ? para('Montant :', `<strong>${escapeHtml(money(vars.amountFcfa))}</strong>`) : '',
        ].filter(Boolean),
        link,
      );
      return { subject: 'Votre paiement est confirmé', html, text };
    }

    case 'payment_confirmed_seller': {
      const { html, text } = layout(
        'Un acheteur a payé votre article',
        [
          para('Le paiement de votre article a été confirmé. Vous pouvez maintenant préparer la remise.'),
          para('Article :', `<strong>${product}</strong>`),
          vars.amountFcfa !== undefined
            ? para('Montant de la vente :', `<strong>${escapeHtml(money(vars.amountFcfa))}</strong>`)
            : '',
        ].filter(Boolean),
        link,
      );
      return { subject: 'Un acheteur a payé votre article', html, text };
    }

    case 'order_created_buyer': {
      // Confirmation d'enregistrement de commande, destinée à l'ACHETEUR
      // CONNECTÉ. Le destinataire n'est jamais lu dans la requête : `queueMail`
      // reçoit l'`id` de session et relit l'adresse en base (CA-V5-011).
      const { html, text } = layout(
        'Votre commande est enregistrée',
        [
          para('Votre commande est bien enregistrée. Le vendeur a été prévenu et prépare l\'article.'),
          order ? para('Commande :', `<strong>${order}</strong>`) : '',
          para('Un nouvel e-mail vous parviendra à la confirmation du paiement, puis à l\'expédition.'),
        ].filter(Boolean),
        link,
      );
      return { subject: 'Votre commande est enregistrée', html, text };
    }

    case 'order_shipped': {
      const { html, text } = layout(
        'Votre colis est prêt',
        [
          para('Votre article a été préparé et remis au transporteur. Votre colis est en route.'),
          order ? para('Commande :', `<strong>${order}</strong>`) : '',
        ].filter(Boolean),
        link,
      );
      return { subject: 'Votre colis est prêt', html, text };
    }

    case 'order_delivered': {
      const { html, text } = layout(
        'Votre commande est livrée',
        [
          para('Votre commande a été livrée. Pensez à confirmer la réception depuis votre espace.'),
          para('Article :', `<strong>${product}</strong>`),
          order ? para('Commande :', `<strong>${order}</strong>`) : '',
        ].filter(Boolean),
        link,
      );
      return { subject: 'Votre commande est livrée', html, text };
    }

    case 'payout_available': {
      const { html, text } = layout(
        'Votre paiement vendeur est disponible',
        [
          para('La commande est terminée : votre paiement vendeur peut désormais être versé.'),
          vars.amountFcfa !== undefined
            ? para('Montant net :', `<strong>${escapeHtml(money(vars.amountFcfa))}</strong>`)
            : '',
          order ? para('Commande :', `<strong>${order}</strong>`) : '',
        ].filter(Boolean),
        link,
      );
      return { subject: 'Votre paiement vendeur est disponible', html, text };
    }

    case 'payout_paid': {
      const { html, text } = layout(
        'Votre paiement vendeur a été versé',
        [
          para('Le virement correspondant a été enregistré. La vente est définitivement close.'),
          vars.amountFcfa !== undefined
            ? para('Montant net :', `<strong>${escapeHtml(money(vars.amountFcfa))}</strong>`)
            : '',
          order ? para('Commande :', `<strong>${order}</strong>`) : '',
        ].filter(Boolean),
        link,
      );
      return { subject: 'Votre paiement vendeur a été versé', html, text };
    }

    case 'reservation_expired_buyer': {
      const { html, text } = layout(
        'Votre réservation a expiré',
        [
          para('La réservation sur cet article est arrivée à terme (5 jours après réception). La commande a été annulée.'),
          para('Article :', `<strong>${product}</strong>`),
          order ? para('Commande :', `<strong>${order}</strong>`) : '',
        ].filter(Boolean),
        link,
      );
      return { subject: 'Votre réservation a expiré', html, text };
    }

    case 'reservation_expired_seller': {
      const { html, text } = layout(
        'La réservation d\'un de vos articles a expiré',
        [
          para('La réservation sur cet article est arrivée à terme (5 jours après réception), l\'acheteur n\'a pas finalisé le paiement.'),
          para('Article :', `<strong>${product}</strong>`),
          para('L\'article est de nouveau disponible à la vente.'),
        ],
        link,
      );
      return { subject: 'La réservation d\'un de vos articles a expiré', html, text };
    }

    case 'article_reserved': {
      // Le vendeur est prévenu qu'un acheteur réserve son article. La
      // réservation a une durée limitée (`config.reservationDays` = 5 jours)
      // APRÈS RÉCEPTION DU PRODUIT : le vendeur doit s'assurer que l'acheteur
      // finalise, sinon l'article redevient disponible (CA-ORD06 / D3).
      const { html, text } = layout(
        'Votre article a été réservé',
        [
          para('Un acheteur vient de réserver votre article. Le paiement sera confirmé à la réception (délai de 5 jours après réception).'),
          para('Article :', `<strong>${product}</strong>`),
          para('Vous recevrez un e-mail dès que le paiement sera confirmé.'),
        ],
        link ?? internalLink('/mes-articles'),
      );
      return { subject: 'Votre article a été réservé', html, text };
    }

    case 'order_product_received': {
      // Le produit a été réceptionné (POINT_RELAIS / plateforme) : la
      // préparation est en cours. Destiné à l'ACHETEUR.
      const { html, text } = layout(
        'Votre produit a été réceptionné',
        [
          para('Bonne nouvelle : votre produit a été réceptionné et sa préparation est en cours.'),
          para('Article :', `<strong>${product}</strong>`),
          order ? para('Commande :', `<strong>${order}</strong>`) : '',
        ].filter(Boolean),
        link,
      );
      return { subject: 'Votre produit a été réceptionné', html, text };
    }

    case 'order_cancelled': {
      // Commande annulée par l'administrateur (PAYMENT_PENDING → CANCELLED).
      // Le produit réservé est redevenu disponible ; aucun débit n'a eu lieu.
      const { html, text } = layout(
        'Votre commande a été annulée',
        [
          para('Votre commande a été annulée par nos équipes. Le produit réservé est de nouveau disponible à la vente.'),
          order ? para('Commande :', `<strong>${order}</strong>`) : '',
          para('Aucun débit n\'a été effectué.'),
        ].filter(Boolean),
        link,
      );
      return { subject: 'Votre commande a été annulée', html, text };
    }

    case 'order_completed_buyer': {
      // Vente terminée côté acheteur (DELIVERED → COMPLETED, système). Le
      // vendeur a été payé ; la commande est close. Destiné à l'ACHETEUR.
      const { html, text } = layout(
        'Votre commande est terminée',
        [
          para('Merci ! Votre commande est désormais terminée et close.'),
          para('Article :', `<strong>${product}</strong>`),
          order ? para('Commande :', `<strong>${order}</strong>`) : '',
          para('Le vendeur a bien reçu son paiement. Merci de votre confiance.'),
        ].filter(Boolean),
        link,
      );
      return { subject: 'Votre commande est terminée', html, text };
    }

    default: {
      // `event` est typé : cette branche est inatteignable en TypeScript. Elle
      // existe pour qu'un ajout futur d'événement sans template échoue bruyamment
      // plutôt que silencieusement.
      const unreachable: never = event;
      throw new Error(`Template d'email manquant : ${String(unreachable)}`);
    }
  }
}
