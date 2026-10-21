/** Formatage — FCFA entiers, dates ISO 8601 (§1.1 du contrat d'API). */

/** 250000 → "250 000 FCFA" */
export function formatFcfa(amount: number): string {
  return `${new Intl.NumberFormat('fr-FR').format(amount)} FCFA`
}

/** 250000 → "250 000" */
export function formatNumber(n: number): string {
  return new Intl.NumberFormat('fr-FR').format(n)
}

/**
 * Pourcentage de réduction arrondi à l'entier, ou null si non applicable.
 * Ex. (4500, 5000) → 10 ; (4500, 4500) → null (pas de réduction) ; (null, …) → null.
 * Utilisé par le badge « -X % » de la carte produit (spec §3.3) et la fiche (CA-ACC-55).
 */
export function formatDiscountPct(price: number, oldPrice: number | null | undefined): number | null {
  if (!oldPrice || oldPrice <= price || price <= 0) return null
  return Math.round((1 - price / oldPrice) * 100)
}

/** ISO → "19/09/2026" */
export function formatDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

/** ISO → "19/09/2026 14:30" */
export function formatDateTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** Date du jour en français pour les dashboards : "Lundi 19 septembre 2026" */
export function formatToday(): string {
  return new Date().toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

/** Délai relatif court : "Il y a 2 heures", "Hier", "Il y a 2 jours" (maquette) */
export function timeAgo(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const minutes = Math.floor(diffMs / 60000)
  if (minutes < 1) return "À l'instant"
  if (minutes < 60) return `Il y a ${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `Il y a ${hours} h`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'Hier'
  if (days < 30) return `Il y a ${days} jours`
  const months = Math.floor(days / 30)
  if (months < 12) return `Il y a ${months} mois`
  const years = Math.floor(months / 12)
  return `Il y a ${years} an${years > 1 ? 's' : ''}`
}

/** Durée restante d'une réservation (ex. "12 min") — compte à rebours CA-CAT03-03 */
export function formatCountdown(untilIso: string): string {
  const until = new Date(untilIso)
  const now = new Date()
  const diffMs = until.getTime() - now.getTime()
  if (diffMs <= 0) return 'Expirée'
  const minutes = Math.ceil(diffMs / 60000)
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  return `${hours} h ${minutes % 60} min`
}