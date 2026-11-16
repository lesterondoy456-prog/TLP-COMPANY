import assert from 'node:assert/strict';
import test from 'node:test';
import { loadRouterWithDatabase, invokeRoute } from './helpers/load-api.mjs';
import { calculateSalesOrder } from '../../SalesSystem/src/salesPricing.mjs';

const fields = ['grossAmount', 'lineDiscountAmount', 'headerDiscountAmount', 'discountAmount', 'netAmount', 'vatAmount', 'amount', 'total'];
const qUnits = value => { const [whole, fraction = ''] = String(value).split('.'); return BigInt(whole) * 1000n + BigInt(fraction.padEnd(3, '0')); };
const qText = units => `${units / 1000n}.${(units % 1000n).toString().padStart(3, '0')}`;

function fixture({ invoiced = true, delivered = false, failAudit = false, places = 2, inclusive = false, quantity = '2.000', price = '10.000000', rate = '55.000000', lineDiscount = '10.000000', headerDiscount = '5.000000' } = {}) {
  const actor = { id: 1, username: 'sales_user', name: 'Current actor', role: 'sales', system: 'sales', isActive: true };
  const source = { id: 11, orderId: 7, productId: 3, productName: 'Product snapshot', sku: 'P3', description: 'Original description', unit: 'PCS', quantity, unitPrice: price, discountRate: lineDiscount, currency: 'USD', refNumber: 'REF', quotationNumber: 'QUOTE', deliveryDate: null };
  const pricing = { items: [source], rate, vatRate: '12.000000', vatInclusive: inclusive, discountType: 'percent', discount: headerDiscount, decimalInTotalPrice: places };
  const calculated = calculateSalesOrder(pricing);
  const initialOrder = { id: 7, number: 'SO-7', customerId: 2, customerName: 'Customer snapshot', customerAddress: 'Office snapshot', billToName: 'Bill To snapshot', billToAddress: 'Billing snapshot', orderDate: '2026-11-16', expectedDeliveryDate: '2026-12-01', currency: 'PHP', sourceCurrency: 'USD', rate, vatRate: '12.000000', vatCode: 'VAT12', vatInclusive: inclusive, discountType: 'percent', discount: headerDiscount, decimalInTotalPrice: places, decimalInPrice: 6, notes: 'Immutable header', preparedByName: 'Original actor', status: 'confirmed', ...Object.fromEntries(fields.map(key => [key, calculated[key]])) };
  let state = { order: initialOrder, items: calculated.items, product: { id: 3, sku: 'P3', stock: '100.000', unit: 'PCS', isActive: true }, invoice: null, invoiceItems: [], delivery: null, deliveryItems: [], shipping: null, audits: [], writes: [], commits: 0, rollbacks: 0 };
  if (invoiced) { state.invoice = { id: 9, orderId: 7, number: 'SI-9', invoiceDate: '2026-11-16', dueDate: '2026-12-16', paidAmount: '0.000000', ...Object.fromEntries(fields.map(key => [key, calculated[key]])) }; state.invoiceItems = calculated.items.map(item => ({ ...item, id: 101, orderItemId: item.id, invoiceId: 9 })); }
  if (delivered) { state.delivery = { id: 10, orderId: 7, number: 'DR-10', deliveryDate: '2026-11-16', address: 'Actual destination', receivedBy: 'Recipient', ...Object.fromEntries(fields.map(key => [key, calculated[key]])) }; state.deliveryItems = calculated.items.map(item => ({ ...item, id: 201, orderItemId: item.id, deliveryReceiptId: 10 })); state.shipping = { id: 12, invoiceId: 9, orderId: 7, number: 'SHI-12' }; }
  const calls = [];
  const dtoItems = () => state.items.map(item => {
    const invoicedUnits = state.invoiceItems.filter(row => row.orderItemId === item.id).reduce((sum, row) => sum + qUnits(row.quantity), 0n);
    const deliveredUnits = state.deliveryItems.filter(row => row.orderItemId === item.id).reduce((sum, row) => sum + qUnits(row.quantity), 0n);
    return { ...item, invoicedQuantity: qText(invoicedUnits), deliveredQuantity: qText(deliveredUnits), remainingInvoiceQuantity: qText(qUnits(item.quantity) - invoicedUnits), remainingDeliveryQuantity: qText(qUnits(item.quantity) - deliveredUnits) };
  });
  const database = {
    sql: new Proxy({}, { get: (_target, type) => type === 'MAX' ? -1 : (...args) => ({ type, args }) }),
    request(scope) {
      const values = {};
      return {
        input(key, _type, value) { values[key] = value; return this; },
        async query(query) {
          calls.push({ query, values: { ...values }, transactional: Boolean(scope) });
          if (query.startsWith('SELECT o.id')) return { recordset: [{ ...state.order, invoiced: Boolean(state.invoice), delivered: Boolean(state.delivery) }] };
          if (query.startsWith('SELECT productId,productName') && query.includes('FROM dbo.SalesOrderItems oi')) {
            assert.match(query, /CAST\(SUM\(s.quantity\) AS DECIMAL\(18,3\)\)/);
            assert.match(query, /CAST\(SUM\(d.quantity\) AS DECIMAL\(18,3\)\)/);
            return { recordset: dtoItems() };
          }
          if (query.startsWith('UPDATE dbo.SalesOrders SET grossAmount')) {
            assert.ok(scope);
            assert.deepEqual(Object.keys(values).sort(), ['id', ...fields].sort());
            state.order = { ...state.order, ...values }; state.writes.push('order-totals'); return { recordset: [] };
          }
          if (query.startsWith('UPDATE dbo.SalesOrderItems SET quantity=')) {
            assert.ok(scope);
            assert.doesNotMatch(query, /unitPrice=|productId=|sku=|description=|unit=|discountRate=|refNumber=|convertedUnitPrice=/);
            state.items = state.items.map(item => item.id === values.id ? { ...item, ...values } : item); state.writes.push('item-quantity'); return { recordset: [] };
          }
          if (query.startsWith('INSERT INTO dbo.SalesInvoices')) {
            assert.ok(scope);
            state.invoice = { ...values, id: 9, number: null, paidAmount: '0.000000' }; state.writes.push('invoice'); return { recordset: [{ id: 9 }] };
          }
          if (query.startsWith('UPDATE dbo.SalesInvoices SET number=')) { state.invoice.number = values.number; return { recordset: [] }; }
          if (query.startsWith('INSERT INTO dbo.SalesInvoiceItems')) {
            assert.ok(scope); assert.match(query, /SELECT @invoiceId,id,[\s\S]* FROM dbo.SalesOrderItems WHERE orderId=@orderId/);
            state.invoiceItems = state.items.map(item => ({ ...item, id: 101, orderItemId: item.id, invoiceId: values.invoiceId })); state.writes.push('invoice-items'); return { recordset: [] };
          }
          if (query.startsWith('UPDATE dbo.Products SET stock=stock-')) {
            assert.ok(scope); const next = qUnits(state.product.stock) - qUnits(values.quantity); if (next < 0n) return { recordset: [] };
            state.product.stock = qText(next); state.writes.push('delivery-stock'); return { recordset: [{ id: 3 }] };
          }
          if (query.startsWith('INSERT INTO dbo.DeliveryReceipts')) { assert.ok(scope); state.delivery = { ...values, id: 10, number: null }; state.writes.push('delivery'); return { recordset: [{ id: 10 }] }; }
          if (query.startsWith('UPDATE dbo.DeliveryReceipts SET number=')) { state.delivery.number = values.number; return { recordset: [] }; }
          if (query.startsWith('INSERT INTO dbo.DeliveryReceiptItems')) {
            assert.ok(scope); assert.match(query, /SELECT @deliveryReceiptId,id,[\s\S]* FROM dbo.SalesOrderItems WHERE orderId=@orderId/);
            state.deliveryItems = state.items.map(item => ({ ...item, id: 201, orderItemId: item.id, deliveryReceiptId: values.deliveryReceiptId })); state.writes.push('delivery-items'); return { recordset: [] };
          }
          if (query.startsWith('SELECT i.id')) {
            for (const key of fields.filter(key => key !== 'total')) assert.ok(query.includes('CONVERT(varchar(60),i.' + key + ') AS ' + key));
            return { recordset: state.invoice ? [{ ...state.order, ...state.invoice }] : [] };
          }
          if (query.startsWith('SELECT d.id')) {
            assert.match(query, /CONVERT\(varchar\(60\),d.amount\) AS total/);
            return { recordset: state.delivery ? [{ ...state.order, ...state.delivery, total: state.delivery.amount }] : [] };
          }
          if (query.startsWith('SELECT s.id')) {
            assert.match(query, /CONVERT\(varchar\(60\),i.amount\) AS amount/);
            return { recordset: state.shipping ? [{ ...state.order, ...state.invoice, ...state.shipping, total: state.invoice.total }] : [] };
          }
          if (query.startsWith('SELECT productId,productName') && query.includes('FROM dbo.SalesInvoiceItems')) { assert.equal(values.invoiceId, 9); return { recordset: state.invoiceItems.map(item => ({ ...item })) }; }
          if (query.startsWith('SELECT productId,productName') && query.includes('FROM dbo.DeliveryReceiptItems')) { assert.equal(values.deliveryReceiptId, 10); return { recordset: state.deliveryItems.map(item => ({ ...item })) }; }
          if (query.startsWith('SELECT id,sku,name,description,unit') && query.includes('FROM dbo.Products')) return { recordset: [{ ...state.product }] };
          if (query.includes('UNION ALL') && query.includes('FROM dbo.ProductStockMovements')) {
            assert.match(query, /JOIN dbo.DeliveryReceiptItems i ON i.deliveryReceiptId=d.id/); assert.doesNotMatch(query, /JOIN dbo.SalesOrderItems/);
            return { recordset: state.deliveryItems.map(item => ({ id: 'delivery:10:' + item.id, quantity: item.quantity, stockBefore: null, stockAfter: null, sourceDestination: state.order.customerName, address: state.delivery.address, receivedBy: state.delivery.receivedBy })) };
          }
          if (query.startsWith('INSERT INTO dbo.AuditTrail')) { assert.ok(scope); if (failAudit) throw new Error('Injected audit rollback'); state.audits.push({ ...values }); return { recordset: [] }; }
          throw new Error('Unexpected fake snapshot SQL: ' + query.slice(0, 130));
        },
      };
    },
    async transaction(work) {
      const snapshot = structuredClone(state);
      try { const result = await work({ serializable: true }); state.commits++; return result; }
      catch (error) { state = snapshot; state.rollbacks++; throw error; }
    },
  };
  const router = loadRouterWithDatabase('sales', database);
  return {
    get state() { return state; }, calls, pricing,
    invoke(method, route, body, id = 7) { return invokeRoute(router, method, route, { params: { id }, is: () => true, body, testUser: actor }); },
    update(quantity, extra = {}) { return this.invoke('patch', '/sales-orders/:id/quantities', { items: [{ id: 11, quantity }], ...extra }); },
  };
}

test('post-invoice quantity changes preserve item identity, frozen SI/DR/shipping snapshots and actual stock', async () => {
  const api = fixture({ delivered: true });
  const invoiceBefore = structuredClone(api.state.invoice), invoiceItems = structuredClone(api.state.invoiceItems), deliveryBefore = structuredClone(api.state.delivery), deliveryItems = structuredClone(api.state.deliveryItems);
  const originalItem = structuredClone(api.state.items[0]);
  const updated = await api.update('3.000');
  const expected = calculateSalesOrder({ ...api.pricing, items: [{ ...originalItem, quantity: '3.000' }] });
  for (const key of fields) assert.equal(updated.body.record[key], expected[key], key);
  assert.equal(updated.body.record.notes, 'Immutable header');
  assert.equal(updated.body.record.preparedByName, 'Original actor');
  for (const key of ['id', 'productId', 'unitPrice', 'convertedUnitPrice', 'discountRate', 'description', 'sku', 'unit', 'refNumber']) assert.equal(updated.body.record.items[0][key], originalItem[key]);
  assert.equal(updated.body.record.items[0].invoicedQuantity, '2.000');
  assert.equal(updated.body.record.items[0].deliveredQuantity, '2.000');
  assert.equal(updated.body.record.items[0].remainingInvoiceQuantity, '1.000');
  assert.equal(updated.body.record.items[0].remainingDeliveryQuantity, '1.000');
  assert.deepEqual(api.state.invoice, invoiceBefore); assert.deepEqual(api.state.invoiceItems, invoiceItems);
  assert.deepEqual(api.state.delivery, deliveryBefore); assert.deepEqual(api.state.deliveryItems, deliveryItems);
  assert.equal(api.state.product.stock, '100.000');
  for (const route of ['/sales-invoices/:id', '/delivery-receipts/:id', '/shipping-invoices/:id']) {
    const result = await api.invoke('get', route, undefined);
    assert.equal(result.body.record.items[0].quantity, '2.000');
    assert.equal(result.body.record.total, invoiceBefore.total);
    assert.equal(result.body.record.items[0].amount, invoiceItems[0].amount);
  }
  const history = await api.invoke('get', '/products/:id/stock-movements', undefined, 3);
  assert.equal(history.body.records[0].quantity, '2.000');
  assert.equal(history.body.records[0].stockBefore, null);
  assert.deepEqual(api.state.writes, ['order-totals', 'item-quantity']);
});

test('quantity floor is the larger actual invoice or delivery amount, including three-decimal boundaries', async () => {
  for (const [invoiceQty, deliveredQty] of [['1.001', '1.002'], ['1.002', '1.001']]) {
    const api = fixture({ delivered: true }); api.state.invoiceItems[0].quantity = invoiceQty; api.state.deliveryItems[0].quantity = deliveredQty;
    await assert.rejects(api.update('1.001'), error => error.status === 409 && /already invoiced or delivered/.test(error.message));
    assert.equal(api.state.writes.length, 0);
    const allowed = await api.update('1.002');
    assert.equal(allowed.body.record.items[0].quantity, '1.002');
  }
});

test('quantity-only API rejects changed headers, prices, item identities, missing lines and malformed quantities', async () => {
  const attempts = [
    { items: [{ id: 11, quantity: '3' }], notes: 'tampered header' },
    { items: [{ id: 11, quantity: '3', unitPrice: '0' }] },
    { items: [{ id: 12, quantity: '3' }] }, { items: [] },
    { items: [{ id: 11, quantity: '3' }, { id: 11, quantity: '3' }] },
    { items: [{ id: 11, quantity: '0' }] }, { items: [{ id: 11, quantity: '1.0001' }] },
    { items: [{ id: 11, quantity: 3 }] }, { items: [{ id: 11, quantity: '1000000.001' }] },
  ];
  for (const body of attempts) { const api = fixture(); await assert.rejects(api.invoke('patch', '/sales-orders/:id/quantities', body), error => [400, 409].includes(error.status)); assert.equal(api.state.writes.length, 0); }
  const uninvoiced = fixture({ invoiced: false });
  await assert.rejects(uninvoiced.update('3'), error => error.status === 409 && /regular sales order form/.test(error.message));
  const fullEdit = fixture();
  await assert.rejects(fullEdit.invoke('put', '/sales-orders/:id', { customerId: 999, orderDate: '2026-11-16', notes: 'forged', status: 'confirmed', items: [{ productId: 3, quantity: '3', unitPrice: '0' }] }), error => error.status === 409);
  assert.equal(fullEdit.state.writes.length, 0);
});

test('quantity recalculation matches the established FX, discount and inclusive/exclusive VAT formulas at zero and six places', async () => {
  for (const places of [0, 2, 6]) for (const inclusive of [false, true]) {
    const api = fixture({ places, inclusive, quantity: '0.333', price: '0.115300', rate: '55.000000' });
    const result = await api.update('1.001');
    const expected = calculateSalesOrder({ ...api.pricing, items: [{ ...api.pricing.items[0], quantity: '1.001' }] });
    for (const key of fields) assert.equal(result.body.record[key], expected[key], key);
    for (const key of ['grossAmount', 'lineDiscountAmount', 'headerDiscountAmount', 'discountAmount', 'netAmount', 'vatAmount', 'amount', 'lineTotal']) assert.equal(result.body.record.items[0][key], expected.items[0][key], key);
    assert.equal(api.calls.some(call => /FROM dbo.Config|FROM dbo.Products/.test(call.query)), false, 'Saved pricing must not change with later Configuration or Product updates.');
  }
});

test('snapshot creation and stock changes commit atomically while audit failures roll everything back', async () => {
  const api = fixture({ invoiced: false });
  const invoice = await api.invoke('post', '/sales-invoices', { orderId: 7, invoiceDate: '2026-11-16', dueDate: '2026-12-16' });
  assert.equal(invoice.statusCode, 201); assert.equal(api.state.invoiceItems[0].orderItemId, 11); assert.equal(api.state.invoiceItems[0].quantity, '2.000');
  const delivery = await api.invoke('post', '/delivery-receipts', { orderId: 7, deliveryDate: '2026-11-16', receivedBy: 'Recipient', address: 'Actual destination' });
  assert.equal(delivery.statusCode, 201); assert.equal(api.state.deliveryItems[0].orderItemId, 11); assert.equal(api.state.deliveryItems[0].quantity, '2.000');
  assert.equal(api.state.product.stock, '98.000');
  const failedInvoice = fixture({ invoiced: false, failAudit: true });
  await assert.rejects(failedInvoice.invoke('post', '/sales-invoices', { orderId: 7, invoiceDate: '2026-11-16', dueDate: '2026-12-16' }), /Injected audit rollback/);
  assert.equal(failedInvoice.state.invoice, null); assert.equal(failedInvoice.state.invoiceItems.length, 0);
  const failedDelivery = fixture({ invoiced: false, failAudit: true });
  await assert.rejects(failedDelivery.invoke('post', '/delivery-receipts', { orderId: 7, deliveryDate: '2026-11-16', receivedBy: 'Recipient', address: 'Actual destination' }), /Injected audit rollback/);
  assert.equal(failedDelivery.state.delivery, null); assert.equal(failedDelivery.state.deliveryItems.length, 0); assert.equal(failedDelivery.state.product.stock, '100.000');
  const failedEdit = fixture({ failAudit: true });
  const original = structuredClone(failedEdit.state.order);
  await assert.rejects(failedEdit.update('3.000'), /Injected audit rollback/);
  assert.deepEqual(failedEdit.state.order, original); assert.equal(failedEdit.state.items[0].quantity, '2.000');
});
