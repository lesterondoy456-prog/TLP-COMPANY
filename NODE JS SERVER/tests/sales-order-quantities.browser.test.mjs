import assert from 'node:assert/strict';
import test from 'node:test';
import { expect } from '@playwright/test';
import { mockBrowser } from './helpers/mock-browser.mjs';

const actor = { id: 1, system: 'sales', name: 'Order Quantity Admin', username: 'mock_quantity', role: 'admin', isActive: true };
const customer = { id: 20, name: 'Mock Quantity Customer', salesName: 'Mock Billing Name', address: 'Main office, Laguna', salesAddressType: 'office', paymentTerm: '30 DAYS', vatCode: 'VZ', vatInclusive: false, decimalInPrice: 6, decimalInTotalPrice: 2, isActive: true };
const products = [
  { id: 30, sku: 'QTY-PCS-030', name: 'Precision component', description: 'Frozen component description', unit: 'PCS', currency: 'USD', price: '10.000000', stock: '100.000', isActive: true },
  { id: 31, sku: 'QTY-KG-031', name: 'Packaging material', description: 'Frozen material description', unit: 'KG', currency: 'USD', price: '2.000000', stock: '50.000', isActive: true },
];
const options = {
  currencies: [{ id: 1, code: 'USD', description: 'US Dollar', isActive: true }],
  paymentTerms: [{ id: 1, name: '30 DAYS', description: '30 DAYS', isActive: true }],
  vatCodes: [{ id: 1, code: 'VZ', description: 'Zero rated', rate: '0.000000', isActive: true }],
  countries: [], shipments: [{ value: 'air', label: 'By Air' }],
};

function orderFixture(invoiced = true, delivered = true) {
  const items = products.map((product, index) => ({
    id: 101 + index, orderId: 11, productId: product.id, productName: product.name, sku: product.sku, description: product.description,
    unit: product.unit, currency: 'USD', unitPrice: product.price, convertedUnitPrice: product.price,
    quantity: index ? '8.500' : '10.000', invoicedQuantity: invoiced ? index ? '1.250' : '6.125' : '0.000',
    deliveredQuantity: delivered ? index ? '2.375' : '4.000' : '0.000', remainingDeliveryQuantity: delivered ? index ? '6.125' : '6.000' : index ? '8.500' : '10.000',
    grossAmount: index ? '17.000000' : '100.000000', netAmount: index ? '17.000000' : '100.000000', amount: index ? '17.000000' : '100.000000',
    lineTotal: index ? '17.000000' : '100.000000', discountAmount: '0.000000', vatAmount: '0.000000', discountRate: null, deliveryDate: null,
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
}

function firstOrderRow(page) { return page.locator('.sales-order-monitor .records-table > tbody > tr').filter({ hasText: products[0].sku }); }

test('An uninvoiced and undelivered Sales Order retains the complete editable form and saves a full PUT', { timeout: 90000 }, async t => {
  let current = orderFixture(false, false);
  const writes = [];
  const app = await orderApp(t, {
    getOrder: () => current,
    onWrite: ({ method, pathname, body }) => {
      assert.equal(method, 'PUT'); assert.equal(pathname, '/api/sales-orders/11'); writes.push(body);
      current = { ...current, ...body, items: body.items.map((item, index) => ({ ...current.items[index], ...item })) };
      return { json: { record: current } };
    },
  });
  const { page } = app;
  await openOrders(app);
  await expect(firstOrderRow(page).getByRole('button', { name: 'Delete', exact: true })).toBeVisible();
  await firstOrderRow(page).getByRole('button', { name: 'Edit', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Edit SO-QTY-MOCK', exact: true });
  await expect(dialog.getByLabel('Customer *', { exact: true })).toBeEditable();
  await expect(dialog.getByLabel('Currency *', { exact: true })).toHaveValue('USD');
  await expect(dialog.getByLabel('Product 1', { exact: true })).toBeEditable();
  await expect(dialog.getByLabel('Unit price 1', { exact: true })).toBeEditable();
  await dialog.getByLabel('Unit price 1', { exact: true }).fill('12.345600');
  await dialog.getByLabel('Quantity 1', { exact: true }).fill('4.125');
  await dialog.getByLabel('Notes', { exact: true }).fill('An uninvoiced order may still change its details.');
  await dialog.getByRole('button', { name: 'Save sales order', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].customerId, 20); assert.equal(writes[0].currency, 'USD');
  assert.equal(writes[0].items[0].unitPrice, '12.345600'); assert.equal(writes[0].items[0].quantity, '4.125');
  assert.equal(writes[0].notes, 'An uninvoiced order may still change its details.');
  assert.ok(app.apiRequests.filter(call => call.method !== 'GET').every(call => call.method === 'PUT'));
  app.assertSafe();
});

test('An invoiced Sales Order exposes quantity-only edits, enforces invoice and delivery floors and preserves saved document snapshots', { timeout: 120000 }, async t => {
  let current = orderFixture();
  const documentItems = current.items.map((item, index) => ({ ...item, quantity: index ? '1.250' : '6.125', grossAmount: index ? '2.500000' : '61.250000', netAmount: index ? '2.500000' : '61.250000', amount: index ? '2.500000' : '61.250000', lineTotal: index ? '2.500000' : '61.250000' }));
  const invoice = { ...structuredClone(current), id: 71, number: 'SI-QTY-SNAPSHOT', orderId: 11, orderNumber: current.number, invoiceDate: '2026-11-14', dueDate: '2026-12-14', total: '63.750000', grossAmount: '63.750000', netAmount: '63.750000', paidAmount: '0.000000', status: 'unpaid', items: documentItems };
  const delivery = { ...structuredClone(current), id: 81, number: 'DR-QTY-SNAPSHOT', orderId: 11, orderNumber: current.number, deliveryDate: '2026-11-15', receivedBy: 'Snapshot Receiver', address: 'Snapshot receiving bay', items: current.items.map((item, index) => ({ ...item, quantity: index ? '2.375' : '4.000' })) };
  const shipping = { ...structuredClone(invoice), id: 91, number: 'SHI-QTY-SNAPSHOT', shippingDate: '2026-11-15', invoiceNumber: invoice.number, deliveryNumber: delivery.number, carrier: 'Snapshot carrier', trackingNumber: 'TRACK-SNAPSHOT' };
  const snapshots = JSON.stringify({ invoice, delivery, shipping });
  const writes = [];
  const app = await orderApp(t, {
    getOrder: () => current, invoice, delivery, shipping,
    onWrite: ({ method, pathname, body }) => {
      assert.equal(method, 'PATCH'); assert.equal(pathname, '/api/sales-orders/11/quantities'); writes.push(body);
      current = { ...current, total: '66.000000', grossAmount: '66.000000', netAmount: '66.000000', items: current.items.map((item, index) => ({ ...item, quantity: body.items[index].quantity, remainingDeliveryQuantity: index ? '0.000' : '2.125' })) };
      return { json: { record: current } };
    },
  });
  const { page } = app;
  await openOrders(app);
  await expect(firstOrderRow(page).getByRole('button', { name: 'Delete', exact: true })).toHaveCount(0);
  await firstOrderRow(page).getByRole('button', { name: 'Edit', exact: true }).click();
  let dialog = page.getByRole('dialog', { name: 'Update quantities · SO-QTY-MOCK', exact: true });
  const first = dialog.getByLabel('Order quantity 1', { exact: true }), second = dialog.getByLabel('Order quantity 2', { exact: true });
  await expect(dialog.locator('input')).toHaveCount(2);
  await expect(dialog.locator('select, textarea')).toHaveCount(0);
  await expect(first).toHaveAttribute('step', '0.001'); await expect(first).toHaveAttribute('min', '6.125');
  await expect(second).toHaveAttribute('min', '2.375');
  await expect(dialog).toContainText(customer.name); await expect(dialog).toContainText('30 DAYS'); await expect(dialog).toContainText(products[0].sku);
  const save = dialog.getByRole('button', { name: 'Save quantities', exact: true });
  for (const value of ['', '0', '-1', '1.0001', '6.124', '1000000.001']) {
    await first.fill(value); await save.click(); await expect(first).toHaveAttribute('aria-invalid', 'true');
    assert.equal(writes.length, 0, 'Invalid order quantities must be blocked before HTTP.');
  }
  await first.fill('6.125'); await second.fill('2.374'); await save.click();
  await expect(second).toHaveAttribute('aria-invalid', 'true');
  await expect(dialog).toContainText('Quantity cannot be below the invoiced or delivered quantity.');
  assert.equal(writes.length, 0);
  await second.fill('2.375');
  for (const width of [320, 375, 768, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await expect(first).toBeVisible(); await expect(second).toBeVisible(); await expect(save).toBeVisible();
    if (width === 320) await app.screenshot('sales-order-quantity-edit-320.png');
    if (width <= 600) {
      await expect(dialog.locator('.order-quantity-details > div')).toHaveCount(6);
      const geometry = await dialog.evaluate(element => {
        const rect = target => { const box = target.getBoundingClientRect(); return { left: box.left, right: box.right, width: box.width }; };
        const summary = element.querySelector('.order-quantity-details');
        const rows = [...element.querySelectorAll('.order-quantity-table tbody tr')];
        return {
          summary: { ...rect(summary), display: getComputedStyle(summary).display, columns: getComputedStyle(summary).gridTemplateColumns, cells: [...summary.children].map(cell => ({ ...rect(cell), label: cell.querySelector('span').textContent })) },
          viewport: rect(element.querySelector('.order-quantity-fields .table-scroll')),
          rows: rows.map(row => ({ ...rect(row), display: getComputedStyle(row).display, columns: getComputedStyle(row).gridTemplateColumns, cells: [...row.children].map(cell => ({ ...rect(cell), display: getComputedStyle(cell).display, label: cell.dataset.label })) })),
        };
      });
      assert.ok(geometry.summary.cells.every(cell => cell.left >= geometry.summary.left - 1 && cell.right <= geometry.summary.right + 1), 'All six summary fields stay inside their mobile card: ' + JSON.stringify(geometry));
      assert.ok(geometry.rows.every(row => row.cells.length === 6));
      assert.ok(geometry.rows.every(row => row.cells.every(cell => cell.left >= geometry.viewport.left - 1 && cell.right <= geometry.viewport.right + 1)), 'All six item fields stay inside their visible mobile card: ' + JSON.stringify(geometry));
      await app.screenshot('sales-order-quantity-edit-' + width + '.png');
    }
  }
  await save.click(); await expect(dialog).toHaveCount(0);
  assert.deepEqual(writes, [{ items: [{ id: 101, quantity: '6.125' }, { id: 102, quantity: '2.375' }] }]);
  await expect(firstOrderRow(page).locator('td').nth(9)).toHaveText('6.125PCS');
  await expect(firstOrderRow(page).locator('td').nth(10)).toHaveText('2.125');
  assert.equal(app.apiRequests.filter(call => call.pathname === '/api/sales-order-options').length, 0, 'Quantity-only editing uses saved details and does not load a full-order options form.');

  for (const [tab, title, quantities] of [['Invoice', 'Invoice', ['6.125', '1.25']], ['Delivery Receipt', 'Delivery Receipt', ['4', '2.375']], ['Shipping Invoice', 'Shipping Invoice', ['6.125', '1.25']]]) {
    await page.locator('.sidebar').getByRole('button', { name: tab, exact: true }).click();
    await page.getByRole('button', { name: 'View', exact: true }).click();
    dialog = page.getByRole('dialog', { name: title, exact: true });
    if (title === 'Invoice') {
      const rows = dialog.locator('[data-invoice-item]');
      await expect(rows).toHaveCount(2);
      await expect(rows.nth(0).locator('[data-invoice-column="quantity"]')).toHaveText(quantities[0]);
      await expect(rows.nth(1).locator('[data-invoice-column="quantity"]')).toHaveText(quantities[1]);
      await expect(dialog.locator('[data-invoice-summary] [data-invoice-field="totalAmountDue"]')).toHaveText('63.75');
    } else {
      const rows = dialog.locator('.document-table > tbody > tr');
      await expect(rows).toHaveCount(2);
      await expect(rows.nth(0).locator('td').nth(2)).toHaveText(quantities[0]);
      await expect(rows.nth(1).locator('td').nth(2)).toHaveText(quantities[1]);
      if (title !== 'Delivery Receipt') await expect(dialog.locator('.document-grand-total strong')).toHaveText(new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'USD' }).format('63.750000'));
    }
    await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  }
  assert.equal(JSON.stringify({ invoice, delivery, shipping }), snapshots);
  assert.ok(app.apiRequests.filter(call => call.method !== 'GET').every(call => call.method === 'PATCH' && call.requestPathname === '/api/sales/sales-orders/11/quantities'));
  app.assertSafe();
});

test('Quantity-only editing blocks saving until every invoiced and delivered quantity is known', { timeout: 90000 }, async t => {
  const current = orderFixture();
  current.items[0].invoicedQuantity = null; current.items[1].deliveredQuantity = null;
  const app = await orderApp(t, {
    getOrder: () => current,
    onWrite: call => { throw new Error('Unknown document quantities must not request ' + call.pathname); },
  });
  const { page } = app;
  await openOrders(app);
  await firstOrderRow(page).getByRole('button', { name: 'Edit', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Update quantities · SO-QTY-MOCK', exact: true });
  await dialog.getByLabel('Order quantity 1', { exact: true }).fill('20');
  await dialog.getByLabel('Order quantity 2', { exact: true }).fill('20');
  await dialog.getByRole('button', { name: 'Save quantities', exact: true }).click();
  await expect(dialog.getByLabel('Order quantity 1', { exact: true })).toHaveAttribute('aria-invalid', 'true');
  await expect(dialog.getByLabel('Order quantity 2', { exact: true })).toHaveAttribute('aria-invalid', 'true');
  await expect(dialog.getByText('Refresh the order to load its invoiced and delivered quantities.', { exact: true })).toHaveCount(2);
  assert.ok(app.apiRequests.every(call => call.method === 'GET'));
  app.assertSafe();
});

test('A quantity reduction that makes the saved fixed discount exceed the order amount is blocked before PATCH', { timeout: 90000 }, async t => {
  const current = orderFixture(true, false);
  current.discountType = 'amount'; current.discount = '150.000000'; current.total = '50.000000';
  current.grossAmount = '200.000000'; current.discountAmount = '150.000000'; current.netAmount = '50.000000';
  current.items = [{ ...current.items[0], quantity: '2.000', unitPrice: '100.000000', convertedUnitPrice: '100.000000', invoicedQuantity: '0.500', deliveredQuantity: '0.000', remainingDeliveryQuantity: '2.000', grossAmount: '200.000000', netAmount: '50.000000', amount: '50.000000', lineTotal: '50.000000', discountAmount: '150.000000' }];
  const app = await orderApp(t, {
    getOrder: () => current,
    onWrite: call => { throw new Error('An invalid calculated amount must not request ' + call.pathname); },
  });
  const { page } = app;
  await openOrders(app);
  await firstOrderRow(page).getByRole('button', { name: 'Edit', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Update quantities · SO-QTY-MOCK', exact: true });
  await dialog.getByLabel('Order quantity 1', { exact: true }).fill('1.000');
  await dialog.getByRole('button', { name: 'Save quantities', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('Header discount cannot exceed the amount after line discounts.');
  await expect(dialog.getByLabel('Order quantity 1', { exact: true })).toHaveValue('1.000');
  assert.ok(app.apiRequests.every(call => call.method === 'GET'));
  app.assertSafe();
});
