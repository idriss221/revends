/**
 * Tests unitaires — formatage & dates (src/lib/format.ts).
 * Reproduit les exigences d'affichage de la maquette (§7.3, puces « FCFA »).
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { formatFcfa, formatNumber, formatDate, formatDateTime, timeAgo, formatCountdown, formatDiscountPct } from './format'

/** `Intl` fr-FR utilise l'espace fine \u202f pour les milliers — normalisation. */
function norm(s: string): string {
  return s.replace(/\u202f/g, ' ')
}

describe('formatFcfa / formatNumber (§7.3 — montants entiers)', () => {
  afterEach(() => vi.useRealTimers())

  it('formate un montant FCFA sans décimale', () => {
    expect(norm(formatFcfa(250_000))).toBe('250 000 FCFA')
    expect(norm(formatFcfa(10_000_000))).toBe('10 000 000 FCFA')
  })
  it("gère 0 et les valeurs minimales de l'API (500)", () => {
    expect(norm(formatFcfa(0))).toBe('0 FCFA')
    expect(norm(formatFcfa(500))).toBe('500 FCFA')
  })
  it('formatNumber gère un grand entier', () => {
    expect(norm(formatNumber(1_234_567))).toBe('1 234 567')
  })
  it('ne tombe pas sur des montants NULS/absents (défense UI)', () => {
    // @ts-expect-error — invoquer avec undefined simule une donnée API manquante
    expect(() => formatFcfa(undefined)).not.toThrow()
  })
})

describe('formatDate / formatDateTime (ISO 8601 → fr-FR)', () => {
  // Date construite en heure LOCALE : le rendu est indépendant du fuseau.
  const iso = new Date(2026, 8, 19, 14, 30).toISOString()

  it('formate une date au format JJ/MM/AAAA', () => {
    expect(formatDate(iso)).toBe('19/09/2026')
  })
  it('formate date + heure', () => {
    const s = formatDateTime(iso)
    expect(s.startsWith('19/09/2026')).toBe(true)
    expect(/\d{2}:\d{2}$/.test(s)).toBe(true)
  })
  it('renvoie la chaîne brute si l’ISO est invalide (gardien UI)', () => {
    expect(formatDate('pas-une-date')).toBe('pas-une-date')
    expect(formatDateTime('')).toBe('')
  })
})

describe('timeAgo (délai relatif — maquette)', () => {
  const now = new Date(2026, 8, 20, 12, 0, 0)

  afterEach(() => vi.useRealTimers())

  it('classifie les différents âges', () => {
    vi.useFakeTimers()
    vi.setSystemTime(now)
    const ago = (ms: number) => new Date(now.getTime() - ms).toISOString()

    expect(norm(timeAgo(ago(30_000)))).toBe("À l'instant")
    expect(timeAgo(ago(5 * 60_000))).toBe('Il y a 5 min')
    expect(timeAgo(ago(3 * 3_600_000))).toBe('Il y a 3 h')
    expect(timeAgo(ago(24 * 3_600_000))).toBe('Hier')
    expect(timeAgo(ago(5 * 24 * 3_600_000))).toBe('Il y a 5 jours')
    expect(timeAgo(ago(62 * 24 * 3_600_000))).toBe('Il y a 2 mois')
    expect(timeAgo(ago(730 * 24 * 3_600_000))).toBe('Il y a 2 ans')
    expect(timeAgo(ago(365 * 24 * 3_600_000))).toBe('Il y a 1 an')
  })
})

describe('formatCountdown (compte à rebours réservation — CA-CAT03-03)', () => {
  const now = new Date(2026, 8, 20, 12, 0, 0)

  afterEach(() => vi.useRealTimers())

  it('calcule minutes et heures restantes', () => {
    vi.useFakeTimers()
    vi.setSystemTime(now)
    expect(formatCountdown(new Date(now.getTime() + 12 * 60_000).toISOString())).toBe('12 min')
    expect(formatCountdown(new Date(now.getTime() + 90 * 60_000).toISOString())).toBe('1 h 30 min')
  })
  it('affiche « Expirée » passé le délai', () => {
    vi.useFakeTimers()
    vi.setSystemTime(now)
    expect(formatCountdown(new Date(now.getTime() - 1).toISOString())).toBe('Expirée')
  })
})

describe('formatDiscountPct (badge « -X % » — V4-Accueil)', () => {
  it('calcule le pourcentage arrondi à l’entier', () => {
    expect(formatDiscountPct(4500, 5000)).toBe(10)
    expect(formatDiscountPct(3400, 4000)).toBe(15)
    expect(formatDiscountPct(1, 100)).toBe(99)
  })
  it('null si pas de réduction (ancien prix absent, égal ou inférieur au prix)', () => {
    expect(formatDiscountPct(4500, null)).toBeNull()
    expect(formatDiscountPct(4500, undefined)).toBeNull()
    expect(formatDiscountPct(4500, 4500)).toBeNull()
    expect(formatDiscountPct(4500, 4000)).toBeNull()
  })
  it('null si prix invalide (0 ou négatif)', () => {
    expect(formatDiscountPct(0, 100)).toBeNull()
    expect(formatDiscountPct(-5, 100)).toBeNull()
  })
})