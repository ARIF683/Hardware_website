import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  toPaise,
  fromPaise,
  addMoney,
  calcLineAmount,
  calcQuotationTotals,
  formatRupees,
  formatQty,
} from '../formatters';

describe('formatters money precision', () => {
  it('converts between rupees and whole paise without floating drift', () => {
    assert.equal(toPaise(19.99), 1999);
    assert.equal(toPaise(0.1) + toPaise(0.2), 30);
    assert.equal(addMoney(0.1, 0.2), 0.3);
    assert.equal(fromPaise(1999), 19.99);
    assert.equal(toPaise(Number.NaN), 0);
  });

  it('calculates line amounts in whole paise with discount clamping', () => {
    assert.equal(calcLineAmount(3, 19.99, 0), 59.97);
    assert.equal(calcLineAmount(2, 100, 15), 170);
    assert.equal(calcLineAmount(1, 100, 150), 0);
    assert.equal(calcLineAmount(-2, 100, 0), 0);
  });

  it('calculates quotation subtotal, discount, GST, and grand total cleanly', () => {
    const totals = calcQuotationTotals(
      [{ total: 100.1 }, { total: 200.2 }],
      10.3,
      18
    );
    assert.equal(totals.subtotal, 300.3);
    assert.equal(totals.discount, 10.3);
    assert.equal(totals.taxable, 290);
    assert.equal(totals.taxAmount, 52.2);
    assert.equal(totals.grandTotal, 342.2);
  });

  it('formats rupees and quantities cleanly', () => {
    assert.equal(formatRupees(null), '₹0.00');
    assert.ok(formatRupees(1250).includes('1,250.00'));
    assert.equal(formatQty(5, 'pcs'), '5');
    assert.equal(formatQty(2.5, 'ltr'), '2.5 ltr');
  });
});
