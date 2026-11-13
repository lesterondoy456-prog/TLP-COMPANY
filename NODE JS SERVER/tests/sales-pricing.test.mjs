import assert from 'node:assert/strict';
import test from 'node:test';
import { salesOrderPricing, commonSalesCurrency } from '../components/sales-pricing.js';
import { salesLineTotal, salesTotal } from '../../SalesSystem/src/salesPricing.mjs';

test('six-place sales prices retain microprices and match the browser preview', () => {
  const items = [{ quantity: 100000, unitPrice: '0.1153' }, { quantity: 1000000, unitPrice: '0.000001' }];
  const result = salesOrderPricing(items);
  assert.deepEqual(result, { total: 11531, lineTotals: [11530, 1] });
  assert.deepEqual(items.map(salesLineTotal), result.lineTotals);
  assert.equal(salesTotal(items), result.total);
});

test('sales rounds each fractional-quantity line to cents before summing', () => {
  const items = [{ quantity: '0.5', unitPrice: '0.01' }, { quantity: '0.333', unitPrice: '0.045045' }];
  const result = salesOrderPricing(items);
  assert.deepEqual(result, { total: 0.02, lineTotals: [0.01, 0.01] });
  assert.deepEqual(items.map(salesLineTotal), result.lineTotals);
  assert.equal(salesTotal(items), result.total);
  assert.throws(() => salesOrderPricing([{ quantity: 1, unitPrice: '0.1234567' }]), /decimal/);
});

test('sales keeps the selected product currency and rejects mixed-currency totals', () => {
  assert.equal(commonSalesCurrency([{ currency: 'usd' }, { currency: 'USD' }]), 'USD');
  assert.equal(commonSalesCurrency([{ currency: '' }, {}]), 'PHP');
  assert.throws(() => commonSalesCurrency([{ currency: 'USD' }, { currency: 'PHP' }]), /same currency/);
});
