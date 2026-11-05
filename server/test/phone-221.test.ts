/**
 * NUMÉROS WHATSAPP — indicatif +221 par défaut, jamais d'écrasement d'un
 * indicatif étranger explicite. Tests unitaires purs (sans BDD/HTTP).
 */
import './env.js';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizePhone, isSenegalMobile, countryCode } from '../src/utils/phone.js';
import { registerSchema, shippingSchema } from '../src/utils/validation.js';

describe('normalizePhone — Sénégal par défaut', () => {
  it('préfixe un mobile local à 9 chiffres par +221', () => {
    assert.equal(normalizePhone('77 123 45 67'), '+221771234567');
    assert.equal(normalizePhone('771234567'), '+221771234567');
  });

  it('retire le 0 initial d’un numéro local à 10 chiffres', () => {
    assert.equal(normalizePhone('0771234567'), '+221771234567');
  });

  it('accepte la forme 00221…', () => {
    assert.equal(normalizePhone('00221 77 123 45 67'), '+221771234567');
  });

  it('accepte un numéro déjà composé sans + (221…)', () => {
    assert.equal(normalizePhone('221771234567'), '+221771234567');
  });
});

describe('normalizePhone — indicatifs étrangers préservés', () => {
  it('ne touche JAMAIS à un +225 ivoirien explicite', () => {
    assert.equal(normalizePhone('+225 07 00 00 00 00'), '+2250700000000');
  });

  it('préserve un +33 français', () => {
    assert.equal(normalizePhone('+33 6 12 34 56 78'), '+33612345678');
  });

  it('ne transforme pas un numéro ivoirien à 10 chiffres après 225', () => {
    const normalized = normalizePhone('2250700000000');
    assert.equal(normalized, '+2250700000000');
    assert.equal(countryCode(normalized!), '225');
  });
});

describe('normalizePhone — valeurs invalides', () => {
  it('retourne null pour une saisie inexploitable', () => {
    assert.equal(normalizePhone(''), null);
    assert.equal(normalizePhone('abc'), null);
    assert.equal(normalizePhone('123'), null);
  });

  it('identifie un mobile sénégalais', () => {
    assert.equal(isSenegalMobile('+221771234567'), true);
    assert.equal(isSenegalMobile('+221331234567'), false);
  });
});

describe('Schémas — messages « Numéro WhatsApp »', () => {
  const base = {
    displayName: 'Aicha',
    name: 'Aïcha Koné',
    email: 'aicha@example.com',
    password: 'motdepasse123',
    acceptedCgu: true as const,
  };

  it('registerSchema normalise le numéro local en +221', () => {
    const parsed = registerSchema.parse({ ...base, phone: '77 123 45 67' });
    assert.equal(parsed.phone, '+221771234567');
  });

  it('registerSchema refuse une saisie invalide avec un message clair', () => {
    const result = registerSchema.safeParse({ ...base, phone: 'pas-un-numero' });
    assert.equal(result.success, false);
    if (!result.success) {
      assert.match(result.error.issues[0]!.message, /WhatsApp/);
    }
  });

  it('shippingSchema conserve un +225 explicite', () => {
    const parsed = shippingSchema.parse({
      name: 'Destinataire',
      phone: '+225 07 00 00 00 00',
      city: 'Abidjan',
      address: 'Cocody, rue 1',
    });
    assert.equal(parsed.phone, '+2250700000000');
  });
});
