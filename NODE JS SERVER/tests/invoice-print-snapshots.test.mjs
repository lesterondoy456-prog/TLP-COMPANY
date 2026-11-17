import assert from 'node:assert/strict';
import test from 'node:test';
import { loadRouterWithDatabase, invokeRoute } from './helpers/load-api.mjs';

const financialFields = ['grossAmount', 'lineDiscountAmount', 'headerDiscountAmount', 'discountAmount', 'netAmount', 'vatAmount', 'amount', 'total'];
const snapshotFields = ['buyerTin', 'shipToName', 'vatClass', 'preparedByName'];

// This adapter cannot connect to SQL Server; it exercises the actual Sales handlers.
function fixture({ billToCustomerId = 3, vatClass = 'Vatable', vatAmount = '112.860000', vatCode = 'VS', failAudit = false } = {}) {
  const actor = { id: 1, username: 'mock_sales', name: 'Original invoice author', role: 'sales', system: 'sales', isActive: true };
  const customers = new Map([
    [2, { tin: '111-222-333-000', drName: 'Original customer delivery name' }],
    [3, { tin: ' 001-023-045-000 ', drName: 'Billing customer delivery name' }],
  ]);
  const configuration = { class: vatClass };
  const order = { id: 7, number: 'SO-7', customerId: 2, billToCustomerId, customerName: 'Order customer snapshot', customerAddress: 'Order office snapshot', billToName: 'Billing name snapshot', billToAddress: 'Billing address snapshot', currency: 'PHP', sourceCurrency: 'USD', rate: '55.000000', orderDate: '2026-11-17', status: 'confirmed', vatCode, vatRate: '12.000000', vatInclusive: false, discountType: 'percent', discount: '5.000000', decimalInPrice: 5, decimalInTotalPrice: 2, grossAmount: '1100.000000', lineDiscountAmount: '110.000000', headerDiscountAmount: '49.500000', discountAmount: '159.500000', netAmount: '940.500000', vatAmount, amount: '1053.360000', total: '1053.360000' };
  const items = [{ id: 11, orderId: 7, productId: 5, productName: 'Frozen product', description: 'Frozen description', sku: 'P5', unit: 'PCS', quantity: '2.000', unitPrice: '10.000000', convertedUnitPrice: '550.000000', grossAmount: order.grossAmount, discountAmount: order.discountAmount, netAmount: order.netAmount, vatAmount, amount: order.amount, lineTotal: order.total }];
  let state = { invoice: null, items: [], audits: [], commits: 0, rollbacks: 0 };
  const calls = [];
  const database = {
    sql: new Proxy({}, { get: (_target, type) => type === 'MAX' ? -1 : (...args) => ({ type, args }) }),
    request(scope) {
      const values = {}, types = {};
      return {
        input(key, type, value) { values[key] = value; types[key] = type; return this; },
        async query(query) {
          calls.push({ query, values: { ...values }, transactional: Boolean(scope) });
          if (query.startsWith('SELECT o.id')) return { recordset: [{ ...order, invoiced: Boolean(state.invoice) }] };
          if (query.startsWith('SELECT productId,productName') && query.includes('FROM dbo.SalesOrderItems')) return { recordset: structuredClone(items) };
          if (query.startsWith('SELECT buyer.tin AS buyerTin')) {
            assert.ok(scope);
            assert.equal(values.buyerId, order.billToCustomerId ?? order.customerId);
            assert.equal(values.customerId, order.customerId);
            assert.match(query, /buyer\.id=@buyerId WHERE customer\.id=@customerId/);
            return { recordset: [{ buyerTin: customers.get(values.buyerId)?.tin ?? null, shipToName: customers.get(values.customerId)?.drName ?? null }] };
          }
          if (query.startsWith('SELECT [class] FROM dbo.ConfigVatCodes')) { assert.ok(scope); assert.equal(values.code, order.vatCode); return { recordset: configuration.class == null ? [] : [{ class: configuration.class }] }; }
          if (query.startsWith('INSERT INTO dbo.SalesInvoices')) {
            assert.ok(scope);
            for (const field of snapshotFields) {
              assert.equal(types[field].type, 'NVarChar');
              assert.deepEqual(types[field].args, [-1]);
              assert.ok(query.includes('@' + field), field);
            }
            for (const field of financialFields) assert.equal(values[field], order[field], 'Saved invoice money remains authoritative: ' + field);
            state.invoice = { ...values, id: 9, paidAmount: '0.000000', number: null };
            return { recordset: [{ id: 9 }] };
          }
          if (query.startsWith('UPDATE dbo.SalesInvoices SET number=')) { state.invoice.number = values.number; return { recordset: [] }; }
          if (query.startsWith('INSERT INTO dbo.SalesInvoiceItems')) { assert.ok(scope); state.items = items.map(item => ({ ...item, id: 101, orderItemId: item.id, invoiceId: values.invoiceId })); return { recordset: [] }; }
          if (query.startsWith('UPDATE dbo.SalesInvoices SET paidAmount=')) {
            assert.ok(scope);
            assert.doesNotMatch(query, /buyerTin|shipToName|vatClass|preparedByName|total=/);
            state.invoice.paidAmount = values.paidAmount;
            return { recordset: [{ id: 9 }] };
          }
          if (query.startsWith('INSERT INTO dbo.AuditTrail')) { assert.ok(scope); if (failAudit) throw new Error('Mock invoice audit failure'); state.audits.push({ ...values }); return { recordset: [] }; }
          if (query.startsWith('SELECT i.id')) {
            assert.match(query, /i\.buyerTin,i\.shipToName,i\.vatClass,COALESCE\(i\.preparedByName,invoiceCreator\.name\) AS preparedByName/);
            assert.doesNotMatch(query, /JOIN dbo\.(?:Customers|ConfigVatCodes)|COALESCE\(i\.(?:buyerTin|shipToName|vatClass)/);
            for (const field of financialFields) assert.ok(query.includes('CONVERT(varchar(60),i.' + field + ') AS ' + field), field);
            return { recordset: state.invoice ? [{ ...order, ...state.invoice, preparedByName: state.invoice.preparedByName ?? actor.name }] : [] };
          }
          if (query.startsWith('SELECT productId,productName') && query.includes('FROM dbo.SalesInvoiceItems')) return { recordset: structuredClone(state.items) };
          throw new Error('Unexpected fake invoice SQL: ' + query.slice(0, 120));
        },
      };
    },
    async transaction(work) {
      const previous = structuredClone(state);
      try { const result = await work({ serializable: true }); state.commits++; return result; }
      catch (error) { state = previous; state.rollbacks++; throw error; }
    },
  };
  const router = loadRouterWithDatabase('sales', database);
  return {
    actor, customers, configuration, order, calls,
    get state() { return state; },
    invoke(method, path, body) { return invokeRoute(router, method, path, { params: { id: 9 }, is: () => true, body, testUser: actor }); },
    issue(body = {}) { return this.invoke('post', '/sales-invoices', { orderId: 7, invoiceDate: '2026-11-17', dueDate: '2026-12-17', ...body }); },
  };
}

test('invoice issuance captures billing TIN, original-customer DR name, configured class and author inside the document transaction', async () => {
  const api = fixture();
  const response = await api.issue({ buyerTin: 'forged', shipToName: 'forged', vatClass: 'Vat-Exempt', preparedByName: 'forged', total: '0', discountAmount: '0' });
  assert.equal(response.statusCode, 201);
  assert.equal(response.body.record.buyerTin, '001-023-045-000');
  assert.equal(response.body.record.shipToName, 'Original customer delivery name');
  assert.equal(response.body.record.vatClass, 'Vatable');
  assert.equal(response.body.record.preparedByName, 'Original invoice author');
  assert.equal(response.body.record.number, 'SI-00000009');
  assert.equal(response.body.record.discountAmount, '159.500000');
  assert.equal(response.body.record.items[0].quantity, '2.000');
  assert.equal(api.state.commits, 1);
  assert.equal(api.state.audits.length, 1);
});

test('invoice reads and payment responses preserve print snapshots after Customer, VAT configuration, author and order-quantity changes', async () => {
  const api = fixture();
  await api.issue();
  const expected = Object.fromEntries([...snapshotFields, ...financialFields].map(field => [field, api.state.invoice[field]]));
  api.customers.get(3).tin = 'CHANGED-TIN'; api.customers.get(2).drName = 'Changed delivery name';
  api.configuration.class = 'Vat-Exempt'; api.actor.name = 'Changed account name';
  api.order.total = '999.000000'; api.order.grossAmount = '999.000000';
  const beforeReads = api.calls.length;
  const list = await api.invoke('get', '/sales-invoices');
  const detail = await api.invoke('get', '/sales-invoices/:id');
  const payment = await api.invoke('patch', '/sales-invoices/:id/payment', { paidAmount: '0.000001' });
  for (const record of [list.body.records[0], detail.body.record, payment.body.record]) for (const [field, value] of Object.entries(expected)) assert.equal(record[field], value, field);
  assert.equal(payment.body.record.paidAmount, '0.000001');
  assert.equal(detail.body.record.items[0].lineTotal, '1053.360000');
  assert.equal(api.calls.slice(beforeReads).some(call => /FROM dbo\.(?:Customers|ConfigVatCodes)/.test(call.query)), false);
});

test('legacy Bill To fallback uses the original customer while absent identity values and unknown classes stay NULL', async () => {
  const api = fixture({ billToCustomerId: null, vatClass: null });
  const response = await api.issue();
  assert.equal(response.body.record.buyerTin, '111-222-333-000');
  assert.equal(response.body.record.shipToName, 'Original customer delivery name');
  assert.equal(response.body.record.vatClass, null);
  const blanks = fixture({ vatCode: null });
  blanks.customers.get(3).tin = ' '; blanks.customers.get(2).drName = ' ';
  const blank = await blanks.issue();
  for (const field of ['buyerTin', 'shipToName', 'vatClass']) assert.equal(blank.body.record[field], null);
  assert.equal(blanks.calls.some(call => call.query.includes('FROM dbo.ConfigVatCodes')), false);
});

test('exempt and zero-rated classifications require a compatible saved VAT amount and never alter invoice money', async () => {
  for (const vatClass of ['Vat-Exempt', 'Zero Rated']) for (const vatAmount of ['0.000000', '0.000001']) {
    const api = fixture({ vatClass, vatAmount });
    const response = await api.issue();
    assert.equal(response.body.record.vatClass, vatAmount === '0.000000' ? vatClass : null);
    assert.equal(response.body.record.vatAmount, vatAmount);
    assert.equal(response.body.record.total, '1053.360000');
  }
  const unknown = fixture({ vatClass: 'Unknown classification' });
  assert.equal((await unknown.issue()).body.record.vatClass, null);
});

test('legacy invoices retain unknown print fields without live fallbacks and failed issuance rolls snapshots back with the document', async () => {
  const legacy = fixture();
  await legacy.issue();
  for (const field of snapshotFields) legacy.state.invoice[field] = null;
  legacy.actor.name = 'Legacy invoice creator';
  const beforeRead = legacy.calls.length;
  const record = (await legacy.invoke('get', '/sales-invoices/:id')).body.record;
  for (const field of ['buyerTin', 'shipToName', 'vatClass']) assert.equal(record[field], null);
  assert.equal(record.preparedByName, 'Legacy invoice creator');
  assert.equal(legacy.calls.slice(beforeRead).some(call => /FROM dbo\.(?:Customers|ConfigVatCodes)/.test(call.query)), false);
  const failed = fixture({ failAudit: true });
  await assert.rejects(failed.issue(), /Mock invoice audit failure/);
  assert.equal(failed.state.invoice, null);
  assert.deepEqual(failed.state.items, []);
  assert.deepEqual(failed.state.audits, []);
  assert.equal(failed.state.commits, 0);
  assert.equal(failed.state.rollbacks, 1);
});
