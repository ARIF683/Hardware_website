import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  splitCsvLine,
  parseCanFactorToLiters,
  formatCanFactorDisplay,
  generateTintRecordId,
  findBestMatchingItem,
  parseColorMachineContent,
} from '../colorMachineParser';
import type { Item } from '../../types';

function makeItem(overrides: Partial<Item>): Item {
  return {
    id: 'item-1',
    o: 0,
    name: 'Test Item',
    code: '',
    barcode: '',
    type: 'Paint',
    brand: 'Asian Paints',
    size: '1 Ltr',
    aliases: '',
    mrp: null,
    cost: 0,
    price: 0,
    qty: 10,
    low: 2,
    unit: 'pcs',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('colorMachineParser', () => {
  it('splits CSV and semicolon lines while respecting quotes', () => {
    assert.deepEqual(splitCsvLine('"Ace Exterior, Matte",1 LIT,2'), [
      'Ace Exterior, Matte',
      '1 LIT',
      '2',
    ]);
    assert.deepEqual(splitCsvLine('ACE;TE15;4 LIT;3'), ['ACE', 'TE15', '4 LIT', '3']);
  });

  it('parses and formats can factors consistently', () => {
    assert.equal(parseCanFactorToLiters('1 LIT'), 1);
    assert.equal(parseCanFactorToLiters('4L'), 4);
    assert.equal(parseCanFactorToLiters('10 LTR'), 10);
    assert.equal(parseCanFactorToLiters('500 ML'), 0.5);
    assert.equal(formatCanFactorDisplay('500 ML'), '500 ml');
    assert.equal(formatCanFactorDisplay('20 LIT'), '20 Ltr');
  });

  it('matches exact base and pack size without confusing 1L vs 4L cans', () => {
    const items: Item[] = [
      makeItem({ id: 'ace-17-1l', name: 'ACE 17G 1Ltr', code: '17G', size: '1 Ltr' }),
      makeItem({ id: 'ace-17-4l', name: 'ACE 17G 4Ltr', code: '17G', size: '4 Ltr' }),
      makeItem({ id: 'ace-2-1l', name: 'ACE 2G 1Ltr', code: '2G', size: '1 Ltr' }),
    ];

    assert.equal(findBestMatchingItem('ACE', '17G', '4 LIT', items)?.id, 'ace-17-4l');
    assert.equal(findBestMatchingItem('ACE', '2G', '1 LIT', items)?.id, 'ace-2-1l');
  });

  it('parses machine CSV rows and marks already-processed fingerprints', () => {
    const items: Item[] = [
      makeItem({ id: 'ace-17-1l', name: 'ACE 17G 1Ltr', code: '17G', size: '1 Ltr' }),
    ];
    const id1 = generateTintRecordId('10-Oct-26', '11:00:00', 'ACE', '17G', '1 Ltr', 2);
    const processed = new Set<string>([id1]);

    const csv = [
      'TINT_DATE,TINT_TIME,PRODUCT_NAME,BASE_CODE,CAN_FACTOR,NO_OF_CAN',
      '10-Oct-26,11:00:00,ACE,17G,1 LIT,2',
      '10-Oct-26,11:05:00,ACE,17G,1 LIT,3',
    ].join('\n');

    const rows = parseColorMachineContent(csv, items, processed);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].isAlreadyProcessed, true);
    assert.equal(rows[1].isAlreadyProcessed, false);
    assert.equal(rows[1].matchedItem?.id, 'ace-17-1l');
    assert.equal(rows[1].deductQty, 3);
    assert.equal(rows[1].deductUnit, 'pcs');
  });
});
