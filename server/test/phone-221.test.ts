/**
 * NUMÉROS WHATSAPP — règles strictes Sénégal : indicatif +221, 9 chiffres
 * après, 1er chiffre 7 (`+2217…`). Tests unitaires purs (sans BDD/HTTP).
 */
import './env.js';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizePhone, isSenegalMobile, countryCode } from '../src/utils/phone.js';
import { registerSchema, shippingSchema } from '../src/utils/validation.js';

describe('normalizePhone — Sénégal strict (+221, 9 chiffres, 7…)', () => {
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

  it('accepte un +2217 déjà conforme', () => {
    assert.equal(normalizePhone('+221 77 123 45 67'), '+221771234567');
  });
});

describe('normalizePhone — rejets stricts (numéros sensibles, jamais inventés)', () => {
  it('rejette un autre indicatif que +221', () => {
    assert.equal(normalizePhone('+225 07 00 00 00 00'), null);
    assert.equal(normalizePhone('+33 6 12 34 56 78'), null);
  });

  it('rejette une longueur ≠ 9 après l’indicatif', () => {
    assert.equal(normalizePhone('+22140721715'), null); // 8 chiffres
    assert.equal(normalizePhone('+2210792673165'), null); // 10 chiffres / 0
    assert.equal(normalizePhone('2250700000000'), null);
  });

  it('rejette un 1er chiffre différent de 7', () => {
    assert.equal(normalizePhone('33 123 45 67'), null); // fixe 33…
    assert.equal(normalizePhone('+221331234567'), null);
    assert.equal(normalizePhone('072400090'), null); // 9 chiffres commençant par 0
  });

  it('countryCode reste utilisable pour l’audit des anciennes données', () => {
    assert.equal(countryCode('+221771234567'), '221');
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

  it('registerSchema refuse un +225 (indicatif Sénégal uniquement)', () => {
    const result = registerSchema.safeParse({ ...base, phone: '+225 07 00 00 00 00' });
    assert.equal(result.success, false);
  });

  it('shippingSchema exige +221 + 9 chiffres / 7', () => {
    const parsed = shippingSchema.parse({
      name: 'Destinataire',
      phone: '77 123 45 67',
      city: 'Dakar',
      address: 'Rue 1',
    });
    assert.equal(parsed.phone, '+221771234567');
    const bad = shippingSchema.safeParse({
      name: 'Destinataire',
      phone: '+225 07 00 00 00 00',
      city: 'Dakar',
      address: 'Rue 1',
    });
    assert.equal(bad.success, false);
  });
});
