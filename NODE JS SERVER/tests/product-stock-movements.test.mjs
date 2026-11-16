import assert from 'node:assert/strict';
import test from 'node:test';
import { loadRouterWithDatabase, invokeRoute } from './helpers/load-api.mjs';

function fixture({ product = {}, role = 'admin', inactiveActor = false, failAudit = false, deliveries = [] } = {}) {
  let state = { product: { id: 7, sku: 'P7', name: 'Product 7', description: 'Finished product', unit: 'PCS', stock: '5.000', isActive: true, ...product }, movements: [], audits: [], writes: 0, commits: 0, rollbacks: 0 };
  const actor = { id: 1, username: 'permanent_actor', name: 'Mock actor', role, isActive: !inactiveActor };
  const calls = [];
  let queue = Promise.resolve();
  const dto = row => ({ id: 'manual:' + row.id, movementId: row.id, type: 'manual-' + row.direction, direction: row.direction, quantity: row.quantity, unit: row.unit, stockBefore: row.stockBefore, stockAfter: row.stockAfter, movementDate: row.movementDate, sourceDestination: row.sourceDestination, reference: row.reference, reason: row.reason, createdByUsername: actor.username, createdByName: actor.name, createdAt: row.createdAt, deliveryReceiptId: null, deliveryReceiptNumber: null, orderId: null, orderNumber: null, invoiceId: null, invoiceNumber: null, customerName: null, address: null, receivedBy: null });
  const database = {
    sql: new Proxy({}, { get: (_target, type) => type === 'MAX' ? -1 : (...args) => ({ type, args }) }),
    request(scope) {
      const values = {}, types = {};
      return {
        input(key, type, value) { values[key] = value; types[key] = type; return this; },
        async query(query) {
          calls.push({ query, values: { ...values }, transactional: Boolean(scope) });
          if (query.includes('FROM dbo.ProductStockMovements WITH (UPDLOCK,HOLDLOCK)')) return { recordset: state.movements.filter(row => row.requestKey === values.requestKey).map(row => ({ ...row })) };
          if (query.includes('FROM dbo.SalesUserLogin WITH (UPDLOCK,HOLDLOCK)')) return { recordset: [actor] };
          if (query.includes('FROM dbo.Products')) return { recordset: values.productId === state.product.id ? [{ ...state.product }] : [] };
          if (query.startsWith('UPDATE dbo.Products SET stock=CAST')) {
            assert.ok(scope);
            assert.equal(typeof values.stockAfter, 'string');
            assert.equal(types.stockAfter.type, 'VarChar');
            assert.deepEqual(types.stockAfter.args, [-1]);
            state.product.stock = values.stockAfter; state.writes++;
            return { recordset: [] };
          }
          if (query.startsWith('INSERT INTO dbo.ProductStockMovements')) {
            assert.ok(scope);
            for (const key of ['quantity', 'stockBefore', 'stockAfter']) assert.equal(typeof values[key], 'string');
            assert.match(query, /createdAt\)\s+OUTPUT INSERTED.id[\s\S]*SYSUTCDATETIME\(\)/);
            const row = { ...values, id: state.movements.length + 1, createdAt: '2026-11-16T00:00:00.000Z' };
            state.movements.push(row); state.writes++;
            return { recordset: [{ id: row.id }] };
          }
          if (query.startsWith('INSERT INTO dbo.AuditTrail')) {
            assert.ok(scope);
            if (failAudit) throw new Error('Injected fake audit failure');
            state.audits.push({ ...values }); state.writes++;
            return { recordset: [] };
          }
          if (query.includes('FROM dbo.ProductStockMovements m JOIN')) {
            if (query.includes('UNION ALL')) {
              assert.match(query, /FROM dbo.DeliveryReceipts d JOIN dbo.SalesOrders o[\s\S]*JOIN dbo.DeliveryReceiptItems i/);
              assert.match(query, /CAST\(NULL AS varchar\(60\)\) AS stockBefore,CAST\(NULL AS varchar\(60\)\) AS stockAfter/);
              assert.match(query, /u.username AS createdByUsername,u.name AS createdByName/);
              return { recordset: [...state.movements.map(dto), ...deliveries] };
            }
            return { recordset: state.movements.filter(row => row.id === values.movementId).map(dto) };
          }
          throw new Error('Unexpected fake stock SQL: ' + query.slice(0, 120));
        },
      };
    },
    async transaction(work) {
      const previous = queue;
      let release;
      queue = new Promise(resolve => { release = resolve; });
      await previous;
      const snapshot = structuredClone(state);
      try { const result = await work({ serializable: true }); state.commits++; return result; }
      catch (error) { state = snapshot; state.rollbacks++; throw error; }
      finally { release(); }
    },
  };
  const router = loadRouterWithDatabase('sales', database);
  return {
    get state() { return state; }, calls,
    save(input = {}, overrides = {}) { return invokeRoute(router, 'post', '/products/:id/stock-movements', { params: { id: 7 }, is: () => true, body: { requestKey: 'a'.repeat(32), direction: 'in', quantity: '1.234', movementDate: '2026-11-16', sourceDestination: ' Stock room ', reason: ' Count adjustment ', reference: '', ...input }, testUser: { ...actor, isActive: true, system: 'sales' }, ...overrides }); },
    read(overrides = {}) { return invokeRoute(router, 'get', '/products/:id/stock-movements', { params: { id: 7 }, testUser: { ...actor, isActive: true, system: 'sales' }, ...overrides }); },
  };
}

test('every Sales role records exact manual stock in/out with actor, location, reason and audit', async () => {
  for (const role of ['admin', 'saleshead', 'sales']) {
    const api = fixture({ role });
    const incoming = await api.save();
    assert.equal(incoming.statusCode, 201);
    assert.equal(incoming.body.replayed, false);
    assert.equal(incoming.body.product.stock, '6.234');
    assert.equal(incoming.body.record.stockBefore, '5.000');
    assert.equal(incoming.body.record.stockAfter, '6.234');
    assert.equal(incoming.body.record.quantity, '1.234');
    assert.equal(incoming.body.record.unit, 'PCS');
    assert.equal(incoming.body.record.reference, null);
    assert.equal(incoming.body.record.sourceDestination, 'Stock room');
    assert.equal(incoming.body.record.reason, 'Count adjustment');
    assert.equal(incoming.body.record.createdByUsername, 'permanent_actor');
    const outgoing = await api.save({ requestKey: 'b'.repeat(32), direction: 'out', quantity: '0.234', sourceDestination: 'Customer pickup', reference: 'PICKUP-1' });
    assert.equal(outgoing.body.product.stock, '6.000');
    assert.equal(outgoing.body.record.type, 'manual-out');
    assert.equal(api.state.movements.length, 2);
    assert.equal(api.state.audits[1].module, 'inventory');
    assert.equal(api.state.audits[1].action, 'manual-out');
    assert.equal(api.state.audits[1].userId, 1);
    assert.match(api.calls[0].query, /UPDLOCK,HOLDLOCK/);
    assert.match(api.calls.find(call => call.query.includes('FROM dbo.Products WITH')).query, /UPDLOCK,HOLDLOCK/);
  }
});

test('manual stock calculations retain all three decimals at the SQL range limit and reject overflow', async () => {
  const api = fixture({ product: { stock: '999999999999999.998' } });
  const added = await api.save({ quantity: '0.001' });
  assert.equal(added.body.product.stock, '999999999999999.999');
  await assert.rejects(api.save({ requestKey: 'b'.repeat(32), quantity: '0.001' }), error => error.status === 409 && /limit/.test(error.message));
  const removed = await api.save({ requestKey: 'c'.repeat(32), direction: 'out', quantity: '999999999999999.999' });
  assert.equal(removed.body.product.stock, '0.000');
  assert.equal(removed.body.record.stockBefore, '999999999999999.999');
});

test('same request retries do not repeat stock or audit writes and conflicting reuse is rejected', async () => {
  const api = fixture();
  const first = await api.save({ quantity: '1.23' });
  const writes = api.state.writes;
  const repeat = await api.save({ quantity: '001.230', requestKey: 'A'.repeat(32) });
  assert.equal(repeat.statusCode, 200);
  assert.equal(repeat.body.replayed, true);
  assert.equal(repeat.body.record.id, first.body.record.id);
  assert.equal(api.state.writes, writes);
  assert.equal(api.state.product.stock, '6.230');
  for (const change of [{ quantity: '2' }, { direction: 'out' }, { movementDate: '2026-11-17' }, { sourceDestination: 'Different destination' }, { reason: 'Different reason' }, { reference: 'Different reference' }]) await assert.rejects(api.save({ quantity: '1.230', ...change }), error => error.status === 409 && /request key/.test(error.message));
  assert.equal(api.state.movements.length, 1);
  assert.equal(api.state.audits.length, 1);
});

test('concurrent stock outs serialize and retry races produce only one movement', async () => {
  const api = fixture({ product: { stock: '1.000' } });
  const results = await Promise.allSettled([api.save({ direction: 'out', quantity: '0.750' }), api.save({ requestKey: 'b'.repeat(32), direction: 'out', quantity: '0.750' })]);
  assert.equal(results.filter(row => row.status === 'fulfilled').length, 1);
  assert.equal(results.find(row => row.status === 'rejected').reason.status, 409);
  assert.equal(api.state.product.stock, '0.250');
  assert.equal(api.state.movements.length, 1);
  const duplicate = fixture();
  const retried = await Promise.all([duplicate.save(), duplicate.save()]);
  assert.deepEqual(retried.map(row => row.statusCode), [201, 200]);
  assert.equal(duplicate.state.product.stock, '6.234');
  assert.equal(duplicate.state.movements.length, 1);
  assert.equal(duplicate.state.audits.length, 1);
});

test('invalid quantities, dates and required context fail before stock access', async () => {
  for (const body of [{ quantity: '0' }, { quantity: '-1' }, { quantity: '0.0001' }, { quantity: 1.234 }, { quantity: '1e3' }, { quantity: '1000000000000000' }, { direction: 'transfer' }, { requestKey: 'invalid' }, { movementDate: '2026-02-30' }, { sourceDestination: ' ' }, { reason: ' ' }]) {
    const api = fixture();
    await assert.rejects(api.save(body), error => error.status === 400);
    assert.equal(api.calls.length, 0);
    assert.equal(api.state.writes, 0);
  }
  const foreign = fixture();
  await assert.rejects(foreign.save({}, { testUser: { id: 1, isActive: true, role: 'admin', system: 'purchasing' } }), error => error.status === 403);
  assert.equal(foreign.calls.length, 0);
});

test('inactive or unknown stock/unit, insufficient balances and audit failure do not persist changes', async () => {
  for (const product of [{ isActive: false }, { stock: null }, { stock: '-1.000' }, { unit: '' }]) {
    const api = fixture({ product });
    await assert.rejects(api.save(), error => error.status === 409);
    assert.equal(api.state.writes, 0);
  }
  const inactiveActor = fixture({ inactiveActor: true });
  await assert.rejects(inactiveActor.save(), error => error.status === 403);
  assert.equal(inactiveActor.state.writes, 0);
  const shortage = fixture();
  await assert.rejects(shortage.save({ direction: 'out', quantity: '5.001' }), error => error.status === 409 && /Insufficient/.test(error.message));
  assert.equal(shortage.state.product.stock, '5.000');
  const failed = fixture({ failAudit: true });
  await assert.rejects(failed.save(), /Injected fake audit failure/);
  assert.equal(failed.state.product.stock, '5.000');
  assert.equal(failed.state.movements.length, 0);
  assert.equal(failed.state.audits.length, 0);
  assert.equal(failed.state.commits, 0);
  assert.equal(failed.state.rollbacks, 1);
});

test('history includes actual delivery references without inventing historical stock balances', async () => {
  const delivery = { id: 'delivery:8:9', movementId: null, type: 'delivery-out', direction: 'out', quantity: '0.125', unit: 'PCS', stockBefore: null, stockAfter: null, movementDate: '2026-11-15', sourceDestination: 'Customer snapshot', reference: 'DR-8', reason: null, createdByUsername: 'sales_user', createdByName: 'Sales User', createdAt: '2026-11-15T00:00:00Z', deliveryReceiptId: 8, deliveryReceiptNumber: 'DR-8', orderId: 10, orderNumber: 'SO-10', invoiceId: 11, invoiceNumber: 'SI-11', customerName: 'Customer snapshot', address: 'Actual destination', receivedBy: 'Recipient' };
  const api = fixture({ deliveries: [delivery] });
  await api.save();
  const history = await api.read();
  assert.equal(history.body.product.stock, '6.234');
  assert.equal(history.body.records.length, 2);
  assert.deepEqual(history.body.records[1], delivery);
  assert.equal(api.state.movements.length, 1, 'Delivery history must not create duplicate ledger records.');
  const unknown = fixture({ product: { stock: null, isActive: false }, deliveries: [delivery] });
  const listed = await unknown.read();
  assert.equal(listed.body.product.stock, null);
  assert.equal(listed.body.product.isActive, false);
  assert.equal(listed.body.records[0].stockBefore, null);
  assert.equal(unknown.state.writes, 0);
});
