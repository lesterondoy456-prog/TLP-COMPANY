import assert from 'node:assert/strict';
import test from 'node:test';
import { expect } from '@playwright/test';
import { mockBrowser } from './helpers/mock-browser.mjs';

const actor = { id: 1, system: 'sales', name: 'Mock Invoice Administrator', username: 'mock_invoice_admin', role: 'admin', isActive: true };
const invoiceA = {
  id: 31, number: 'SI-0031', orderId: 11, orderNumber: 'SO-0011', customerId: 2, customerName: 'Ordering Customer',
  billToName: 'Aster Billing Company', billToAddress: 'Main office, Industrial Estate\nSanta Rosa, Laguna', preparedByName: 'Mock Invoice Creator',
  invoiceDate: '2026-11-14', dueDate: '2026-12-14', currency: 'USD', sourceCurrency: 'USD', rate: '1.000000',
  vatCode: 'VS', vatRate: '12.000000', vatInclusive: false, decimalInTotalPrice: 6,
  grossAmount: '200.123456', discountAmount: '10.000001', netAmount: '190.123455', vatAmount: '22.814815',
  total: '212.938270', paidAmount: '12.000001', status: 'partial',
};
const itemsA = [
  { id: 1, productId: 5, productName: 'First product', sku: 'ASTER-A', description: 'Precision component for invoice A', unit: 'PCS', quantity: '1.000', currency: 'USD', unitPrice: '110.123456', convertedUnitPrice: '110.123456', grossAmount: '110.123456', discountAmount: '10.000001', netAmount: '100.123455', vatAmount: '12.014815', amount: '112.138270', lineTotal: '112.138270', refNumber: 'REF-A1' },
  { id: 2, productId: 6, productName: 'Second product', sku: 'ASTER-B', description: 'Second component for invoice A', unit: 'BOX', quantity: '1.000', currency: 'USD', unitPrice: '90.000000', convertedUnitPrice: '90.000000', grossAmount: '90.000000', discountAmount: '0.000000', netAmount: '90.000000', vatAmount: '10.800000', amount: '100.800000', lineTotal: '100.800000', refNumber: 'REF-A2' },
];
const invoiceB = { ...invoiceA, id: 32, number: 'SI-0032', orderNumber: 'SO-0012', billToName: 'Birch Billing Company', currency: 'PHP', sourceCurrency: 'USD', rate: '55.000000', decimalInTotalPrice: 2, grossAmount: '55.000000', discountAmount: '0.000000', netAmount: '55.000000', vatAmount: '6.600000', total: '61.600000', paidAmount: '0.000000', status: 'unpaid' };
const itemsB = [{ ...itemsA[0], id: 3, sku: 'BIRCH-ONLY', description: 'This item belongs only to invoice B', unitPrice: '1.000000', convertedUnitPrice: '55.000000', currency: 'USD', grossAmount: '55.000000', discountAmount: '0.000000', netAmount: '55.000000', vatAmount: '6.600000', amount: '61.600000', lineTotal: '61.600000' }];
const usd = value => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'USD', minimumFractionDigits: 6, maximumFractionDigits: 6 }).format(value);

test('Invoice monitoring expands one SI inline, shows exact amounts and keeps actions independent on desktop and mobile', { timeout: 120_000 }, async t => {
  const reads = [];
  let releaseFirst;
  const firstDetail = new Promise(resolve => { releaseFirst = resolve; });
  t.after(() => releaseFirst());
  const { page, origin, screenshot, apiRequests, assertSafe } = await mockBrowser(t, async ({ method, pathname }) => {
    assert.equal(method, 'GET', 'Invoice monitoring must never save any business record.');
    if (pathname === '/api/auth/session') return { json: { user: actor } };
    if (pathname === '/api/sales-invoices') return { json: { records: [invoiceA, invoiceB] } };
    if (pathname === '/api/sales-invoices/31') { reads.push(31); if (reads.filter(id => id === 31).length === 1) await firstDetail; return { json: { record: { ...invoiceA, items: itemsA } } }; }
    if (pathname === '/api/sales-invoices/32') { reads.push(32); return { json: { record: { ...invoiceB, items: itemsB } } }; }
    if (['/api/customers', '/api/products', '/api/sales-orders', '/api/delivery-receipts', '/api/shipping-invoices', '/api/users'].includes(pathname)) return { json: { records: pathname === '/api/users' ? [actor] : [] } };
  }, { project: 'SalesSystem', viewport: { width: 1440, height: 1000 }, screenshotName: 'invoice-monitor-last.png' });
  await page.goto(origin);
  await expect(page.getByRole('heading', { name: 'Customer', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Invoice', exact: true }).click();
  const monitor = page.getByRole('region', { name: 'Invoice', exact: true });
  const summaries = monitor.locator('.invoice-summary-row');
  await expect(summaries).toHaveCount(2);
  assert.deepEqual(reads, [], 'Item requests begin only when an invoice is opened.');
  const headerNames = ['SI number', 'Bill to', 'Prepared by', 'Invoice date', 'Due date', 'Currency', 'Gross amount', 'Discount amount', 'Net amount', 'VAT amount', 'Total amount', 'Paid amount', 'Balance', 'Status', 'Actions'];
  await expect(monitor.locator('.invoice-summary-table > thead').getByRole('columnheader')).toHaveText(headerNames);
  const first = summaries.filter({ hasText: invoiceA.number });
  const cells = first.locator('td');
  await expect(cells.nth(1)).toContainText(invoiceA.billToName);
  await expect(cells.nth(2)).toHaveText(invoiceA.preparedByName);
  await expect(cells.nth(6)).toHaveText(usd('200.123456'));
  await expect(cells.nth(10)).toHaveText(usd('212.938270'));
  await expect(cells.nth(11)).toHaveText(usd('12.000001'));
  await expect(cells.nth(12)).toHaveText(usd('200.938269'));
  await cells.nth(1).click();
  await expect(first).toHaveAttribute('aria-expanded', 'true');
  const firstPanel = page.getByRole('region', { name: 'Items for SI-0031', exact: true });
  await expect(firstPanel.getByRole('status')).toContainText('Loading items for SI-0031');
  assert.deepEqual(reads, [31]);
  releaseFirst();
  await expect(firstPanel.locator('.invoice-items-table tbody tr')).toHaveCount(2);
  await expect(firstPanel).toContainText('ASTER-A');
  await expect(firstPanel).toContainText('REF-A2');
  await expect(firstPanel).toContainText(usd('112.138270'));
  await expect(firstPanel).not.toContainText('BIRCH-ONLY');
  await expect(firstPanel.getByRole('columnheader')).toHaveText(['Product code', 'Description', 'UOP', 'Quantity', 'Selling price', 'Currency', 'VAT (%)', 'Gross amount', 'Discount amount', 'Net amount', 'VAT amount', 'Amount', 'Ref no.']);
  const firstItem = firstPanel.locator('.invoice-items-table tbody tr').first().locator('td');
  await expect(firstItem.nth(4)).toHaveText('$110.123456');
  await expect(firstItem.nth(5)).toHaveText('USD');
  await expect(firstItem.nth(6)).toHaveText('12');
  await expect(first).toHaveCSS('cursor', 'pointer');
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  const panelWidth = (await firstPanel.boundingBox()).width;
  const monitorWidth = (await monitor.boundingBox()).width;
  assert.ok(panelWidth <= monitorWidth, 'The expanded panel stays inside the visible card width.');
  await screenshot('invoice-monitor-dark-expanded.png');

  await first.focus(); await page.keyboard.press('Enter');
  await expect(firstPanel).toHaveCount(0);
  await expect(first).toHaveAttribute('aria-expanded', 'false');
  await first.focus(); await page.keyboard.press('Space');
  await expect(firstPanel).toBeVisible();
  await expect.poll(() => reads.filter(id => id === 31).length).toBe(2);
  await first.getByRole('button', { name: 'Collapse items for SI-0031', exact: true }).click();
  const second = summaries.filter({ hasText: invoiceB.number });
  await second.getByRole('button', { name: 'Expand items for SI-0032', exact: true }).click();
  const secondPanel = page.getByRole('region', { name: 'Items for SI-0032', exact: true });
  await expect(secondPanel).toContainText('BIRCH-ONLY');
  await expect(secondPanel).not.toContainText('ASTER-A');
  await expect(firstPanel).toHaveCount(0);
  const secondItem = secondPanel.locator('.invoice-items-table tbody tr').first().locator('td');
  await expect(secondItem.nth(4)).toHaveText('₱55.00');
  await expect(secondItem.nth(5)).toHaveText('PHP');

  await second.getByRole('button', { name: 'Payment', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Record payment', exact: true })).toBeVisible();
  await expect(second).toHaveAttribute('aria-expanded', 'true');
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
  await second.getByRole('button', { name: 'View', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Invoice', exact: true })).toContainText('BIRCH-ONLY');
  await expect(second).toHaveAttribute('aria-expanded', 'true');
  await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'Switch to light mode', exact: true }).click();
  await monitor.locator('.invoice-summary-scroll').evaluate(element => { element.scrollLeft = 0; });
  await screenshot('invoice-monitor-light-expanded.png');

  await page.setViewportSize({ width: 390, height: 844 });
  await secondPanel.scrollIntoViewIfNeeded();
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  assert.ok(await secondPanel.locator('.invoice-items-scroll').evaluate(element => element.scrollWidth > element.clientWidth));
  assert.ok((await secondPanel.boundingBox()).width <= (await monitor.boundingBox()).width);
  await screenshot('invoice-monitor-mobile-expanded.png');
  await secondPanel.locator('.invoice-items-scroll').evaluate(element => { element.scrollLeft = element.scrollWidth; });
  await expect(secondPanel.getByRole('cell', { name: 'REF-A1', exact: true })).toBeVisible();
  assert.ok(apiRequests.every(request => request.method === 'GET')); assertSafe();
});

test('open Invoice items refresh through Socket.IO without collapsing or clearing their previous view', { timeout: 90_000 }, async t => {
  let version = 1, listReads = 0, detailReads = 0, releaseUpdate;
  const updateReady = new Promise(resolve => { releaseUpdate = resolve; });
  t.after(() => releaseUpdate());
  const browser = await mockBrowser(t, async ({ method, pathname }) => {
    assert.equal(method, 'GET');
    if (pathname === '/api/auth/session') return { json: { user: actor } };
    if (pathname === '/api/sales-invoices') { listReads++; return { json: { records: [{ ...invoiceA, paidAmount: version === 1 ? '12.000001' : '13.000001' }] } }; }
    if (pathname === '/api/sales-invoices/31') {
      detailReads++; const requestedVersion = version;
      if (requestedVersion === 2) await updateReady;
      return { json: { record: { ...invoiceA, items: [{ ...itemsA[0], description: requestedVersion === 1 ? 'Original inline item description' : 'Realtime updated inline item description' }] } } };
    }
    if (['/api/customers', '/api/products', '/api/sales-orders', '/api/delivery-receipts', '/api/shipping-invoices', '/api/users'].includes(pathname)) return { json: { records: pathname === '/api/users' ? [actor] : [] } };
  }, { project: 'SalesSystem', realtime: true, screenshotName: 'invoice-monitor-realtime.png' });
  const { page, origin } = browser;
  await page.goto(origin);
  await expect(page.getByRole('heading', { name: 'Customer', exact: true })).toBeVisible();
  await expect.poll(() => browser.realtimeClients()).toBe(1);
  await expect.poll(() => listReads).toBeGreaterThanOrEqual(2);
  await page.getByRole('button', { name: 'Invoice', exact: true }).click();
  const row = page.locator('.invoice-summary-row');
  await row.getByRole('button', { name: 'Expand items for SI-0031', exact: true }).click();
  const panel = page.getByRole('region', { name: 'Items for SI-0031', exact: true });
  await expect(panel).toContainText('Original inline item description');
  const before = detailReads;
  version = 2; browser.emitChange('SalesSystem', ['sales-invoices']);
  await expect.poll(() => detailReads).toBeGreaterThan(before);
  await expect(row).toHaveAttribute('aria-expanded', 'true');
  await expect(panel.getByRole('status')).toHaveText('Updating items…');
  await expect(panel).toContainText('Original inline item description');
  releaseUpdate();
  await expect(panel).toContainText('Realtime updated inline item description');
  await expect(panel).not.toContainText('Original inline item description');
  await expect(row.locator('td').nth(11)).toHaveText(usd('13.000001'));
  await expect(row.locator('td').nth(12)).toHaveText(usd('199.938269'));
  await expect(row).toHaveAttribute('aria-expanded', 'true');
  browser.assertSafe();
});

test('Invoice item errors can retry and empty or embedded details stay scoped to their own SI', { timeout: 90_000 }, async t => {
  let failures = 0;
  const reads = [];
  const emptyInvoice = { ...invoiceA, id: 33, number: 'SI-EMPTY' };
  const embeddedInvoice = { ...invoiceB, id: 34, number: 'SI-EMBEDDED', items: itemsB };
  const { page, origin, assertSafe } = await mockBrowser(t, async ({ method, pathname }) => {
    assert.equal(method, 'GET');
    if (pathname === '/api/auth/session') return { json: { user: actor } };
    if (pathname === '/api/sales-invoices') return { json: { records: [invoiceA, emptyInvoice, embeddedInvoice] } };
    if (pathname === '/api/sales-invoices/31') { reads.push(31); failures++; return failures === 1 ? { status: 503, json: { message: 'Mock invoice details are temporarily unavailable.' } } : { json: { record: { ...invoiceA, items: itemsA } } }; }
    if (pathname === '/api/sales-invoices/33') { reads.push(33); return { json: { record: { ...emptyInvoice, items: [] } } }; }
    if (['/api/customers', '/api/products', '/api/sales-orders', '/api/delivery-receipts', '/api/shipping-invoices', '/api/users'].includes(pathname)) return { json: { records: pathname === '/api/users' ? [actor] : [] } };
  }, { project: 'SalesSystem' });
  await page.goto(origin);
  await expect(page.getByRole('heading', { name: 'Customer', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Invoice', exact: true }).click();
  await page.getByRole('button', { name: 'Expand items for SI-0031', exact: true }).click();
  const panel = page.getByRole('region', { name: 'Items for SI-0031', exact: true });
  await expect(panel.getByRole('alert')).toContainText('Mock invoice details are temporarily unavailable.');
  await panel.getByRole('button', { name: 'Retry invoice items', exact: true }).click();
  await expect(panel.locator('.invoice-items-table tbody tr')).toHaveCount(2);
  await expect(panel.getByRole('alert')).toHaveCount(0);
  await page.getByRole('button', { name: 'Collapse items for SI-0031', exact: true }).click();
  await page.getByRole('button', { name: 'Expand items for SI-EMPTY', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Items for SI-EMPTY', exact: true }).getByRole('status')).toHaveText('No items are recorded for this invoice.');
  await page.getByRole('button', { name: 'Expand items for SI-EMBEDDED', exact: true }).click();
  const embedded = page.getByRole('region', { name: 'Items for SI-EMBEDDED', exact: true });
  await expect(embedded).toContainText('BIRCH-ONLY');
  await expect(embedded).not.toContainText('ASTER-A');
  assert.deepEqual(reads, [31, 31, 33], 'Embedded items need no redundant detail request.');
  assertSafe();
});
