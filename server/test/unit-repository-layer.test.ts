/**
 * Tests UNITAIRES de la couche repository (logique pure exposée) et de la
 * normalisation des entrées HTTP. Sans BDD, sans HTTP.
 */
import './env.js';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ownerCountsFromRow, ACTIVE_ORDER_STATUSES, ACTIVE_ORDER_STATUSES_SQL } from '../src/repositories/products.repository.js';
import { normalizeOptionalFields, normalizeMeListParams, normalizeAdminListParams } from '../src/utils/normalize.js';
import { adminHistoryQuerySchema, meListQuerySchema } from '../src/utils/validation.js';

type OwnerRow = Parameters<typeof ownerCountsFromRow>[0];

describe('products.repository — ownerCountsFromRow (compteurs de fenêtre)', () => {
  it('convertit les agrégats TEXT en nombres (PG renvoie COUNT en string)', () => {
    const row = {
      cnt_total: '5',
      cnt_pending: '1',
      cnt_available: '2',
      cnt_reserved: '1',
      cnt_sold: '1',
      cnt_rejected: '0',
    } as unknown as OwnerRow;
    assert.deepEqual(ownerCountsFromRow(row), {
      total: 5,
      pending: 1,
      available: 2,
      reserved: 1,
      sold: 1,
      rejected: 0,
    });
  });

  it('row absente (page vide au-delà du dernier élément) ⇒ tous les compteurs à 0', () => {
    const zero = { total: 0, pending: 0, available: 0, reserved: 0, sold: 0, rejected: 0 };
    assert.deepEqual(ownerCountsFromRow(undefined), zero);
    assert.deepEqual(ownerCountsFromRow({} as OwnerRow), zero);
  });
});

describe('products.repository — statuts de commande ACTIVE (fragment SQL partagé)', () => {
  it('expose la même liste en TypeScript qu’en SQL (DRY, pas de divergence)', () => {
    for (const status of ACTIVE_ORDER_STATUSES) {
      assert.ok(ACTIVE_ORDER_STATUSES_SQL.includes(`'${status}'`), `${status} absent du fragment SQL`);
    }
  });

  it('le fragment est une liste SQL entre parenthèses', () => {
    assert.match(ACTIVE_ORDER_STATUSES_SQL, /^\('COMPLETED', 'CANCELLED', 'PAYMENT_FAILED'\)$/);
  });
});

describe('normalize — champs optionnels multipart vides', () => {
  it('supprime les chaînes vides / blanchies des champs optionnels', () => {
    const out = normalizeOptionalFields({
      name: 'iPhone',
      brand: '',
      model: '   ',
      ageYears: '',
      defects: 'Rayure écran',
      accessories: '',
      notes: '',
    });
    for (const key of ['brand', 'model', 'ageYears', 'accessories', 'notes']) {
      assert.ok(!(key in out), `${key} aurait dû être supprimé`);
    }
    assert.equal(out.defects, 'Rayure écran');
    assert.equal(out.name, 'iPhone');
  });

  it('conserve les valeurs non vides telles quelles', () => {
    const out = normalizeOptionalFields({ brand: 'Apple', model: '13', notes: 'RAS' });
    assert.deepEqual(out, { brand: 'Apple', model: '13', notes: 'RAS' });
  });
});

describe('normalize — pagination /api/me/* (alias rétrocompatibles)', () => {
  it('per_page → limit', () => {
    assert.equal(normalizeMeListParams({ per_page: '5' }).limit, '5');
  });

  it('perPage → limit', () => {
    assert.equal(normalizeMeListParams({ perPage: '7' }).limit, '7');
  });

  it('la clé canonique `limit` prime sur les alias', () => {
    assert.equal(normalizeMeListParams({ limit: '3', per_page: '9' }).limit, '3');
  });

  it('sans alias, la query est recopiée sans clé `limit` ajoutée', () => {
    const out = normalizeMeListParams({ page: '2' });
    assert.equal(out.page, '2');
    assert.ok(!('limit' in out));
  });
});

describe('normalize — listes admin (alias contractuels per_page / target_type)', () => {
  it('per_page → perPage', () => {
    assert.equal(normalizeAdminListParams({ per_page: '1' }).perPage, '1');
  });

  it('target_type → targetType', () => {
    assert.equal(normalizeAdminListParams({ target_type: 'product' }).targetType, 'product');
  });

  it('la clé canonique prime sur les alias', () => {
    const out = normalizeAdminListParams({ perPage: '12', per_page: '9', targetType: 'order', target_type: 'product' });
    assert.equal(out.perPage, '12');
    assert.equal(out.targetType, 'order');
  });

  it('l\'alias normalisé passe le schéma admin history (perPage borné à 48)', () => {
    const q = adminHistoryQuerySchema.parse(normalizeAdminListParams({ per_page: '5', target_type: 'category' }));
    assert.equal(q.perPage, 5);
    assert.equal(q.targetType, 'category');
    assert.throws(() => adminHistoryQuerySchema.parse(normalizeAdminListParams({ per_page: '999' })));
  });
});

describe('meListQuerySchema — défauts et bornes', () => {
  it('défauts : page=1, limit=12', () => {
    const q = meListQuerySchema.parse({});
    assert.equal(q.page, 1);
    assert.equal(q.limit, 12);
  });

  it('coerce les chaînes de query', () => {
    const q = meListQuerySchema.parse({ page: '3', limit: '24' });
    assert.equal(q.page, 3);
    assert.equal(q.limit, 24);
  });

  it('rejette page < 1 et limit > 48', () => {
    assert.throws(() => meListQuerySchema.parse({ page: '0' }));
    assert.throws(() => meListQuerySchema.parse({ limit: '49' }));
  });
});
