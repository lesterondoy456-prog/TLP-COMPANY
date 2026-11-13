import assert from 'node:assert/strict';
import test from 'node:test';
import { memoryReceivingRepository, receivingFixture, receivingRouteWorkflow } from './helpers/receiving-memory-repository.mjs';
import { priceOnRoute } from './helpers/purchasing-sql-memory.mjs';
import { calculateTotals as purchasePreview } from '../../PurchasingSystem/src/purchaseMath.js';

const admin = { id: 1, role: 'admin', name: 'Mock Administrator' };
const balance = snapshot => Object.values(snapshot.inventory).reduce((sum, value) => sum + value, 0n);
const line = (quantity, unitPrice, discountRate = 0) => ({ quantity, unitPrice, discountRate });

test('purchase-order save routes calculate exact rounding, discounts and inclusive/exclusive VAT', async () => {
  const exclusive = await priceOnRoute([line(1, 100, 10)], { vatRate: 12 });
  assert.equal(exclusive.grossAmount, '100.00');
  assert.equal(exclusive.discountAmount, '10.00');
  assert.equal(exclusive.netAmount, '90.00');
  assert.equal(exclusive.vatAmount, '10.80');
  assert.equal(exclusive.amount, '100.80');
  const inclusive = await priceOnRoute([line(1, 112)], { vatRate: 12, vatInclusive: true });
  assert.equal(inclusive.netAmount, '100.00');
  assert.equal(inclusive.vatAmount, '12.00');
  assert.equal(inclusive.amount, '112.00');
  assert.equal((await priceOnRoute([line(1, 1.005)])).amount, '1.01');
  assert.equal((await priceOnRoute([line('2.5', '0.10001')], { decimalInTotalPrice: 6 })).amount, '0.250025');
  for (const items of [[line(0, 1)], [line('0.0000001', 1)], [line(1, '0.0000001')], [line(1, 1, 101)], [line(1e9, 1e9)]]) await assert.rejects(priceOnRoute(items), error => error.status === 400);
});

test('purchase-order POST and PUT round supplier prices before multiplication and retain micro-prices', async () => {
  for (const update of [false, true]) {
    const whole = await priceOnRoute([line(3, '1.5')], { decimalInPrice: 0 }, { update });
    assert.equal(whole.items[0].unitPrice, '2.000000');
    assert.equal(whole.amount, '6.00');
    const cents = await priceOnRoute([line(3, '1.255')], { decimalInPrice: 2 }, { update });
    assert.equal(cents.items[0].unitPrice, '1.260000');
    assert.equal(cents.amount, '3.78');
    const micro = await priceOnRoute([line(1_000_000, '0.000001')], { decimalInPrice: 6 }, { update });
    assert.equal(micro.items[0].unitPrice, '0.000001');
    assert.equal(micro.amount, '1.00');
    assert.equal((await priceOnRoute([line(1800, '0.11530')], { decimalInPrice: 6 }, { update })).amount, '207.54');
  }
  for (const decimalInPrice of [-1, 7, 1.5]) await assert.rejects(priceOnRoute([line(1, 1)], { decimalInPrice }), error => error.status === 400);
});

test('PO and receiving save routes agree with browser previews across precision and VAT modes', async () => {
  const cases = [
    { items: [line(3, '1.5')], settings: { decimalInPrice: 0 }, amount: '6.00' },
    { items: [line(3, '1.255')], settings: { decimalInPrice: 2 }, amount: '3.78' },
    { items: [line(1800, '0.11530')], settings: { decimalInPrice: 6 }, amount: '207.54' },
    { items: [line(1_000_000, '0.000001')], settings: { decimalInPrice: 6, decimalInTotalPrice: 6 }, amount: '1.000000' },
    { items: [line(1, 112)], settings: { vatRate: 12, vatInclusive: true }, amount: '112.00' },
    { items: [line(1, 100, 10)], settings: { vatRate: 12 }, amount: '100.80' },
  ];
  for (const { items, settings, amount } of cases) {
    const preview = purchasePreview(items, settings);
    for (const receiving of [false, true]) for (const update of [false, true]) {
      const saved = await priceOnRoute(items, settings, { receiving, update });
      assert.equal(saved.amount, amount);
      for (const key of ['grossAmount', 'discountAmount', 'netAmount', 'vatAmount', 'amount']) assert.equal(saved[key], preview[key]);
    }
  }
});

test('drafts do not change stock; posting commits allocations, receipt, source quantities, and audit together', async () => {
  const memory = memoryReceivingRepository();
  const workflow = receivingRouteWorkflow(memory.repository);
  assert.equal(balance(memory.snapshot()), 0n);
  const result = await workflow.post(1, admin);
  assert.equal(result.alreadyPosted, false);
  assert.equal(result.record.status, 'posted');
  const saved = memory.snapshot();
  assert.equal(balance(saved), 3_000_000n);
  assert.equal(saved.orders[0].items[0].receivedQuantity, 3);
  assert.equal(saved.orders[0].status, 'posted');
  assert.equal(saved.ledger.length, 1);
  assert.equal(saved.audit.length, 1);
  assert.equal(saved.productStock, 7, 'Raw-material receiving must never replenish finished-product stock.');
  assert.deepEqual(memory.events.filter(event => ['stock', 'posted', 'order-refreshed', 'audit', 'commit'].includes(event)), ['stock', 'posted', 'order-refreshed', 'audit', 'commit']);
});

test('replayed and concurrent posts apply each allocation only once', async () => {
  const memory = memoryReceivingRepository();
  const workflow = receivingRouteWorkflow(memory.repository);
  const results = await Promise.all([workflow.post(1, admin), workflow.post(1, admin)]);
  assert.deepEqual(results.map(result => result.alreadyPosted).sort(), [false, true]);
  const replay = await workflow.post(1, admin);
  assert.equal(replay.alreadyPosted, true);
  assert.equal(balance(memory.snapshot()), 3_000_000n);
  assert.equal(memory.snapshot().ledger.length, 1);
  assert.equal(memory.snapshot().audit.length, 1);
  assert.equal(memory.stockCalls(), 1);
  assert.equal(memory.events.filter(event => event === 'order-lock').length, 1, 'Already-posted replay must return before source or inventory effects.');
});

test('split decimal allocations sum exactly without binary floating-point mismatch', async () => {
  const fixture = receivingFixture();
  const item = fixture.receipts[0].items[0];
  item.quantity = 0.3;
  item.allocations[0].quantity = 0.1;
  item.allocations.push({ ...item.allocations[0], id: 10002, quantity: 0.2 });
  const memory = memoryReceivingRepository(fixture);
  await receivingRouteWorkflow(memory.repository).post(1, admin);
  assert.equal(balance(memory.snapshot()), 300_000n);
  assert.equal(memory.snapshot().ledger.length, 2);
  assert.equal(memory.snapshot().orders[0].items[0].receivedQuantity, 0.3);
});

test('all source and allocation validations finish before any stock effect', async () => {
  const invalidFixtures = [];
  const changed = change => { const fixture = receivingFixture(); change(fixture); invalidFixtures.push(fixture); };
  changed(fixture => { fixture.receipts[0].items[0].suppliesId = 999; });
  changed(fixture => { fixture.receipts[0].items[0].unit = 'wrong-uom'; });
  changed(fixture => { fixture.receipts[0].items[0].allocations[0].quantity = '2.999999'; });
  changed(fixture => { fixture.receipts[0].items[0].allocations[0].warehouseId = 999; });
  changed(fixture => { fixture.receipts[0].items[0].allocations = []; });
  changed(fixture => { fixture.receipts[0].items.push({ ...structuredClone(fixture.receipts[0].items[0]), id: 1002 }); });
  for (const fixture of invalidFixtures) {
    const memory = memoryReceivingRepository(fixture);
    await assert.rejects(receivingRouteWorkflow(memory.repository).post(1, admin), error => error.status === 400);
    assert.equal(memory.stockCalls(), 0);
    assert.deepEqual(memory.snapshot(), fixture);
  }
});

test('partial receipts and concurrent receipts cannot exceed the remaining purchase-order quantity', async () => {
  const fixture = receivingFixture();
  fixture.receipts[0].items[0].quantity = 6;
  fixture.receipts[0].items[0].allocations[0].quantity = 6;
  fixture.receipts.push({ ...structuredClone(fixture.receipts[0]), id: 2, items: [{ ...structuredClone(fixture.receipts[0].items[0]), id: 2001, allocations: [{ ...structuredClone(fixture.receipts[0].items[0].allocations[0]), id: 20001 }] }] });
  const memory = memoryReceivingRepository(fixture);
  const workflow = receivingRouteWorkflow(memory.repository);
  const outcomes = await Promise.allSettled([workflow.post(1, admin), workflow.post(2, admin)]);
  assert.equal(outcomes.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(outcomes.filter(result => result.status === 'rejected' && result.reason.status === 409).length, 1);
  const saved = memory.snapshot();
  assert.equal(balance(saved), 6_000_000n);
  assert.equal(saved.orders[0].items[0].receivedQuantity, 6);
  assert.equal(saved.receipts.filter(receipt => receipt.status === 'posted').length, 1);
  assert.equal(saved.audit.length, 1);
});

test('mid-stock failures roll back every effect and a retry safely posts the complete receipt', async () => {
  const fixture = receivingFixture();
  fixture.receipts[0].items.push({ id: 1002, orderItemId: 101, suppliesId: 501, quantity: 2, unit: 'pcs', allocations: [{ id: 10002, quantity: 2, warehouseId: 200, locationId: 300, imLot: 'LOT-B', qcStatus: '', expiryDate: null, mfgDate: null }] });
  const memory = memoryReceivingRepository(fixture, { failStockCall: 2 });
  const workflow = receivingRouteWorkflow(memory.repository);
  await assert.rejects(workflow.post(1, admin), /Injected stock-write failure/);
  assert.deepEqual(memory.snapshot(), fixture, 'The first stock movement and all document changes must roll back.');
  const retry = await workflow.post(1, admin);
  assert.equal(retry.alreadyPosted, false);
  assert.equal(balance(memory.snapshot()), 5_000_000n);
  assert.equal(memory.snapshot().ledger.length, 2);
  assert.equal(memory.snapshot().audit.length, 1);
  assert.equal(memory.snapshot().receipts[0].status, 'posted');
});

test('an audit failure rolls back stock and posting, and unavailable source states remain unchanged', async () => {
  const fixture = receivingFixture();
  const failedAudit = memoryReceivingRepository(fixture, { failAudit: true });
  await assert.rejects(receivingRouteWorkflow(failedAudit.repository).post(1, admin), /Injected audit failure/);
  assert.deepEqual(failedAudit.snapshot(), fixture);
  for (const target of ['receipt', 'order']) {
    const invalid = receivingFixture();
    if (target === 'receipt') invalid.receipts[0].status = 'cancelled'; else invalid.orders[0].status = 'draft';
    const memory = memoryReceivingRepository(invalid);
    await assert.rejects(receivingRouteWorkflow(memory.repository).post(1, admin), error => error.status === 409);
    assert.deepEqual(memory.snapshot(), invalid);
    assert.equal(memory.stockCalls(), 0);
  }
});
