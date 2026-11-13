import assert from 'node:assert/strict';
import test from 'node:test';
import { loadRouterWithDatabase, invokeRoute } from './helpers/load-api.mjs';
import { salesLineTotal, salesTotal } from '../../SalesSystem/src/salesPricing.mjs';

// Only the actual router is loaded. db.js, SQL Server and .env are never read.
function orderFixture(currencies = ['USD'], current = {}) {
  const state = {
    header: { id: 7, number: 'SO-MOCK', currency: 'USD', status: 'draft', invoiced: false, delivered: false, ...current },
    items: [], commits: 0, rollbacks: 0, writes: 0,
  };
  const sql = new Proxy({}, { get: (_target, type) => (...args) => ({ type, args }) });
  const database = {
    sql,
    request() {
      const values = {};
      return {
        input(key, _type, value) { values[key] = value; return this; },
        async query(query) {
          if (/FROM dbo\.Customers/.test(query)) return { recordset: [{ id: 2, name: 'Customer', address: 'Office', isActive: true }] };
          if (/FROM dbo\.Products/.test(query)) return { recordset: [{ id: values.id, name: 'Product ' + values.id, sku: 'P' + values.id, unit: 'PCS', currency: currencies[values.id - 1], isActive: true }] };
          if (/INSERT INTO dbo\.SalesOrders/.test(query)) { assert.match(query, /createdAt,updatedAt/); assert.match(query, /SYSUTCDATETIME\(\)/); }
          if (/INSERT INTO dbo\.SalesOrders|UPDATE dbo\.SalesOrders/.test(query)) {
            state.header = { ...state.header, ...values };
            state.writes++;
            return { recordset: [{ id: state.header.id }] };
          }
          if (/DELETE FROM dbo\.SalesOrderItems/.test(query)) { state.items = []; state.writes++; return { recordset: [] }; }
          if (/INSERT INTO dbo\.SalesOrderItems/.test(query)) { state.items.push({ ...values }); state.writes++; return { recordset: [] }; }
          if (/INSERT INTO dbo\.AuditTrail/.test(query)) return { recordset: [] };
          if (/FROM dbo\.SalesOrders/.test(query)) return { recordset: [{ ...state.header }] };
          if (/FROM dbo\.SalesOrderItems/.test(query)) return { recordset: state.items.map(row => ({ ...row })) };
          throw new Error('Unexpected SQL in isolated order test: ' + query);
        },
      };
    },
    async transaction(work) {
      const snapshot = structuredClone(state);
      try { const value = await work({ serializable: true }); state.commits++; return value; }
      catch (error) { for (const key of Object.keys(snapshot)) state[key] = snapshot[key]; state.rollbacks++; throw error; }
    },
  };
  const router = loadRouterWithDatabase('sales', database);
  return {
    state,
    async save(items, method = 'post', currency) {
      return invokeRoute(router, method, '/sales-orders' + (method === 'put' ? '/:id' : ''), {
        params: { id: 7 }, is: () => true,
        testUser: { id: 1, name: 'Mock actor', system: 'sales', role: 'admin', isActive: true },
        body: {
          customerId: 2, orderDate: '2026-11-13', notes: '', status: 'confirmed',
          ...(currency ? { currency } : {}),
          items: items.map((item, index) => ({ productId: index + 1, ...item })),
        },
      });
    },
  };
}

test('POST and PUT order handlers preserve six-place microprices and match the browser preview', async () => {
  const items = [{ quantity: 100000, unitPrice: '0.1153' }, { quantity: 1000000, unitPrice: '0.000001' }];
  for (const method of ['post', 'put']) {
    const fixture = orderFixture(['USD', 'USD']);
    const response = await fixture.save(items, method);
    assert.equal(response.statusCode, method === 'post' ? 201 : 200);
    assert.equal(response.body.record.total, 11531);
    assert.deepEqual(response.body.record.items.map(item => item.lineTotal), items.map(salesLineTotal));
    assert.equal(salesTotal(items), response.body.record.total);
    assert.equal(response.body.record.items[1].unitPrice, 0.000001);
    assert.equal(fixture.state.commits, 1);
    assert.equal(fixture.state.rollbacks, 0);
  }
});

test('order handlers round each fractional-quantity line HALF-UP before summing', async () => {
  const items = [{ quantity: '0.5', unitPrice: '0.01' }, { quantity: '0.333', unitPrice: '0.045045' }, { quantity: 1, unitPrice: '1.005' }];
  const fixture = orderFixture(['USD', 'USD', 'USD']);
  const response = await fixture.save(items);
  assert.deepEqual(response.body.record.items.map(item => item.lineTotal), [0.01, 0.01, 1.01]);
  assert.equal(response.body.record.total, 1.03);
  assert.equal(salesTotal(items), response.body.record.total);
});

test('order numeric boundaries reject precision loss and excessive totals before database writes', async () => {
  for (const item of [
    { quantity: '0.0001', unitPrice: 1 },
    { quantity: 1, unitPrice: '0.1234567' },
    { quantity: -1, unitPrice: 1 },
    { quantity: 1, unitPrice: -1 },
    { quantity: 0, unitPrice: 1 },
    { quantity: 1000001, unitPrice: 1 },
    { quantity: 1000000, unitPrice: 100000000 },
  ]) {
    const fixture = orderFixture();
    await assert.rejects(() => fixture.save([item]), error => error.status === 400);
    assert.equal(fixture.state.writes, 0);
    assert.equal(fixture.state.commits, 0);
  }
});

test('orders retain a common product currency, default legacy prices to PHP and roll back mixed currencies', async () => {
  const lowerCase = orderFixture(['usd', 'USD']);
  assert.equal((await lowerCase.save([{ quantity: 1, unitPrice: 1 }, { quantity: 1, unitPrice: 1 }])).body.record.currency, 'USD');
  const legacy = orderFixture(['', undefined]);
  assert.equal((await legacy.save([{ quantity: 1, unitPrice: 1 }, { quantity: 1, unitPrice: 1 }])).body.record.currency, 'PHP');
  const mixed = orderFixture(['USD', 'PHP']);
  await assert.rejects(() => mixed.save([{ quantity: 1, unitPrice: 1 }, { quantity: 1, unitPrice: 1 }]), error => error.status === 400 && /same currency/.test(error.message));
  assert.equal(mixed.state.writes, 0);
  assert.equal(mixed.state.rollbacks, 1);
  const mismatch = orderFixture(['USD']);
  await assert.rejects(() => mismatch.save([{ quantity: 1, unitPrice: 1 }], 'post', 'PHP'), error => error.status === 400);
  assert.equal(mismatch.state.writes, 0);
});

test('linked order updates stop under the source-row lock before changing saved lines', async () => {
  for (const current of [{ invoiced: true }, { delivered: true }]) {
    const fixture = orderFixture(['USD'], current);
    await assert.rejects(() => fixture.save([{ quantity: 1, unitPrice: 1 }], 'put'), error => error.status === 409);
    assert.equal(fixture.state.writes, 0);
    assert.equal(fixture.state.rollbacks, 1);
  }
});


test('sales order numbers are assigned in backend JavaScript without truncating identities above eight digits', async () => {
  const fixture = orderFixture(['USD'], { id: 100000001 });
  const result = await fixture.save([{ quantity: 1, unitPrice: 1 }]);
  assert.equal(result.body.record.number, 'SO-100000001');
  assert.equal(fixture.state.commits, 1);
});
