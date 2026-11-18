import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateSalesOrder } from '../../SalesSystem/src/salesPricing.mjs';
import { calculateEditableSalesOrder, hasSalesInvoice } from '../../SalesSystem/src/salesOrderEdit.mjs';

function order(discountType = 'percent', discount = '10', extra = {}) {
  const record = { invoiced: true, rate: '1', vatRate: '0', vatInclusive: false, decimalInTotalPrice: 2, discountType, discount, ...extra };
  const calculated = calculateSalesOrder({ ...record, items: [{ id: 1, productId: 10, quantity: '1', unitPrice: '100' }, { id: 2, productId: 20, quantity: '1', unitPrice: '200' }] });
  return { ...record, ...calculated, items: calculated.items.map((item, index) => ({ ...item, hasInvoice: index === 0 })) };
}

test('invoice reference flags lock zero-quantity SI references while new and explicitly uninvoiced rows stay editable', () => {
  assert.equal(hasSalesInvoice({ invoiced: true }, { id: 1, hasInvoice: true, invoicedQuantity: '0.000' }), true);
  assert.equal(hasSalesInvoice({ invoiced: true }, { id: 2, hasInvoice: false, invoicedQuantity: '0.000' }), false);
  assert.equal(hasSalesInvoice({ invoiced: true }, { id: 3 }), true);
  assert.equal(hasSalesInvoice({ invoiced: true }, { productId: 10 }), false);
  assert.equal(hasSalesInvoice({}, { id: 4, invoicedQuantity: '0.001' }), true);
});

test('editable-row percentage discounts never reallocate the frozen SI row amounts', () => {
  const record = order();
  const before = JSON.stringify(record);
  const preview = calculateEditableSalesOrder({ record, items: [{ ...record.items[0], quantity: '99', unitPrice: '999' }, { ...record.items[1], quantity: '2' }] });
  assert.deepEqual(preview.items[0], record.items[0]);
  assert.equal(preview.items[1].amount, '360.000000');
  assert.equal(preview.headerDiscountAmount, '50.000000');
  assert.equal(preview.total, '450.000000');
  assert.equal(JSON.stringify(record), before);
});

test('fixed discounts apply only their unused allocation to editable items and reject insufficient remaining value', () => {
  const record = order('amount', '30');
  const preview = calculateEditableSalesOrder({ record, items: [record.items[0], { ...record.items[1], quantity: '2' }] });
  assert.deepEqual(preview.items[0], record.items[0]);
  assert.equal(preview.items[0].headerDiscountAmount, '10.000000');
  assert.equal(preview.items[1].headerDiscountAmount, '20.000000');
  assert.equal(preview.total, '470.000000');
  assert.throws(() => calculateEditableSalesOrder({ record, items: [record.items[0], { ...record.items[1], unitPrice: '1' }] }), /discount cannot exceed/i);
});

test('saved FX, VAT and rounding remain independent of mutable catalog/configuration values', () => {
  for (const decimalInTotalPrice of [0, 2, 6]) for (const vatInclusive of [false, true]) {
    const record = order('percent', '5.555555', { rate: '55.123456', vatRate: '12', vatInclusive, decimalInTotalPrice });
    const draft = { ...record.items[1], quantity: '3.125', unitPrice: '0.115305' };
    const preview = calculateEditableSalesOrder({ record, items: [record.items[0], draft] });
    const standalone = calculateSalesOrder({ ...record, items: [draft] });
    assert.deepEqual(preview.items[0], record.items[0]);
    assert.deepEqual(preview.items[1], standalone.items[0]);
  }
});

test('all-SI previews retain authoritative saved header totals without modifying frozen rows', () => {
  const record = order();
  record.items.forEach(item => { item.hasInvoice = true; });
  record.total = '123.456789';
  const preview = calculateEditableSalesOrder({ record, items: record.items });
  assert.equal(preview.total, '123.456789');
  assert.deepEqual(preview.items, record.items);
});

test('removing the last uninvoiced row previews only frozen totals and rejects an unallocated fixed discount', () => {
  const percent = order();
  const preview = calculateEditableSalesOrder({ record: percent, items: [percent.items[0]] });
  assert.equal(preview.total, '90.000000');
  assert.deepEqual(preview.items, [percent.items[0]]);
  const fixed = order('amount', '30');
  assert.throws(() => calculateEditableSalesOrder({ record: fixed, items: [fixed.items[0]] }), /discount cannot be allocated/i);
});
