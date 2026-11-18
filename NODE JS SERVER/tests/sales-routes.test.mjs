import assert from 'node:assert/strict';
import test from 'node:test';
import { loadRouterWithDatabase, invokeRoute } from './helpers/load-api.mjs';

// This adapter receives SQL text/parameters in memory. It cannot open SQL Server.
const step = (match, rows = [], check) => ({ match, result: Array.isArray(rows) ? { recordset: rows } : rows, check });
const audit = () => step(/INSERT INTO dbo\.AuditTrail/, [], (values, _state, query) => {
  assert.match(query, /createdAt/);
  assert.match(query, /SYSUTCDATETIME\(\)/);
  assert.equal(values.system, 'sales');
  assert.equal(values.userId, 1);
});
function routeFixture(steps, initial = {}) {
  const pending = [...steps];
  const state = { commits: 0, rollbacks: 0, ...initial };
  const sql = new Proxy({}, { get: (_target, type) => (...args) => ({ type, args }) });
  const database = {
    sql,
    request() {
      const values = {};
      return {
        input(key, _type, value) { values[key] = value; return this; },
        async query(query) {
          assert.doesNotMatch(query, /dbo\.ProductOffices\b/, 'Product Office associations must never be queried or saved.');
          assert.doesNotMatch(query, /\[(?:color|thickness|planType)\]|@(?:color|thickness|planType)\b|\beolDate\b|\beolRemarks\b/i, 'Removed Product fields must not be queried or saved.');
          for (const statement of query.split(';')) {
            if (/\b(?:FROM|INTO|UPDATE)\s+dbo\.Customers\b/i.test(statement)) assert.doesNotMatch(statement, /\bcode\b/i, 'Customer codes are not stored or queried.');
          }
          if (query.startsWith('SELECT c.[id]') && !query.includes('UPDLOCK,HOLDLOCK')) {
            assert.match(query, /CONVERT\(varchar\(10\),\(SELECT MAX\(i\.invoiceDate\)[\s\S]*FROM dbo\.SalesInvoices i JOIN dbo\.SalesOrders o ON o\.id=i\.orderId[\s\S]*WHERE o\.customerId=c\.id\),23\) AS lastSalesDate/);
            assert.doesNotMatch(query, /GETDATE|COALESCE\([^)]*invoiceDate/i, 'A customer without an invoice has no Last Sales Date.');
          }
          const next = pending.shift();
          assert.ok(next, 'Unexpected SQL: ' + query);
          assert.match(query, next.match);
          next.check?.(values, state, query);
          return next.result;
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
    invoke(method, path, body) {
      return invokeRoute(router, method, path, {
        body, params: { id: 7 }, query: {}, is: () => true,
        testUser: { id: 1, name: 'Mock actor', system: 'sales', role: 'admin', isActive: true },
      });
    },
    done() { assert.equal(pending.length, 0, 'The handler did not execute its expected queries.'); },
  };
}
const customer = {
  id: 7, name: 'Customer', shortName: 'C', businessStyle: 'Trade', address: 'Office',
  salesName: 'Sales name', drName: 'DR name', vatCode: 'VS', salesInChargeId: null, salesInCharge: '', isActive: true,
  lastSalesDate: null,
};
const product = {
  id: 7, sku: 'P7', name: 'Product', description: 'Old', unit: 'PCS', secondaryUnit: '', currency: 'USD',
  category: '', stock: 5, price: '0.115300', productHeaderId: null, inventorySetup: 'monthly', isActive: true,
};
const productResult = record => ({ recordsets: [[record], [{ productId: 7, name: 'Cut' }], [], []] });

test('Product direct writes reject multiple selected customers before changing child rows', async () => {
  const body = { sku: 'P7', unit: 'PCS', currency: 'USD', customerApprovals: [{ customerId: 20 }, { customerId: 21 }] };
  for (const method of ['post', 'put']) {
    const fixture = routeFixture(method === 'put' ? [step(/SELECT p\.id/, productResult(product))] : []);
    await assert.rejects(() => fixture.invoke(method, method === 'post' ? '/products' : '/products/:id', body), error => error.status === 400 && /only one customer/.test(error.message));
    assert.equal(fixture.state.commits, 0);
    fixture.done();
  }
});

test('Unrelated Product edits retain every historical customer link without rewriting approvals', async () => {
  const approvals = [{ productId: 7, customerId: 20, customerName: 'Historical A', approvalDate: null, approvalRemarks: 'First approval' }, { productId: 7, customerId: 21, customerName: 'Historical B', approvalDate: null, approvalRemarks: 'Second approval' }];
  const rows = { recordsets: [[product], [{ productId: 7, name: 'Cut' }], approvals, []] };
  const fixture = routeFixture([
    step(/SELECT p\.id/, rows), step(/SELECT id FROM dbo.Customers/, [{ id: 20 }]), step(/SELECT id FROM dbo.Customers/, [{ id: 21 }]),
    step(/UPDATE dbo.Products/, [], values => assert.equal(values.revision, '2')), audit(), step(/SELECT p\.id/, rows),
  ]);
  const result = await fixture.invoke('put', '/products/:id', { revision: '2' });
  assert.deepEqual(result.body.record.customerApprovals.map(row => row.customerId), [20, 21]);
  assert.equal(fixture.state.commits, 1);
  fixture.done();
});

test('Customer list and detail return Last Sales Date from the latest customer invoice, or NULL without sales', async () => {
  const records = [{ ...customer, lastSalesDate: null }, { ...customer, id: 8, name: 'Customer with invoices', lastSalesDate: '2026-11-14' }];
  const list = routeFixture([step(/FROM dbo\.Customers/, records), step(/FROM dbo\.CustomerDeliveryAddresses/, [])]);
  const response = await list.invoke('get', '/customers', {});
  assert.deepEqual(response.body.records.map(row => row.lastSalesDate), [null, '2026-11-14']);
  list.done();
  for (const lastSalesDate of [null, '2026-11-14']) {
    const detail = routeFixture([step(/FROM dbo\.Customers/, [{ ...customer, lastSalesDate }]), step(/FROM dbo\.CustomerDeliveryAddresses/, [])]);
    const record = await detail.invoke('get', '/customers/:id', {});
    assert.equal(record.body.record.lastSalesDate, lastSalesDate);
    detail.done();
  }
});

test('customer creation uses its row identity and saves ordered delivery addresses atomically', async () => {
  const fixture = routeFixture([
    step(/INSERT INTO dbo\.Customers/, [{ id: 7 }], (values, _state, query) => { assert.equal(Object.hasOwn(values, 'code'), false); assert.equal(values.isActive, true); assert.equal(values.discount, null); assert.equal(values.discountType, null); assert.equal(values.cpnumber, null); assert.match(query, /createdAt,updatedAt/); }),
    step(/DELETE FROM dbo\.CustomerDeliveryAddresses/),
    step(/INSERT INTO dbo\.CustomerDeliveryAddresses/, [], values => { assert.equal(values.position, 0); assert.equal(values.address, 'Delivery A'); }),
    step(/INSERT INTO dbo\.CustomerDeliveryAddresses/, [], values => { assert.equal(values.position, 1); assert.equal(values.address, 'Delivery B'); }),
    audit(), step(/FROM dbo\.Customers/, [customer]),
    step(/FROM dbo\.CustomerDeliveryAddresses/, [{ address: 'Delivery A' }, { address: 'Delivery B' }]),
  ]);
  const response = await fixture.invoke('post', '/customers', { ...customer, code: 'ignored legacy customer code', isActive: false, deliveryAddresses: ['Delivery A', 'Delivery B'] });
  assert.equal(response.statusCode, 201);
  assert.equal(response.body.record.id, 7);
  assert.equal(Object.hasOwn(response.body.record, 'code'), false);
  assert.equal(response.body.record.lastSalesDate, null);
  assert.deepEqual(response.body.record.deliveryAddresses, ['Delivery A', 'Delivery B']);
  assert.equal(fixture.state.commits, 1);
  fixture.done();
});

test('None discount type clears a stale numeric discount on Customer create and update', async () => {
  const saved = { ...customer, discountType: null, discount: null };
  const create = routeFixture([
    step(/INSERT INTO dbo\.Customers/, [{ id: 7 }], values => { assert.equal(values.discountType, null); assert.equal(values.discount, null); assert.equal(Object.hasOwn(values, 'code'), false); }),
    step(/DELETE FROM dbo\.CustomerDeliveryAddresses/), audit(),
    step(/FROM dbo\.Customers/, [saved]), step(/FROM dbo\.CustomerDeliveryAddresses/, []),
  ]);
  const created = await create.invoke('post', '/customers', { ...customer, discountType: null, discount: 4 });
  assert.equal(created.body.record.discount, null);
  assert.equal(create.state.commits, 1);
  create.done();

  const update = routeFixture([
    step(/UPDLOCK,HOLDLOCK/, [{ ...customer, discountType: 'percent', discount: 25 }]), step(/FROM dbo\.CustomerDeliveryAddresses/, []),
    step(/UPDATE dbo\.Customers/, [], values => { assert.equal(values.discountType, null); assert.equal(values.discount, null); assert.equal(Object.hasOwn(values, 'code'), false); }),
    audit(), step(/FROM dbo\.Customers/, [saved]), step(/FROM dbo\.CustomerDeliveryAddresses/, []),
  ]);
  const updated = await update.invoke('put', '/customers/:id', { discountType: '', discount: 4, code: 'ignored legacy customer code' });
  assert.equal(updated.body.record.discount, null);
  assert.equal(updated.body.record.discountType, null);
  assert.equal(Object.hasOwn(updated.body.record, 'code'), false);
  assert.equal(update.state.commits, 1);
  update.done();
});

test('partial customer edits preserve legacy assignments and omitted address collections', async () => {
  const legacy = { ...customer, salesInCharge: 'Legacy Person', _salesInChargeSnapshot: 'Legacy Person' };
  const fixture = routeFixture([
    step(/UPDLOCK,HOLDLOCK/, [legacy]), step(/FROM dbo\.CustomerDeliveryAddresses/, [{ address: 'Preserved' }]),
    step(/UPDATE dbo\.Customers/, [], values => { assert.equal(values.salesInCharge, 'Legacy Person'); assert.equal(values.salesInChargeId, null); assert.equal(values.shortName, 'C'); assert.equal(values.isActive, false); }),
    audit(), step(/FROM dbo\.Customers/, [{ ...legacy, name: 'Renamed', isActive: false }]), step(/FROM dbo\.CustomerDeliveryAddresses/, [{ address: 'Preserved' }]),
  ]);
  const response = await fixture.invoke('put', '/customers/:id', { name: 'Renamed', isActive: false });
  assert.equal(response.body.record.salesInCharge, 'Legacy Person');
  assert.equal(response.body.record.isActive, false);
  assert.equal(response.body.record.lastSalesDate, null);
  assert.deepEqual(response.body.record.deliveryAddresses, ['Preserved']);
  assert.equal(fixture.state.commits, 1);
  fixture.done();
});

test('changed Sales In-charge assignments reject inactive accounts inside the customer transaction', async () => {
  const fixture = routeFixture([
    step(/UPDLOCK,HOLDLOCK/, [customer]), step(/FROM dbo\.CustomerDeliveryAddresses/, []),
    step(/FROM dbo\.SalesUserLogin/, [{ id: 4, name: 'Inactive Sales', role: 'sales', isActive: false }]),
  ]);
  await assert.rejects(() => fixture.invoke('put', '/customers/:id', { salesInChargeId: 4 }), error => error.status === 400);
  assert.equal(fixture.state.rollbacks, 1);
  fixture.done();
});

test('partial Product edits preserve child rows, its historical stock and six-place price', async () => {
  const fixture = routeFixture([
    step(/SELECT p\.id/, productResult(product)),
    step(/UPDATE dbo\.Products/, [], values => { assert.equal(Object.hasOwn(values, 'stock'), false); assert.equal(values.price, '0.115300'); assert.equal(values.description, 'Updated'); assert.equal(values.isActive, false); assert.equal(values.inventorySetup, 'monthly'); }),
    audit(), step(/SELECT p\.id/, productResult({ ...product, description: 'Updated', name: 'Updated', isActive: false })),
  ]);
  const response = await fixture.invoke('put', '/products/:id', { description: 'Updated', productHeaderId: null, isActive: false, offices: 'ignored stale client payload', inventorySchedules: 'ignored stale client payload' });
  assert.equal(response.body.record.stock, 5);
  assert.equal(response.body.record.price, '0.115300');
  assert.equal(response.body.record.isActive, false);
  assert.deepEqual(response.body.record.processes, [{ name: 'Cut' }]);
  assert.equal(Object.hasOwn(response.body.record, 'offices'), false);
  assert.equal(response.body.record.inventorySetup, 'monthly');
  assert.equal(Object.hasOwn(response.body.record, 'inventorySchedules'), false);
  fixture.done();
});

test('Product stock edits and circular Product Headers cannot bypass transaction checks', async () => {
  const stock = routeFixture([step(/SELECT p\.id/, productResult(product))]);
  await assert.rejects(() => stock.invoke('put', '/products/:id', { stock: 6 }), error => error.status === 400);
  stock.done();
  const circular = routeFixture([step(/SELECT p\.id/, productResult(product))]);
  await assert.rejects(() => circular.invoke('put', '/products/:id', { productHeaderId: 7 }), error => error.status === 400);
  assert.equal(circular.state.rollbacks, 1);
  circular.done();
});

test('manual movement history prevents changing Product UOP even when current stock has returned to zero', async () => {
  const fixture = routeFixture([
    step(/SELECT p\.id/, productResult({ ...product, stock: '0.000' })),
    step(/FROM dbo\.ConfigUnits/, [{ id: 2 }]),
    step(/FROM dbo\.SalesOrderItems[\s\S]*UNION ALL[\s\S]*FROM dbo\.ProductStockMovements/, [{ id: 9 }], values => assert.equal(values.id, 7)),
  ]);
  await assert.rejects(() => fixture.invoke('put', '/products/:id', { unit: 'BOX' }), error => error.status === 409 && /stock movements/.test(error.message));
  assert.equal(fixture.state.commits, 0);
  assert.equal(fixture.state.rollbacks, 1);
  fixture.done();
});

const order = { id: 7, number: 'SO-MOCK', customerId: 2, customerName: 'Customer', customerAddress: 'Office', currency: 'USD', total: 2, status: 'confirmed', invoiced: false, delivered: false };
const items = [{ productId: 3, productName: 'First', sku: 'P3', unit: 'PCS', quantity: 1, unitPrice: 1, lineTotal: 1 }, { productId: 4, productName: 'Second', sku: 'P4', unit: 'PCS', quantity: 1, unitPrice: 1, lineTotal: 1 }];

test('delivery requires an actual invoice and never adjusts product stock', async () => {
  const fixture = routeFixture([step(/SELECT orderId FROM dbo\.SalesInvoices/, [])], { stock3: 5 });
  await assert.rejects(() => fixture.invoke('post', '/delivery-receipts', { invoiceId: 9, deliveryDate: '2026-11-13', address: 'Office' }), error => error.status === 404);
  assert.equal(fixture.state.stock3, 5);
  assert.equal(fixture.state.commits, 0);
  assert.equal(fixture.state.rollbacks, 1);
  fixture.done();
});

test('delivery copies frozen invoice items without stock effects and an invoice accepts only one delivery receipt', async () => {
  const invoice = { ...order, id: 9, orderId: 7, invoiceDate: '2026-11-13', billToAddress: 'Office' };
  const deliveryItem = { id: 11, orderItemId: 1, productId: 3, productName: 'First', sku: 'P3', unit: 'PCS', quantity: '1.000' };
  const fixture = routeFixture([
    step(/SELECT orderId FROM dbo\.SalesInvoices/, [{ orderId: 7 }]), step(/FROM dbo\.SalesOrders WITH/, [{ id: 7 }]),
    step(/FROM dbo\.SalesInvoices i WITH/, [invoice]), step(/FROM dbo\.DeliveryReceipts WITH/, []), step(/SELECT id FROM dbo\.SalesInvoiceItems/, [{ id: 101 }]),
    step(/INSERT INTO dbo\.DeliveryReceipts/, [{ id: 10 }], (values, _state, query) => { assert.match(query, /createdAt/); assert.equal(values.invoiceId, 9); assert.equal(values.stockDeducted, false); assert.equal(values.receivedBy, null); assert.equal(values.preparedByName, 'Mock actor'); }),
    step(/UPDATE dbo\.DeliveryReceipts SET number=@number/, [], values => assert.equal(values.number, 'DR-00000010')),
    step(/INSERT INTO dbo\.DeliveryReceiptItems[\s\S]*SELECT @deliveryReceiptId,orderItemId/, [], (values, _state, query) => { assert.equal(values.deliveryReceiptId, 10); assert.equal(values.invoiceId, 9); assert.match(query, /FROM dbo\.SalesInvoiceItems WHERE invoiceId=@invoiceId/); }), audit(),
    step(/FROM dbo\.DeliveryReceipts/, [{ id: 10, invoiceId: 9, orderId: 7, number: 'DR-MOCK' }]), step(/FROM dbo\.DeliveryReceiptItems/, [deliveryItem], (_values, _state, query) => assert.doesNotMatch(query, /unitPrice|lineTotal|grossAmount|vatAmount|currency/)),
  ], { stock3: 5 });
  const response = await fixture.invoke('post', '/delivery-receipts', { invoiceId: 9, deliveryDate: '2026-11-13', address: 'Office' });
  assert.equal(response.statusCode, 201);
  assert.equal(fixture.state.stock3, 5);
  assert.equal(fixture.state.commits, 1);
  fixture.done();
  const duplicate = routeFixture([step(/SELECT orderId FROM dbo\.SalesInvoices/, [{ orderId: 7 }]), step(/FROM dbo\.SalesOrders WITH/, [{ id: 7 }]), step(/FROM dbo\.SalesInvoices i WITH/, [invoice]), step(/FROM dbo\.DeliveryReceipts WITH/, [{ id: 10 }])]);
  await assert.rejects(() => duplicate.invoke('post', '/delivery-receipts', { invoiceId: 9, deliveryDate: '2026-11-13' }), error => error.status === 409);
  duplicate.done();
});

test('Invoice list and expanded detail preserve financial snapshots, legacy NULL values and exact item amounts without writes', async () => {
  const detailed = { id: 7, number: 'SI-MOCK', orderId: 8, orderNumber: 'SO-MOCK', customerName: 'Customer', currency: 'PHP', sourceCurrency: 'USD', rate: '55.000000', preparedByName: 'Invoice author', sourcePreparedByName: 'Source author', grossAmount: '1100.000000', lineDiscountAmount: '110.000000', headerDiscountAmount: '49.500000', discountAmount: '159.500000', netAmount: '940.500000', vatAmount: '112.860000', amount: '1053.360000', total: '1053.360000', paidAmount: '0.000001' };
  const legacy = { id: 9, number: 'SI-LEGACY', orderId: 10, total: '207.540000', paidAmount: '0.000000', grossAmount: null, discountAmount: null, netAmount: null, vatAmount: null, amount: null };
  const checkHeader = (_values, _state, query) => {
    for (const name of ['grossAmount', 'lineDiscountAmount', 'headerDiscountAmount', 'discountAmount', 'netAmount', 'vatAmount', 'amount']) assert.ok(query.includes('CONVERT(varchar(60),i.' + name + ') AS ' + name), name);
    assert.match(query, /o\.sourceCurrency,CONVERT\(varchar\(60\),o\.rate\) AS rate/);
    assert.match(query, /i\.buyerTin,i\.buyerBusinessStyle,i\.shipToName,i\.vatClass,COALESCE\(i\.preparedByName,invoiceCreator\.name\) AS preparedByName,o\.preparedByName AS sourcePreparedByName/);
    assert.match(query, /LEFT JOIN dbo\.SalesUserLogin invoiceCreator ON invoiceCreator\.id=i\.createdBy/);
    assert.match(query, /CONVERT\(varchar\(60\),i\.total\) AS total,CONVERT\(varchar\(60\),i\.paidAmount\) AS paidAmount/);
    assert.doesNotMatch(query, /CreditNote|COALESCE\(o\.(?:grossAmount|discountAmount|netAmount|vatAmount),0\)/i);
  };
  const listed = routeFixture([step(/FROM dbo\.SalesInvoices i JOIN dbo\.SalesOrders o/, [detailed, legacy], checkHeader)]);
  assert.deepEqual((await listed.invoke('get', '/sales-invoices', {})).body.records, [detailed, legacy]);
  assert.equal(listed.state.commits, 0);
  listed.done();
  for (const invoice of [detailed, legacy]) {
    const item = { id: 11, orderId: invoice.orderId, productId: 12, productName: 'Snapshot product', refNumber: 'REF', quotationNumber: null, description: 'Snapshot description', quantity: '0.333', unitPrice: '0.115300', convertedUnitPrice: invoice === detailed ? '6.341500' : null, grossAmount: invoice === detailed ? '2.110000' : null, discountAmount: null, netAmount: null, vatAmount: null, amount: '0.040000', lineTotal: '0.040000', currency: 'USD', sourceCurrency: 'USD' };
    const expanded = routeFixture([
      step(/FROM dbo\.SalesInvoices i JOIN dbo\.SalesOrders o/, [invoice], (values, state, query) => { checkHeader(values, state, query); assert.match(query, /WHERE i\.id=@id/); assert.equal(values.id, 7); }),
      step(/FROM dbo\.SalesInvoiceItems WHERE invoiceId=@invoiceId ORDER BY id/, [item], (values, _state, query) => {
        assert.equal(values.orderId, invoice.orderId);
        assert.equal(values.invoiceId, invoice.id);
        assert.match(query, /CONVERT\(varchar\(60\),COALESCE\(amount,lineTotal\)\) AS amount/);
        assert.match(query, /description AS productDescription,currency,currency AS sourceCurrency/);
        for (const name of ['convertedUnitPrice', 'discountRate', 'grossAmount', 'lineDiscountAmount', 'headerDiscountAmount', 'discountAmount', 'netAmount', 'vatAmount']) assert.ok(query.includes('CONVERT(varchar(60),' + name + ') AS ' + name), name);
      }),
    ]);
    assert.deepEqual((await expanded.invoke('get', '/sales-invoices/:id', {})).body.record, { ...invoice, items: [item] });
    assert.equal(expanded.state.commits, 0);
    expanded.done();
  }
});

test('invoice/shipping source locks reject duplicates and dates before the source invoice', async () => {
  const invoice = routeFixture([step(/UPDLOCK,HOLDLOCK/, [{ ...order, invoiced: true }]), step(/FROM dbo\.SalesOrderItems/, items)]);
  await assert.rejects(() => invoice.invoke('post', '/sales-invoices', { orderId: 7, invoiceDate: '2026-11-13', dueDate: '2026-11-13' }), error => error.status === 409);
  invoice.done();
  const shipping = routeFixture([step(/UPDLOCK,HOLDLOCK/, [{ invoiceDate: '2026-11-13' }])]);
  await assert.rejects(() => shipping.invoke('post', '/shipping-invoices', { invoiceId: 9, shippingDate: '2026-11-12' }), error => error.status === 400);
  shipping.done();
  const duplicate = routeFixture([step(/UPDLOCK,HOLDLOCK/, [{ invoiceDate: '2026-11-13' }]), step(/FROM dbo\.ShippingInvoices WHERE invoiceId/, [{ id: 10 }])]);
  await assert.rejects(() => duplicate.invoke('post', '/shipping-invoices', { invoiceId: 9, shippingDate: '2026-11-13' }), error => error.status === 409);
  duplicate.done();
});

test('payment handlers reject negative, overprecision and excessive payments without recording an audit', async () => {
  for (const paidAmount of [-1, '0.0000001', '1000000000000.000001']) {
    const fixture = routeFixture([]);
    await assert.rejects(() => fixture.invoke('patch', '/sales-invoices/:id/payment', { paidAmount }), error => error.status === 400);
    fixture.done();
  }
  const excessive = routeFixture([step(/UPDATE dbo\.SalesInvoices/, []), step(/SELECT id FROM dbo\.SalesInvoices/, [{ id: 7 }])]);
  await assert.rejects(() => excessive.invoke('patch', '/sales-invoices/:id/payment', { paidAmount: '5.00' }), error => error.status === 400);
  assert.equal(excessive.state.rollbacks, 1);
  excessive.done();
});

test('invoice payments retain six-place precision and exact large decimal strings', async () => {
  for (const paidAmount of ['0.000001', '999999999999.999999', '0']) {
    const canonical = paidAmount === '0' ? '0.000000' : paidAmount;
    const fixture = routeFixture([
      step(/UPDATE dbo\.SalesInvoices/, [{ id: 7 }], values => assert.equal(values.paidAmount, canonical)),
      audit(), step(/FROM dbo\.SalesInvoices/, [{ id: 7, orderId: 7, total: '1000000000000.000000', paidAmount: canonical }]),
      step(/FROM dbo\.SalesInvoiceItems/, []),
    ]);
    const response = await fixture.invoke('patch', '/sales-invoices/:id/payment', { paidAmount });
    assert.equal(response.body.record.paidAmount, canonical);
    assert.equal(fixture.state.commits, 1);
    fixture.done();
  }
});
test('Product creation writes each named child table with its own literal SQL and preserves the linked supply unit', async () => {
  const input = {
    sku: 'P7', description: 'Product', unit: 'PCS', currency: 'USD', price: 0.1153, isActive: false,
    color: 'ignored legacy color', thickness: -99, planType: 'ignored legacy plan',
    processes: [{ name: 'Cut' }], offices: [{ name: 'TTI Laguna Philippines Inc.' }],
    customerApprovals: [{ customerId: 2, approvalDate: '2026-11-13', eolDate: 'invalid ignored legacy date', approvalRemarks: 'Approved', eolRemarks: 'ignored legacy EOL remarks' }],
    inventorySetup: 'quarterly', inventorySchedules: [{ scheduleDate: 'not-a-date', month: 'ignored stale row' }],
    linkedSupplies: [{ suppliesId: 4, quantity: 0.000001, unit: 'KG' }],
  };
  const approvals = [{ customerId: 2, customerName: 'Approved Customer', approvalDate: '2026-11-13', approvalRemarks: 'Approved' }];
  const returned = { recordsets: [
    [{ ...product, stock: 0, inventorySetup: input.inventorySetup }], [{ productId: 7, name: 'Cut' }],
    [{ productId: 7, ...approvals[0] }], [{ productId: 7, ...input.linkedSupplies[0] }],
  ] };
  const fixture = routeFixture([
    step(/ConfigUnits/, [{ id: 1 }]), step(/ConfigCurrencies/, [{ id: 1 }]),
    step(/FROM dbo.Customers/, [{ id: 2 }]), step(/FROM dbo.Supplies/, [{ unit: 'KG', isActive: true }]),
    step(/INSERT INTO dbo.Products/, [{ id: 7 }], (values, _state, query) => { assert.equal(values.price, '0.1153'); assert.equal(values.stock, 0); assert.equal(values.isActive, true); assert.equal(values.inventorySetup, 'quarterly'); assert.equal(values.revision, null); assert.equal(values.moq, null); assert.equal(values.vatMode, null); assert.match(query, /createdAt,updatedAt/); for (const key of ['color', 'thickness', 'planType']) assert.equal(Object.hasOwn(values, key), false); }),
    step(/DELETE FROM dbo.ProductProcesses/), step(/INSERT INTO dbo.ProductProcesses/, [], values => assert.equal(values.name, 'Cut')),
    step(/DELETE FROM dbo.ProductCustomerApprovals/), step(/INSERT INTO dbo.ProductCustomerApprovals/, [], values => { assert.equal(values.customerId, 2); assert.equal(values.approvalDate, '2026-11-13'); assert.equal(Object.hasOwn(values, 'eolDate'), false); assert.equal(Object.hasOwn(values, 'eolRemarks'), false); }),
    step(/DELETE FROM dbo.ProductSupplies/), step(/INSERT INTO dbo.ProductSupplies/, [], values => { assert.equal(values.suppliesId, 4); assert.equal(values.quantity, 0.000001); assert.equal(values.unit, 'KG'); }),
    audit(), step(/SELECT p.id/, returned),
  ]);
  const response = await fixture.invoke('post', '/products', input);
  assert.equal(response.statusCode, 201);
  assert.deepEqual(response.body.record.customerApprovals, approvals);
  assert.equal(Object.hasOwn(response.body.record, 'offices'), false);
  assert.equal(response.body.record.inventorySetup, 'quarterly');
  assert.equal(Object.hasOwn(response.body.record, 'inventorySchedules'), false);
  assert.deepEqual(response.body.record.linkedSupplies, input.linkedSupplies);
  assert.equal(fixture.state.commits, 1);
  fixture.done();
  for (const path of ['/products', '/products/:id']) {
    const reader = routeFixture([step(/SELECT p.id/, returned)]);
    const read = await reader.invoke('get', path, {});
    const record = path === '/products' ? read.body.records[0] : read.body.record;
    assert.deepEqual(record.customerApprovals, approvals, 'Approvals include their Customer name, date and remarks.');
    assert.deepEqual(record.linkedSupplies, input.linkedSupplies, 'Supplies must map from the shifted fourth recordset.');
    assert.equal(Object.hasOwn(record, 'offices'), false);
    assert.equal(record.inventorySetup, 'quarterly');
    assert.equal(Object.hasOwn(record, 'inventorySchedules'), false);
    reader.done();
  }
  const optionSets = [[{ id: 1, name: 'PCS' }], [{ id: 1, code: 'USD' }], [], [], [], [], [{ name: 'Cut' }]];
  const optionsReader = routeFixture([step(/SELECT id,shortName AS name/, { recordsets: optionSets })]);
  const options = await optionsReader.invoke('get', '/product-options', {});
  assert.deepEqual(options.body.units, optionSets[0]);
  assert.deepEqual(options.body.currencies, optionSets[1]);
  assert.deepEqual(options.body.processes, ['Cut']);
  assert.equal(Object.hasOwn(options.body, 'offices'), false);
  optionsReader.done();
});


test('former Customer and Product CHECK invariants reject invalid direct writes before SQL', async () => {
  for (const change of [{ decimalInPrice: -1 }, { decimalInTotalPrice: 7 }, { salesAddressType: 'unknown' }, { discountType: 'unknown' }, { discountType: 'amount', discount: -1 }, { discountType: 'amount', discount: 1000000001 }]) {
    const fixture = routeFixture([]);
    await assert.rejects(() => fixture.invoke('post', '/customers', { ...customer, ...change }), error => error.status === 400);
    assert.equal(fixture.state.commits, 0);
    fixture.done();
  }
  for (const change of [{ price: -1 }, { divisor: -1 }, { vatMode: 'unknown' }, { linkedSupplies: [{ suppliesId: 4, quantity: 0, unit: 'kg' }] }, { customerApprovals: [{ customerId: 0, approvalDate: '2026-11-13' }] }]) {
    const fixture = routeFixture([]);
    await assert.rejects(() => fixture.invoke('post', '/products', { sku: 'P7', unit: 'PCS', currency: 'USD', ...change }), error => error.status === 400);
    assert.equal(fixture.state.commits, 0);
    fixture.done();
  }
});

test('invoice and shipping inserts explicitly initialize values and assign untruncated identity numbers before commit', async () => {
  const identity = 100000001;
  const invoice = routeFixture([
    step(/UPDLOCK,HOLDLOCK/, [order]), step(/FROM dbo\.SalesOrderItems/, [items[0]]),
    step(/SELECT buyer\.tin AS buyerTin,buyer\.businessStyle AS buyerBusinessStyle,customer\.drName AS shipToName/, [{ buyerTin: null, shipToName: null }]),
    step(/INSERT INTO dbo\.SalesInvoices/, [{ id: identity }], (values, _state, query) => { assert.match(query, /paidAmount,grossAmount/); assert.match(query, /@createdBy,0,@grossAmount/); assert.equal(values.amount, String(order.total)); assert.equal(values.notes, null); }),
    step(/UPDATE dbo\.SalesInvoices SET number=@number/, [], values => assert.equal(values.number, 'SI-100000001')),
    step(/INSERT INTO dbo\.SalesInvoiceItems[\s\S]*SELECT @invoiceId,id/, [], values => { assert.equal(values.invoiceId, identity); assert.equal(values.orderId, 7); }),
    step(/SELECT id,productId,productName,unit,CONVERT/, [{ ...items[0], id: 101, quantity: '1.000' }]),
    step(/SELECT id FROM dbo\.ProductStockMovements/, []), step(/FROM dbo\.Products WITH/, [{ id: 3, unit: 'PCS', stock: '5.000', isActive: true }]),
    step(/UPDATE dbo\.Products SET stock=CAST/, [], values => assert.equal(values.stockAfter, '4.000')),
    step(/INSERT INTO dbo\.ProductStockMovements/, [], values => { assert.equal(values.requestKey, 'SI:' + identity + ':101'); assert.equal(values.reference, 'SI-100000001'); }),
    audit(), step(/FROM dbo\.SalesInvoices/, [{ id: identity, orderId: 7, number: 'SI-100000001', paidAmount: 0 }]), step(/FROM dbo\.SalesInvoiceItems/, [items[0]]),
  ]);
  const savedInvoice = await invoice.invoke('post', '/sales-invoices', { orderId: 7, invoiceDate: '2026-11-13', dueDate: '2026-11-13', notes: '' });
  assert.equal(savedInvoice.body.record.number, 'SI-100000001');
  assert.equal(invoice.state.commits, 1);
  invoice.done();
  const shipping = routeFixture([
    step(/UPDLOCK,HOLDLOCK/, [{ id: 9, orderId: 7, invoiceDate: '2026-11-13' }]), step(/FROM dbo\.ShippingInvoices WHERE invoiceId/, []),
    step(/INSERT INTO dbo\.ShippingInvoices/, [{ id: identity }], (values, _state, query) => { assert.match(query, /createdAt/); assert.equal(values.carrier, null); assert.equal(values.trackingNumber, null); assert.equal(values.notes, null); }),
    step(/UPDATE dbo\.ShippingInvoices SET number=@number/, [], values => assert.equal(values.number, 'SHI-100000001')),
    audit(), step(/FROM dbo\.ShippingInvoices/, [{ id: identity, orderId: 7, number: 'SHI-100000001', invoiceId: 9 }]), step(/FROM dbo\.SalesInvoiceItems/, [items[0]]),
  ]);
  const savedShipping = await shipping.invoke('post', '/shipping-invoices', { invoiceId: 9, shippingDate: '2026-11-13', carrier: '', trackingNumber: '', notes: '' });
  assert.equal(savedShipping.body.record.number, 'SHI-100000001');
  assert.equal(shipping.state.commits, 1);
  shipping.done();
});
