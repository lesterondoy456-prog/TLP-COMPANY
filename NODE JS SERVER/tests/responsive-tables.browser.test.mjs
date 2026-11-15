import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { expect } from '@playwright/test';
import { mockBrowser } from './helpers/mock-browser.mjs';
import { loadApi } from './helpers/load-api.mjs';

const customerName = 'Aster International Packaging and Industrial Distribution Corporation — Laguna Export Customer';
const suppliesName = 'Aster precision packaging material for international distribution and long production descriptions';
const description = 'Long responsive description: precision components packed for the receiving warehouse, inspected by the quality team, and delivered through the Laguna distribution facility.';
const remarks = 'Responsive remarks: contact the receiving coordinator before delivery, bring the approved documents, and use the designated industrial-estate receiving entrance.';
const address = 'Building 12, Block 7, International Industrial Estate, Santa Rosa, Laguna, Philippines — receiving entrance beside the main distribution warehouse.';
const customers = Array.from({ length: 16 }, (_, index) => ({
  id: index + 1, name: index ? 'Other Customer ' + (index + 1) : customerName,
  shortName: index ? 'Other ' + (index + 1) : 'Aster International', businessStyle: 'Manufacturing, packaging and international distribution services',
  address, deliveryAddresses: ['Delivery gate 3, Distribution Avenue, Calamba, Laguna, Philippines'], salesAddressType: 'office', drAddressType: 'delivery',
  tin: '3213-3123-3123-000', contactPerson: 'Maria Santos — Customer Purchasing Coordinator', cpnumber: '+63 917 123 4567', faxNo: '+63 49 555 0101',
  email: 'customer.purchasing.department@international-packaging.example', countryOfOrigin: 'Japan', country: 'Philippines', paymentTerm: '60 DAYS', category: 'Export Sales',
  decimalInPrice: 6, decimalInTotalPrice: 6, vatInclusive: false, vatCode: 'VS', taxCode: 'WC010', remarks, isActive: true,
}));
const requests = Array.from({ length: 16 }, (_, index) => ({
  id: index + 1, number: index ? 'PR-OTHER-' + (index + 1) : 'PR-ASTER-00000001', prDate: '2026-11-15', neededDate: '2026-11-20', requestedBy: 'Maria Santos — Purchasing Coordinator', requestedDept: 'Materials Planning and Purchasing', remarks, status: 'draft',
  items: [{ id: index + 1, suppliesId: index + 30, suppliesCode: 'SUP-' + (index + 1), suppliesName: index ? 'Other Supplies ' + (index + 1) : suppliesName, description, unit: 'KG', quantity: '1234.123456', balanceQuantity: '1000.000001', neededDate: '2026-11-20', remarks: 'Item remarks for export packaging.', orderNumbers: 'PO-MOCK-REFERENCE' }],
}));
const inventory = Array.from({ length: 16 }, (_, index) => ({
  id: index + 1, suppliesId: index + 30, code: index ? 'SUP-OTHER-' + (index + 1) : 'SUP-ASTER-FIRST', name: index ? 'Other Stock Supplies ' + (index + 1) : suppliesName,
  description, category: 'Packaging and industrial raw materials', unit: 'KG', quantity: '1234567.123456', minimumStock: '10.000000',
  warehouseId: 1, warehouseCode: 'MAIN-DISTRIBUTION', warehouseDescription: 'Laguna receiving and distribution warehouse', locationId: 1, locationCode: 'RECEIVING-AREA-01', imLot: 'LOT-RESPONSIVE-2026-001', qcStatus: 'Passed', expiryDate: '2027-12-31', mfgDate: '2026-11-01',
}));
const configuration = Array.from({ length: 16 }, (_, index) => ({ id: index + 1, code: index ? 'ATC-OTHER-' + (index + 1) : 'ATC-ASTER-FIRST', description, rate: '5.125000', isActive: true, deletedDate: null }));
const specifications = [
  { project: 'SalesSystem', system: 'sales', heading: 'Customer', primary: customerName, reading: customerName, secondary: '3213-3123-3123-000', card: '.record-mobile-list > article.record-mobile-card', details: 'details.record-mobile-details', table: '.records-table', search: 'Search customers', needle: 'Aster International Packaging', pageSize: 10, next: 'Next page', previous: 'Previous page', actions: ['Edit', 'Delete'], action: 'Edit', initial: '/api/customers' },
  { project: 'PurchasingSystem', system: 'purchasing', heading: 'PR Monitoring', primary: 'PR-ASTER-00000001', reading: suppliesName, secondary: remarks, card: '.records-mobile > .record-card', details: 'details.record-card-details', table: '.purchasing-monitor-table', search: 'Search PR Monitoring', needle: 'PR-ASTER-00000001', pageSize: 10, next: 'Next page', previous: 'Previous page', actions: ['View', 'Edit', 'Post', 'Cancel document'], action: 'View', initial: '/api/purchase-requests' },
  { project: 'WarehouseSystem', system: 'warehouse', heading: 'Supplies Stock', primary: suppliesName, reading: suppliesName, secondary: description, card: '.records-card > .mobile-records > article.mobile-record-card', details: 'details.mobile-record-details', table: '.warehouse-summary-table', search: 'Search supplies stock', needle: 'SUP-ASTER-FIRST', pageSize: 16, actions: ['View stock'], action: 'View stock', initial: '/api/inventory' },
  { project: 'ConfigurationSystem', system: 'configuration', heading: 'ATC', primary: 'ATC-ASTER-FIRST', reading: description, secondary: '5.125000', card: '.records-card > .mobile-records > article.mobile-record-card', details: 'details.mobile-record-details', table: '.configuration-table', search: 'Search configuration records', needle: 'ATC-ASTER-FIRST', pageSize: 15, next: 'Next configuration page', previous: 'Previous configuration page', actions: ['Edit', 'Deactivate'], action: 'Edit', initial: '/api/configuration/atc' },
];

async function assertPageGeometry(page) {
  await page.evaluate(() => scrollTo(0, 0));
  const result = await page.evaluate(() => {
    const bounds = selector => {
      const element = document.querySelector(selector);
      if (!element || getComputedStyle(element).display === 'none') return null;
      const rect = element.getBoundingClientRect();
      return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
    };
    const title = bounds('.page-heading h1'), action = bounds('.page-heading > button'), menu = bounds('[aria-label="Open navigation"]');
    const overlaps = (a, b) => Boolean(a && b && a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1);
    return { overflow: document.documentElement.scrollWidth > innerWidth, titleAction: overlaps(title, action), titleMenu: overlaps(title, menu), actionMenu: overlaps(action, menu) };
  });
  assert.equal(result.overflow, false, 'Record views must not make the page scroll sideways.');
  assert.equal(result.titleAction, false, 'The page title and primary action must remain separate.');
  assert.equal(result.titleMenu, false, 'The menu control must not cover the page title.');
  assert.equal(result.actionMenu, false, 'The menu control must not cover the primary action.');
}

async function assertReadable(locator, card) {
  await expect(locator).toBeVisible();
  const result = await locator.evaluate((element, selector) => {
    const container = element.closest(selector).getBoundingClientRect();
    const range = document.createRange(); range.selectNodeContents(element);
    const rectangles = [...range.getClientRects()];
    return { fits: rectangles.every(rect => rect.left >= container.left - 1 && rect.right <= container.right + 1), fontSize: parseFloat(getComputedStyle(element).fontSize), lines: rectangles.length };
  }, card);
  assert.ok(result.fits, 'Long record values wrap within their card instead of clipping off-screen.');
  assert.ok(result.fontSize >= 11, 'Mobile record text remains readable.');
}

for (const specification of specifications) {
  test(`${specification.project} keeps populated responsive records readable from320px to1920px`, { timeout: 120000 }, async t => {
    const { project, system } = specification;
    const user = { id: 1, system, name: 'Responsive Administrator', username: 'mock_responsive', role: 'admin', isActive: true };
    const modules = system === 'configuration' ? loadApi('configuration').configurationMetadata() : [];
    const listings = { '/api/customers': customers, '/api/purchase-requests': requests, '/api/inventory': inventory, '/api/configuration/atc': configuration };
    const app = await mockBrowser(t, async ({ method, pathname }) => {
      assert.equal(method, 'GET', 'Responsive record QA must never save a business record.');
      if (pathname === '/api/auth/session') return { json: { user } };
      if (pathname === '/api/configuration') return { json: { modules } };
      if (pathname === '/api/users') return { json: { records: [user] } };
      if (pathname === '/api/purchase-requests/1') return { json: { record: requests[0] } };
      if (pathname === '/api/inventory/movements') return { json: { records: [{ id: 1, receiptNumber: 'SRR-RESPONSIVE-001', warehouseCode: inventory[0].warehouseCode, locationCode: inventory[0].locationCode, imLot: inventory[0].imLot, quantity: '1234567.123456', receivedDate: '2026-11-15' }] } };
      if (pathname.endsWith('options')) return { json: { salesInCharges: [], users: [user], suppliers: [], supplies: [], products: [], headers: [], units: [], currencies: [], countriesOfOrigin: [], countries: [], paymentTerms: [], categories: [], taxCodes: [], vatCodes: [], warehouses: [], locations: [], shipments: [], customers } };
      return { json: { records: listings[pathname] || [] } };
    }, { project, viewport: { width: 320, height: 900 }, screenshotName: `${system}-responsive-records-last.png` });
    const { page, origin } = app;
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(origin);
    await expect(page.getByRole('heading', { level: 1, name: specification.heading, exact: true })).toBeVisible();
    const card = page.locator(specification.card).first();
    const table = page.locator(specification.table).filter({ visible: true }).first();
    for (const width of [320, 375, 600, 768, 1024, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      await assertPageGeometry(page);
      if (width <= 600) {
        await expect(card).toBeVisible();
        await expect(card).toContainText(specification.primary);
        if (system !== 'warehouse') await expect(card.locator('.badge').filter({ visible: true }).first()).toHaveText(system === 'purchasing' ? 'Not Yet Posted' : 'Active');
        assert.ok(await card.locator('dl').first().locator('dt').count(), 'Card values keep visible field labels.');
        await assertReadable(card.getByText(specification.reading, { exact: true }).filter({ visible: true }).first(), specification.card.split(' > ').at(-1));
        if (system === 'sales') {
          const salesAddress = card.locator('dt').filter({ hasText: /^Sales address$/ }).locator('..').locator('dd');
          const drAddress = card.locator('dt').filter({ hasText: /^DR address$/ }).locator('..').locator('dd');
          await expect(card.locator('dt').filter({ hasText: /^Address$/ })).toHaveCount(0);
          await expect(salesAddress.locator('.customer-address-label')).toHaveText('Office address');
          await expect(salesAddress.locator('p')).toHaveText(customers[0].address);
          await expect(drAddress.locator('.customer-address-label')).toHaveText('Delivery address');
          await expect(drAddress.locator('p')).toHaveText(customers[0].deliveryAddresses);
          await assertReadable(salesAddress.locator('p'), specification.card.split(' > ').at(-1));
          await assertReadable(drAddress.locator('p'), specification.card.split(' > ').at(-1));
        }
        for (const name of specification.actions) {
          const action = card.getByRole('button', { name, exact: true });
          await expect(action).toBeVisible();
          assert.equal(await action.evaluate(element => Boolean(element.closest('details'))), false, 'Existing actions remain available without opening More details.');
          assert.ok(await action.evaluate(element => { const rect = element.getBoundingClientRect(); return rect.left >= 0 && rect.right <= innerWidth; }));
        }
        const details = card.locator(specification.details);
        await expect(details.locator('summary')).toHaveText('More details');
        await details.locator('summary').click();
        await expect(details).toHaveAttribute('open', '');
        await expect(card).toContainText(specification.secondary);
        await expect(card.getByText(specification.secondary, { exact: true }).filter({ visible: true }).first()).toBeVisible();
        await assertReadable(card.getByText(specification.secondary, { exact: true }).filter({ visible: true }).first(), specification.card.split(' > ').at(-1));
        await details.locator('summary').click();
        if (width === 320) {
          await card.screenshot({ path: fileURLToPath(new URL(`../.qa/screenshots/${system}-responsive-card-320.png`, import.meta.url)) });
          await page.evaluate(() => scrollTo(0, 300));
          await expect(page.getByRole('button', { name: 'Open navigation', exact: true })).not.toBeInViewport();
          await assertPageGeometry(page);
        }
      } else {
        await expect(card).toBeHidden();
        await expect(table).toBeVisible();
        await expect(table).toContainText(specification.primary);
        const scroll = table.locator('..');
        const hasOverflow = await scroll.evaluate(element => element.scrollWidth > element.clientWidth + 1);
        const hint = page.locator('.table-scroll-hint').filter({ visible: true });
        if (hasOverflow) {
          await expect(hint.first()).toBeVisible();
          await scroll.evaluate(element => { element.scrollLeft = element.scrollWidth; });
          const action = specification.actions[0];
          await expect(table.getByRole('button', { name: action, exact: true }).first()).toBeInViewport();
          await scroll.evaluate(element => { element.scrollLeft = 0; });
        } else await expect(hint).toHaveCount(0);
        await assertPageGeometry(page);
        if (width === 1920) await app.screenshot(`${system}-responsive-table-1920.png`);
      }
    }

    // Search survives a breakpoint change; pagination still works in card mode.
    await page.setViewportSize({ width: 375, height: 900 });
    const search = page.getByRole('searchbox', { name: specification.search, exact: true });
    await search.fill(specification.needle);
    await expect(page.locator(specification.card)).toHaveCount(1);
    await page.setViewportSize({ width: 1024, height: 900 });
    await expect(search).toHaveValue(specification.needle);
    await expect(table).toContainText(specification.primary);
    await page.setViewportSize({ width: 600, height: 900 });
    await expect(card).toBeVisible();
    await expect(card).toContainText(specification.primary);
    await search.fill('');
    await expect(page.locator(specification.card)).toHaveCount(specification.pageSize);
    if (specification.next) {
      await page.getByRole('button', { name: specification.next, exact: true }).click();
      await expect(page.locator(specification.card).filter({ hasText: specification.primary })).toHaveCount(0);
      await page.getByRole('button', { name: specification.previous, exact: true }).click();
      await expect(card).toContainText(specification.primary);
    }
    await page.setViewportSize({ width: 375, height: 900 });
    await card.getByRole('button', { name: specification.action, exact: true }).click();
    if (system === 'warehouse') {
      const stock = card.locator('.warehouse-details');
      await expect(stock.getByRole('heading', { name: 'LOT-RESPONSIVE-2026-001', exact: true })).toBeVisible();
      await expect(stock.getByRole('heading', { name: 'SRR-RESPONSIVE-001', exact: true })).toBeVisible();
      const lot = stock.locator('article.mobile-record-card').filter({ has: page.getByRole('heading', { name: 'LOT-RESPONSIVE-2026-001', exact: true }) });
      await lot.locator('summary').click();
      await expect(lot.getByText('RECEIVING-AREA-01', { exact: true })).toBeVisible();
      const movement = stock.locator('article.mobile-record-card').filter({ has: page.getByRole('heading', { name: 'SRR-RESPONSIVE-001', exact: true }) });
      await movement.locator('summary').click();
      await expect(movement.getByText('Receiving Receipt', { exact: true })).toBeVisible();
      await assertPageGeometry(page);
      await card.getByRole('button', { name: 'Hide stock', exact: true }).click();
    } else {
      await expect(page.getByRole('dialog')).toBeVisible();
      await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
    }
    await assertPageGeometry(page);
    assert.ok(app.apiRequests.every(request => request.method === 'GET'));
    app.assertSafe();
  });
}

test('Sales Invoice responsive cards preserve one SI with its own expandable converted item details', { timeout: 120000 }, async t => {
  const user = { id: 1, system: 'sales', name: 'Responsive Invoice Administrator', username: 'mock_invoice_responsive', role: 'admin', isActive: true };
  const invoice = { id: 31, number: 'SI-RESP-00031', orderId: 21, orderNumber: 'SO-RESP-00021', customerId: 1, customerName,
    billToName: customerName, billToAddress: address, preparedByName: 'Maria Santos — Invoice Preparation and Customer Coordination',
    invoiceDate: '2026-11-15', dueDate: '2026-12-15', currency: 'PHP', sourceCurrency: 'USD', rate: '55.000000', vatCode: 'VS', vatRate: '12.000000', vatInclusive: false,
    decimalInTotalPrice: 6, grossAmount: '1100.000000', discountAmount: '159.500000', netAmount: '940.500000', vatAmount: '112.860000', total: '1053.360000', paidAmount: '0.000001', status: 'partial' };
  const second = { ...invoice, id: 32, number: 'SI-RESP-00032', billToName: 'Other Invoice Billing Customer' };
  const item = { id: 7, productId: 4, productName: 'Responsive precision component', sku: 'ASTER-INVOICE-PART', description, unit: 'PCS', quantity: '2.000', currency: 'USD', unitPrice: '10.000000', convertedUnitPrice: '550.000000', grossAmount: '1100.000000', discountAmount: '159.500000', netAmount: '940.500000', vatAmount: '112.860000', amount: '1053.360000', lineTotal: '1053.360000', refNumber: 'REF-RESPONSIVE-2026-001' };
  const { page, origin, assertSafe, apiRequests } = await mockBrowser(t, async ({ method, pathname }) => {
    assert.equal(method, 'GET', 'Invoice responsive checks must never save a transaction.');
    if (pathname === '/api/auth/session') return { json: { user } };
    if (pathname === '/api/sales-invoices') return { json: { records: [invoice, second] } };
    if (pathname === '/api/sales-invoices/31') return { json: { record: { ...invoice, items: [item] } } };
    if (pathname === '/api/sales-invoices/32') return { json: { record: { ...second, items: [{ ...item, id: 8, sku: 'OTHER-SI-ONLY', description: 'Only the second invoice contains this item.' }] } } };
    return { json: { records: pathname === '/api/users' ? [user] : [] } };
  }, { project: 'SalesSystem', viewport: { width: 320, height: 900 }, screenshotName: 'invoice-responsive-last.png' });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(origin);
  await expect(page.getByRole('heading', { level: 1, name: 'Customer', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
  await page.locator('.sidebar').getByRole('button', { name: 'Invoice', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Invoice', exact: true })).toBeVisible();
  const parents = page.locator('.invoice-mobile-list > article.record-mobile-card');
  const first = parents.first();
  for (const width of [320, 375, 600, 768, 1024, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    await assertPageGeometry(page);
    if (width <= 600) {
      await expect(parents).toHaveCount(2);
      await expect(first).toBeVisible();
      await expect(first).toContainText(invoice.number);
      await assertReadable(first.getByText(customerName, { exact: true }).filter({ visible: true }).first(), 'article.record-mobile-card');
      for (const name of ['View', 'Payment']) {
        const action = first.getByRole('button', { name, exact: true });
        await expect(action).toBeVisible();
        assert.equal(await action.evaluate(element => Boolean(element.closest('details'))), false);
      }
      const expand = first.getByRole('button', { name: 'Expand items for ' + invoice.number, exact: true });
      if (await expand.count()) await expand.click();
      const panel = first.getByRole('region', { name: 'Items for ' + invoice.number, exact: true });
      const items = panel.locator('.invoice-mobile-items > article.record-mobile-card');
      await expect(items).toHaveCount(1);
      await expect(items.first()).toContainText('ASTER-INVOICE-PART');
      await expect(items.first()).not.toContainText('OTHER-SI-ONLY');
      await assertReadable(items.first().getByText(description, { exact: true }).filter({ visible: true }).first(), 'article.record-mobile-card');
      for (const details of await items.first().locator('details').all()) if (await details.getAttribute('open') === null) await details.locator('summary').click();
      await expect(items.first().getByText('₱550.00', { exact: true })).toBeVisible();
      await expect(items.first().getByText('₱1,053.360000', { exact: true })).toBeVisible();
      await expect(items.first().getByText('REF-RESPONSIVE-2026-001', { exact: true })).toBeVisible();
      await assertPageGeometry(page);
      if (width === 375) await first.screenshot({ path: fileURLToPath(new URL('../.qa/screenshots/invoice-responsive-card-375.png', import.meta.url)) });
    } else {
      await expect(first).toBeHidden();
      const summaries = page.locator('.invoice-summary-scroll .invoice-summary-row').filter({ visible: true });
      await expect(summaries).toHaveCount(2);
      const summaryScroll = page.locator('.invoice-summary-scroll');
      assert.ok(await summaryScroll.evaluate(element => element.scrollWidth > element.clientWidth));
      await expect(page.locator('.invoice-summary-hint')).toBeVisible();
      await summaryScroll.evaluate(element => { element.scrollLeft = element.scrollWidth; });
      await expect(summaries.first().getByRole('button', { name: 'Payment', exact: true })).toBeInViewport();
      await summaryScroll.evaluate(element => { element.scrollLeft = 0; });
      const firstPanel = page.locator('.invoice-summary-scroll .invoice-item-panel').filter({ visible: true }).first();
      await expect(firstPanel).toContainText('ASTER-INVOICE-PART');
      await expect(firstPanel).not.toContainText('OTHER-SI-ONLY');
      await expect(firstPanel.locator('.invoice-items-table')).toBeVisible();
      await expect(firstPanel.locator('.invoice-items-hint')).toBeVisible();
      const itemScroll = firstPanel.locator('.invoice-items-scroll');
      assert.ok(await itemScroll.evaluate(element => element.scrollWidth > element.clientWidth));
      await itemScroll.scrollIntoViewIfNeeded();
      await itemScroll.evaluate(element => { element.scrollLeft = element.scrollWidth; });
      await expect(firstPanel.getByRole('cell', { name: 'REF-RESPONSIVE-2026-001', exact: true })).toBeInViewport();
      await itemScroll.evaluate(element => { element.scrollLeft = 0; });
      await assertPageGeometry(page);
    }
  }
  await page.setViewportSize({ width: 375, height: 900 });
  await first.getByRole('button', { name: 'View', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Invoice', exact: true })).toContainText('ASTER-INVOICE-PART');
  await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
  await expect(first.getByRole('button', { name: 'Collapse items for ' + invoice.number, exact: true })).toBeVisible();
  await first.getByRole('button', { name: 'Payment', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Record payment', exact: true })).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
  await parents.nth(1).getByRole('button', { name: 'Expand items for ' + second.number, exact: true }).click();
  await expect(parents.nth(1).getByRole('region', { name: 'Items for ' + second.number, exact: true })).toContainText('OTHER-SI-ONLY');
  await expect(first.getByRole('region', { name: 'Items for ' + invoice.number, exact: true })).not.toContainText('OTHER-SI-ONLY');
  await page.getByRole('searchbox', { name: 'Search invoices', exact: true }).fill(invoice.number);
  await expect(parents).toHaveCount(1);
  await expect(first).toContainText(invoice.number);
  await assertPageGeometry(page);
  assert.ok(apiRequests.every(request => request.method === 'GET'));
  assertSafe();
});
