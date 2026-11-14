import assert from 'node:assert/strict';
import test from 'node:test';
import { loadRouterWithDatabase, invokeRoute } from './helpers/load-api.mjs';
import { calculateSalesOrder, salesLineTotal, salesTotal } from '../../SalesSystem/src/salesPricing.mjs';

// Only the actual router is loaded. db.js, SQL Server and .env are never read.
function orderFixture(currencies = ['USD'], current = {}, settings = {}) {
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
          assert.doesNotMatch(query, /\bbranch\b/i, 'Sales orders do not store or query Branch.');
          if (query.startsWith('SELECT id,shortName AS code')) {
            assert.match(query, /ConfigPaymentTerms WHERE isActive=1 AND forCustomer=1/);
            return { recordsets: [[{ id: 1, code: 'USD', isActive: true }], [{ id: 1, name: 'Net 30', description: 'Net 30', isActive: true }], [{ id: 1, code: 'VAT12', rate: settings.vatRate === undefined ? '12.000000' : settings.vatRate, isActive: true }], [{ id: 1, name: 'Philippines', isActive: true }]] };
          }
          if (/FROM dbo\.ConfigCurrencies/.test(query)) return { recordset: settings.currencyActive === false || !['USD', 'PHP'].includes(values.code) ? [] : [{ id: 1 }] };
          if (/FROM dbo\.ConfigPaymentTerms/.test(query)) return { recordset: settings.paymentActive === false || values.name !== 'Net 30' ? [] : [{ id: 1 }] };
          if (/FROM dbo\.ConfigCountries/.test(query)) return { recordset: values.name === 'Philippines' ? [{ id: 1 }] : [] };
          if (/FROM dbo\.ConfigVatCodes/.test(query)) return { recordset: settings.vatActive === false || values.code !== 'VAT12' ? [] : [{ id: 1, rate: settings.vatRate === undefined ? '12.000000' : settings.vatRate }] };
          if (/FROM dbo\.CustomerDeliveryAddresses/.test(query)) return { recordset: (settings.billToAddresses || []).map(address => ({ address })) };
          if (/FROM dbo\.Customers/.test(query)) {
            const row = values.id === 3 ? { id: 3, name: 'Billing Customer', address: 'Billing Address', isActive: true, decimalInPrice: 6, decimalInTotalPrice: 2, ...settings.billTo } : { id: 2, name: 'Customer', address: 'Office', isActive: true, vatCode: 'VAT12', vatInclusive: false, decimalInPrice: 6, decimalInTotalPrice: 2, ...settings.customer };
            return { recordset: [row] };
          }
          if (/FROM dbo\.Products/.test(query)) return { recordset: [{ id: values.id, name: 'Product ' + values.id, description: 'Product description ' + values.id, sku: 'P' + values.id, unit: 'PCS', currency: currencies[values.id - 1], vatMode: 'inclusive', isActive: true }] };
          if (/INSERT INTO dbo\.SalesOrders/.test(query)) { assert.match(query, /createdAt,updatedAt/); assert.match(query, /SYSUTCDATETIME\(\)/); }
          if (/INSERT INTO dbo\.SalesOrders|UPDATE dbo\.SalesOrders/.test(query)) {
            state.header = { ...state.header, ...values };
            state.writes++;
            return { recordset: [{ id: state.header.id }] };
          }
          if (/DELETE FROM dbo\.SalesOrderItems/.test(query)) { state.items = []; state.writes++; return { recordset: [] }; }
          if (/INSERT INTO dbo\.SalesOrderItems/.test(query)) { state.items.push({ ...values, id: state.items.length + 1 }); state.writes++; return { recordset: [] }; }
          if (/INSERT INTO dbo\.AuditTrail/.test(query)) return { recordset: [] };
          if (/FROM dbo\.SalesOrders/.test(query)) return { recordset: [{ ...state.header }] };
          if (/FROM dbo\.SalesOrderItems/.test(query)) return { recordset: state.items.map(row => ({ ...row, productDescription: row.description, sourceCurrency: row.currency })) };
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
    async read(path) {
      return invokeRoute(router, 'get', path, { testUser: { id: 1, name: 'Mock actor', system: 'sales', role: 'admin', isActive: true } });
    },
    async save(items, method = 'post', currency, header = {}) {
      return invokeRoute(router, method, '/sales-orders' + (method === 'put' ? '/:id' : ''), {
        params: { id: 7 }, is: () => true,
        testUser: { id: 1, name: 'Mock actor', system: 'sales', role: 'admin', isActive: true },
        body: {
          customerId: 2, orderDate: '2026-11-13', notes: '', status: 'confirmed',
          ...(currency ? { currency } : {}),
          ...header,
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
    assert.equal(response.body.record.total, '11531.000000');
    assert.deepEqual(response.body.record.items.map(item => Number(item.lineTotal)), items.map(salesLineTotal));
    assert.equal(salesTotal(items), Number(response.body.record.total));
    assert.equal(response.body.record.items[1].unitPrice, '0.000001');
    assert.equal(fixture.state.commits, 1);
    assert.equal(fixture.state.rollbacks, 0);
  }
});

test('order handlers round each fractional-quantity line HALF-UP before summing', async () => {
  const items = [{ quantity: '0.5', unitPrice: '0.01' }, { quantity: '0.333', unitPrice: '0.045045' }, { quantity: 1, unitPrice: '1.005' }];
  const fixture = orderFixture(['USD', 'USD', 'USD']);
  const response = await fixture.save(items);
  assert.deepEqual(response.body.record.items.map(item => item.lineTotal), ['0.010000', '0.010000', '1.010000']);
  assert.equal(response.body.record.total, '1.030000');
  assert.equal(salesTotal(items), Number(response.body.record.total));
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
  await assert.rejects(() => mixed.save([{ quantity: 1, unitPrice: 1 }, { quantity: 1, unitPrice: 1 }]), error => error.status === 400 && /same source currency/.test(error.message));
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

const financialHeader = {
  billToCustomerId: 3, expectedDeliveryDate: '2026-11-20', rate: '55', paymentTerm: 'Net 30', shipment: 'land',
  countryOfOrigin: 'Philippines', vatCode: 'VAT12', vatInclusive: false, discountType: 'percent', discount: '5',
};
const amountFields = ['grossAmount', 'lineDiscountAmount', 'headerDiscountAmount', 'discountAmount', 'netAmount', 'vatAmount', 'amount', 'total'];
const lineAmountFields = ['convertedUnitPrice', 'grossAmount', 'lineDiscountAmount', 'headerDiscountAmount', 'discountAmount', 'netAmount', 'vatAmount', 'amount', 'lineTotal'];

test('POST and PUT financial orders snapshot Bill To and source prices, convert FX, apply both discounts and override Customer VAT', async () => {
  const items = [{ quantity: '2', unitPrice: '10', discountRate: '10', refNumber: ' REF-1 ', quotationNumber: ' Q-1 ', deliveryDate: '2026-11-21', description: 'forged description', convertedUnitPrice: '1', amount: '1' }];
  for (const method of ['post', 'put']) for (const vatInclusive of [false, true]) {
    const fixture = orderFixture(['USD'], { preparedByName: method === 'put' ? 'Original actor' : null });
    const expected = calculateSalesOrder({ items, rate: '55', vatRate: '12', vatInclusive, discountType: 'percent', discount: '5', decimalInTotalPrice: 2 });
    const response = await fixture.save(items, method, 'PHP', { ...financialHeader, vatInclusive, vatRate: '99', total: '1', preparedByName: 'forged actor', branch: 'forged branch' });
    const record = response.body.record;
    for (const key of amountFields) assert.equal(record[key], expected[key], key);
    for (const key of lineAmountFields) assert.equal(record.items[0][key], expected.items[0][key], key);
    assert.equal(record.total, vatInclusive ? '940.500000' : '1053.360000');
    assert.equal(record.customerName, 'Customer');
    assert.equal(record.billToName, 'Billing Customer');
    assert.equal(record.billToAddress, 'Billing Address');
    assert.equal(record.billToCustomerId, 3);
    assert.equal(record.sourceCurrency, 'USD');
    assert.equal(record.currency, 'PHP');
    assert.equal(record.rate, '55.000000');
    assert.equal(record.vatRate, '12.000000');
    assert.equal(record.discount, '5.000000');
    assert.equal(record.preparedByName, method === 'put' ? 'Original actor' : 'Mock actor');
    assert.equal(Object.hasOwn(record, 'branch'), false);
    assert.equal(record.items[0].unitPrice, '10.000000');
    assert.equal(record.items[0].description, 'Product description 1');
    assert.equal(record.items[0].currency, 'USD');
    assert.equal(record.items[0].refNumber, 'REF-1');
    assert.equal(record.items[0].quotationNumber, 'Q-1');
    assert.equal(record.items[0].deliveryDate, '2026-11-21');
    assert.equal(fixture.state.commits, 1);
  }
});

test('Bill To snapshots preserve configured delivery addresses, Sales name and optional blanks on POST and PUT', async () => {
  for (const method of ['post', 'put']) {
    for (const selectedAddress of ['Billing Address', 'Delivery Address', null]) {
      const fixture = orderFixture(['USD'], {}, { billTo: { salesName: 'Billing Sales Name', salesAddressType: 'delivery' }, billToAddresses: ['Delivery Address'] });
      const response = await fixture.save([{ quantity: 1, unitPrice: 10 }], method, 'PHP', { ...financialHeader, billToName: 'forged name', billToAddress: selectedAddress });
      assert.equal(response.body.record.billToName, 'Billing Sales Name');
      assert.equal(response.body.record.billToAddress, selectedAddress);
    }
    const defaultDelivery = orderFixture(['USD'], {}, { billTo: { salesAddressType: 'delivery' }, billToAddresses: ['Delivery Address'] });
    assert.equal((await defaultDelivery.save([{ quantity: 1, unitPrice: 10 }], method, 'PHP', financialHeader)).body.record.billToAddress, 'Delivery Address');
    const invalid = orderFixture(['USD'], {}, { billToAddresses: ['Delivery Address'] });
    await assert.rejects(() => invalid.save([{ quantity: 1, unitPrice: 10 }], method, 'PHP', { ...financialHeader, billToAddress: 'Unrelated Address' }), error => error.status === 400);
    assert.equal(invalid.state.writes, 0);
  }
  const historical = orderFixture(['USD'], { billToCustomerId: 3, billToAddress: 'Former Address' });
  assert.equal((await historical.save([{ quantity: 1, unitPrice: 10 }], 'put', 'PHP', { ...financialHeader, billToAddress: 'Former Address' })).body.record.billToAddress, 'Former Address');
});

test('amount header discounts are allocated proportionally without losing a rounding unit', async () => {
  const items = [{ quantity: 2, unitPrice: 10, discountRate: 10 }, { quantity: 1, unitPrice: 20 }];
  const fixture = orderFixture(['USD', 'USD']);
  const response = await fixture.save(items, 'post', 'PHP', { ...financialHeader, discountType: 'amount', discount: 90 });
  const record = response.body.record;
  const expected = calculateSalesOrder({ items, rate: 55, vatRate: 12, vatInclusive: false, discountType: 'amount', discount: 90, decimalInTotalPrice: 2 });
  for (const key of amountFields) assert.equal(record[key], expected[key]);
  assert.equal(record.total, '2240.000000');
  assert.deepEqual(record.items.map(row => row.headerDiscountAmount), ['42.630000', '47.370000']);
  assert.equal(record.items[1].discountRate, null);
  assert.equal(record.items[1].deliveryDate, null, 'A blank override remains NULL; the view uses expectedDeliveryDate.');
  const listed = await fixture.read('/sales-orders');
  assert.equal(listed.body.records.length, 1);
  assert.equal(listed.body.records[0].items.length, 2);
  assert.equal(listed.body.records[0].items[1].id, 2);
  assert.equal(listed.body.records[0].items[1].sourceCurrency, 'USD');
});

test('Bill To precision zero and six matches the frontend calculator, including inclusive VAT', async () => {
  const cases = [
    { places: 0, currency: 'PHP', rate: '2', vatInclusive: false, discountType: 'amount', discount: '3', items: [{ quantity: 2, unitPrice: 10, discountRate: '12.5' }], total: '36.000000' },
    { places: 6, currency: 'USD', rate: '1', vatInclusive: true, discountType: 'percent', discount: '2.5', items: [{ quantity: '0.333', unitPrice: '0.1153', discountRate: '5.5' }], total: '0.035376' },
  ];
  for (const example of cases) {
    const fixture = orderFixture(['USD'], {}, { billTo: { decimalInTotalPrice: example.places } });
    const response = await fixture.save(example.items, 'post', example.currency, { ...financialHeader, rate: example.rate, vatInclusive: example.vatInclusive, discountType: example.discountType, discount: example.discount });
    const expected = calculateSalesOrder({ ...example, decimalInTotalPrice: example.places, vatRate: 12 });
    assert.equal(response.body.record.decimalInTotalPrice, example.places);
    assert.equal(response.body.record.total, example.total);
    for (const key of amountFields) assert.equal(response.body.record[key], expected[key], key);
    for (const key of lineAmountFields) assert.equal(response.body.record.items[0][key], expected.items[0][key], key);
  }
});

test('six-place totals above floating-point precision remain exact strings and None ignores a stale discount', async () => {
  const fixture = orderFixture(['USD', 'USD'], {}, { billTo: { decimalInTotalPrice: 6 }, vatRate: '0.000000' });
  const response = await fixture.save([{ quantity: 1000000, unitPrice: 999999 }, { quantity: 1, unitPrice: '999999.999999' }], 'post', 'USD', { ...financialHeader, rate: '1', discountType: null, discount: '999999' });
  assert.equal(response.body.record.total, '999999999999.999999');
  assert.equal(response.body.record.grossAmount, '999999999999.999999');
  assert.equal(response.body.record.discount, null);
  assert.equal(response.body.record.headerDiscountAmount, '0.000000');
  assert.equal(response.body.record.vatRate, '0.000000');
  assert.equal(fixture.state.header.total, '999999999999.999999');
});

test('financial orders reject unknown VAT/rate modes, inactive references, invalid dates and overflow before writes', async () => {
  const cases = [
    { header: { rate: '0' } }, { header: { rate: '1.0000001' } }, { header: { rate: '1000000.000001' } },
    { header: { expectedDeliveryDate: '2026-11-12' } }, { header: { shipment: 'unknown' } },
    { header: { countryOfOrigin: 'Unknown Country' } }, { header: { discountType: 'amount', discount: 999999 } },
    { header: { vatInclusive: null } }, { settings: { vatRate: null } }, { settings: { vatRate: 101 } },
    { settings: { currencyActive: false } }, { settings: { paymentActive: false } }, { settings: { vatActive: false } },
    { settings: { billTo: { isActive: false } } }, { settings: { billTo: { decimalInTotalPrice: 7 } } },
    { items: [{ quantity: 1, unitPrice: 10, discountRate: 101 }] },
    { items: [{ quantity: 1, unitPrice: 10, deliveryDate: '2026-11-12' }] },
    { currency: 'USD', header: { rate: '2' } },
    { currency: 'USD', header: { rate: '1', discountType: 'percent', discount: 100 }, items: [{ quantity: 1000000, unitPrice: 100000000 }] },
    { header: { rate: '1000000' }, items: [{ quantity: '0.001', unitPrice: 100000000 }] },
  ];
  for (const example of cases) {
    const fixture = orderFixture(['USD'], {}, example.settings);
    await assert.rejects(() => fixture.save(example.items || [{ quantity: 1, unitPrice: 10 }], 'post', example.currency || 'PHP', { ...financialHeader, ...example.header }), error => error.status === 400);
    assert.equal(fixture.state.writes, 0);
    assert.equal(fixture.state.commits, 0);
  }
});

test('Sales Order choices come from active Configuration references and preserve an unset VAT rate', async () => {
  const fixture = orderFixture(['USD'], {}, { vatRate: null });
  const response = await fixture.read('/sales-order-options');
  assert.deepEqual(response.body.currencies.map(row => row.code), ['USD']);
  assert.equal(response.body.paymentTerms[0].name, 'Net 30');
  assert.equal(response.body.vatCodes[0].rate, null);
  assert.deepEqual(response.body.shipments.map(row => row.value), ['air', 'land', 'boat', 'na']);
});
