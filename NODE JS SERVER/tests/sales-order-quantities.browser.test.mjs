import assert from 'node:assert/strict';
import test from 'node:test';
import { expect } from '@playwright/test';
import { mockBrowser } from './helpers/mock-browser.mjs';

const actor = { id: 1, system: 'sales', name: 'Order Edit Admin', username: 'mock_order_edit', role: 'admin', isActive: true };
const customer = { id: 20, name: 'Mock Order Customer', salesName: 'Mock Billing Name', address: 'Main office, Laguna', salesAddressType: 'office', paymentTerm: '30 DAYS', vatCode: 'VZ', vatInclusive: false, decimalInPrice: 6, decimalInTotalPrice: 2, isActive: true };
const products = [
  { id: 30, sku: 'QTY-PCS-030', name: 'Precision component', description: 'Component description', unit: 'PCS', currency: 'USD', price: '10.000000', stock: '100.000', isActive: true },
  { id: 31, sku: 'QTY-KG-031', name: 'Packaging material', description: 'Material description', unit: 'KG', currency: 'USD', price: '2.000000', stock: '50.000', isActive: true },
  { id: 32, sku: 'QTY-PCS-032', name: 'Additional cable', description: 'Additional cable description', unit: 'PCS', currency: 'USD', price: '5.000000', stock: '80.000', isActive: true },
];
const options = {
  currencies: [{ id: 1, code: 'USD', description: 'US Dollar', isActive: true }],
  paymentTerms: [{ id: 1, name: '30 DAYS', description: '30 DAYS', isActive: true }],
  vatCodes: [{ id: 1, code: 'VZ', description: 'Zero rated', rate: '0.000000', isActive: true }],
  countries: [], shipments: [{ value: 'air', label: 'By Air' }],
};

function orderFixture({ invoiced = true, allLinked = false, delivered = false } = {}) {
  const items = products.slice(0, 2).map((product, index) => ({
    id: 101 + index, orderId: 11, productId: product.id, productName: product.name, sku: product.sku, description: product.description,
    unit: product.unit, currency: 'USD', unitPrice: product.price, convertedUnitPrice: product.price,
    refNumber: 'REF-' + (101 + index), quotationNumber: 'QT-' + (101 + index), deliveryDate: '2026-12-01',
    quantity: index ? '8.500' : '10.000', hasInvoice: invoiced && (!index || allLinked),
    invoicedQuantity: invoiced && (!index || allLinked) ? index ? '1.250' : '6.125' : '0.000',
    deliveredQuantity: delivered && !index ? '4.000' : '0.000',
    remainingDeliveryQuantity: delivered && !index ? '6.000' : index ? '8.500' : '10.000',
    grossAmount: index ? '17.000000' : '100.000000', netAmount: index ? '17.000000' : '100.000000', amount: index ? '17.000000' : '100.000000',
    lineTotal: index ? '17.000000' : '100.000000', lineDiscountAmount: '0.000000', headerDiscountAmount: '0.000000', discountAmount: '0.000000', vatAmount: '0.000000', discountRate: null,
  }));
  return {
    id: 11, number: 'SO-QTY-MOCK', customerId: 20, customerName: customer.name, customerAddress: customer.address,
    billToCustomerId: 20, billToName: customer.salesName, billToAddress: customer.address, preparedByName: actor.name,
    orderDate: '2026-11-14', expectedDeliveryDate: '2026-12-14', currency: 'USD', sourceCurrency: 'USD', rate: '1.000000',
    paymentTerm: '30 DAYS', shipment: 'air', countryOfOrigin: null, vatCode: 'VZ', vatRate: '0.000000', vatInclusive: false,
    discountType: null, discount: null, notes: 'Saved order note', status: 'confirmed', decimalInPrice: 6, decimalInTotalPrice: 2,
    total: '117.000000', grossAmount: '117.000000', discountAmount: '0.000000', netAmount: '117.000000', vatAmount: '0.000000',
    invoiced, delivered, items,
  };
}

async function orderApp(t, { getOrder, onWrite, invoice, delivery, shipping }) {
  return mockBrowser(t, async ({ method, pathname, body }) => {
    if (method === 'GET' && pathname === '/api/auth/session') return { json: { user: actor } };
    const lists = {
      '/api/customers': [customer], '/api/products': products, '/api/sales-orders': [getOrder()], '/api/users': [actor],
      '/api/sales-invoices': invoice ? [invoice] : [], '/api/delivery-receipts': delivery ? [delivery] : [], '/api/shipping-invoices': shipping ? [shipping] : [],
    };
    if (method === 'GET' && lists[pathname]) return { json: { records: lists[pathname] } };
    if (method === 'GET' && pathname === '/api/sales-orders/11') return { json: { record: getOrder() } };
    if (method === 'GET' && pathname === '/api/sales-order-options') return { json: options };
    const documents = { '/api/sales-invoices/71': invoice, '/api/delivery-receipts/81': delivery, '/api/shipping-invoices/91': shipping };
    if (method === 'GET' && documents[pathname]) return { json: { record: documents[pathname] } };
    return onWrite({ method, pathname, body });
  }, { project: 'SalesSystem', viewport: { width: 1920, height: 1000 } });
}

async function openOrders(app) {
  await app.page.emulateMedia({ reducedMotion: 'reduce' });
  await app.page.goto(app.origin);
  await expect(app.page.getByRole('heading', { name: 'Customer', exact: true })).toBeVisible();
  await app.page.locator('.sidebar').getByRole('button', { name: 'Sales Order', exact: true }).click();
  await expect(app.page.getByRole('heading', { name: 'Sales Order', exact: true })).toBeVisible();
  await expect(app.page.locator('.sales-order-monitor').getByRole('button', { name: 'View', exact: true })).toHaveCount(0);
}

function orderRow(page, index = 0) { return page.locator('.sales-order-monitor .records-table > tbody > tr').filter({ hasText: products[index].sku }); }
const editDialog = page => page.getByRole('dialog', { name: 'Edit SO-QTY-MOCK', exact: true });
const writes = app => app.apiRequests.filter(call => !['GET', 'HEAD', 'OPTIONS'].includes(call.method));

test('Edit from a searched later Sales Order line loads every item in the full editable form and saves an uninvoiced PUT', { timeout: 90000 }, async t => {
  let current = orderFixture({ invoiced: false });
  const savedBodies = [];
  const app = await orderApp(t, {
    getOrder: () => current,
    onWrite: ({ method, pathname, body }) => {
      assert.equal(method, 'PUT'); assert.equal(pathname, '/api/sales-orders/11'); savedBodies.push(body);
      current = { ...current, ...body, items: body.items.map((item, index) => ({ ...current.items[index], ...item })) };
      return { json: { record: current } };
    },
  });
  const { page } = app;
  await openOrders(app);
  const search = page.getByRole('searchbox', { name: 'Search sales order items', exact: true });
  await search.fill(products[1].sku);
  await expect(orderRow(page)).toHaveCount(0);
  await expect(orderRow(page, 1)).toHaveCount(1);
  await orderRow(page, 1).getByRole('button', { name: 'Edit', exact: true }).click();
  const dialog = editDialog(page);
  await expect(dialog.locator('.sales-order-items tbody tr')).toHaveCount(2);
  await expect(dialog.getByLabel('Product 1', { exact: true })).toHaveValue('30');
  await expect(dialog.getByLabel('Product 2', { exact: true })).toHaveValue('31');
  await expect(dialog.getByLabel('Customer *', { exact: true })).toBeEditable();
  await expect(dialog.getByLabel('Currency *', { exact: true })).toHaveValue('USD');
  await expect(dialog.getByLabel('Product 1', { exact: true })).toBeEditable();
  await expect(dialog.getByLabel('Quantity 1', { exact: true })).toBeEditable();
  await expect(dialog.getByLabel('Quantity 2', { exact: true })).toBeEditable();
  await dialog.getByLabel('Unit price 1', { exact: true }).fill('12.345600');
  await dialog.getByLabel('Quantity 1', { exact: true }).fill('4.125');
  await dialog.getByLabel('Notes', { exact: true }).fill('An uninvoiced order may still change its details.');
  await dialog.getByRole('button', { name: 'Save sales order', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  assert.equal(savedBodies.length, 1);
  assert.equal(savedBodies[0].customerId, 20); assert.equal(savedBodies[0].currency, 'USD');
  assert.equal(savedBodies[0].items.length, 2);
  assert.equal(savedBodies[0].items[0].unitPrice, '12.345600'); assert.equal(savedBodies[0].items[0].quantity, '4.125');
  assert.equal(savedBodies[0].items[1].quantity, '8.500');
  assert.equal(savedBodies[0].notes, 'An uninvoiced order may still change its details.');
  assert.equal(app.apiRequests.filter(call => call.method === 'GET' && call.pathname === '/api/sales-orders/11').length, 1, 'Edit must load the complete order instead of editing only the clicked list row.');
  assert.ok(writes(app).every(call => call.method === 'PUT'));
  await search.fill('');
  await expect(orderRow(page).getByRole('button', { name: 'Edit', exact: true })).toBeVisible();
  await expect(orderRow(page).getByRole('button', { name: 'Delete', exact: true })).toBeVisible();
  app.assertSafe();
});

test('A mixed Sales Order keeps the complete form, locks its header and SI row, and edits only the no-SI row without changing saved documents', { timeout: 120000 }, async t => {
  let current = orderFixture({ delivered: true });
  const frozenLine = structuredClone(current.items[0]);
  const invoiceItem = { ...structuredClone(frozenLine), quantity: '6.125', grossAmount: '61.250000', netAmount: '61.250000', amount: '61.250000', lineTotal: '61.250000' };
  const invoice = { ...structuredClone(current), id: 71, number: 'SI-QTY-SNAPSHOT', orderId: 11, orderNumber: current.number, invoiceDate: '2026-11-14', dueDate: '2026-12-14', total: '61.250000', grossAmount: '61.250000', netAmount: '61.250000', paidAmount: '0.000000', status: 'unpaid', items: [invoiceItem] };
  const delivery = { id: 81, number: 'DR-QTY-SNAPSHOT', orderId: 11, orderNumber: current.number, customerName: current.customerName, deliveredTo: 'Frozen receiver company', deliveryDate: '2026-11-15', receivedBy: 'Snapshot Receiver', address: 'Snapshot receiving bay', paymentTerm: current.paymentTerm, preparedByName: actor.name, items: [{ ...structuredClone(frozenLine), quantity: '4.000' }] };
  const shipping = { ...structuredClone(invoice), id: 91, number: 'SHI-QTY-SNAPSHOT', shippingDate: '2026-11-15', invoiceNumber: invoice.number, deliveryNumber: delivery.number, carrier: 'Snapshot carrier', trackingNumber: 'TRACK-SNAPSHOT' };
  const snapshots = JSON.stringify({ invoice, delivery, shipping });
  const savedBodies = [];
  const app = await orderApp(t, {
    getOrder: () => current, invoice, delivery, shipping,
    onWrite: ({ method, pathname, body }) => {
      assert.equal(method, 'PATCH'); assert.equal(pathname, '/api/sales-orders/11/items'); savedBodies.push(body);
      assert.deepEqual(Object.keys(body).sort(), ['items', 'removedItemIds']);
      assert.deepEqual(body.removedItemIds, []);
      assert.deepEqual(body.items.map(item => item.id), [102], 'The SI-linked line must not be submitted as an editable item.');
      current = { ...current, items: current.items.map(item => item.id === 102 ? { ...item, ...body.items[0], remainingDeliveryQuantity: body.items[0].quantity } : item) };
      return { json: { record: current } };
    },
  });
  const { page } = app;
  await openOrders(app);
  await expect(orderRow(page).getByRole('button', { name: 'Delete', exact: true })).toHaveCount(0);
  await orderRow(page, 1).getByRole('button', { name: 'Edit', exact: true }).click();
  let dialog = editDialog(page);
  await expect(dialog.locator('.sales-order-header > section')).toHaveCount(3);
  await expect(dialog.locator('.sales-order-items tbody tr')).toHaveCount(2);
  for (const label of ['Customer *', 'Bill to *', 'Billing address', 'Order date *', 'Expected delivery date *', 'Currency *', 'Rate *', 'Payment term *', 'Shipment *', 'Country of origin', 'VAT code *', 'VAT pricing *', 'Discount type', 'Notes', 'Status *']) {
    await expect(dialog.getByLabel(label, { exact: true })).not.toBeEditable();
  }
  for (const prefix of ['Reference', 'Product', 'Quantity', 'Unit price', 'Discount rate', 'Delivery date', 'Quotation number']) {
    await expect(dialog.getByLabel(prefix + ' 1', { exact: true })).not.toBeEditable();
    await expect(dialog.getByLabel(prefix + ' 2', { exact: true })).toBeEditable();
  }
  await expect(dialog.getByLabel('Quantity 1', { exact: true })).toHaveValue('10.000');
  await expect(dialog.getByRole('button', { name: 'Remove product 1', exact: true })).toBeDisabled();
  await expect(dialog.getByRole('button', { name: 'Remove product 2', exact: true })).toBeEnabled();
  await expect(dialog.locator('tr[data-invoice-locked="true"]')).toHaveCount(1);
  await expect(dialog.locator('.sales-order-item-lock')).toHaveCount(0);
  for (const width of [1280, 1440]) {
    await page.setViewportSize({ width, height: 960 });
    await dialog.locator('.sales-order-items-scroll').evaluate(element => { element.scrollLeft = 0; });
    const productGeometry = await dialog.getByLabel('Product 1', { exact: true }).evaluate(select => {
      const cell = select.closest('td').getBoundingClientRect();
      const input = select.getBoundingClientRect();
      return { inputLeft: input.left, inputRight: input.right, cellLeft: cell.left, cellRight: cell.right };
    });
    assert.ok(productGeometry.inputLeft >= productGeometry.cellLeft && productGeometry.inputRight <= productGeometry.cellRight + 1, 'Locked product controls must stay within their cell: ' + JSON.stringify(productGeometry));
  }

  await dialog.getByLabel('Quantity 2', { exact: true }).fill('4.125');
  await dialog.getByLabel('Unit price 2', { exact: true }).fill('3.456789');
  await dialog.getByLabel('Reference 2', { exact: true }).fill('REF-OPEN-UPDATED');
  await dialog.getByLabel('Quotation number 2', { exact: true }).fill('QT-OPEN-UPDATED');
  await dialog.getByLabel('Discount rate 2', { exact: true }).fill('5');
  await dialog.getByLabel('Delivery date 2', { exact: true }).fill('2026-12-20');
  for (const width of [320, 768, 1920]) {
    await page.setViewportSize({ width, height: 1000 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'The full form must stay inside the viewport while its line-item table scrolls.');
    await expect(dialog.getByRole('button', { name: 'Save sales order', exact: true })).toBeVisible();
  }
  await app.screenshot('sales-order-mixed-si-locks.png');
  await dialog.getByRole('button', { name: 'Save sales order', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  assert.equal(savedBodies.length, 1);
  assert.deepEqual(savedBodies[0].items[0], { id: 102, productId: 31, quantity: '4.125', unitPrice: '3.456789', refNumber: 'REF-OPEN-UPDATED', quotationNumber: 'QT-OPEN-UPDATED', discountRate: '5', deliveryDate: '2026-12-20' });
  assert.deepEqual(current.items[0], frozenLine);
  await expect(orderRow(page, 1).locator('td').nth(9)).toHaveText('4.125KG');
  await expect(orderRow(page).locator('td').nth(9)).toHaveText('10PCS');
  for (const [tab, title, quantity] of [['Invoice', 'Invoice', '6.125'], ['Delivery Receipt', 'Delivery Receipt', '4'], ['Shipping Invoice', 'Shipping Invoice', '6.125']]) {
    await page.locator('.sidebar').getByRole('button', { name: tab, exact: true }).click();
    await page.getByRole('button', { name: 'View', exact: true }).click();
    dialog = page.getByRole('dialog', { name: title, exact: true });
    if (title === 'Invoice') {
      await expect(dialog.locator('[data-invoice-item]')).toHaveCount(1);
      await expect(dialog.locator('[data-invoice-column="quantity"]')).toHaveText(quantity);
      await expect(dialog.locator('[data-invoice-summary] [data-invoice-field="totalAmountDue"]')).toHaveText('61.25');
    } else if (title === 'Delivery Receipt') {
      await expect(dialog.locator('[data-dr-item]')).toHaveCount(1);
      await expect(dialog.locator('[data-dr-column="quantity"]')).toHaveText(quantity);
      await expect(dialog.locator('[data-dr-column="unitPrice"], [data-dr-field="totalAmountDue"]')).toHaveCount(0);
    } else {
      await expect(dialog.locator('.document-table > tbody > tr')).toHaveCount(1);
      await expect(dialog.locator('.document-table > tbody > tr td').nth(2)).toHaveText(quantity);
    }
    await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  }
  assert.equal(JSON.stringify({ invoice, delivery, shipping }), snapshots);
  assert.ok(writes(app).every(call => call.method === 'PATCH' && call.requestPathname === '/api/sales/sales-orders/11/items'));
  app.assertSafe();
});

test('A mixed Sales Order may explicitly remove an unbilled line and add a new line while retaining the omitted SI line', { timeout: 90000 }, async t => {
  let current = orderFixture();
  const frozenLine = structuredClone(current.items[0]);
  const savedBodies = [];
  const app = await orderApp(t, {
    getOrder: () => current,
    onWrite: ({ method, pathname, body }) => {
      assert.equal(method, 'PATCH'); assert.equal(pathname, '/api/sales-orders/11/items'); savedBodies.push(body);
      assert.deepEqual(body.removedItemIds, [102]);
      assert.equal(body.items.length, 1); assert.equal(body.items[0].id, undefined); assert.equal(body.items[0].productId, 32);
      current = { ...current, items: [current.items[0], { ...body.items[0], id: 103, orderId: 11, sku: products[2].sku, productName: products[2].name, description: products[2].description, unit: 'PCS', currency: 'USD', hasInvoice: false, invoicedQuantity: '0.000', deliveredQuantity: '0.000', remainingDeliveryQuantity: body.items[0].quantity }] };
      return { json: { record: current } };
    },
  });
  const { page } = app;
  await openOrders(app);
  await orderRow(page, 1).getByRole('button', { name: 'Edit', exact: true }).click();
  const dialog = editDialog(page);
  await dialog.getByRole('button', { name: 'Remove product 2', exact: true }).click();
  await expect(dialog.locator('.sales-order-items tbody tr')).toHaveCount(1);
  await dialog.getByRole('button', { name: /Add product/ }).click();
  await dialog.getByLabel('Product 2', { exact: true }).selectOption('32');
  await dialog.getByLabel('Quantity 2', { exact: true }).fill('3.250');
  await dialog.getByLabel('Reference 2', { exact: true }).fill('NEW-REF');
  await dialog.getByRole('button', { name: 'Save sales order', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  assert.equal(savedBodies.length, 1);
  assert.deepEqual(current.items[0], frozenLine);
  await expect(orderRow(page, 1)).toHaveCount(0);
  await expect(orderRow(page, 2)).toHaveCount(1);
  app.assertSafe();
});

test('SI existence locks every linked line even when its invoiced quantity is zero, and adding a new line is still available', { timeout: 90000 }, async t => {
  const current = orderFixture({ allLinked: true });
  current.items.forEach(item => { item.invoicedQuantity = '0.000'; });
  const app = await orderApp(t, { getOrder: () => current, onWrite: call => { throw new Error('Unchanged SI-linked rows must not request ' + call.pathname); } });
  const { page } = app;
  await openOrders(app);
  await orderRow(page, 1).getByRole('button', { name: 'Edit', exact: true }).click();
  const dialog = editDialog(page);
  await expect(dialog.locator('.sales-order-items tbody tr')).toHaveCount(2);
  await expect(dialog.getByLabel('Quantity 1', { exact: true })).not.toBeEditable();
  await expect(dialog.getByLabel('Quantity 2', { exact: true })).not.toBeEditable();
  await expect(dialog.getByRole('button', { name: 'Save sales order', exact: true })).toBeDisabled();
  await expect(dialog.getByRole('button', { name: /Add product/ })).toBeEnabled();
  assert.equal(writes(app).length, 0);
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  app.assertSafe();
});

test('Unknown invoice linkage and a delivered legacy order stay read-only instead of permitting unsafe edits', { timeout: 90000 }, async t => {
  const current = orderFixture({ invoiced: false, delivered: true });
  current.items.forEach(item => { delete item.hasInvoice; });
  const app = await orderApp(t, { getOrder: () => current, onWrite: call => { throw new Error('Read-only legacy order must not request ' + call.pathname); } });
  const { page } = app;
  await openOrders(app);
  await orderRow(page, 1).getByRole('button', { name: 'Edit', exact: true }).click();
  const dialog = editDialog(page);
  await expect(dialog.getByLabel('Quantity 1', { exact: true })).not.toBeEditable();
  await expect(dialog.getByLabel('Quantity 2', { exact: true })).not.toBeEditable();
  await expect(dialog.getByRole('button', { name: 'Save sales order', exact: true })).toBeDisabled();
  await expect(dialog.getByRole('button', { name: /Add product/ })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  assert.equal(writes(app).length, 0);
  app.assertSafe();
});

test('An SI created after the edit form opens causes a visible conflict while preserving the unsaved no-SI draft', { timeout: 90000 }, async t => {
  const current = orderFixture();
  const before = structuredClone(current);
  const conflict = 'This item now has a sales invoice. Refresh the order before editing it.';
  const app = await orderApp(t, {
    getOrder: () => current,
    onWrite: ({ method, pathname, body }) => {
      assert.equal(method, 'PATCH'); assert.equal(pathname, '/api/sales-orders/11/items');
      assert.deepEqual(body.items.map(item => item.id), [102]);
      return { status: 409, json: { message: conflict } };
    },
  });
  const { page } = app;
  await openOrders(app);
  await orderRow(page, 1).getByRole('button', { name: 'Edit', exact: true }).click();
  const dialog = editDialog(page);
  await dialog.getByLabel('Quantity 2', { exact: true }).fill('9.125');
  await dialog.getByLabel('Reference 2', { exact: true }).fill('KEEP-UNSAVED-REF');
  current.items[1].hasInvoice = true; current.items[1].invoicedQuantity = '1.000';
  await dialog.getByRole('button', { name: 'Save sales order', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText(conflict);
  await expect(dialog.getByLabel('Quantity 2', { exact: true })).toHaveValue('9.125');
  await expect(dialog.getByLabel('Reference 2', { exact: true })).toHaveValue('KEEP-UNSAVED-REF');
  await expect(dialog.getByRole('button', { name: 'Save sales order', exact: true })).toBeEnabled();
  assert.equal(current.items[1].quantity, before.items[1].quantity);
  assert.equal(current.items[1].refNumber, before.items[1].refNumber);
  assert.deepEqual(current.items[0], before.items[0]);
  assert.equal(writes(app).length, 1);
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  app.assertSafe();
});

test('Invalid no-SI quantities are blocked before HTTP while SI quantities remain frozen', { timeout: 90000 }, async t => {
  const current = orderFixture();
  const app = await orderApp(t, { getOrder: () => current, onWrite: call => { throw new Error('Invalid line values must not request ' + call.pathname); } });
  const { page } = app;
  await openOrders(app);
  await orderRow(page, 1).getByRole('button', { name: 'Edit', exact: true }).click();
  const dialog = editDialog(page);
  const quantity = dialog.getByLabel('Quantity 2', { exact: true });
  for (const value of ['', '0', '-1', '1.0001', '1000000.001']) {
    await quantity.fill(value);
    await expect(dialog.getByRole('button', { name: 'Save sales order', exact: true })).toBeDisabled();
    await expect(dialog.getByLabel('Quantity 1', { exact: true })).toHaveValue('10.000');
    assert.equal(writes(app).length, 0);
  }
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  app.assertSafe();
});
