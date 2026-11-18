import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { expect } from '@playwright/test';
import { mockBrowser } from './helpers/mock-browser.mjs';

const actor = { id: 1, system: 'sales', name: 'Frozen DR preparer', username: 'mock_invoice_stock', role: 'admin', isActive: true };
const customer = { id: 2, name: 'Changed current customer', address: 'Changed current address', drName: 'Changed current receiver', businessStyle: 'Changed business style', tin: 'WRONG-CURRENT-TIN', isActive: true };
const initialProduct = { id: 41, sku: 'FROZEN-PCS-041', name: 'Current product name', description: 'Changed current product description', unit: 'PCS', stock: '10.250', price: '987.654321', currency: 'USD', isActive: true };
const initialItem = { id: 101, productId: 41, productName: 'Frozen invoice product', sku: initialProduct.sku, description: 'Frozen invoice description', unit: 'PCS', quantity: '2.125', unitPrice: '987.654321', convertedUnitPrice: '987.654321', grossAmount: '2098.765432', netAmount: '2098.765432', discountAmount: '0.000000', vatAmount: '251.851852', amount: '2350.617284', lineTotal: '2350.617284', invoicedQuantity: '0.000', deliveredQuantity: '0.000', remainingDeliveryQuantity: '2.125' };
const financialKeys = ['currency', 'unitPrice', 'convertedUnitPrice', 'grossAmount', 'discountAmount', 'netAmount', 'vatAmount', 'amount', 'total', 'lineTotal'];
const artifacts = new URL('../.qa/delivery-receipt/', import.meta.url);

function deliveryFrom(invoice, id = 81, overrides = {}) {
  return {
    id, number: `DR-FROZEN-${id}`, invoiceId: invoice.id, invoiceNumber: invoice.number, orderId: invoice.orderId, orderNumber: invoice.orderNumber,
    customerId: invoice.customerId, customerName: invoice.customerName, deliveredTo: invoice.shipToName ?? invoice.billToName ?? invoice.customerName,
    address: invoice.billToAddress ?? invoice.customerAddress, buyerTin: invoice.buyerTin, businessStyle: invoice.buyerBusinessStyle,
    paymentTerm: invoice.paymentTerm, purchaseOrderNumber: null, preparedByName: actor.name, receivedBy: 'Frozen receiving person',
    deliveryDate: '2026-11-18', notes: 'Frozen receipt notes', stockDeducted: false,
    items: invoice.items.map(({ id, productId, productName, sku, description, unit, quantity }) => ({ id, productId, productName, sku, description, unit, quantity })),
    ...overrides,
  };
}

function invoiceSnapshot(order) {
  return {
    ...structuredClone(order), id: 61, number: 'SI-FROZEN-061', orderId: order.id, orderNumber: order.number,
    invoiceDate: '2026-11-18', dueDate: '2026-12-18', customerName: 'Frozen ordering customer', customerAddress: 'Frozen order address',
    billToName: 'Frozen bill-to company', billToAddress: 'Frozen billing and delivery address', shipToName: 'Frozen ship-to company',
    buyerTin: '001-023-045-00000', buyerBusinessStyle: 'Frozen manufacturing business', preparedByName: 'Original invoice issuer',
    delivered: false, deliveryReceiptId: null, deliveryReceiptNumber: null, paidAmount: '0.000000', status: 'unpaid',
    items: order.items.map((item, index) => ({ ...structuredClone(item), id: 601 + index, orderItemId: item.id })),
  };
}

async function fixture(t, { seedInvoice = false, seedReceipt, stock = '10.250', detailFailure = false, duplicateReceipt = false, realtime = false, excelError = false } = {}) {
  const state = {
    product: { ...initialProduct, stock },
    order: { id: 51, number: 'SO-FROZEN-051', customerId: 2, customerName: 'Frozen ordering customer', customerAddress: 'Frozen order address', billToName: 'Frozen bill-to company', billToAddress: 'Frozen billing and delivery address', orderDate: '2026-11-18', currency: 'USD', sourceCurrency: 'USD', rate: '1.000000', paymentTerm: '30 DAYS', vatCode: 'VS', vatRate: '12.000000', vatInclusive: false, grossAmount: '2098.765432', netAmount: '2098.765432', discountAmount: '0.000000', vatAmount: '251.851852', total: '2350.617284', decimalInTotalPrice: 6, status: 'confirmed', invoiced: false, delivered: false, items: [structuredClone(initialItem)] },
    invoices: [], receipts: [], movements: [], writes: [], detailReads: 0, excelReads: 0,
  };
  function issueInvoice() {
    const invoice = invoiceSnapshot(state.order);
    const before = state.product.stock;
    const after = (Number(before) - 2.125).toFixed(3);
    state.product.stock = after;
    state.order.invoiced = true; state.order.items[0].invoicedQuantity = '2.125';
    state.invoices.push(invoice);
    state.movements.push({ id: 'invoice:1', movementId: 1, type: 'invoice-out', direction: 'out', quantity: '2.125', unit: 'PCS', stockBefore: before, stockAfter: after, movementDate: invoice.invoiceDate, sourceDestination: invoice.shipToName, reference: invoice.number, reason: 'Sales invoice issued.', createdByUsername: actor.username, createdByName: actor.name, createdAt: '2026-11-18T02:00:00.000Z', invoiceId: invoice.id, invoiceNumber: invoice.number, orderNumber: state.order.number, customerName: invoice.customerName, address: null, receivedBy: null, deliveryReceiptId: null, deliveryReceiptNumber: null });
    return invoice;
  }
  if (seedInvoice) issueInvoice();
  if (seedReceipt) {
    // Read-only preview fixtures represent already saved documents; opening
    // them must not synthesize invoice stock postings or business writes.
    state.invoices.push({ ...invoiceSnapshot(state.order), items: structuredClone(seedReceipt.items) });
    state.order.invoiced = true;
    state.receipts.push(seedReceipt);
    state.invoices[0].delivered = true;
    state.invoices[0].deliveryReceiptId = seedReceipt.id;
    state.invoices[0].deliveryReceiptNumber = seedReceipt.number;
  }
  const workbook = Buffer.from('PK\x03\x04Mock-only delivery receipt workbook bytes.');
  const app = await mockBrowser(t, async ({ method, pathname, body }) => {
    if (method === 'GET' && pathname === '/api/auth/session') return { json: { user: actor } };
    const lists = { '/api/customers': [customer], '/api/products': [state.product], '/api/sales-orders': [state.order], '/api/sales-invoices': state.invoices, '/api/delivery-receipts': state.receipts, '/api/shipping-invoices': [], '/api/users': [actor] };
    if (method === 'GET' && Object.hasOwn(lists, pathname)) return { json: { records: structuredClone(lists[pathname]) } };
    if (method === 'GET' && pathname === '/api/sales-orders/51') return { json: { record: structuredClone(state.order) } };
    if (method === 'GET' && pathname === '/api/sales-invoices/61') {
      state.detailReads++;
      if (detailFailure && state.detailReads === 1) return { status: 503, json: { message: 'Mock invoice items could not be loaded.' } };
      return { json: { record: structuredClone(state.invoices[0]) } };
    }
    if (method === 'GET' && pathname === '/api/products/41/stock-movements') return { json: { product: structuredClone(state.product), records: structuredClone(state.movements) } };
    const excel = pathname.match(/^\/api\/delivery-receipts\/(\d+)\/excel$/);
    if (method === 'GET' && excel) {
      state.excelReads++;
      if (excelError && state.excelReads > 1) return { status: 503, json: { message: 'Mock DR workbook is temporarily unavailable.' } };
      const record = state.receipts.find(row => row.id === Number(excel[1]));
      return { contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', headers: { 'Content-Disposition': `attachment; filename="${record.number}.xlsx"` }, body: workbook };
    }
    const detail = pathname.match(/^\/api\/delivery-receipts\/(\d+)$/);
    if (method === 'GET' && detail) return { json: { record: structuredClone(state.receipts.find(row => row.id === Number(detail[1]))) } };
    if (method === 'POST' && pathname === '/api/sales-invoices') {
      state.writes.push({ method, pathname, body });
      assert.equal(body.orderId, 51); assert.equal(state.invoices.length, 0);
      return { status: 201, json: { record: issueInvoice() } };
    }
    if (method === 'PATCH' && pathname === '/api/sales-orders/51/quantities') {
      state.writes.push({ method, pathname, body });
      assert.deepEqual(body.items.map(row => row.id), [101]);
      state.order.items[0].quantity = body.items[0].quantity;
      state.order.items[0].remainingDeliveryQuantity = body.items[0].quantity;
      return { json: { record: structuredClone(state.order) } };
    }
    if (method === 'POST' && pathname === '/api/delivery-receipts') {
      state.writes.push({ method, pathname, body });
      assert.equal(body.invoiceId, 61); assert.equal(Object.hasOwn(body, 'orderId'), false);
      assert.equal(Object.hasOwn(body, 'items'), false, 'The browser must not submit mutable receipt quantities.');
      if (duplicateReceipt || state.receipts.length) return { status: 409, json: { message: 'This invoice already has a delivery receipt.' } };
      const record = deliveryFrom(state.invoices[0], 81, body);
      state.receipts.push(record); state.invoices[0].delivered = true; state.invoices[0].deliveryReceiptId = record.id; state.invoices[0].deliveryReceiptNumber = record.number;
      state.order.delivered = true; state.order.items[0].deliveredQuantity = '2.125';
      return { status: 201, json: { record } };
    }
    throw new Error('Unexpected mocked DR request: ' + method + ' ' + pathname);
  }, { project: 'SalesSystem', realtime, viewport: { width: 1440, height: 1100 } });
  await app.page.emulateMedia({ reducedMotion: 'reduce' });
  await app.page.goto(app.origin);
  await expect(app.page.getByRole('heading', { name: 'Customer', exact: true })).toBeVisible();
  return { ...app, state, workbook };
}

async function nav(app, label) {
  await app.page.locator('.sidebar').getByRole('button', { name: label, exact: true }).click();
  await expect(app.page.getByRole('heading', { name: label, exact: true })).toBeVisible();
}

async function newDelivery(app) {
  await nav(app, 'Delivery Receipt');
  await app.page.getByRole('button', { name: 'New delivery receipt', exact: false }).click();
  return app.page.getByRole('dialog', { name: 'New delivery receipt', exact: true });
}

async function noMoney(scope) {
  await expect(scope.locator('[data-dr-column="unitPrice"], [data-dr-column="grossAmount"], [data-dr-field="totalAmountDue"]')).toHaveCount(0);
  for (const text of ['987.654321', '987.65432', '2,350.62', '2350.617284', 'USD']) await expect(scope).not.toContainText(text);
  const labels = await scope.locator('th, [data-template-chrome] text').allTextContents();
  assert.ok(!labels.some(label => /^(?:unit price|selling price|currency|gross|discount|net amount|vat amount|total amount)$/i.test(label.trim())));
}

test('an invoice records one stock-out and its DR keeps frozen quantities after the Sales Order changes without deducting again', { timeout: 120_000 }, async t => {
  const app = await fixture(t);
  let dialog = await newDelivery(app);
  await expect(dialog.getByRole('combobox', { name: 'Sales order *', exact: true })).toHaveCount(0);
  await expect(dialog.getByRole('combobox', { name: 'Invoice *', exact: true }).locator('option')).toHaveCount(1);
  await expect(dialog.getByRole('button', { name: 'Create delivery receipt', exact: true })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await nav(app, 'Invoice');
  await app.page.getByRole('button', { name: 'New invoice', exact: false }).click();
  dialog = app.page.getByRole('dialog');
  await dialog.getByRole('combobox', { name: 'Sales order *', exact: true }).selectOption('51');
  await dialog.getByLabel('Invoice date *', { exact: true }).fill('2026-11-18');
  await dialog.getByLabel('Due date *', { exact: true }).fill('2026-12-18');
  await dialog.getByRole('button', { name: 'Create invoice', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  assert.equal(app.state.product.stock, '8.125'); assert.equal(app.state.movements.length, 1);
  await nav(app, 'Inventory');
  const stockRow = app.page.locator('.inventory-page .records-table tbody tr').filter({ hasText: initialProduct.sku });
  await expect(stockRow.locator('td').nth(3)).toHaveText('8.125');
  await stockRow.getByRole('button', { name: 'View transactions', exact: true }).click();
  dialog = app.page.getByRole('dialog', { name: 'Inventory transactions', exact: true });
  const history = dialog.locator('tbody > tr');
  await expect(history).toHaveCount(1); await expect(history.locator('.badge')).toHaveText(/invoice/i);
  await expect(history.locator('td').nth(7)).toHaveText('2.125');
  await expect(history.locator('td').nth(8)).toHaveText('10.25'); await expect(history.locator('td').nth(9)).toHaveText('8.125');
  await expect(history).toContainText('SI-FROZEN-061'); await expect(history).toContainText(actor.username);
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await nav(app, 'Sales Order');
  await app.page.locator('.sales-order-monitor .records-table tbody tr').getByRole('button', { name: 'Edit', exact: true }).click();
  dialog = app.page.getByRole('dialog');
  await dialog.getByLabel('Order quantity 1', { exact: true }).fill('5.000');
  await dialog.getByRole('button', { name: 'Save quantities', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  assert.equal(app.state.order.items[0].quantity, '5.000');
  assert.equal(app.state.invoices[0].items[0].quantity, '2.125');
  dialog = await newDelivery(app);
  await dialog.getByRole('combobox', { name: 'Invoice *', exact: true }).selectOption('61');
  await expect(dialog.getByRole('region', { name: 'Invoice items', exact: true }).locator('table')).toContainText('2.125');
  await expect(dialog.getByRole('region', { name: 'Invoice items', exact: true }).locator('table')).not.toContainText('5.000');
  await expect(dialog.locator('input[type="number"]')).toHaveCount(0);
  await noMoney(dialog);
  await dialog.getByLabel('Delivery date *', { exact: true }).fill('2026-11-18');
  await expect(dialog.getByLabel('Received by', { exact: true })).toHaveValue('');
  await expect(dialog.getByRole('textbox', { name: 'Delivery address *', exact: true })).toHaveValue('Frozen billing and delivery address');
  await dialog.getByRole('button', { name: 'Create delivery receipt', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  assert.equal(app.state.product.stock, '8.125'); assert.equal(app.state.movements.length, 1);
  assert.equal(app.state.receipts[0].items[0].quantity, '2.125');
  assert.equal(app.state.receipts[0].receivedBy, null, 'An unknown optional receiver must stay blank instead of being invented from a live customer.');
  for (const key of financialKeys) assert.equal(Object.hasOwn(app.state.receipts[0], key), false);
  await app.page.getByRole('button', { name: 'View', exact: true }).click();
  dialog = app.page.getByRole('dialog', { name: 'Delivery Receipt', exact: true });
  await expect(dialog.locator('[data-dr-item="0"] [data-dr-column="quantity"]')).toHaveText('2.125');
  await expect(dialog.locator('[data-dr-field="deliveredTo"]')).toHaveText('Frozen ship-to company');
  await expect(dialog.locator('[data-dr-field="businessStyle"]')).toHaveText('Frozen manufacturing business');
  await expect(dialog.locator('[data-dr-field="receivedBy"]')).toBeEmpty();
  await expect(dialog).not.toContainText('WRONG-CURRENT'); await noMoney(dialog);
  await app.screenshot('delivery-receipt-frozen-no-prices.png');
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  dialog = await newDelivery(app);
  await expect(dialog.getByRole('combobox', { name: 'Invoice *', exact: true }).locator('option')).toHaveCount(1);
  await expect(dialog.getByRole('button', { name: 'Create delivery receipt', exact: true })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await nav(app, 'Inventory');
  await expect(stockRow.locator('td').nth(3)).toHaveText('8.125');
  assert.deepEqual(app.state.writes.map(write => write.method + ' ' + write.pathname), ['POST /api/sales-invoices', 'PATCH /api/sales-orders/51/quantities', 'POST /api/delivery-receipts']);
  app.assertSafe();
});

test('insufficient invoice stock blocks every POST until realtime refresh enables the same open form', { timeout: 90_000 }, async t => {
  const app = await fixture(t, { stock: '1.000', realtime: true });
  await expect.poll(() => app.realtimeClients()).toBe(1);
  await nav(app, 'Invoice');
  await app.page.getByRole('button', { name: 'New invoice', exact: false }).click();
  const dialog = app.page.getByRole('dialog');
  await dialog.getByRole('combobox', { name: 'Sales order *', exact: true }).selectOption('51');
  await dialog.getByLabel('Invoice date *', { exact: true }).fill('2026-11-18');
  await dialog.getByLabel('Due date *', { exact: true }).fill('2026-12-18');
  await dialog.getByLabel('Notes', { exact: true }).fill('Keep my unsaved invoice note');
  await expect(dialog.getByRole('alert')).toContainText('insufficient stock');
  await expect(dialog.getByRole('button', { name: 'Create invoice', exact: true })).toBeDisabled();
  assert.ok(app.apiRequests.every(call => call.method === 'GET'));
  await app.page.evaluate(() => { window.invoiceFormNode = document.querySelector('dialog'); });
  app.state.product = { ...app.state.product, stock: '10.250' };
  app.emitChange('SalesSystem', ['products', 'stock-movements']);
  await expect(dialog.getByRole('button', { name: 'Create invoice', exact: true })).toBeEnabled();
  await expect(dialog.getByRole('textbox', { name: 'Notes', exact: true })).toHaveValue('Keep my unsaved invoice note');
  await expect(dialog.getByRole('combobox', { name: 'Sales order *', exact: true })).toHaveValue('51');
  assert.equal(await app.page.evaluate(() => window.invoiceFormNode === document.querySelector('dialog')), true);
  await dialog.getByRole('button', { name: 'Create invoice', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  assert.equal(app.state.writes.length, 1); assert.equal(app.state.movements.length, 1); assert.equal(app.state.product.stock, '8.125');
  app.assertSafe();
});

test('DR retries invoice detail reads and reports a duplicate receipt without posting stock or changing frozen items', { timeout: 90_000 }, async t => {
  const app = await fixture(t, { seedInvoice: true, detailFailure: true, duplicateReceipt: true });
  const dialog = await newDelivery(app);
  await dialog.getByRole('combobox', { name: 'Invoice *', exact: true }).selectOption('61');
  await expect(dialog.getByRole('alert')).toContainText('Mock invoice items could not be loaded.');
  await expect(dialog.getByRole('button', { name: 'Create delivery receipt', exact: true })).toBeDisabled();
  assert.ok(app.apiRequests.every(call => call.method === 'GET'));
  await dialog.getByRole('button', { name: 'Retry invoice items', exact: true }).click();
  await expect(dialog.getByRole('region', { name: 'Invoice items', exact: true }).locator('table')).toContainText('2.125');
  await dialog.getByLabel('Delivery date *', { exact: true }).fill('2026-11-18');
  await dialog.getByLabel('Received by', { exact: true }).fill('Frozen receiving person');
  await dialog.getByRole('button', { name: 'Create delivery receipt', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('already has a delivery receipt');
  await expect(dialog.getByRole('region', { name: 'Invoice items', exact: true }).locator('table')).toContainText('2.125');
  assert.equal(app.state.receipts.length, 0); assert.equal(app.state.product.stock, '8.125'); assert.equal(app.state.movements.length, 1);
  assert.equal(app.state.writes.length, 1); app.assertSafe();
});

for (const count of [1, 14, 15, 100]) {
  test(`price-free DR template keeps ${count} frozen items on ${Math.ceil(count / 14)} Letter sheets and downloads Excel`, { timeout: 90_000 }, async t => {
    const invoice = invoiceSnapshot({ id: 51, number: 'SO-FROZEN-051', customerId: 2, paymentTerm: '30 DAYS', items: Array.from({ length: count }, (_, index) => ({ ...initialItem, id: index + 1, sku: `DR-ITEM-${String(index + 1).padStart(3, '0')}`, description: `Frozen short description ${index + 1}`, quantity: '2.125' })) });
    const receipt = deliveryFrom(invoice);
    const app = await fixture(t, { seedReceipt: receipt, excelError: true });
    await nav(app, 'Delivery Receipt');
    await app.page.getByRole('button', { name: 'View', exact: true }).click();
    await expect(app.page.getByRole('dialog', { name: 'Delivery Receipt', exact: true })).toBeVisible();
    const dialog = app.page.locator('dialog:has([data-dr-page])[open]');
    const pages = dialog.locator('[data-dr-page]');
    await expect(pages).toHaveCount(Math.ceil(count / 14));
    await expect(dialog.locator('[data-dr-item]')).toHaveCount(count);
    assert.deepEqual(await dialog.locator('[data-dr-item]').evaluateAll(rows => rows.map(row => Number(row.dataset.drItem))), Array.from({ length: count }, (_, index) => index));
    await expect(dialog.locator('[data-dr-summary]')).toHaveCount(1);
    await expect(pages.last().locator('[data-dr-summary]')).toHaveCount(1);
    await expect(dialog.locator('.dr-data-footer, [data-dr-field="pageNumber"]')).toHaveCount(0);
    await expect(pages.first().locator('[data-dr-field="buyerTin"]')).toHaveText('001-023-045-00000');
    await noMoney(dialog);
    const downloaded = app.page.waitForEvent('download');
    await dialog.getByRole('button', { name: 'Download Excel', exact: true }).click();
    const download = await downloaded;
    assert.equal(download.suggestedFilename(), receipt.number + '.xlsx');
    assert.deepEqual(await readFile(await download.path()), app.workbook);
    if (count === 1) {
      await dialog.getByRole('button', { name: 'Download Excel', exact: true }).click();
      await expect(dialog.getByText('Mock DR workbook is temporarily unavailable.', { exact: false })).toBeVisible();
      await app.page.setViewportSize({ width: 375, height: 844 });
      await expect.poll(async () => (await pages.first().boundingBox()).width).toBeLessThanOrEqual(375);
      await expect.poll(async () => (await pages.first().boundingBox()).width).toBeGreaterThan(250);
      await expect.poll(() => app.page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
      await app.screenshot('delivery-receipt-mobile-fit-no-prices.png');
    }
    await app.page.emulateMedia({ media: 'print' });
    await mkdir(artifacts, { recursive: true });
    const pdf = await app.page.pdf({ path: fileURLToPath(new URL(`delivery-${count}-items.pdf`, artifacts)), preferCSSPageSize: true, printBackground: true, displayHeaderFooter: false });
    assert.equal((pdf.toString('latin1').match(/\/Type\s*\/Page\b/g) || []).length, Math.ceil(count / 14));
    for (const [, width, height] of pdf.toString('latin1').matchAll(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/g)) {
      assert.ok(Math.abs(Number(width) - 612) < 1); assert.ok(Math.abs(Number(height) - 792) < 1);
    }
    assert.ok(app.apiRequests.every(call => call.method === 'GET')); app.assertSafe();
  });
}
