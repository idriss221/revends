import { describe, expect, it } from 'vitest'
import {
  deltaPct,
  formatDeltaPct,
  formatMonthPeriod,
  graphemeCount,
  paymentMethodLabel,
  safeReference,
  validatePaymentFields,
} from './v8'

describe('safeReference — masquage back-office (CA-V8-055)', () => {
  it('reproduit l’exemple de consigne « WAVE-2026-0…123 »', () => {
    expect(safeReference('WAVE-2026-01123')).toBe('WAVE-2026-0…123')
  })
  it('conserve un préfixe lisible et les 3 derniers caractères', () => {
    expect(safeReference('WAVE-20261118-8392')).toBe('WAVE-202611…392')
    expect(safeReference('OM 11 22 33')).toBe('OM 11 2…33')
    expect(safeReference('VIR/2026/118')).toBe('VIR/2026…118')
  })
  it('ne révèle JAMAIS la référence complète', () => {
    const full = 'WAVE-20261118-8392'
    expect(safeReference(full)).not.toContain(full)
    expect(full.endsWith('8392')).toBe(true)
  })
  it('référence trop courte → entièrement masquée', () => {
    expect(safeReference('AB12')).toBe('••••••')
  })
  it('absente / null / vide → libellé « référence absente » (CA-V8-053)', () => {
    expect(safeReference(null)).toBe('référence absente')
    expect(safeReference(undefined)).toBe('référence absente')
    expect(safeReference('   ')).toBe('référence absente')
  })
})

describe('paymentMethodLabel', () => {
  it('traduit les 3 méthodes contractuelles', () => {
    expect(paymentMethodLabel('wave')).toBe('Wave')
    expect(paymentMethodLabel('orange_money')).toBe('Orange Money')
    expect(paymentMethodLabel('virement')).toBe('Virement bancaire')
  })
  it('inconnu / null → « — » (jamais un code)', () => {
    expect(paymentMethodLabel(null)).toBe('—')
    expect(paymentMethodLabel('carte')).toBe('—')
  })
})

describe('formatMonthPeriod', () => {
  it('2026-11 → « Novembre 2026 »', () => {
    expect(formatMonthPeriod('2026-11')).toBe('Novembre 2026')
  })
  it('janvier 2027', () => {
    expect(formatMonthPeriod('2027-01')).toBe('Janvier 2027')
  })
  it('format inattendu → renvoyé tel quel', () => {
    expect(formatMonthPeriod('n/a')).toBe('n/a')
  })
})

describe('graphemeCount', () => {
  it('compte les graphèmes, pas les points de code (👨‍👩‍👧 = 1)', () => {
    expect(graphemeCount('👨‍👩‍👧')).toBe(1)
    expect(graphemeCount('abc')).toBe(3)
    expect(graphemeCount('')).toBe(0)
  })
})

describe('validatePaymentFields — miroir client de E1 (le serveur arbitre)', () => {
  it('valide une souscription Wave conforme', () => {
    expect(validatePaymentFields({ paymentMethod: 'wave', paymentReference: 'WAVE-2026-01118' })).toEqual({})
    expect(validatePaymentFields({ paymentMethod: 'orange_money', paymentReference: 'OM 11 22 33' })).toEqual({})
    expect(validatePaymentFields({ paymentMethod: 'virement', paymentReference: 'VIR/2026/118' })).toEqual({})
  })
  it('méthode absente/invalide → message FR', () => {
    expect(validatePaymentFields({ paymentMethod: '', paymentReference: 'WAVE-1' }).paymentMethod).toBeTruthy()
    expect(validatePaymentFields({ paymentMethod: 'carte', paymentReference: 'WAVE-1' }).paymentMethod).toBeTruthy()
  })
  it('référence manquante → obligatoire', () => {
    expect(validatePaymentFields({ paymentMethod: 'wave', paymentReference: '' }).paymentReference).toMatch(/obligatoire/)
    expect(validatePaymentFields({ paymentMethod: 'wave', paymentReference: '   ' }).paymentReference).toMatch(/obligatoire/)
  })
  it('référence trop courte / trop longue / caractères interdits', () => {
    expect(validatePaymentFields({ paymentMethod: 'wave', paymentReference: 'AB1' }).paymentReference).toBeTruthy()
    expect(validatePaymentFields({ paymentMethod: 'wave', paymentReference: 'A'.repeat(65) }).paymentReference).toBeTruthy()
    expect(validatePaymentFields({ paymentMethod: 'wave', paymentReference: 'WAVE<>01118' }).paymentReference).toBeTruthy()
    expect(validatePaymentFields({ paymentMethod: 'wave', paymentReference: '-ABCD12345' }).paymentReference).toBeTruthy()
  })
})

describe('deltaPct / formatDeltaPct', () => {
  it('delta arrondi à l’entier avec signe', () => {
    expect(deltaPct(112, 100)).toBe(12)
    expect(deltaPct(80, 100)).toBe(-20)
    expect(formatDeltaPct(deltaPct(112, 100))).toBe('+12 %')
    expect(formatDeltaPct(deltaPct(80, 100))).toBe('−20 %')
  })
  it('précédent nul/absent → « — » (jamais une division par zéro)', () => {
    expect(deltaPct(10, 0)).toBeNull()
    expect(deltaPct(10, null)).toBeNull()
    expect(formatDeltaPct(null)).toBe('—')
  })
})
