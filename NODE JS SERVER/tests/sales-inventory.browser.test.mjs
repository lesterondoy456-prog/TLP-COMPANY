import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { expect } from '@playwright/test';
import { mockBrowser } from './helpers/mock-browser.mjs';

const products = [
  { id: 1, sku: 'INV-PCS-001', name: 'Aster precision component', description: 'Aster precision component for export packaging and industrial distribution, with a long description that must remain readable on a narrow screen.', unit: 'PCS', stock: '12.345000', category: 'Components', isActive: true },
  { id: 2, sku: 'INV-KG-002', name: 'Packaging material', description: 'A separate unit must not be added to a PCS quantity.', unit: 'KG', stock: '7.125000', category: 'Packaging', isActive: true },
  { id: 3, sku: 'INV-ZERO-003', name: 'Explicit zero stock', description: 'A saved zero is out of stock.', unit: 'PCS', stock: '0.000000', category: 'Components', isActive: true },
  { id: 4, sku: 'INV-UNSET-004', name: 'Unset stock', description: 'A missing quantity must remain distinct from zero.', unit: 'MTR', stock: null, category: 'Materials', isActive: true },
  { id: 5, sku: 'INV-INACTIVE-005', name: 'Inactive boxed product', description: 'Inactive products retain their actual quantity and status.', unit: 'BOX', stock: '4.500000', category: 'Packaging', isActive: false },
  ...Array.from({ length: 7 }, (_, index) => ({ id: index + 6, sku: 'INV-OTHER-' + (index + 6), name: 'Other product ' + (index + 6), description: 'Other inventory product ' + (index + 6), unit: 'PCS', stock: '1.000000', category: 'Components', isActive: true })),
];

async function inventoryApp(t, role, { realtime = false, listing = () => products } = {}) {
  const user = { id: 1, system: 'sales', name: 'Inventory ' + role, username: 'mock_inventory_' + role, role, isActive: true };
  let productReads = 0;
  const app = await mockBrowser(t, async ({ method, pathname }) => {
    assert.equal(method, 'GET', 'Inventory monitoring must never save a business record.');
    if (pathname === '/api/auth/session') return { json: { user } };
    if (pathname === '/api/products') { productReads++; return { json: { records: listing() } }; }
    if (pathname === '/api/users') return { json: { records: [user] } };
    if (['/api/customers', '/api/sales-orders', '/api/sales-invoices', '/api/delivery-receipts', '/api/shipping-invoices'].includes(pathname)) return { json: { records: [] } };
  }, { project: 'SalesSystem', realtime, viewport: { width: 1920, height: 1000 } });
  return { ...app, productReads: () => productReads };
}

async function openInventory(app) {
  await app.page.goto(app.origin);
  await expect(app.page.getByRole('heading', { level: 1, name: 'Customer', exact: true })).toBeVisible();
  await app.page.locator('.sidebar').getByRole('button', { name: 'Inventory', exact: true }).click();
  await expect(app.page.getByRole('heading', { level: 1, name: 'Inventory', exact: true })).toBeVisible();
}

function assertReadOnly(app) {
  assert.ok(app.apiRequests.every(request => request.method === 'GET'));
  assert.ok(app.apiRequests.every(request => !request.pathname.startsWith('/api/inventory')), 'Inventory reuses the existing product API without introducing an Inventory endpoint.');
  app.assertSafe();
}

for (const role of ['admin', 'saleshead', 'sales']) {
  test(`Sales ${role} can monitor product Inventory with responsive stock and all three movement actions`, { timeout: 90000 }, async t => {
    const app = await inventoryApp(t, role);
    const { page } = app;
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openInventory(app);
    const inventory = page.locator('.inventory-page');
    const records = inventory.getByRole('region', { name: 'Inventory', exact: true });
    const tableRows = records.locator('.records-table > tbody > tr');
    const cards = records.locator('.record-mobile-list > article.record-mobile-card');
    const stockFilter = page.getByRole('combobox', { name: 'Stock status', exact: true });
    const productFilter = page.getByRole('combobox', { name: 'Product status', exact: true });
    const search = records.getByRole('searchbox');
    const nav = page.locator('.sidebar .nav-item');
    const names = await nav.evaluateAll(buttons => buttons.map(button => button.getAttribute('aria-label')));
    assert.deepEqual(names.slice(0, 3), ['Customer', 'Product', 'Inventory']);
    assert.equal(names.length, role === 'sales' ? 7 : 8);
    await expect(page.locator('.sidebar').getByRole('button', { name: 'SalesUserLogin', exact: true })).toHaveCount(role === 'sales' ? 0 : 1);
    await expect(page.locator('.sidebar').getByRole('button', { name: 'Inventory', exact: true }).locator('.nav-count')).toHaveText('12');
    await expect(inventory.getByRole('button', { name: /^(?:\+\s*)?(?:New|Add|Edit|Delete)\b/i })).toHaveCount(0);
    await expect(inventory.locator('.page-heading > button')).toHaveCount(0);
    const row = tableRows.filter({ hasText: 'INV-PCS-001' });
    for (const name of ['View transactions', 'Manual stock in', 'Manual stock out']) {
      const action = row.getByRole('button', { name, exact: true });
      await expect(action).toBeVisible();
      await expect(action).toBeEnabled();
      await expect(action).toHaveAttribute('title', name);
      await expect(action.locator('svg')).toHaveCount(1);
    }
    await expect(row.locator('td').nth(3)).toHaveText('12.345');
    await expect(row.locator('td').nth(4)).toHaveText('In stock');
    await expect(row).toContainText('PCS');
    await expect(tableRows.filter({ hasText: 'INV-KG-002' }).locator('td').nth(3)).toHaveText('7.125');
    await expect(tableRows.filter({ hasText: 'INV-KG-002' })).toContainText('KG');
    const summary = page.getByRole('region', { name: 'Inventory summary', exact: true });
    await expect(summary).toBeVisible();
    await expect(summary.locator('strong')).toHaveText(['12', '10', '1']);
    await expect(summary).not.toContainText('30.97');

    if (role === 'admin') {
      await expect(tableRows).toHaveCount(10);
      await records.getByRole('button', { name: 'Next page', exact: true }).click();
      await expect(tableRows).toHaveCount(2);
      await expect(tableRows.filter({ hasText: 'INV-PCS-001' })).toHaveCount(0);
      await records.getByRole('button', { name: 'Previous page', exact: true }).click();
      await stockFilter.selectOption('in-stock');
      await expect(tableRows.filter({ hasText: 'INV-ZERO-003' })).toHaveCount(0);
      await expect(tableRows.filter({ hasText: 'INV-UNSET-004' })).toHaveCount(0);
      await stockFilter.selectOption('out-of-stock');
      await expect(tableRows).toHaveCount(1);
      await expect(tableRows.first()).toContainText('INV-ZERO-003');
      await expect(tableRows.first().locator('td').nth(3)).toHaveText('0');
      await expect(tableRows.first().locator('td').nth(4)).toHaveText('Out of stock');
      await stockFilter.selectOption('not-set');
      await expect(tableRows).toHaveCount(1);
      await expect(tableRows.first()).toContainText('INV-UNSET-004');
      await expect(tableRows.first().locator('td').nth(3)).toHaveText('—');
      await expect(tableRows.first().locator('td').nth(4)).toHaveText('Not set');
      await stockFilter.selectOption('all');
      await productFilter.selectOption('inactive');
      await expect(tableRows).toHaveCount(1);
      await expect(tableRows.first()).toContainText('INV-INACTIVE-005');
      await expect(tableRows.first()).toContainText('4.5');
      await expect(tableRows.first().locator('td').nth(6)).toHaveText('Inactive');
      await productFilter.selectOption('active');
      await expect(tableRows.filter({ hasText: 'INV-INACTIVE-005' })).toHaveCount(0);
      await productFilter.selectOption('all');
      await search.fill('INV-KG-002');
      await expect(tableRows).toHaveCount(1);
      await expect(tableRows.first()).toContainText('KG');
      await search.fill('');
    }

    for (const width of role === 'admin' ? [320, 375, 768, 1920] : [375, 1920]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.evaluate(() => scrollTo(0, 0));
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      if (width <= 600) {
        const card = cards.filter({ hasText: 'INV-PCS-001' });
        await expect(card).toBeVisible();
        await expect(card.getByText('12.345', { exact: true })).toBeVisible();
        await expect(card).toContainText('PCS');
        await expect(card.getByRole('button', { name: /^(?:New|Add|Edit|Delete)\b/i })).toHaveCount(0);
        for (const name of ['View transactions', 'Manual stock in', 'Manual stock out']) await expect(card.getByRole('button', { name, exact: true })).toBeVisible();
        for (const details of await card.locator('details').all()) if (await details.getAttribute('open') === null) await details.locator('summary').click();
        await expect(card).toContainText(products[0].description);
        await expect(card).toContainText('Components');
        if (role === 'admin' && width === 320) await card.screenshot({ path: fileURLToPath(new URL('../.qa/screenshots/sales-inventory-card-320.png', import.meta.url)) });
      } else {
        await expect(cards.first()).toBeHidden();
        await expect(tableRows.filter({ hasText: 'INV-PCS-001' })).toBeVisible();
        if (role === 'admin' && width === 1920) await app.screenshot('sales-inventory-desktop.png');
      }
    }
    assertReadOnly(app);
  });
}

test('Sales Inventory receives real Socket.IO product changes without resetting filters or replacing the open document', { timeout: 90000 }, async t => {
  let current = products.slice(0, 4).map(product => ({ ...product }));
  const app = await inventoryApp(t, 'sales', { realtime: true, listing: () => current });
  const { page } = app;
  await openInventory(app);
  await expect.poll(() => app.realtimeClients()).toBe(1);
  await expect.poll(() => app.productReads()).toBeGreaterThanOrEqual(2);
  const inventory = page.locator('.inventory-page');
  const stockFilter = inventory.getByRole('combobox', { name: 'Stock status', exact: true });
  const productFilter = inventory.getByRole('combobox', { name: 'Product status', exact: true });
  const search = inventory.getByRole('searchbox');
  await stockFilter.selectOption('in-stock');
  await productFilter.selectOption('active');
  await search.fill('INV-PCS-001');
  await expect(inventory.locator('.records-table > tbody > tr')).toHaveCount(1);
  await page.evaluate(() => {
    window.inventoryDocumentNode = document;
    window.inventoryHeadingNode = document.querySelector('.inventory-page h1');
    window.inventorySearchNode = document.querySelector('.inventory-page input[type="search"]');
  });
  const before = app.productReads();
  current = current.map(product => product.id === 1 ? { ...product, stock: '0.000000' } : product);
  app.emitChange('SalesSystem', ['products', 'delivery-receipts']);
  await expect.poll(() => app.productReads()).toBeGreaterThan(before);
  await expect(inventory.locator('.records-table > tbody > tr')).toHaveCount(0);
  await expect(stockFilter).toHaveValue('in-stock');
  await expect(productFilter).toHaveValue('active');
  await expect(search).toHaveValue('INV-PCS-001');
  current = current.map(product => product.id === 1 ? { ...product, stock: '5.500000' } : product);
  app.emitChange('SalesSystem', ['products']);
  await expect(inventory.locator('.records-table > tbody > tr')).toHaveCount(1);
  await expect(inventory.locator('.records-table > tbody > tr').first().locator('td').nth(3)).toHaveText('5.5');
  assert.equal(await page.evaluate(() => window.inventoryDocumentNode === document && window.inventoryHeadingNode === document.querySelector('.inventory-page h1') && window.inventorySearchNode === document.querySelector('.inventory-page input[type="search"]')), true);
  assert.equal(await page.evaluate(() => performance.getEntriesByType('navigation').length), 1);
  await expect(search).toHaveValue('INV-PCS-001');
  assertReadOnly(app);
});
