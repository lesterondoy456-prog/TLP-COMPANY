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

test('Inventory history shows invoice stock-out balances, manual movements and legacy Delivery Receipts while Sales remains read-only through realtime refresh', { timeout: 90000 }, async t => {
  let current = { ...product }, reads = 0;
  let records = [{
    id: 'invoice:82', movementId: 82, type: 'invoice-out', direction: 'out', quantity: '2.001', unit: 'PCS', stockBefore: '14.346', stockAfter: '12.345',
    movementDate: '2026-11-15', sourceDestination: 'Frozen invoice destination', reference: 'SI-STOCK-082', reason: null,
    createdByUsername: 'mock_invoice_author', createdByName: 'Invoice Operator', createdAt: '2026-11-15T09:00:00.000Z',
    invoiceId: 82, invoiceNumber: 'SI-STOCK-082', orderNumber: 'SO-STOCK-081', customerName: 'Frozen Invoice Customer',
    deliveryReceiptId: null, deliveryReceiptNumber: null, address: null, receivedBy: null,
  }, manualRecord({ stockBefore: '14.345', stockAfter: '14.346' }), {
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
  await expect(dialog).toContainText('SI-STOCK-082');
  await expect(dialog).toContainText('DR-MOCK-061');
  await expect(dialog).toContainText('12.345'); await expect(dialog).toContainText('14.346');
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
  const invoiceRow = dialog.locator('tbody > tr').filter({ hasText: 'SI-STOCK-082' });
  await expect(invoiceRow.locator('.badge')).toHaveText(/invoice/i);
  await expect(invoiceRow.locator('td').nth(7)).toHaveText('2.001');
  await expect(invoiceRow.locator('td').nth(8)).toHaveText('14.346');
  await expect(invoiceRow.locator('td').nth(9)).toHaveText('12.345');
  await expect(invoiceRow).toContainText('SO-STOCK-081');
  await expect(invoiceRow).toContainText('Frozen invoice destination');
  await expect(invoiceRow).toContainText('mock_invoice_author');
  await page.evaluate(() => { window.inventoryDocument = document; window.inventoryNode = document.querySelector('.inventory-page'); window.historyDialog = document.querySelector('dialog'); });
  for (const width of [320, 375, 768, 1920]) {
    await page.setViewportSize({ width, height: 900 }); await assertNoPageOverflow(page);
    await expect(dialog).toContainText('REF-MOCK-041'); await expect(dialog).toContainText('DR-MOCK-061'); await expect(dialog).toContainText('SI-STOCK-082');
    if (width <= 600) {
      const deliveryCard = dialog.locator('.record-mobile-card').filter({ hasText: 'DR-MOCK-061' });
      await expect(deliveryCard.getByText('2.001', { exact: true })).toBeVisible();
      for (const details of await deliveryCard.locator('details').all()) if (await details.getAttribute('open') === null) await details.locator('summary').click();
      await expect(deliveryCard.getByText('Mock Receiver', { exact: true })).toBeVisible();
      const invoiceCard = dialog.locator('.record-mobile-card').filter({ hasText: 'SI-STOCK-082' });
      await expect(invoiceCard.getByText('2.001', { exact: true })).toBeVisible();
      for (const details of await invoiceCard.locator('details').all()) if (await details.getAttribute('open') === null) await details.locator('summary').click();
      await expect(invoiceCard.getByText('14.346', { exact: true })).toBeVisible();
      await expect(invoiceCard.getByText('12.345', { exact: true })).toBeVisible();
      if (width === 375) await app.screenshot('sales-inventory-history-375.png');
    }
  }
  const before = reads;
  current = { ...current, stock: '11.125' };
  records = [manualRecord({ id: 2, quantity: '1.220', direction: 'out', stockBefore: '12.345', stockAfter: '11.125', reference: 'REF-REALTIME-042' }), ...records];
  app.emitChange('SalesSystem', ['sales-invoices']);
  await expect.poll(() => reads).toBeGreaterThan(before);
  await expect(dialog).toContainText('REF-REALTIME-042');
  assert.equal(await page.evaluate(() => window.historyDialog === document.querySelector('dialog')), true);
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(productRow(page).locator('td').nth(3)).toHaveText('11.125');
  await expect(inventory.getByRole('button', { name: /^Manual stock (?:in|out)$/ })).toHaveCount(0);
  assert.equal(await page.evaluate(() => window.inventoryDocument === document && window.inventoryNode === document.querySelector('.inventory-page')), true);
  await expect(stockFilter).toHaveValue('in-stock'); await expect(productFilter).toHaveValue('active'); await expect(search).toHaveValue(product.sku);
  assert.equal(await page.evaluate(() => performance.getEntriesByType('navigation').length), 1);
  assert.ok(app.apiRequests.every(call => call.method === 'GET'));
  app.assertSafe();
});
