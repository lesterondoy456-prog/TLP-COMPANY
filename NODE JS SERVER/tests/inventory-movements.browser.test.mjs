import assert from 'node:assert/strict';
import test from 'node:test';
import { expect } from '@playwright/test';
import { mockBrowser } from './helpers/mock-browser.mjs';

const product = { id: 41, sku: 'INV-MOVE-041', name: 'Precision component', description: 'A component with stock measured to three decimal places.', unit: 'PCS', stock: '12.345', category: 'Components', isActive: true };
const otherProduct = { id: 42, sku: 'INV-MOVE-042', name: 'Separate material', description: 'A separate product measured in KG.', unit: 'KG', stock: '7.125', category: 'Materials', isActive: true };

async function movementApp(t, onMovement, { realtime = false, role = 'admin', listing = () => [product, otherProduct] } = {}) {
  const user = { id: 3, system: 'sales', name: 'Movement ' + role, username: 'mock_movement_' + role, role, isActive: true };
  let reads = 0;
  const app = await mockBrowser(t, async call => {
    if (call.method === 'GET' && call.pathname === '/api/auth/session') return { json: { user } };
    if (call.method === 'GET' && call.pathname === '/api/products') { reads++; return { json: { records: listing() } }; }
    if (call.method === 'GET' && call.pathname === '/api/users') return { json: { records: [user] } };
    if (call.method === 'GET' && ['/api/customers', '/api/sales-orders', '/api/sales-invoices', '/api/delivery-receipts', '/api/shipping-invoices'].includes(call.pathname)) return { json: { records: [] } };
    return onMovement(call);
  }, { project: 'SalesSystem', realtime, viewport: { width: 1920, height: 1000 } });
  return { ...app, productReads: () => reads };
}

async function openInventory(app) {
  await app.page.emulateMedia({ reducedMotion: 'reduce' });
  await app.page.goto(app.origin);
  await expect(app.page.getByRole('heading', { name: 'Customer', exact: true })).toBeVisible();
  await app.page.locator('.sidebar').getByRole('button', { name: 'Inventory', exact: true }).click();
  await expect(app.page.getByRole('heading', { name: 'Inventory', exact: true })).toBeVisible();
}

function productRow(page, sku = product.sku) {
  return page.locator('.inventory-page .records-table > tbody > tr').filter({ hasText: sku });
}

async function fillMovement(dialog, direction, { quantity = '0.001', movementDate = '2026-11-15', counterparty = 'Mock stock room', reason = 'Approved physical inventory correction', reference = 'REF-MOCK-041' } = {}) {
  await dialog.getByLabel('Movement date *', { exact: true }).fill(movementDate);
  await dialog.getByLabel('Quantity *', { exact: true }).fill(quantity);
  await dialog.getByLabel(direction === 'in' ? 'Source *' : 'Destination *', { exact: true }).fill(counterparty);
  await dialog.getByLabel('Reason *', { exact: true }).fill(reason);
  await dialog.getByLabel('Reference (optional)', { exact: true }).fill(reference);
}

async function assertNoPageOverflow(page) {
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'The movement view must stay inside the page at this viewport.');
}

function manualRecord({ id = 1, direction = 'in', quantity = '0.001', stockBefore = '12.345', stockAfter = '12.346', reference = 'REF-MOCK-041' } = {}) {
  return {
    id: 'manual:' + id, movementId: id, type: 'manual-' + direction, direction, quantity, unit: 'PCS', stockBefore, stockAfter,
    movementDate: '2026-11-15', sourceDestination: 'Mock stock room', reference, reason: 'Approved physical inventory correction',
    createdByUsername: 'mock_movement_admin', createdByName: 'Movement admin', createdAt: '2026-11-15T08:10:00.000Z',
    deliveryReceiptId: null, deliveryReceiptNumber: null, orderNumber: null, invoiceNumber: null, customerName: null, address: null, receivedBy: null,
  };
}

test('Sales can review and confirm exact three-decimal manual stock in and out without making any request during review', { timeout: 90000 }, async t => {
  let current = { ...product };
  const writes = [], records = [];
  const app = await movementApp(t, ({ method, pathname, body }) => {
    assert.equal(pathname, '/api/products/41/stock-movements');
    if (method === 'GET') return { json: { product: current, records } };
    assert.equal(method, 'POST');
    writes.push(body);
    const next = writes.length === 1 ? '12.346' : '12.000';
    const record = manualRecord({ id: writes.length, ...body, stockBefore: current.stock, stockAfter: next });
    current = { ...current, stock: next }; records.unshift(record);
    return { status: 201, json: { record, product: current, replayed: false } };
  }, { role: 'sales', listing: () => [current, otherProduct] });
  const { page } = app;
  await openInventory(app);
  await productRow(page).getByRole('button', { name: 'Manual stock in', exact: true }).click();
  let dialog = page.getByRole('dialog', { name: 'Manual stock in', exact: true });
  await fillMovement(dialog, 'in');
  await dialog.getByRole('button', { name: 'Review movement', exact: true }).click();
  await expect(dialog.locator('.inventory-stock-preview dd')).toHaveText('12.346');
  assert.equal(writes.length, 0, 'Reviewing a movement never creates a transaction.');
  await dialog.getByRole('button', { name: 'Back to edit', exact: true }).click();
  await expect(dialog.getByLabel('Quantity *', { exact: true })).toHaveValue('0.001');
  await expect(dialog.getByLabel('Source *', { exact: true })).toHaveValue('Mock stock room');
  await expect(dialog.getByLabel('Reference (optional)', { exact: true })).toHaveValue('REF-MOCK-041');
  await dialog.getByRole('button', { name: 'Review movement', exact: true }).click();
  await dialog.getByRole('button', { name: 'Confirm stock in', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(productRow(page).locator('td').nth(3)).toHaveText('12.346');

  await productRow(page).getByRole('button', { name: 'Manual stock out', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Manual stock out', exact: true });
  await fillMovement(dialog, 'out', { quantity: '0.346', reference: '' });
  await dialog.getByRole('button', { name: 'Review movement', exact: true }).click();
  await expect(dialog.locator('.inventory-stock-preview dd')).toHaveText('12');
  assert.equal(writes.length, 1);
  await dialog.getByRole('button', { name: 'Confirm stock out', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(productRow(page).locator('td').nth(3)).toHaveText('12');
  assert.equal(writes.length, 2);
  for (const [index, write] of writes.entries()) {
    assert.match(write.requestKey, /^[a-f\d]{32}$/i);
    assert.deepEqual(Object.keys(write).sort(), ['requestKey', 'direction', 'quantity', 'movementDate', 'sourceDestination', 'reason', 'reference'].sort());
    assert.equal(write.quantity, index === 0 ? '0.001' : '0.346');
    assert.equal(write.direction, index === 0 ? 'in' : 'out');
    assert.equal(write.movementDate, '2026-11-15');
    assert.equal(write.sourceDestination, 'Mock stock room');
    assert.equal(write.reason, 'Approved physical inventory correction');
    assert.equal(write.reference, index === 0 ? 'REF-MOCK-041' : null);
  }
  assert.notEqual(writes[0].requestKey, writes[1].requestKey, 'Distinct movements get distinct retry keys.');
  assert.ok(app.apiRequests.filter(call => call.method !== 'GET').every(call => call.requestPathname === '/api/sales/products/41/stock-movements'));
  app.assertSafe();
});

test('Manual movement required fields, fractional precision and insufficient stock are rejected in the frontend before a POST', { timeout: 90000 }, async t => {
  const app = await movementApp(t, call => { throw new Error('Invalid or unconfirmed movement must not request ' + call.pathname); }, { role: 'saleshead' });
  const { page } = app;
  await openInventory(app);
  await productRow(page).getByRole('button', { name: 'Manual stock out', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Manual stock out', exact: true });
  await expect(dialog.locator('.required-mark')).toHaveCount(4);
  await fillMovement(dialog, 'out');
  const review = dialog.getByRole('button', { name: 'Review movement', exact: true });
  const rejectsReview = async () => {
    await review.click();
    await expect(dialog.getByRole('alert')).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Confirm stock out', exact: true })).toHaveCount(0);
    assert.ok(app.apiRequests.every(call => call.method === 'GET'), 'Invalid inputs are rejected before fetch.');
  };
  for (const quantity of ['', '0', '-1', '1.0001', '13']) {
    await dialog.getByLabel('Quantity *', { exact: true }).fill(quantity);
    await rejectsReview();
  }
  await dialog.getByLabel('Quantity *', { exact: true }).fill('0.001');
  for (const label of ['Movement date *', 'Destination *', 'Reason *']) {
    const input = dialog.getByLabel(label, { exact: true });
    const original = await input.inputValue(); await input.fill(''); await rejectsReview(); await input.fill(original);
  }
  await dialog.getByLabel('Reference (optional)', { exact: true }).fill('');
  await review.click();
  await expect(dialog.getByRole('button', { name: 'Confirm stock out', exact: true })).toBeVisible();
  assert.ok(app.apiRequests.every(call => call.method === 'GET'), 'A valid preview still requires explicit confirmation.');
  for (const width of [320, 375, 768, 1920]) {
    await page.setViewportSize({ width, height: 844 });
    await assertNoPageOverflow(page);
    await expect(dialog.getByRole('button', { name: 'Confirm stock out', exact: true })).toBeVisible();
    if (width === 320) await app.screenshot('sales-inventory-movement-review-320.png');
  }
  await dialog.getByRole('button', { name: 'Back to edit', exact: true }).click();
  await expect(dialog.getByLabel('Quantity *', { exact: true })).toHaveValue('0.001');
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  assert.ok(app.apiRequests.every(call => call.method === 'GET'));
  app.assertSafe();
});

test('Inventory history shows manual and Delivery Receipt sources and realtime refresh preserves the history, filters and unsaved movement', { timeout: 90000 }, async t => {
  let current = { ...product }, reads = 0;
  let records = [manualRecord(), {
    id: 'delivery:61:72', movementId: null, type: 'delivery-out', direction: 'out', quantity: '2.001', unit: 'PCS', stockBefore: null, stockAfter: null,
    movementDate: '2026-11-14', sourceDestination: 'Mock Delivery Customer', reference: 'DR-MOCK-061', reason: null,
    createdByUsername: 'mock_delivery', createdByName: 'Delivery Operator', createdAt: '2026-11-14T02:00:00.000Z',
    deliveryReceiptId: 61, deliveryReceiptNumber: 'DR-MOCK-061', orderNumber: 'SO-MOCK-051', invoiceNumber: 'SI-MOCK-052', customerName: 'Mock Delivery Customer', address: 'Mock receiving bay, Laguna', receivedBy: 'Mock Receiver',
  }];
  const app = await movementApp(t, ({ method, pathname }) => {
    assert.equal(method, 'GET'); assert.equal(pathname, '/api/products/41/stock-movements'); reads++;
    return { json: { product: current, records } };
  }, { realtime: true, listing: () => [current, otherProduct] });
  const { page } = app;
  await openInventory(app);
  await expect.poll(() => app.realtimeClients()).toBe(1);
  await expect.poll(() => app.productReads()).toBeGreaterThanOrEqual(2);
  const inventory = page.locator('.inventory-page');
  const stockFilter = inventory.getByRole('combobox', { name: 'Stock status', exact: true });
  const productFilter = inventory.getByRole('combobox', { name: 'Product status', exact: true });
  const search = inventory.getByRole('searchbox');
  await stockFilter.selectOption('in-stock'); await productFilter.selectOption('active'); await search.fill(product.sku);
  assert.equal(reads, 0, 'History is loaded only when requested.');
  await productRow(page).getByRole('button', { name: 'View transactions', exact: true }).click();
  let dialog = page.getByRole('dialog', { name: 'Inventory transactions', exact: true });
  await expect(dialog).toContainText('REF-MOCK-041');
  await expect(dialog).toContainText('DR-MOCK-061');
  await expect(dialog).toContainText('12.345'); await expect(dialog).toContainText('12.346');
  await expect(dialog).toContainText('2.001');
  await expect(dialog).not.toContainText(otherProduct.sku);
  const deliveryRow = dialog.locator('tbody > tr').filter({ hasText: 'DR-MOCK-061' });
  await expect(deliveryRow.locator('td').nth(8)).toHaveText('—');
  await expect(deliveryRow.locator('td').nth(9)).toHaveText('—');
  await expect(deliveryRow.locator('td').nth(7)).toHaveText('2.001');
  await expect(deliveryRow).toContainText('SO-MOCK-051');
  await expect(deliveryRow).toContainText('SI-MOCK-052');
  await expect(deliveryRow).toContainText('Mock Receiver');
  await expect(deliveryRow).toContainText('Mock receiving bay, Laguna');
  await expect(deliveryRow).toContainText('mock_delivery');
  await page.evaluate(() => { window.inventoryDocument = document; window.inventoryNode = document.querySelector('.inventory-page'); window.historyDialog = document.querySelector('dialog'); });
  for (const width of [320, 375, 768, 1920]) {
    await page.setViewportSize({ width, height: 900 }); await assertNoPageOverflow(page);
    await expect(dialog).toContainText('REF-MOCK-041'); await expect(dialog).toContainText('DR-MOCK-061');
    if (width <= 600) {
      const deliveryCard = dialog.locator('.record-mobile-card').filter({ hasText: 'DR-MOCK-061' });
      await expect(deliveryCard.getByText('2.001', { exact: true })).toBeVisible();
      for (const details of await deliveryCard.locator('details').all()) if (await details.getAttribute('open') === null) await details.locator('summary').click();
      await expect(deliveryCard.getByText('Mock Receiver', { exact: true })).toBeVisible();
      if (width === 375) await app.screenshot('sales-inventory-history-375.png');
    }
  }
  const before = reads;
  current = { ...current, stock: '11.125' };
  records = [manualRecord({ id: 2, quantity: '1.221', direction: 'out', stockBefore: '12.346', stockAfter: '11.125', reference: 'REF-REALTIME-042' }), ...records];
  app.emitChange('SalesSystem', ['products', 'stock-movements']);
  await expect.poll(() => reads).toBeGreaterThan(before);
  await expect(dialog).toContainText('REF-REALTIME-042');
  assert.equal(await page.evaluate(() => window.historyDialog === document.querySelector('dialog')), true);
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(productRow(page).locator('td').nth(3)).toHaveText('11.125');
  await productRow(page).getByRole('button', { name: 'Manual stock in', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Manual stock in', exact: true });
  await fillMovement(dialog, 'in', { quantity: '1.125', reason: 'Keep this unsaved reason through realtime refresh' });
  await page.evaluate(() => { window.movementDialog = document.querySelector('dialog'); window.quantityInput = [...document.querySelectorAll('dialog input')].find(input => input.value === '1.125'); });
  const beforeProducts = app.productReads(); current = { ...current, stock: '10.125' };
  app.emitChange('SalesSystem', ['products', 'stock-movements']);
  await expect.poll(() => app.productReads()).toBeGreaterThan(beforeProducts);
  await expect(dialog.getByLabel('Quantity *', { exact: true })).toHaveValue('1.125');
  await expect(dialog.getByLabel('Reason *', { exact: true })).toHaveValue('Keep this unsaved reason through realtime refresh');
  await expect(dialog.locator('.inventory-current-stock')).toHaveText('10.125');
  await dialog.getByRole('button', { name: 'Review movement', exact: true }).click();
  await expect(dialog.locator('.inventory-stock-preview dd')).toHaveText('11.25');
  current = { ...current, stock: '8.125' };
  app.emitChange('SalesSystem', ['products', 'stock-movements']);
  await expect(dialog.locator('.inventory-stock-preview dd')).toHaveText('9.25');
  await expect(dialog.getByRole('button', { name: 'Confirm stock in', exact: true })).toBeVisible();
  assert.equal(await page.evaluate(() => window.inventoryDocument === document && window.inventoryNode === document.querySelector('.inventory-page') && window.movementDialog === document.querySelector('dialog')), true);
  await expect(stockFilter).toHaveValue('in-stock'); await expect(productFilter).toHaveValue('active'); await expect(search).toHaveValue(product.sku);
  assert.equal(await page.evaluate(() => performance.getEntriesByType('navigation').length), 1);
  assert.ok(app.apiRequests.every(call => call.method === 'GET'));
  app.assertSafe();
});

test('Unknown, negative, inactive and missing-unit products retain readable history while manual adjustments are blocked before a POST', { timeout: 90000 }, async t => {
  const blocked = [
    { ...product, id: 41, sku: 'INV-UNKNOWN', stock: null },
    { ...product, id: 42, sku: 'INV-NEGATIVE', stock: '-0.001' },
    { ...product, id: 43, sku: 'INV-INACTIVE', isActive: false },
    { ...product, id: 44, sku: 'INV-NO-UNIT', unit: null },
  ];
  const app = await movementApp(t, ({ method, pathname }) => {
    assert.equal(method, 'GET', 'Blocked product states cannot create stock movements.');
    const match = pathname.match(/^\/api\/products\/(\d+)\/stock-movements$/);
    assert.ok(match);
    return { json: { product: blocked.find(row => row.id === Number(match[1])), records: [] } };
  }, { listing: () => blocked });
  const { page } = app;
  await openInventory(app);
  for (const row of blocked) {
    await productRow(page, row.sku).getByRole('button', { name: 'View transactions', exact: true }).click();
    const history = page.getByRole('dialog', { name: 'Inventory transactions', exact: true });
    await expect(history).toContainText(row.sku);
    await expect(history.getByRole('heading', { name: 'No recorded stock movements', exact: true })).toBeVisible();
    await history.getByRole('button', { name: 'Close', exact: true }).click();
    for (const direction of ['in', 'out']) {
      const action = productRow(page, row.sku).getByRole('button', { name: 'Manual stock ' + direction, exact: true });
      await expect(action).toBeDisabled();
      await expect(action).toHaveAttribute('title', new RegExp('^Manual stock ' + direction + ': .+'));
    }
  }
  assert.ok(app.apiRequests.every(call => call.method === 'GET'));
  app.assertSafe();
});

test('Inventory history can retry failed loading and a busy movement retries its original key without applying the stock twice', { timeout: 90000 }, async t => {
  let current = { ...product, stock: '1.000' }, reads = 0;
  let releaseHistory, releaseSave;
  const historyGate = new Promise(resolve => { releaseHistory = resolve; });
  const saveGate = new Promise(resolve => { releaseSave = resolve; });
  t.after(() => { releaseHistory(); releaseSave(); });
  const writes = [];
  const app = await movementApp(t, async ({ method, pathname, body }) => {
    assert.equal(pathname, '/api/products/41/stock-movements');
    if (method === 'GET') {
      reads++;
      if (reads === 1) { await historyGate; return { status: 503, json: { message: 'Mock history is temporarily unavailable.' } }; }
      return { json: { product: current, records: [] } };
    }
    assert.equal(method, 'POST'); writes.push(body);
    if (writes.length === 1) {
      await saveGate;
      current = { ...current, stock: '0.000' };
      return { status: 503, json: { message: 'Mock connection interrupted after recording. Retry this movement.' } };
    }
    assert.deepEqual(body, writes[0], 'An uncertain response must retry the same movement, not allocate a new request key.');
    return { json: { record: manualRecord({ direction: 'out', quantity: '1.000', stockBefore: '1.000', stockAfter: '0.000' }), product: current, replayed: true } };
  }, { realtime: true, listing: () => [current, otherProduct] });
  const { page } = app;
  await openInventory(app);
  await expect.poll(() => app.realtimeClients()).toBe(1);
  await expect.poll(() => app.productReads()).toBeGreaterThanOrEqual(2);
  await productRow(page).getByRole('button', { name: 'View transactions', exact: true }).click();
  let dialog = page.getByRole('dialog', { name: 'Inventory transactions', exact: true });
  await expect(dialog.getByRole('status')).toContainText('Loading inventory transactions');
  releaseHistory();
  await expect(dialog.getByRole('alert')).toContainText('Mock history is temporarily unavailable.');
  await dialog.getByRole('button', { name: 'Retry transactions', exact: true }).click();
  await expect(dialog).toContainText('No recorded stock movements');
  await expect(dialog.getByRole('alert')).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();

  await productRow(page).getByRole('button', { name: 'Manual stock out', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Manual stock out', exact: true });
  await fillMovement(dialog, 'out', { quantity: '1.000' });
  await dialog.getByRole('button', { name: 'Review movement', exact: true }).click();
  await dialog.getByRole('button', { name: 'Confirm stock out', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Saving...', exact: true })).toBeDisabled();
  await expect(dialog.getByRole('button', { name: 'Back to edit', exact: true })).toBeDisabled();
  await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeDisabled();
  await expect(dialog.getByRole('button', { name: 'Close dialog', exact: true })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  assert.equal(writes.length, 1);
  releaseSave();
  await expect(dialog.getByRole('alert')).toContainText('Mock connection interrupted after recording. Retry this movement.');
  await expect(dialog.getByLabel('Quantity *', { exact: true })).toHaveValue('1.000');
  await expect(dialog.getByLabel('Reason *', { exact: true })).toHaveValue('Approved physical inventory correction');
  const previous = app.productReads();
  app.emitChange('SalesSystem', ['products', 'stock-movements']);
  await expect.poll(() => app.productReads()).toBeGreaterThan(previous);
  await expect(dialog.locator('.inventory-current-stock')).toHaveText('0');
  await dialog.getByRole('button', { name: 'Back to edit', exact: true }).click();
  await dialog.getByLabel('Quantity *', { exact: true }).fill('0.500');
  await dialog.getByRole('button', { name: 'Review movement', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('Quantity cannot exceed current stock.');
  await expect(dialog.getByRole('button', { name: 'Confirm stock out', exact: true })).toHaveCount(0);
  assert.equal(writes.length, 1, 'A changed movement loses the original retry exemption.');
  await dialog.getByLabel('Quantity *', { exact: true }).fill('1.000');
  await dialog.getByRole('button', { name: 'Review movement', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Confirm stock out', exact: true })).toBeVisible();
  assert.equal(writes.length, 1, 'Reviewing the original uncertain movement never posts it again.');
  await dialog.getByRole('button', { name: 'Confirm stock out', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(productRow(page).locator('td').nth(3)).toHaveText('0');
  assert.equal(writes.length, 2);
  assert.deepEqual(writes[0], writes[1]);
  app.assertSafe();
});
