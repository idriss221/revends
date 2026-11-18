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
  | 'password_reset'
  | 'payment_instructions_buyer'
  | 'payment_proof_received_buyer'
  | 'payment_proof_rejected_buyer'
  | 'payment_proof_submitted_admin'
  | 'product_submitted_admin'
  | 'order_created_admin'
  | 'phone_reset'
  | 'announcement_sell'
  | 'referral_program_launch'
  | 'referral_milestone'
  | 'subscription_activated'
  | 'subscription_expiry_reminder'
  | 'storefront_monthly_report';

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
  /** Pseudo PUBLIC du destinataire (jamais `users.name`, privé). */
  displayName?: string;
  /** Nombre d'articles en ligne — personnalisation de la campagne de parrainage. */
  productCount?: number;
  /** Palier franchi (5 ou 10) pour `referral_milestone`. */
  milestone?: number;
  /** Code de parrainage (campagne) — assaini avant d'entrer dans l'URL. */
  referralCode?: string;
  /** Chemin interne, ex. `/orders/CMD-000123`. Relié à SITE_URL. Jamais absolu. */
  linkPath?: string;
  /** Nom du forfait (DB subscription_plans) — échappé à l'interpolation. */
  planName?: string;
  /** Nom affichable de la boutique (ex. slug) — échappé à l'interpolation. */
  boutiqueName?: string;
  /** Période lisible du bilan, ex. « novembre 2026 ». */
  period?: string;
  /** Cumul de vues affiché tel quel dans le corps (chiffres). */
  viewsCount?: number;
  viewsLabel?: string;
  salesCount?: number;
  revenueFcfa?: number;
  netRevenueFcfa?: number;
  commissionFcfa?: number;
  /** null ⇒ « — » (aucune vente). */
  avgBasketFcfa?: number | null;
  bestProductName?: string;
  bestProductSales?: number | null;
  /** 2 décimales, ex. 0.0032 ; null ⇒ « — » (0 vue). */
  conversionRate?: number | null;
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
  // URL BRUTE : `layout()` échappe une seule fois pour le HTML, et la part
  // texte garde l'URL réelle (un `&amp;` affiché dans le plain-text serait un
  // bug). Échapper ici ET dans `layout()` produisait `&amp;amp;`.
  return `${site}${cleaned}`;
}

/**
 * Corps de message. Le `layout` est volontairement minimaliste : une table
 * d'une seule colonne, des balises inline, aucun `class`, aucun `style`
 * externe, aucune image, aucun script.
 */
function layout(heading: string, paragraphs: string[], link: string | null): { html: string; text: string } {
  // CTA « Ouvrir dans ReVends » : un VRAI bouton, pas un simple texte.
  //
  // Pourquoi des styles inline et une URL répétée en clair :
  //  - un `<a>` sans style est parfois rendu comme du texte inerte par certains
  //    clients mobiles (et le libellé seul ne donne aucune cible tactile) ;
  //  - la part `text/plain` n'est pas toujours linkifiée → l'URL doit rester
  //    visible, sur sa propre ligne, pour être tapée ou copiée.
  // Aucun CSS externe, aucune image, aucun script (CA-V5-007).
  const href = link === null ? null : escapeHtml(link);
  const htmlLink =
    href === null
      ? ''
      : '<p style="margin:0 0 10px;">' +
        `<a href="${href}" target="_blank" rel="noopener noreferrer" ` +
        'style="display:inline-block;background-color:#7A1B2E;color:#FFFFFF;' +
        'font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:bold;' +
        'line-height:20px;padding:12px 22px;border-radius:6px;text-decoration:none;">' +
        'Ouvrir dans ReVends</a></p>' +
        '<p style="margin:0 0 12px;font-size:13px;color:#6b7280;">' +
        'Lien direct : ' +
        `<a href="${href}" target="_blank" rel="noopener noreferrer" style="color:#7A1B2E;">${href}</a></p>`;
  const textLink = link === null ? '' : `\n\nOuvrir dans ReVends :\n${link}\n`;
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
 * Email d'annonce marketing (campagne « vendez ce que vous n'utilisez plus »).
 *
 * Volontairement séparé de `layout()` : un email d'annonce a besoin d'une mise
 * en page plus riche (panneau sombre, tuiles de chiffres, étapes numérotées)
 * pour porter la marque, là où les emails transactionnels restent minimalistes.
 *
 * Contraintes techniques identiques (CA-V5-007 / CA-V5-009) :
 * - tableaux + styles inline uniquement (aucun `<style>`, aucun CSS externe) ;
 * - aucune image distante (les clients mail les bloquent par défaut) ;
 * - les deux seuls liens pointent vers `SITE_URL` (aucun lien tiers) ;
 * - version texte équivalente, lisible sans HTML.
 */
function announcementLayout(primaryLink: string, secondaryLink: string): { html: string; text: string } {
  const cta = escapeHtml(primaryLink);
  const shop = escapeHtml(secondaryLink);
  const html =
    '<!doctype html><html lang="fr"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>Ce que vous n\'utilisez plus peut devenir de l\'argent</title></head>' +
    '<body style="margin:0;padding:0;background-color:#F1E9DC;">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F1E9DC;">' +
    '<tr><td align="center" style="padding:28px 12px;">' +
    '<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" ' +
    'style="width:100%;max-width:600px;background-color:#FFFDF9;border:1px solid #E6DED0;border-radius:16px;">' +
    '<tr><td style="height:5px;background-color:#B84D20;border-radius:16px 16px 0 0;font-size:0;line-height:0;">&nbsp;</td></tr>' +
    // En-tête de marque (texte uniquement : aucun logo distant à charger).
    '<tr><td style="padding:26px 34px 0;">' +
    '<div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:bold;letter-spacing:4px;color:#171513;text-transform:uppercase;">ReVendsen</div>' +
    '<div style="font-family:Georgia,\'Times New Roman\',serif;font-size:13px;font-style:italic;color:#7B6D5D;margin-top:6px;">La seconde vie a de la valeur.</div>' +
    '</td></tr>' +
    // Panneau sombre : accroche.
    '<tr><td style="padding:20px 34px 0;">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#171513;border-radius:14px;">' +
    '<tr><td style="padding:30px 28px 26px;">' +
    '<div style="font-family:Arial,Helvetica,sans-serif;font-size:10px;font-weight:bold;letter-spacing:2.5px;color:#DCC8A8;text-transform:uppercase;">Le bon réflexe</div>' +
    '<h1 style="margin:14px 0 12px;font-family:Georgia,\'Times New Roman\',serif;font-size:29px;line-height:1.24;color:#F7F3EC;font-weight:normal;">' +
    'Ce que vous n\'utilisez plus peut devenir de l\'argent.</h1>' +
    '<p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.65;color:#CFC4B8;">' +
    'Un téléphone qui dort dans un tiroir. Un sac porté deux fois. Un meuble qui encombre. ' +
    'Sur ReVendsen, chaque objet trouve une nouvelle maison — et vous encaissez.</p>' +
    '<div style="margin-top:18px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;color:#E08A5F;">' +
    'Publication gratuite&nbsp; ·&nbsp; 10&nbsp;% uniquement à la vente</div>' +
    '</td></tr></table>' +
    '</td></tr>' +
    // Trois chiffres clés.
    '<tr><td style="padding:22px 34px 0;">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>' +
    '<td width="33%" align="center" style="padding:14px 6px;border-top:1px solid #E6DED0;border-bottom:1px solid #E6DED0;">' +
    '<div style="font-family:Georgia,\'Times New Roman\',serif;font-size:21px;color:#171513;">0 FCFA</div>' +
    '<div style="font-family:Arial,Helvetica,sans-serif;font-size:10px;letter-spacing:0.6px;color:#7B6D5D;text-transform:uppercase;margin-top:5px;">pour publier</div></td>' +
    '<td width="33%" align="center" style="padding:14px 6px;border:1px solid #E6DED0;">' +
    '<div style="font-family:Georgia,\'Times New Roman\',serif;font-size:21px;color:#171513;">2 min</div>' +
    '<div style="font-family:Arial,Helvetica,sans-serif;font-size:10px;letter-spacing:0.6px;color:#7B6D5D;text-transform:uppercase;margin-top:5px;">pour être en ligne</div></td>' +
    '<td width="33%" align="center" style="padding:14px 6px;border-top:1px solid #E6DED0;border-bottom:1px solid #E6DED0;">' +
    '<div style="font-family:Georgia,\'Times New Roman\',serif;font-size:21px;color:#171513;">10&nbsp;%</div>' +
    '<div style="font-family:Arial,Helvetica,sans-serif;font-size:10px;letter-spacing:0.6px;color:#7B6D5D;text-transform:uppercase;margin-top:5px;">seulement à la vente</div></td>' +
    '</tr></table>' +
    '</td></tr>' +
    // Les trois étapes.
    '<tr><td style="padding:30px 34px 0;">' +
    '<div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:bold;letter-spacing:2px;color:#A9471F;text-transform:uppercase;">Comment vendre</div>' +
    '<div style="font-family:Georgia,\'Times New Roman\',serif;font-size:22px;color:#171513;margin:10px 0 18px;">Trois étapes, et c\'est parti.</div>' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">' +
    '<tr><td width="44" valign="top" style="padding-bottom:16px;">' +
    '<div style="width:30px;height:30px;line-height:30px;text-align:center;background-color:#F8E7DC;border-radius:15px;font-family:Georgia,\'Times New Roman\',serif;font-size:14px;color:#A9471F;">1</div></td>' +
    '<td valign="top" style="padding-bottom:16px;">' +
    '<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:bold;color:#171513;">Photographiez</div>' +
    '<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#5B4A3E;margin-top:3px;">' +
    'Deux ou trois photos nettes, une description honnête de l\'état. C\'est tout ce qu\'il faut.</div></td></tr>' +
    '<tr><td width="44" valign="top" style="padding-bottom:16px;">' +
    '<div style="width:30px;height:30px;line-height:30px;text-align:center;background-color:#F8E7DC;border-radius:15px;font-family:Georgia,\'Times New Roman\',serif;font-size:14px;color:#A9471F;">2</div></td>' +
    '<td valign="top" style="padding-bottom:16px;">' +
    '<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:bold;color:#171513;">Publiez</div>' +
    '<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#5B4A3E;margin-top:3px;">' +
    'Fixez votre prix en FCFA. Votre annonce est vérifiée par notre équipe, puis mise en ligne.</div></td></tr>' +
    '<tr><td width="44" valign="top">' +
    '<div style="width:30px;height:30px;line-height:30px;text-align:center;background-color:#F8E7DC;border-radius:15px;font-family:Georgia,\'Times New Roman\',serif;font-size:14px;color:#A9471F;">3</div></td>' +
    '<td valign="top">' +
    '<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:bold;color:#171513;">Encaissez</div>' +
    '<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#5B4A3E;margin-top:3px;">' +
    'Un acheteur est intéressé&nbsp;? Convenez de la remise, et recevez votre paiement.</div></td></tr>' +
    '</table>' +
    '</td></tr>' +
    // Réassurance.
    '<tr><td style="padding:14px 34px 0;">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F1E7D5;border-radius:12px;">' +
    '<tr><td style="padding:20px 22px;">' +
    '<div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:bold;letter-spacing:2px;color:#3A2923;text-transform:uppercase;">Pourquoi ReVendsen</div>' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">' +
    '<tr><td width="20" valign="top" style="padding-top:10px;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#2F6B4F;">&#10003;</td>' +
    '<td valign="top" style="padding-top:10px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.55;color:#3A2923;">' +
    'Une communauté sénégalaise, avec des acheteurs près de chez vous.</td></tr>' +
    '<tr><td width="20" valign="top" style="padding-top:8px;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#2F6B4F;">&#10003;</td>' +
    '<td valign="top" style="padding-top:8px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.55;color:#3A2923;">' +
    'Des annonces modérées, pour protéger acheteurs et vendeurs.</td></tr>' +
    '<tr><td width="20" valign="top" style="padding-top:8px;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#2F6B4F;">&#10003;</td>' +
    '<td valign="top" style="padding-top:8px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.55;color:#3A2923;">' +
    'Un paiement contrôlé par notre équipe, preuve à l\'appui.</td></tr>' +
    '<tr><td width="20" valign="top" style="padding-top:8px;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#2F6B4F;">&#10003;</td>' +
    '<td valign="top" style="padding-top:8px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.55;color:#3A2923;">' +
    'Publier ne coûte rien&nbsp;: 10&nbsp;% de commission seulement quand vous vendez.</td></tr>' +
    '</table>' +
    '</td></tr></table>' +
    '</td></tr>' +
    // Appel à l'action.
    '<tr><td style="padding:28px 34px 0;">' +
    '<div style="font-family:Georgia,\'Times New Roman\',serif;font-size:20px;line-height:1.4;color:#171513;margin-bottom:14px;">' +
    'Il y a sûrement un objet à vendre chez vous, dès aujourd\'hui.</div>' +
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>' +
    '<td style="background-color:#B84D20;border-radius:9px;">' +
    `<a href="${cta}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:15px 28px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:bold;color:#FFFFFF;text-decoration:none;border-radius:9px;">Publier mon article</a>` +
    '</td></tr></table>' +
    '<div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.6;color:#7B6D5D;margin-top:14px;">' +
    `Ou <a href="${shop}" target="_blank" rel="noopener noreferrer" style="color:#A9471F;text-decoration:underline;">parcourez le catalogue</a> pour voir ce qui se vend en ce moment.</div>` +
    '</td></tr>' +
    // Signature.
    '<tr><td style="padding:26px 34px 8px;">' +
    '<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#3A2923;">' +
    'À très vite,<br><strong>L\'équipe ReVendsen</strong></div>' +
    '</td></tr>' +
    // Pied de page : transparence + opt-out simple (réponse STOP).
    '<tr><td style="padding:18px 34px 28px;">' +
    '<div style="border-top:1px solid #E6DED0;padding-top:16px;font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:1.6;color:#8C7A6B;">' +
    'ReVendsen — Dakar, Sénégal · revendsen@gmail.com<br>' +
    'Vous recevez cet e-mail car vous avez un compte sur ReVendsen. ' +
    'Pour ne plus recevoir nos annonces, répondez simplement STOP à cet e-mail.<br>' +
    'Message automatique ReVendsen.' +
    '</div></td></tr>' +
    '</table>' +
    '</td></tr></table>' +
    '</body></html>';

  const text = [
    'REVENDSEN — La seconde vie a de la valeur.',
    '',
    'CE QUE VOUS N\'UTILISEZ PLUS PEUT DEVENIR DE L\'ARGENT.',
    '',
    'Un téléphone qui dort dans un tiroir. Un sac porté deux fois. Un meuble qui encombre.',
    'Sur ReVendsen, chaque objet trouve une nouvelle maison — et vous encaissez.',
    '',
    'Publication gratuite · 10 % uniquement à la vente.',
    '',
    'COMMENT VENDRE',
    '1. Photographiez — deux ou trois photos nettes, une description honnête de l\'état.',
    '2. Publiez — fixez votre prix en FCFA. Votre annonce est vérifiée, puis mise en ligne.',
    '3. Encaissez — convenez de la remise avec l\'acheteur et recevez votre paiement.',
    '',
    'POURQUOI REVENDSEN',
    '- Une communauté sénégalaise, avec des acheteurs près de chez vous.',
    '- Des annonces modérées, pour protéger acheteurs et vendeurs.',
    '- Un paiement contrôlé par notre équipe, preuve à l\'appui.',
    '- Publier ne coûte rien : 10 % de commission seulement quand vous vendez.',
    '',
    'Il y a sûrement un objet à vendre chez vous, dès aujourd\'hui.',
    '',
    'Publier mon article :',
    primaryLink,
    '',
    'Parcourir le catalogue :',
    secondaryLink,
    '',
    'À très vite,',
    'L\'équipe ReVendsen',
    '',
    '--',
    'ReVendsen — Dakar, Sénégal · revendsen@gmail.com',
    'Vous recevez cet e-mail car vous avez un compte sur ReVendsen. Pour ne plus recevoir nos annonces, répondez STOP.',
    'Message automatique ReVendsen.',
  ].join('\n');

  return { html, text };
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
    displayName: rawVars.displayName === undefined ? undefined : escapeHtml(rawVars.displayName),
    productCount: rawVars.productCount,
    milestone: rawVars.milestone,
    referralCode: rawVars.referralCode === undefined ? undefined : escapeHtml(rawVars.referralCode),
    amountFcfa: rawVars.amountFcfa,
    linkPath: rawVars.linkPath,
    planName: rawVars.planName === undefined ? undefined : escapeHtml(rawVars.planName),
    boutiqueName: rawVars.boutiqueName === undefined ? undefined : escapeHtml(rawVars.boutiqueName),
    period: rawVars.period === undefined ? undefined : escapeHtml(rawVars.period),
    viewsCount: rawVars.viewsCount,
    viewsLabel: rawVars.viewsLabel === undefined ? undefined : escapeHtml(rawVars.viewsLabel),
    salesCount: rawVars.salesCount,
    revenueFcfa: rawVars.revenueFcfa,
    netRevenueFcfa: rawVars.netRevenueFcfa,
    commissionFcfa: rawVars.commissionFcfa,
    avgBasketFcfa: rawVars.avgBasketFcfa,
    bestProductName: rawVars.bestProductName === undefined ? undefined : escapeHtml(rawVars.bestProductName),
    bestProductSales: rawVars.bestProductSales,
    conversionRate: rawVars.conversionRate,
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

    case 'phone_reset': {
      const { html, text } = layout(
        'Mettez à jour votre numéro WhatsApp',
        [
          para('ReVends est au Sénégal : votre numéro doit être au format +221, 9 chiffres commençant par 7 (ex. +221 77 123 45 67). Nous mettons à jour nos règles et nous vous demandons de ressaisir votre numéro.'),
          para('Cliquez sur le bouton ci-dessous, saisissez votre numéro WhatsApp actuel, puis enregistrez : le nouveau numéro remplacera l\'ancien.'),
          para('Ce lien est valable 7 jours et ne peut être utilisé qu\'une seule fois. Si vous n\'êtes pas à l\'origine de ce compte, ignorez ce message.'),
        ],
        link ?? internalLink('/'),
      );
      return { subject: 'Mettez à jour votre numéro WhatsApp', html, text };
    }

    case 'welcome': {
      const { html, text } = layout(
        'Bienvenue sur ReVends',
        [
          para(
            'Votre compte est créé. Vous pouvez maintenant publier vos articles et acheter auprès de la communauté.',
          ),
        ],
        link ?? internalLink('/'),
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
        link ?? internalLink('/mes-articles'),
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
        link ?? internalLink('/mes-articles'),
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
          para('Votre commande est bien enregistrée, mais elle n\'est PAS encore validée : le paiement doit être confirmé.'),
          order ? para('Commande :', `<strong>${order}</strong>`) : '',
          para('Envoyez votre preuve de paiement depuis la page de la commande, ou par WhatsApp. Dès validation par notre équipe, le vendeur sera prévenu et préparera l\'article.'),
        ].filter(Boolean),
        link,
      );
      return { subject: 'Votre commande est enregistrée — paiement en attente', html, text };
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

    case 'payment_instructions_buyer': {
      const { html, text } = layout(
        'Instructions de paiement',
        [
          para('Votre commande est en attente de paiement. Effectuez le paiement puis envoyez la capture (preuve) depuis votre commande.'),
          order ? para('Commande :', `<strong>${order}</strong>`) : '',
          vars.amountFcfa !== undefined
            ? para('Montant à régler :', `<strong>${escapeHtml(money(vars.amountFcfa))}</strong>`)
            : '',
          para('Tant que le paiement n\'est pas validé par notre équipe, la commande n\'est pas confirmée et le vendeur n\'est pas notifié.'),
        ].filter(Boolean),
        link,
      );
      return { subject: 'Instructions de paiement — ReVends', html, text };
    }

    case 'payment_proof_received_buyer': {
      const { html, text } = layout(
        'Votre preuve de paiement a été reçue',
        [
          para('Nous avons bien reçu votre preuve de paiement. Elle est en cours de vérification.'),
          order ? para('Commande :', `<strong>${order}</strong>`) : '',
          para('La commande ne sera confirmée qu\'après validation par notre équipe.'),
        ].filter(Boolean),
        link,
      );
      return { subject: 'Preuve de paiement reçue — vérification en cours', html, text };
    }

    case 'payment_proof_rejected_buyer': {
      const motif = vars.reason ? ` Motif : ${vars.reason}` : '';
      const { html, text } = layout(
        'Votre preuve de paiement a été refusée',
        [
          para(`La preuve de paiement transmise n\'a pas pu être validée.${motif}`),
          order ? para('Commande :', `<strong>${order}</strong>`) : '',
          para('Vous pouvez renvoyer une preuve lisible depuis la page de votre commande. Aucun débit ne sera effectué tant que le paiement n\'est pas confirmé.'),
        ].filter(Boolean),
        link,
      );
      return { subject: 'Preuve de paiement refusée — action requise', html, text };
    }

    case 'payment_proof_submitted_admin': {
      const { html, text } = layout(
        'Nouvelle preuve de paiement à vérifier',
        [
          para('Un acheteur a transmis une preuve de paiement. Elle doit être vérifiée avant toute notification au vendeur.'),
          order ? para('Commande :', `<strong>${order}</strong>`) : '',
          vars.amountFcfa !== undefined
            ? para('Montant :', `<strong>${escapeHtml(money(vars.amountFcfa))}</strong>`)
            : '',
        ].filter(Boolean),
        link ?? internalLink('/admin/commandes'),
      );
      return { subject: 'Nouvelle preuve de paiement à vérifier', html, text };
    }

    case 'product_submitted_admin': {
      const { html, text } = layout(
        'Nouvel article en attente de validation',
        [
          para('Un vendeur vient de soumettre un article. Il reste invisible au catalogue tant qu\'il n\'est pas approuvé.'),
          product ? para('Article :', `<strong>${product}</strong>`) : '',
          vars.amountFcfa !== undefined
            ? para('Prix :', `<strong>${escapeHtml(money(vars.amountFcfa))}</strong>`)
            : '',
          para('Ouvrez la fiche pour vérifier toutes les photos avant d\'approuver ou de refuser.'),
        ].filter(Boolean),
        link ?? internalLink('/admin/articles-en-attente'),
      );
      return { subject: 'Nouvel article en attente de validation', html, text };
    }

    case 'order_created_admin': {
      const { html, text } = layout(
        'Nouvelle commande enregistrée',
        [
          para('Une nouvelle commande vient d\'être créée. Elle n\'est PAS encore payée : le vendeur ne doit rien expédier avant validation du paiement.'),
          order ? para('Commande :', `<strong>${order}</strong>`) : '',
          product ? para('Article :', `<strong>${product}</strong>`) : '',
          vars.amountFcfa !== undefined
            ? para('Montant :', `<strong>${escapeHtml(money(vars.amountFcfa))}</strong>`)
            : '',
          para('Suivez la preuve de paiement depuis l\'espace admin.'),
        ].filter(Boolean),
        link ?? internalLink('/admin/commandes'),
      );
      return { subject: 'Nouvelle commande enregistrée', html, text };
    }

    case 'announcement_sell': {
      // Campagne marketing : les deux liens sont FIXES (formulaire de vente et
      // catalogue). On ignore volontairement `linkPath` : une annonce ne doit
      // jamais pouvoir être détournée vers un chemin fourni par un appelant.
      const primary = internalLink('/sell') ?? config.siteUrl;
      const secondary = internalLink('/shop') ?? config.siteUrl;
      const { html, text } = announcementLayout(primary, secondary);
      return { subject: 'Ce que vous n\'utilisez plus peut devenir de l\'argent', html, text };
    }

    case 'referral_program_launch': {
      // Campagne de parrainage : le lien reste INTERNE (`/parrainage`) et le
      // code personnel est affiché à part. On ne met PAS `?ref=` dans l'e-mail :
      // un vendeur déjà inscrit n'a rien à s'auto-attribuer, et le code affiché
      // est plus simple à partager à la voix ou par SMS.
      const code = (vars.referralCode ?? '').replace(/[^A-Za-z0-9]/g, '');
      const referralUrl = internalLink('/parrainage') ?? config.siteUrl;
      const { html, text } = referralLayout({
        displayName: vars.displayName ?? null,
        productCount: typeof vars.productCount === 'number' ? vars.productCount : null,
        referralUrl,
        code: code.length > 0 ? code : null,
      });
      return { subject: '10 amis, un mois de vitrine offert', html, text };
    }

    case 'referral_milestone': {
      const milestone = vars.milestone === 10 ? 10 : 5;
      const inCircle = milestone === 10;
      const { html, text } = layout(
        inCircle ? 'Bienvenue dans le Cercle des 10' : 'Vous êtes Ambassadeur ReVendsen',
        [
          para(
            inCircle
              ? 'Votre dixième filleul vient de faire publier son premier article. Vous entrez dans le Cercle des 10.'
              : 'Votre cinquième filleul vient de faire publier son premier article. Vous êtes désormais Ambassadeur ReVendsen.',
          ),
          para(
            inCircle
              ? 'Votre badge Ambassadeur est actif pour un an et votre Vitrine est ouverte pour 30 jours : vos annonces passent en tête du catalogue, votre badge s\'affiche sur vos fiches produit, et vos articles sont validés en priorité.'
              : 'Votre badge Ambassadeur est actif pour 30 jours et votre Vitrine est ouverte pour 7 jours : vos annonces passent en tête du catalogue et votre badge s\'affiche sur vos fiches produit.',
          ),
          para('Rien à activer : c\'est déjà en place.'),
          para('La commission reste à 10 %, due uniquement à la vente.'),
        ],
        link ?? internalLink('/parrainage') ?? internalLink('/'),
      );
      return {
        subject: inCircle ? 'Vous entrez dans le Cercle des 10' : 'Vous êtes Ambassadeur ReVendsen',
        html,
        text,
      };
    }

    case 'subscription_activated': {
      const plan = vars.planName ?? 'Hébergement Boutique';
      const { html, text } = layout(
        'Votre boutique est active',
        [
          para(`Votre abonnement ${plan} est activé : votre boutique est en ligne et vos articles éligibles peuvent être publiés directement.`),
          para('Votre badge de palier apparaît dès maintenant sur vos articles et votre fiche.'),
        ],
        link ?? internalLink('/mon-abonnement'),
      );
      return { subject: 'Votre boutique est active sur ReVends', html, text };
    }

    case 'subscription_expiry_reminder': {
      const plan = vars.planName ?? 'Hébergement Boutique';
      const { html, text } = layout(
        'Votre abonnement expire dans 3 jours',
        [
          para(`Votre abonnement ${plan} arrive à échéance dans 3 jours.`),
          para("À l'échéance : votre boutique passe en veille (annonces conservées, catalogue intact) et votre badge disparaît. Renouvelez-le depuis votre espace pour les conserver."),
        ],
        link ?? internalLink('/mon-abonnement'),
      );
      return { subject: 'Votre abonnement ReVends expire dans 3 jours', html, text };
    }

    case 'storefront_monthly_report': {
      const period = vars.period ?? 'ce mois-ci';
      const boutique = vars.boutiqueName ?? 'votre boutique';
      const viewsLabel = vars.viewsLabel ?? 'vues du mois';
      const views = typeof vars.viewsCount === 'number' ? MONEY(vars.viewsCount) : '—';
      const sales = typeof vars.salesCount === 'number' ? MONEY(vars.salesCount) : '—';
      const gross = typeof vars.revenueFcfa === 'number' ? money(vars.revenueFcfa) : '—';
      const net = typeof vars.netRevenueFcfa === 'number' ? money(vars.netRevenueFcfa) : '—';
      const commission = typeof vars.commissionFcfa === 'number' ? money(vars.commissionFcfa) : '—';
      const avg = vars.avgBasketFcfa == null ? '—' : money(vars.avgBasketFcfa);
      const best = vars.bestProductName
        ? `${vars.bestProductName}${vars.bestProductSales != null ? ` — ${MONEY(vars.bestProductSales)} vente(s)` : ''}`
        : '—';
      const conversion = vars.conversionRate == null ? '—' : `${(vars.conversionRate * 100).toFixed(2).replace('.', ',')} %`;
      const { html, text } = layout(
        `Votre bilan de ${period}`,
        [
          para(`Boutique : ${boutique}`),
          para(`Période : ${period}`),
          para(`${viewsLabel} : ${views}`),
          para(`Ventes : ${sales}`),
          para(`CA brut : ${gross}`),
          para(`CA net (vendeur) : ${net}`),
          para(`Commission ReVends (10 %) : ${commission}`),
          para(`Panier moyen : ${avg}`),
          para(`Meilleur article : ${best}`),
          para(`Taux de conversion (vues → ventes) : ${conversion}`),
        ],
        link ?? internalLink('/mon-abonnement'),
      );
      return { subject: `Votre bilan ReVends de ${period} — ${boutique}`, html, text };
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

/**
 * Campagne « Le Cercle des 10 » — gabarit marketing dédié.
 *
 * Même charte que l'annonce de vente (fond ivoire, panneau sombre, accents
 * terre cuite) mais un objectif différent : faire partager un lien. Aucune
 * image distante, aucun CSS externe, aucun script — les clients mail
 * (Gmail, Outlook) affichent donc la mise en page telle quelle.
 */
function referralLayout(opts: {
  displayName: string | null;
  productCount: number | null;
  referralUrl: string;
  /** Code personnel (`RV…`) — nul si absent : on n'affiche alors pas la ligne. */
  code: string | null;
}): { html: string; text: string } {
  const { displayName, productCount, referralUrl, code } = opts;
  const hello = displayName ? `Bonjour ${displayName},` : 'Bonjour,';
  const articles =
    productCount === null || productCount <= 0
      ? 'Merci de faire vivre ReVendsen.'
      : productCount === 1
        ? 'Votre article est en ligne sur ReVendsen. Merci — c\'est grâce à des vendeurs comme vous que la marketplace grandit.'
        : `Vos ${productCount} articles sont en ligne sur ReVendsen. Merci — c'est grâce à des vendeurs comme vous que la marketplace grandit.`;
  const cta = escapeHtml(referralUrl);
  const brand = 'ReVendsen';

  const html =
    '<!doctype html><html lang="fr"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    "<title>10 amis, un mois de vitrine offert</title></head>" +
    '<body style="margin:0;padding:0;background-color:#F1E9DC;">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F1E9DC;">' +
    '<tr><td align="center" style="padding:28px 12px;">' +
    '<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" ' +
    'style="width:100%;max-width:600px;background-color:#FFFDF9;border:1px solid #E6DED0;border-radius:16px;">' +
    '<tr><td style="height:5px;background-color:#B84D20;border-radius:16px 16px 0 0;font-size:0;line-height:0;">&nbsp;</td></tr>' +
    '<tr><td style="padding:26px 34px 0;">' +
    `<div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:bold;letter-spacing:4px;color:#171513;text-transform:uppercase;">${brand}</div>` +
    '<div style="font-family:Georgia,\'Times New Roman\',serif;font-size:13px;font-style:italic;color:#7B6D5D;margin-top:6px;">La seconde vie a de la valeur.</div>' +
    '</td></tr>' +
    '<tr><td style="padding:20px 34px 0;">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#171513;border-radius:14px;">' +
    '<tr><td style="padding:30px 28px 26px;">' +
    '<div style="font-family:Arial,Helvetica,sans-serif;font-size:10px;font-weight:bold;letter-spacing:2.5px;color:#DCC8A8;text-transform:uppercase;">Le Cercle des 10</div>' +
    '<h1 style="margin:14px 0 12px;font-family:Georgia,\'Times New Roman\',serif;font-size:29px;line-height:1.24;color:#F7F3EC;font-weight:normal;">' +
    'Dix amis. Un mois de vitrine offert.</h1>' +
    '<p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.65;color:#CFC4B8;">' +
    `${escapeHtml(hello)} ${escapeHtml(articles)}</p>` +
    '<div style="margin-top:18px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;color:#E08A5F;">' +
    'Invitez des vendeurs&nbsp; ·&nbsp; 10 filleuls validés&nbsp; ·&nbsp; badge + Vitrine 30 jours</div>' +
    '</td></tr></table>' +
    '</td></tr>' +
    '<tr><td style="padding:26px 34px 0;">' +
    '<div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:bold;letter-spacing:2px;color:#A9471F;text-transform:uppercase;">Comment ça marche</div>' +
    '<div style="font-family:Georgia,\'Times New Roman\',serif;font-size:22px;color:#171513;margin:10px 0 18px;">Trois étapes, un lien.</div>' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">' +
    '<tr><td width="44" valign="top" style="padding-bottom:14px;"><div style="width:30px;height:30px;line-height:30px;text-align:center;background-color:#F8E7DC;border-radius:15px;font-family:Georgia,\'Times New Roman\',serif;font-size:14px;color:#A9471F;">1</div></td>' +
    '<td valign="top" style="padding-bottom:14px;"><div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:bold;color:#171513;">Partagez votre lien</div>' +
    '<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#5B4A3E;margin-top:3px;">Envoyez-le à des personnes qui ont des articles à vendre, autour de vous.</div></td></tr>' +
    '<tr><td width="44" valign="top" style="padding-bottom:14px;"><div style="width:30px;height:30px;line-height:30px;text-align:center;background-color:#F8E7DC;border-radius:15px;font-family:Georgia,\'Times New Roman\',serif;font-size:14px;color:#A9471F;">2</div></td>' +
    '<td valign="top" style="padding-bottom:14px;"><div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:bold;color:#171513;">Votre filleul publie</div>' +
    '<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#5B4A3E;margin-top:3px;">Il crée son compte, vérifie son numéro +221 et fait approuver un premier article : le filleul est validé.</div></td></tr>' +
    '<tr><td width="44" valign="top"><div style="width:30px;height:30px;line-height:30px;text-align:center;background-color:#F8E7DC;border-radius:15px;font-family:Georgia,\'Times New Roman\',serif;font-size:14px;color:#A9471F;">3</div></td>' +
    '<td valign="top"><div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:bold;color:#171513;">Vous entrez dans le Cercle</div>' +
    '<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#5B4A3E;margin-top:3px;">À 10 filleuls validés, le badge et la Vitrine sont activés automatiquement.</div></td></tr>' +
    '</table>' +
    '</td></tr>' +
    '<tr><td style="padding:22px 34px 0;">' +
    '<div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:bold;letter-spacing:2px;color:#3A2923;text-transform:uppercase;margin-bottom:10px;">Ce que vous gagnez</div>' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>' +
    '<td width="46%" valign="top" style="padding:16px;border:1px solid #E6DED0;border-radius:12px;">' +
    '<div style="font-family:Georgia,\'Times New Roman\',serif;font-size:20px;color:#171513;">5 filleuls</div>' +
    '<div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.55;color:#5B4A3E;margin-top:6px;">Badge Ambassadeur 30 jours + Vitrine 7 jours.</div></td>' +
    '<td width="8%" style="font-size:0;line-height:0;">&nbsp;</td>' +
    '<td width="46%" valign="top" style="padding:16px;background-color:#F1E7D5;border-radius:12px;">' +
    '<div style="font-family:Georgia,\'Times New Roman\',serif;font-size:20px;color:#171513;">10 filleuls</div>' +
    '<div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.55;color:#3A2923;margin-top:6px;">Badge Ambassadeur 1 an + <strong>Vitrine 30 jours</strong> : annonces en tête du catalogue, badge sur vos fiches, validation prioritaire.</div></td>' +
    '</tr></table>' +
    '</td></tr>' +
    '<tr><td style="padding:18px 34px 0;">' +
    '<div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.65;color:#7B6D5D;">' +
    'Les règles, sans astérisque : un filleul validé = un compte avec numéro +221 vérifié et un article approuvé. Une seule récompense par vendeur. Offre ouverte jusqu\'au <strong>16 décembre 2026</strong>. La commission reste à 10&nbsp;%, due uniquement à la vente.' +
    '</div></td></tr>' +
    '<tr><td style="padding:26px 34px 0;">' +
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>' +
    '<td style="background-color:#B84D20;border-radius:9px;">' +
    `<a href="${cta}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:15px 28px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:bold;color:#FFFFFF;text-decoration:none;border-radius:9px;">Découvrir mon lien de parrainage</a>` +
    '</td></tr></table>' +
    `<div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;color:#7B6D5D;margin-top:12px;">Ou copiez ce lien : <span style="color:#A9471F;">${cta}</span></div>` +
    (code === null
      ? ''
      : `<div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;color:#7B6D5D;margin-top:8px;">Votre code personnel : <strong style="color:#171513;letter-spacing:1px;">${escapeHtml(code)}</strong> — vos filleuls peuvent aussi le saisir à l'inscription.</div>`) +
    '</td></tr>' +
    '<tr><td style="padding:24px 34px 0;">' +
    '<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#3A2923;">' +
    'Pas 10 amis sous la main&nbsp;? Le palier 5 existe exactement pour ça — et il donne déjà le badge.<br><br>' +
    'À très vite,<br><strong>Idrissa, fondateur de ReVendsen</strong><br>' +
    '<span style="color:#7B6D5D;font-size:13px;">revendsen@gmail.com</span></div>' +
    '</td></tr>' +
    '<tr><td style="padding:18px 34px 28px;">' +
    '<div style="border-top:1px solid #E6DED0;padding-top:16px;font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:1.6;color:#8C7A6B;">' +
    'ReVendsen — Dakar, Sénégal · revendsen@gmail.com<br>' +
    'Vous recevez cet e-mail parce que vous avez publié un article sur ReVendsen. ' +
    'Pour ne plus recevoir nos offres, répondez simplement STOP à cet e-mail.<br>' +
    'Message automatique ReVendsen.' +
    '</div></td></tr>' +
    '</table>' +
    '</td></tr></table>' +
    '</body></html>';

  const text = [
    'REVENDSEN — La seconde vie a de la valeur.',
    '',
    'LE CERCLE DES 10 — DIX AMIS, UN MOIS DE VITRINE OFFERT.',
    '',
    unescapeHtml(hello),
    unescapeHtml(articles),
    '',
    'COMMENT ÇA MARCHE',
    '1. Partagez votre lien avec des personnes qui ont des articles à vendre.',
    '2. Votre filleul crée son compte, vérifie son numéro +221 et fait approuver un premier article.',
    '3. À 10 filleuls validés, le badge et la Vitrine sont activés automatiquement.',
    '',
    'CE QUE VOUS GAGNEZ',
    '- 5 filleuls : badge Ambassadeur 30 jours + Vitrine 7 jours.',
    '- 10 filleuls : badge Ambassadeur 1 an + Vitrine 30 jours (annonces en tête du catalogue, badge sur vos fiches, validation prioritaire).',
    '',
    'Les règles, sans astérisque : un filleul validé = un compte avec numéro +221 vérifié et un article approuvé.',
    'Une seule récompense par vendeur. Offre ouverte jusqu\'au 16 décembre 2026.',
    'La commission reste à 10 %, due uniquement à la vente.',
    '',
    'Découvrir mon lien de parrainage :',
    referralUrl,
    '',
    ...(code === null ? [] : [`Votre code personnel : ${code} — vos filleuls peuvent aussi le saisir à l'inscription.`, '']),
    'Pas 10 amis sous la main ? Le palier 5 existe exactement pour ça — et il donne déjà le badge.',
    '',
    'À très vite,',
    'Idrissa, fondateur de ReVendsen',
    'revendsen@gmail.com',
    '',
    '--',
    'ReVendsen — Dakar, Sénégal · revendsen@gmail.com',
    'Vous recevez cet e-mail parce que vous avez publié un article sur ReVendsen. Pour ne plus recevoir nos offres, répondez STOP.',
    'Message automatique ReVendsen.',
  ].join('\n');

  return { html, text };
}
