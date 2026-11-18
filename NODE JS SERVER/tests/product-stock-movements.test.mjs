import assert from 'node:assert/strict';
import test from 'node:test';
import { loadRouterWithDatabase, invokeRoute } from './helpers/load-api.mjs';

function fixture({ role = 'admin', product = {}, records = [] } = {}) {
  const current = { id: 7, sku: 'P7', name: 'Product 7', description: 'Finished product', unit: 'PCS', stock: '5.000', isActive: true, ...product };
  const calls = [];
  let transactions = 0;
  const database = {
    sql: new Proxy({}, { get: (_target, type) => type === 'MAX' ? -1 : (...args) => ({ type, args }) }),
    request() {
      return {
        input() { return this; },
        async query(query) {
          calls.push(query);
          assert.match(query, /^\s*SELECT\b/i, 'Sales inventory history must never write stock or business records.');
          if (query.includes('FROM dbo.Products')) return { recordset: [{ ...current }] };
          assert.match(query, /FROM dbo.ProductStockMovements m JOIN/);
          assert.match(query, /FROM dbo.DeliveryReceipts d JOIN dbo.SalesOrders o[\s\S]*JOIN dbo.DeliveryReceiptItems i/);
          assert.match(query, /CAST\(NULL AS varchar\(60\)\) AS stockBefore,CAST\(NULL AS varchar\(60\)\) AS stockAfter/);
          return { recordset: structuredClone(records) };
        },
      };
    },
    async transaction() { transactions++; throw new Error('No inventory write transaction is allowed from Sales.'); },
  };
  const router = loadRouterWithDatabase('sales', database);
  const actor = { id: 1, username: 'sales_reader', name: 'Sales Reader', role, isActive: true, system: 'sales' };
  return {
    current, calls, get transactions() { return transactions; },
    save(direction, overrides = {}) { return invokeRoute(router, 'post', '/products/:id/stock-movements', { params: { id: 7 }, is: () => true, body: { requestKey: 'a'.repeat(32), direction, quantity: '1.234', movementDate: '2026-11-18', sourceDestination: 'Stock room', reason: 'Manual adjustment', ...overrides }, testUser: actor }); },
    read() { return invokeRoute(router, 'get', '/products/:id/stock-movements', { params: { id: 7 }, testUser: actor }); },
  };
}

test('all Sales roles are denied manual stock in/out before any database access', async () => {
  for (const role of ['admin', 'saleshead', 'sales']) {
    const api = fixture({ role });
    const before = JSON.stringify(api.current);
    for (const direction of ['in', 'out']) {
      await assert.rejects(api.save(direction), error => error.status === 403 && /read.only|manual|inventory/i.test(error.message));
      await assert.rejects(api.save(direction, { quantity: '999999999999999.999' }), error => error.status === 403);
    }
    assert.equal(JSON.stringify(api.current), before);
    assert.deepEqual(api.calls, []);
    assert.equal(api.transactions, 0);
  }
});

test('Sales can read invoice, historical manual and delivery references without inventing stock balances', async () => {
  const records = [
    { id: 'invoice:8', type: 'invoice-out', quantity: '0.125', stockBefore: '5.125', stockAfter: '5.000', invoiceNumber: 'SI-8' },
    { id: 'manual:9', type: 'manual-in', quantity: '1.000', stockBefore: '4.125', stockAfter: '5.125', reference: 'HISTORICAL-9' },
    { id: 'delivery:8:9', type: 'delivery-out', quantity: '0.125', stockBefore: null, stockAfter: null, deliveryReceiptNumber: 'DR-8', orderNumber: 'SO-10', invoiceNumber: 'SI-11', address: 'Original destination', receivedBy: 'Recipient' },
  ];
  for (const role of ['admin', 'saleshead', 'sales']) {
    const api = fixture({ role, records });
    const history = await api.read();
    assert.equal(history.body.product.stock, '5.000');
    assert.deepEqual(history.body.records, records);
    assert.equal(api.transactions, 0);
  }
  const unknown = fixture({ product: { stock: null, isActive: false }, records });
  const history = await unknown.read();
  assert.equal(history.body.product.stock, null);
  assert.equal(history.body.product.isActive, false);
  assert.deepEqual(history.body.records, records);
});
