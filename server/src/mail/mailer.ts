import nodemailer, { type Transporter } from 'nodemailer';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { renderTemplate, type MailEvent, type TemplateVars } from './templates.js';

/**
 * Unique interface d'envoi de courriel de l'application (CA-V5-001).
 *
 * `grep -rn "createTransport\|nodemailer\|sendgrid\|mailgun" src/` ne doit
 * retourner QUE ce fichier : aucun service métier n'envoie d'e-mail
 * directement, tous passent par `sendMail()`.
 *
 * Trois fois le principe P8 — **un échec d'envoi ne fait jamais échouer une
 * action métier** :
 * 1. `sendMail` ne lève JAMAIS (toute erreur est capturée, journalisée, et la
 *    fonction retourne `false`) ;
 * 2. les appels se font APRÈS le commit (voir `afterCommit` dans les
 *    services) : un rollback n'envoie rien (CA-V5-003) ;
 * 3. en test, le transport est neutre : aucun réseau, aucun SMTP, aucun
 *    accès disque (CA-V5-015).
 */

/** Mode de transport effectif, journalisé à chaque envoi (CA-V5-013). */
export type MailTransportKind = 'smtp' | 'json' | 'console' | 'disabled';

/**
 * Bornes de temps du transport SMTP (millisecondes).
 *
 * Sans elles, Nodemailer applique des valeurs très hautes (jusqu'à 10 min sur
 * `socketTimeout`) : un SMTP lent bloquerait le worker d'une instance API
 * pendant tout ce temps. Une notification transactionnelle n'a aucune raison
 * de durer plus de quelques secondes.
 */
const SMTP_CONNECTION_TIMEOUT_MS = 10_000;
const SMTP_GREETING_TIMEOUT_MS = 10_000;
const SMTP_SOCKET_TIMEOUT_MS = 20_000;

/**
 * Nombre de tentatives totales (1 envoi + 1 reprise) et délai avant reprise.
 * On ne rejoue QUE les erreurs de transport (le message n'a pas été remis) :
 * rejouer une erreur applicative 5xx de SendGrid risquerait un doublon.
 */
const MAX_ATTEMPTS = 2;
const RETRY_DELAY_MS = 250;

/** Erreurs de transport considérées comme rejouables (le message n'est pas parti). */
const RETRYABLE_CODES = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'ESOCKET',
  'EDNS',
  'EPROTOCOL',
  'EAI_AGAIN',
]);

export interface SentMail {
  event: MailEvent;
  to: string;
  subject: string;
  transport: MailTransportKind;
  ok: boolean;
}

/**
 * Journal d'envoi en mémoire : le seul moyen pour les tests d'observer ce qui
 * a été « envoyé » sans réseau ni disque (CA-V5-015). Borné à 200 entrées pour
 * ne pas croître indéfiniment en cas de serveur long-running.
 */
const sentLog: SentMail[] = [];
const SENT_LOG_MAX = 200;

/** Derniers envois (copie défensive) — réservé aux tests. */
export function recentSentMails(): SentMail[] {
  return sentLog.slice();
}

/** Vide le journal — réservé aux tests (isolation). */
export function clearSentMails(): void {
  sentLog.length = 0;
}

let transporter: Transporter | null = null;
let transportKind: MailTransportKind = 'disabled';
/** Transport construit pour le mode courant — invalidé si `MAIL_ENABLED` change. */
let builtForEnabled: boolean | null = null;

function isTestEnv(): boolean {
  return process.env.NODE_ENV === 'test';
}

/**
 * L'envoi est-il actif ?
 *
 * On lit `process.env` à l'appel plutôt que `config.mail.enabled`, figé au
 * chargement du module. C'est délibéré et c'est ce qui rend la suite de tests
 * possible : `config.ts` est évalué avant que le test ait pu activer
 * `MAIL_ENABLED`, et la source de vérité reste bien l'unique variable
 * d'environnement MAINTENUE (aucun `if (NODE_ENV === 'test')` dispersé dans
 * le code métier — CA-V5-016).
 */
function isEnabled(): boolean {
  return process.env.MAIL_ENABLED === 'true';
}

/**
 * Construit le transport une SEULE FOIS et le réutilise (doc officielle
 * Nodemailer : « create the transporter once and reuse it for all emails » —
 * sinon on ouvre une connexion réseau par message).
 *
 * - **production + activé** → SMTP réel, configuré uniquement par variables
 *   d'environnement (CA-V5-006) ;
 * - **test** → `jsonTransport` : aucun réseau, aucun disque, et le message
 *   généré reste vérifiable (CA-V5-015) ;
 * - **développement** → `jsonTransport` + journalisation console : jamais de
 *   SMTP réel, et le serveur démarre sans aucune variable mail (CA-V5-005).
 */
function getTransporter(): { transporter: Transporter; kind: MailTransportKind } {
  const enabled = isEnabled();
  // Un changement de `MAIL_ENABLED` (test) invalide le transport mémorisé.
  if (transporter && builtForEnabled === enabled) return { transporter, kind: transportKind };
  builtForEnabled = enabled;

  if (!enabled) {
    // `disabled` reste un transport valide : `sendMail` ne fait rien et
    // retourne un succès, ce qui évite un branchement null partout.
    transportKind = 'disabled';
    transporter = nodemailer.createTransport({ jsonTransport: true });
    return { transporter, kind: transportKind };
  }

  if (config.isProduction) {
    transportKind = 'smtp';
    transporter = nodemailer.createTransport({
      host: config.mail.host,
      port: config.mail.port,
      // `secure` = TLS direct (port 465) ; sinon STARTTLS est utilisé par
      // Nodemailer automatiquement sur le port submission (587).
      secure: config.mail.secure,
      auth: { user: config.mail.user, pass: config.mail.password },
      // Bornes explicites : jamais de worker bloqué sur un SMTP muet.
      connectionTimeout: SMTP_CONNECTION_TIMEOUT_MS,
      greetingTimeout: SMTP_GREETING_TIMEOUT_MS,
      socketTimeout: SMTP_SOCKET_TIMEOUT_MS,
    });
    return { transporter, kind: transportKind };
  }

  // Dev : jsonTransport, aucune connexion sortante.
  transportKind = isTestEnv() ? 'json' : 'console';
  transporter = nodemailer.createTransport({ jsonTransport: true });
  return { transporter, kind: transportKind };
}

/**
 * Envoie un email transactionnel. **NE LÈVE JAMAIS** (principe P8).
 *
 * @param userId destinataire, résolu par identifiant dans la base — jamais
 *   depuis le corps de requête (CA-V5-011, anti-spam).
 * @returns `true` si l'envoi a réussi, `false` sinon. L'action métier ignore
 *   ce booléen : elle a déjà été validée en base.
 */
export async function sendMail(userId: number, to: string | null, event: MailEvent, vars: TemplateVars = {}): Promise<boolean> {
  // CA-V5-012 : le compte a disparu entre la résolution et l'envoi (ou n'a pas
  // d'adresse) → on IGNORE et on JOURNALISE, l'action métier réussit.
  if (!to) {
    logger.warn('email ignoré (aucune adresse)', { event, userId });
    return false;
  }
  if (!isEnabled()) {
    // Commutateur global coupé (CA-V5-016) : on journalise et on sort.
    logger.info('email désactivé (MAIL_ENABLED=false)', { event, userId, subject: subjectOf(event) });
    return false;
  }

  const content = renderTemplate(event, vars);
  const { transporter: t, kind } = getTransporter();

  let lastReason = '';
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const startedAt = Date.now();
    try {
      await t.sendMail({
        from: config.mail.from,
        to,
        subject: content.subject,
        text: content.text,
        html: content.html,
      });
      // CA-V5-013 : type d'événement, id destinataire, sujet, transporteur.
      // JAMAIS le corps complet, JAMAIS le mot de passe SMTP, JAMAIS l'adresse
      // e-mail du destinataire (donnée personnelle — RG-V5-07).
      logger.info('email envoyé', {
        event,
        userId,
        subject: content.subject,
        transport: kind,
        attempt,
        durationMs: Date.now() - startedAt,
      });
      pushSent({ event, to, subject: content.subject, transport: kind, ok: true });
      return true;
    } catch (err) {
      lastReason = err instanceof Error ? err.message : String(err);
      const code = (err as { code?: string } | null)?.code ?? '';
      const retryable = kind === 'smtp' && RETRYABLE_CODES.has(code) && attempt < MAX_ATTEMPTS;
      logger.warn("tentative d'envoi d'email échouée", {
        event,
        userId,
        transport: kind,
        attempt,
        code: code || undefined,
        retryable,
        durationMs: Date.now() - startedAt,
      });
      if (!retryable) break;
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    }
  }

  // P8 : on journalise, on n'Avale PAS l'action métier.
  logger.error("échec d'envoi d'email", {
    event,
    userId,
    transport: kind,
    attempts: MAX_ATTEMPTS,
    errorMessage: lastReason,
  });
  pushSent({ event, to, subject: content.subject, transport: kind, ok: false });
  return false;
}

function subjectOf(event: MailEvent): string {
  // Sujet affiché dans le journal d'un envoi désactivé : on ne construit pas
  // le HTML complet pour ça (coût inutile sur un chemin non fonctionnel).
  const map: Record<MailEvent, string> = {
    welcome: 'Bienvenue sur ReVends',
    product_approved: 'Votre article est approuvé',
    product_rejected: 'Votre article a été refusé',
    order_created_buyer: 'Votre commande est enregistrée',
    payment_confirmed_buyer: 'Votre paiement est confirmé',
    payment_confirmed_seller: 'Un acheteur a payé votre article',
    order_shipped: 'Votre colis est prêt',
    order_delivered: 'Votre commande est livrée',
    payout_available: 'Votre paiement vendeur est disponible',
    payout_paid: 'Votre paiement vendeur a été versé',
    reservation_expired_buyer: 'Votre réservation a expiré',
    article_reserved: 'Votre article a été réservé',
    order_product_received: 'Votre produit a été réceptionné',
    order_cancelled: 'Votre commande a été annulée',
    order_completed_buyer: 'Votre commande est terminée',
    password_reset: 'Réinitialisation de votre mot de passe',
    reservation_expired_seller: 'La réservation d\'un de vos articles a expiré',
  };
  return map[event];
}

function pushSent(entry: SentMail): void {
  sentLog.push(entry);
  if (sentLog.length > SENT_LOG_MAX) sentLog.shift();
}
