/**
 * Tests UNITAIRES des services — logique métier pure, sans BDD ni HTTP.
 * Couvre la validation cross-champ du panier (`normalizeQuantities`) et les
 * constantes métier de suggestions.
 */
import './env.js';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeQuantities } from '../src/services/orders.service.js';
import { SUGGESTION_LIMITS, SUGGESTION_MAX_TOTAL } from '../src/services/products.service.js';

describe('orders.service — normalizeQuantities (panier 1..9)', () => {
  it('quantités absentes ⇒ map vide (chaque article à 1 par défaut)', () => {
    assert.equal(normalizeQuantities([1, 2, 3], undefined).size, 0);
  });

  it('accepte des entiers 1..9 et les associe au bon produit', () => {
    const map = normalizeQuantities([1, 2], { 1: 3, 2: 9 });
    assert.equal(map.get(1), 3);
    assert.equal(map.get(2), 9);
    assert.equal(map.size, 2);
  });

  it('rejette une quantité pour un article absent du panier', () => {
    assert.throws(() => normalizeQuantities([1], { 2: 1 }), /absent du panier/);
  });

  it('rejette une clé non entière', () => {
    assert.throws(() => normalizeQuantities([1], { abc: 1 }), /absent du panier|entière/);
  });

  it('rejette une quantité hors bornes 1..9', () => {
    assert.throws(() => normalizeQuantities([1], { 1: 0 }), /entre 1 et 9/);
    assert.throws(() => normalizeQuantities([1], { 1: 10 }), /entre 1 et 9/);
  });

  it('rejette une quantité non entière', () => {
    assert.throws(() => normalizeQuantities([1], { 1: 1.5 }), /entier/);
  });
});

describe('products.service — constantes de suggestions (PO-V5-18)', () => {
  it('plafonds par type', () => {
    assert.deepEqual(SUGGESTION_LIMITS, { products: 6, categories: 2, brands: 2 });
  });

  it('le total des plafonds ne dépasse pas le plafond global', () => {
    const sum = SUGGESTION_LIMITS.products + SUGGESTION_LIMITS.categories + SUGGESTION_LIMITS.brands;
    assert.ok(sum <= SUGGESTION_MAX_TOTAL, `${sum} > ${SUGGESTION_MAX_TOTAL}`);
  });
});
