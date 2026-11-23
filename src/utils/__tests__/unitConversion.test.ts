import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { convertQuantity, getPairedUnit } from '../unitConversion';

describe('unitConversion', () => {
  it('returns expected paired unit and default factor', () => {
    assert.deepEqual(getPairedUnit('box'), { pairedUnit: 'pcs', factor: 10 });
    assert.deepEqual(getPairedUnit('  ROLL '), { pairedUnit: 'mtr', factor: 50 });
    assert.deepEqual(getPairedUnit('kg'), { pairedUnit: 'gm', factor: 1000 });
    assert.deepEqual(getPairedUnit('unknown'), { pairedUnit: 'pcs', factor: 1 });
  });

  it('converts major to minor and minor to major quantities accurately', () => {
    assert.equal(convertQuantity('box', 'pcs', 3, 12), 36);
    assert.equal(convertQuantity('pcs', 'box', 25, 10), 2.5);
    assert.equal(convertQuantity('roll', 'mtr', 2, 50), 100);
    assert.equal(convertQuantity('mtr', 'roll', 150, 50), 3);
    assert.equal(convertQuantity('kg', 'gm', 1.5, 1000), 1500);
  });

  it('returns original quantity when units match, are unrelated, or factor <= 0', () => {
    assert.equal(convertQuantity('pcs', 'PCS', 5, 10), 5);
    assert.equal(convertQuantity('box', 'pcs', 5, 0), 5);
    assert.equal(convertQuantity('box', 'pcs', 5, -2), 5);
    assert.equal(convertQuantity('ltr', 'kg', 4, 10), 4);
  });
});
