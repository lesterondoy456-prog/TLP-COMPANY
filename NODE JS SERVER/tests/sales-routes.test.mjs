import assert from 'node:assert/strict';
import test from 'node:test';
import { loadRouterWithDatabase, invokeRoute } from './helpers/load-api.mjs';

// This adapter receives SQL text/parameters in memory. It cannot open SQL Server.
const step = (match, rows = [], check) => ({ match, result: Array.isArray(rows) ? { recordset: rows } : rows, check });
const audit = () => step(/INSERT INTO dbo\.AuditTrail/, [], values => {
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
          const next = pending.shift();
          assert.ok(next, 'Unexpected SQL: ' + query);
          assert.match(query, next.match);
          next.check?.(values, state);
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
  id: 7, code: 'C-00000007', name: 'Customer', shortName: 'C', businessStyle: 'Trade', address: 'Office',
  salesName: 'Sales name', drName: 'DR name', vatCode: 'VS', salesInChargeId: null, salesInCharge: '', isActive: true,
};
const product = {
  id: 7, sku: 'P7', name: 'Product', description: 'Old', unit: 'PCS', secondaryUnit: '', currency: 'USD',
  category: '', stock: 5, price: '0.115300', productHeaderId: null, isActive: true,
};
const productResult = record => ({ recordsets: [[record], [{ productId: 7, name: 'Cut' }], [{ productId: 7, name: 'TLP COMPANY' }], [], [], []] });

test('customer creation allocates its generated code and ordered delivery addresses atomically', async () => {
  const fixture = routeFixture([
    step(/TABLOCKX,HOLDLOCK/, [{ total: 0 }]), step(/sys\.identity_columns/, [{ nextId: 7 }]),
    step(/WHERE code=@code/, []),
    step(/INSERT INTO dbo\.Customers/, [{ id: 7 }], values => assert.equal(values.code, 'C-00000007')),
    step(/DELETE FROM dbo\.CustomerDeliveryAddresses/),
    step(/INSERT INTO dbo\.CustomerDeliveryAddresses/, [], values => { assert.equal(values.position, 0); assert.equal(values.address, 'Delivery A'); }),
    step(/INSERT INTO dbo\.CustomerDeliveryAddresses/, [], values => { assert.equal(values.position, 1); assert.equal(values.address, 'Delivery B'); }),
    audit(), step(/FROM dbo\.Customers/, [customer]),
    step(/FROM dbo\.CustomerDeliveryAddresses/, [{ address: 'Delivery A' }, { address: 'Delivery B' }]),
  ]);
  const response = await fixture.invoke('post', '/customers', { ...customer, code: '', deliveryAddresses: ['Delivery A', 'Delivery B'] });
  assert.equal(response.statusCode, 201);
  assert.deepEqual(response.body.record.deliveryAddresses, ['Delivery A', 'Delivery B']);
  assert.equal(fixture.state.commits, 1);
  fixture.done();
});

test('partial customer edits preserve legacy assignments and omitted address collections', async () => {
  const legacy = { ...customer, salesInCharge: 'Legacy Person', _salesInChargeSnapshot: 'Legacy Person' };
  const fixture = routeFixture([
    step(/UPDLOCK,HOLDLOCK/, [legacy]), step(/FROM dbo\.CustomerDeliveryAddresses/, [{ address: 'Preserved' }]),
    step(/UPDATE dbo\.Customers/, [], values => { assert.equal(values.salesInCharge, 'Legacy Person'); assert.equal(values.salesInChargeId, null); assert.equal(values.shortName, 'C'); }),
    audit(), step(/FROM dbo\.Customers/, [{ ...legacy, name: 'Renamed' }]), step(/FROM dbo\.CustomerDeliveryAddresses/, [{ address: 'Preserved' }]),
  ]);
  const response = await fixture.invoke('put', '/customers/:id', { name: 'Renamed' });
  assert.equal(response.body.record.salesInCharge, 'Legacy Person');
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
    step(/UPDATE dbo\.Products/, [], values => { assert.equal(values.stock, 5); assert.equal(values.price, '0.115300'); assert.equal(values.description, 'Updated'); }),
    audit(), step(/SELECT p\.id/, productResult({ ...product, description: 'Updated', name: 'Updated' })),
  ]);
  const response = await fixture.invoke('put', '/products/:id', { description: 'Updated', productHeaderId: null });
  assert.equal(response.body.record.stock, 5);
  assert.equal(response.body.record.price, '0.115300');
  assert.deepEqual(response.body.record.processes, [{ name: 'Cut' }]);
  assert.deepEqual(response.body.record.offices, [{ name: 'TLP COMPANY' }]);
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

const order = { id: 7, number: 'SO-MOCK', customerId: 2, customerName: 'Customer', customerAddress: 'Office', currency: 'USD', total: 2, status: 'confirmed', invoiced: false, delivered: false };
const items = [{ productId: 3, productName: 'First', sku: 'P3', unit: 'PCS', quantity: 1, unitPrice: 1, lineTotal: 1 }, { productId: 4, productName: 'Second', sku: 'P4', unit: 'PCS', quantity: 1, unitPrice: 1, lineTotal: 1 }];

test('delivery failure rolls back earlier product deductions and does not create a receipt', async () => {
  const fixture = routeFixture([
    step(/UPDLOCK,HOLDLOCK/, [order]), step(/FROM dbo\.SalesOrderItems/, items),
    step(/stock>=@quantity/, [{ id: 3 }], (_values, state) => { state.stock3--; }),
    step(/stock>=@quantity/, []),
  ], { stock3: 5 });
  await assert.rejects(() => fixture.invoke('post', '/delivery-receipts', { orderId: 7, deliveryDate: '2026-11-13', address: 'Office', receivedBy: 'Customer' }), error => error.status === 409);
  assert.equal(fixture.state.stock3, 5);
  assert.equal(fixture.state.commits, 0);
  assert.equal(fixture.state.rollbacks, 1);
  fixture.done();
});

test('a successful delivery deducts stock within its receipt transaction and linked orders reject another delivery', async () => {
  const fixture = routeFixture([
    step(/UPDLOCK,HOLDLOCK/, [order]), step(/FROM dbo\.SalesOrderItems/, [items[0]]),
    step(/stock>=@quantity/, [{ id: 3 }], (_values, state) => { state.stock3--; }),
    step(/INSERT INTO dbo\.DeliveryReceipts/, [{ id: 10 }]), audit(),
    step(/FROM dbo\.DeliveryReceipts/, [{ id: 10, orderId: 7, number: 'DR-MOCK' }]), step(/FROM dbo\.SalesOrderItems/, [items[0]]),
  ], { stock3: 5 });
  const response = await fixture.invoke('post', '/delivery-receipts', { orderId: 7, deliveryDate: '2026-11-13', address: 'Office', receivedBy: 'Customer' });
  assert.equal(response.statusCode, 201);
  assert.equal(fixture.state.stock3, 4);
  assert.equal(fixture.state.commits, 1);
  fixture.done();
  const duplicate = routeFixture([step(/UPDLOCK,HOLDLOCK/, [{ ...order, delivered: true }]), step(/FROM dbo\.SalesOrderItems/, [items[0]])]);
  await assert.rejects(() => duplicate.invoke('post', '/delivery-receipts', { orderId: 7, deliveryDate: '2026-11-13' }), error => error.status === 409);
  duplicate.done();
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
  for (const paidAmount of [-1, '0.001', '1000000000001']) {
    const fixture = routeFixture([]);
    await assert.rejects(() => fixture.invoke('patch', '/sales-invoices/:id/payment', { paidAmount }), error => error.status === 400);
    fixture.done();
  }
  const excessive = routeFixture([step(/UPDATE dbo\.SalesInvoices/, []), step(/SELECT id FROM dbo\.SalesInvoices/, [{ id: 7 }])]);
  await assert.rejects(() => excessive.invoke('patch', '/sales-invoices/:id/payment', { paidAmount: '5.00' }), error => error.status === 400);
  assert.equal(excessive.state.rollbacks, 1);
  excessive.done();
});
test('Product creation writes each named child table with its own literal SQL and preserves the linked supply unit', async () => {
  const input = {
    sku: 'P7', description: 'Product', unit: 'PCS', currency: 'USD', price: 0.1153,
    processes: [{ name: 'Cut' }], offices: [{ name: 'TLP COMPANY' }],
    customerApprovals: [{ customerId: 2, approvalDate: '2026-11-13', eolDate: null, approvalRemarks: 'Approved', eolRemarks: '' }],
    inventorySchedules: [{ scheduleDate: '2026-11-13', month: 'November' }],
    linkedSupplies: [{ suppliesId: 4, quantity: 0.000001, unit: 'KG' }],
  };
  const returned = { recordsets: [
    [{ ...product, stock: 0 }], [{ productId: 7, name: 'Cut' }], [{ productId: 7, name: 'TLP COMPANY' }],
    [{ productId: 7, ...input.customerApprovals[0] }], [{ productId: 7, ...input.inventorySchedules[0] }],
    [{ productId: 7, ...input.linkedSupplies[0] }],
  ] };
  const fixture = routeFixture([
    step(/ConfigUnits/, [{ id: 1 }]), step(/ConfigCurrencies/, [{ id: 1 }]),
    step(/FROM dbo.Customers/, [{ id: 2 }]), step(/FROM dbo.Supplies/, [{ unit: 'KG', isActive: true }]),
    step(/INSERT INTO dbo.Products/, [{ id: 7 }], values => { assert.equal(values.price, '0.1153'); assert.equal(values.stock, 0); }),
    step(/DELETE FROM dbo.ProductProcesses/), step(/INSERT INTO dbo.ProductProcesses/, [], values => assert.equal(values.name, 'Cut')),
    step(/DELETE FROM dbo.ProductOffices/), step(/INSERT INTO dbo.ProductOffices/, [], values => assert.equal(values.name, 'TLP COMPANY')),
    step(/DELETE FROM dbo.ProductCustomerApprovals/), step(/INSERT INTO dbo.ProductCustomerApprovals/, [], values => { assert.equal(values.customerId, 2); assert.equal(values.approvalDate, '2026-11-13'); }),
    step(/DELETE FROM dbo.ProductInventorySchedules/), step(/INSERT INTO dbo.ProductInventorySchedules/, [], values => assert.equal(values.month, 'November')),
    step(/DELETE FROM dbo.ProductSupplies/), step(/INSERT INTO dbo.ProductSupplies/, [], values => { assert.equal(values.suppliesId, 4); assert.equal(values.quantity, 0.000001); assert.equal(values.unit, 'KG'); }),
    audit(), step(/SELECT p.id/, returned),
  ]);
  const response = await fixture.invoke('post', '/products', input);
  assert.equal(response.statusCode, 201);
  assert.deepEqual(response.body.record.customerApprovals, input.customerApprovals);
  assert.deepEqual(response.body.record.inventorySchedules, input.inventorySchedules);
  assert.deepEqual(response.body.record.linkedSupplies, input.linkedSupplies);
  assert.equal(fixture.state.commits, 1);
  fixture.done();
});
