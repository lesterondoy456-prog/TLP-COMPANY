import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateSalesOrder } from '../../SalesSystem/src/salesPricing.mjs';

const item = { productId: 1, quantity: '1', unitPrice: '100' };
test('sales order source-price conversion preserves six places and rounds totals at customer precision', () => {
  const legacy = calculateSalesOrder({ items: [{ ...item, quantity: '1800', unitPrice: '0.115300' }] });
  assert.equal(legacy.total, '207.540000');
  const converted = calculateSalesOrder({ items: [{ ...item, quantity: '1800', unitPrice: '0.115300' }], rate: '55' });
  assert.equal(converted.items[0].convertedUnitPrice, '6.341500');
  assert.equal(converted.total, '11414.700000');
  assert.equal(converted.items[0].unitPrice, '0.115300');
  assert.equal(calculateSalesOrder({ items: [{ ...item, unitPrice: '0.000001' }], decimalInTotalPrice: 6 }).total, '0.000001');
  assert.equal(calculateSalesOrder({ items: [{ ...item, unitPrice: '10.5' }], decimalInTotalPrice: 0 }).total, '11.000000');
});
test('sales order discounts reduce the taxable base before inclusive or exclusive VAT', () => {
  const exclusive = calculateSalesOrder({ items: [{ ...item, quantity: 3, discountRate: 10 }], discountType: 'percent', discount: 10, vatRate: 12 });
  assert.equal(exclusive.grossAmount, '300.000000');
  assert.equal(exclusive.lineDiscountAmount, '30.000000');
  assert.equal(exclusive.headerDiscountAmount, '27.000000');
  assert.equal(exclusive.netAmount, '243.000000');
  assert.equal(exclusive.vatAmount, '29.160000');
  assert.equal(exclusive.total, '272.160000');
  const inclusive = calculateSalesOrder({ items: [{ ...item, unitPrice: 112 }], vatRate: 12, vatInclusive: true });
  assert.equal(inclusive.netAmount, '100.000000');
  assert.equal(inclusive.vatAmount, '12.000000');
  assert.equal(inclusive.total, '112.000000');
});
test('header discount allocations add up exactly and None never applies a hidden value', () => {
  const result = calculateSalesOrder({ items: [{ ...item, quantity: 2 }, item], discountType: 'amount', discount: 10 });
  assert.deepEqual(result.items.map(row => row.headerDiscountAmount), ['6.660000', '3.340000']);
  assert.equal(result.total, '290.000000');
  assert.equal(result.discountAmount, '10.000000');
  assert.equal(calculateSalesOrder({ items: [item], discountType: null, discount: 99 }).total, '100.000000');
  assert.equal(calculateSalesOrder({ items: [{ ...item, unitPrice: 0 }] }).total, '0.000000');
});
test('unknown VAT, incomplete prices and excessive discounts or totals cannot become valid previews', () => {
  for (const change of [{ rate: 0 }, { vatRate: null }, { vatInclusive: null }, { discountType: 'percent', discount: 101 }, { discountType: 'amount', discount: 101 }, { items: [{ ...item, unitPrice: '' }] }, { items: [{ ...item, quantity: '' }] }, { items: [{ ...item, unitPrice: '0.0000001' }] }, { items: [{ ...item, quantity: '1000000', unitPrice: '100000000' }] }, { items: [{ ...item, quantity: '1000000', unitPrice: '100000000' }], discountType: 'percent', discount: 100 }]) {
    assert.throws(() => calculateSalesOrder({ items: [item], ...change }));
  }
});
