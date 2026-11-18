/**
 * Helpers V8 — « Hébergement Boutique ».
 *
 * Fonctions pures (vitest, sans réseau) : masquage de la référence de
 * paiement (vue admin), libellés FR des méthodes, libellé de période,
 * comptage graphèmes (Intl.Segmenter), validation côté client des
 * identifiants de paiement (le serveur arbitre — double vérification).
 *
 * Aucun code métier ici ne remplace une règle serveur : ce sont des hints.
 */

/** Méthodes de paiement acceptées à la souscription (V8-D8, E1). */
export type PaymentMethod = 'wave' | 'orange_money' | 'virement'

export const PAYMENT_METHODS: readonly PaymentMethod[] = ['wave', 'orange_money', 'virement']

const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  wave: 'Wave',
  orange_money: 'Orange Money',
  virement: 'Virement bancaire',
}

/** « wave » → « Wave ». Valeur inconnue/null → « — » (jamais un code technique). */
export function paymentMethodLabel(method: string | null | undefined): string {
  if (!method) return '—'
  return PAYMENT_METHOD_LABELS[method as PaymentMethod] ?? '—'
}

/**
 * Référence de paiement MASQUÉE pour la file admin (CA-V8-055, V8-D8).
 * L'exemple de consigne « WAVE-2026-0…123 » vient de « WAVE-2026-01123 » :
 * préfixe conservé (≤ 11 car.) + « … » + 3 derniers caractères.
 * Aucun autre affichage de la référence complète n'est autorisé.
 */
export function safeReference(reference: string | null | undefined): string {
  const ref = (reference ?? '').trim()
  if (!ref) return 'référence absente'
  if (ref.length <= 7) return '••••••'
  const keep = Math.min(11, Math.max(4, ref.length - 4))
  return `${ref.slice(0, keep).trimEnd()}…${ref.slice(-3).trimStart()}`
}

/** « 2026-11 » → « novembre 2026 » (fuseau UTC, première lettre capitale). */
export function formatMonthPeriod(period: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(period)
  if (!match) return period
  const year = Number(match[1])
  const month = Number(match[2])
  if (month < 1 || month > 12) return period
  const label = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(Date.UTC(year, month - 1, 1)),
  )
  return label.charAt(0).toUpperCase() + label.slice(1)
}

/** Comptage en graphèmes (👨‍👩‍👧 = 1). `Intl.Segmenter` si disponible, sinon `Array.from` (points de code). */
export function graphemeCount(text: string): number {
  if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
    const segmenter = new Intl.Segmenter('fr', { granularity: 'grapheme' })
    let count = 0
    for (const _ of segmenter.segment(text)) count += 1
    return count
  }
  return Array.from(text).length
}

/** Regex de la référence (contrat v2.8, E1) : 4–64 car., pas de CR/LF/<>. */
export const PAYMENT_REFERENCE_RE = /^[A-Za-z0-9][A-Za-z0-9 .\-_/]{2,62}$/

export interface PaymentFields {
  paymentMethod: string
  paymentReference: string
}

export interface PaymentFieldErrors {
  paymentMethod?: string
  paymentReference?: string
}

/**
 * Validation côté client — le serveur reste l'arbitre (codes E1).
 * Retourne {} si tout est bon ; sinon des messages FR affichables.
 */
export function validatePaymentFields(input: PaymentFields): PaymentFieldErrors {
  const errors: PaymentFieldErrors = {}
  if (!PAYMENT_METHODS.includes(input.paymentMethod as PaymentMethod)) {
    errors.paymentMethod = 'Choisissez votre mode de paiement : Wave, Orange Money ou virement.'
  }
  const ref = input.paymentReference.trim()
  if (ref.length === 0) {
    errors.paymentReference = 'Indiquez la référence de votre paiement (obligatoire).'
  } else if (ref.length < 4) {
    errors.paymentReference = 'La référence doit contenir au moins 4 caractères.'
  } else if (ref.length > 64) {
    errors.paymentReference = 'La référence ne peut pas dépasser 64 caractères.'
  } else if (!PAYMENT_REFERENCE_RE.test(ref)) {
    errors.paymentReference =
      'Référence invalide — lettres, chiffres, espaces, tirets, points, slashes ou « _ » uniquement.'
  }
  return errors
}

/** Delta en pourcentage vs le mois précédent, arrondi à l'entier. Null si non calculable (précédent nul/absent). */
export function deltaPct(current: number, previous: number | null | undefined): number | null {
  if (previous === null || previous === undefined || previous === 0) return null
  return Math.round(((current - previous) / previous) * 100)
}

export function formatDeltaPct(delta: number | null): string {
  if (delta === null) return '—'
  const sign = delta > 0 ? '+' : delta < 0 ? '−' : ''
  return `${sign}${Math.abs(delta)} %`
}

/** Âge lisible « hh:mm » depuis une date ISO — pour la SLA 24h des demandes PENDING. */
export function formatRemainingAge(iso: string, nowMs: number = Date.now()): string {
  const start = new Date(iso).getTime()
  if (!Number.isFinite(start)) return 'âge inconnu'
  const diffMs = Math.max(0, nowMs - start)
  const hours = Math.floor(diffMs / (3_600_000))
  const minutes = Math.floor((diffMs % 3_600_000) / 60_000)
  if (hours < 1) return `${minutes} min`
  return `${hours}h${String(minutes).padStart(2, '0')}`
}

/** Vrai si la date ISO a dépassé le seuil en heures. */
export function isOlderThanHours(iso: string, thresholdHours: number, nowMs: number = Date.now()): boolean {
  const start = new Date(iso).getTime()
  if (!Number.isFinite(start)) return false
  return nowMs - start >= thresholdHours * 3_600_000
}

/** > 24h : SLA dépassé (R-V8-03/PO-V8-06-like). */
export const SLA_AGE_THRESHOLD_HOURS = 24

/** Plusieurs fois « en retard SLA » si ancien. */
export function isSlaBreach(iso: string): boolean {
  return isOlderThanHours(iso, SLA_AGE_THRESHOLD_HOURS)
}
