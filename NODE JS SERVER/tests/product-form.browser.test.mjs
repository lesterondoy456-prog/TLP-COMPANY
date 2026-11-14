import { loadApi } from './helpers/load-api.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { expect } from '@playwright/test';
const { configurationMetadata } = loadApi('configuration');
import { mockBrowser } from './helpers/mock-browser.mjs';

test('CAS Product tabs validate and preserve all scalar and child fields using mocked APIs only', { timeout: 120_000 }, async t => {
  const admin = { id: 1, system: 'sales', name: 'Mock Administrator', username: 'mock_admin', role: 'admin', isActive: true, cpnumber: '', email: '', photo: '' };
  const header = { id: 20, sku: 'HEADER', name: 'Existing Header', unit: 'pcs', price: 0, stock: 50, isActive: true };
  const records = [header];
  const writes = [];
  const options = {
    units: [{ id: 1, name: 'pcs', description: 'Piece', isActive: true }, { id: 2, name: 'box', description: 'Box', isActive: true }],
    currencies: [{ id: 1, code: 'PHP', description: 'Philippine Peso', isActive: true }],
    categories: [{ id: 1, name: 'Packaging', isActive: true }],
    customers: [{ id: 10, name: 'Mock Customer A', isActive: true }, { id: 11, name: 'Mock Customer B', isActive: true }],
    headers: [header], processes: ['Printing', 'Cutting'],
    supplies: [{ id: 30, code: 'RM-001', name: 'Paper', description: 'Paper Roll', unit: 'kg', isActive: true }],
  };
  const { page, origin, screenshot, assertSafe } = await mockBrowser(t, async ({ method, pathname, body }) => {
    if (method === 'GET' && pathname === '/api/auth/session') return { json: { user: admin } };
    if (method === 'GET' && pathname === '/api/configuration') return { json: { modules: configurationMetadata() } };
    if (method === 'GET' && pathname === '/api/product-options') return { json: options };
    if (method === 'GET' && pathname === '/api/products') return { json: { records } };
    if (method === 'GET' && /^\/api\/products\/\d+$/.test(pathname)) {
      const record = records.find(record => record.id === Number(pathname.split('/').pop()));
      return { json: { record: { ...record, color: 'Retired color', planType: 'Retired plan', thickness: 99, customerApprovals: (record.customerApprovals || []).map(row => ({ ...row, eolDate: '2099-01-01', eolRemarks: 'Retired EOL remarks' })), offices: [{ name: 'Legacy Office' }], inventorySchedules: [{ scheduleDate: '2026-11-13', month: 'Legacy editable schedule' }] } } };
    }
    if (method === 'GET' && ['/api/customers', '/api/sales-orders', '/api/sales-invoices', '/api/delivery-receipts', '/api/shipping-invoices', '/api/users'].includes(pathname)) return { json: { records: pathname === '/api/users' ? [admin] : [] } };
    if ((method === 'POST' && pathname === '/api/products') || (method === 'PUT' && /^\/api\/products\/\d+$/.test(pathname))) {
      writes.push({ method, pathname, body });
      const id = method === 'POST' ? 101 : Number(pathname.split('/').pop());
      const record = { ...body, id, name: body.description || body.sku, stock: 0 };
      const index = records.findIndex(product => product.id === id);
      if (index === -1) records.push(record); else records[index] = record;
      return { status: method === 'POST' ? 201 : 200, json: { record } };
    }
  }, { project: 'SalesSystem', screenshotName: 'product-form-mock-last.png', viewport: { width: 1500, height: 1100 } });
  await page.goto(origin);
  await expect(page.getByRole('heading', { name: 'Customer', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Product', exact: true }).click();
  await page.getByRole('button', { name: 'New product', exact: false }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('checkbox', { name: 'Active product', exact: true })).toHaveCount(0);
  const tabs = Object.fromEntries(['Basic Info', 'Customer', 'Inventory Sched', 'Link Supplies'].map(name => [name, dialog.getByRole('tab', { name, exact: true })]));
  const panel = name => dialog.getByRole('tabpanel', { name, exact: true });
  const field = name => panel('Basic Info').getByLabel(name, { exact: true });
  const save = dialog.getByRole('button', { name: 'Save product', exact: true });
  await expect(dialog.locator('.required-mark')).toHaveCount(3);
  await expect(dialog.locator('[aria-required="true"]')).toHaveCount(3);
  for (const [theme, color] of [['dark', 'rgb(255, 113, 130)'], ['light', 'rgb(202, 36, 64)']]) {
    await page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
    for (const marker of await dialog.locator('.required-mark').all()) await expect(marker).toHaveCSS('color', color);
  }
  await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
  for (const tab of Object.values(tabs)) await expect(tab).toBeVisible();
  for (const label of ['Code *', 'Rev', 'Description', 'UOP *', 'UOP2', 'Qty per UOP2', 'MOQ', 'SPQ', 'Unit Cost', 'Selling Price', 'Currency *', 'Model / Item code', 'Category / Platform', 'Divisor', 'Weight', 'Product Header', 'Remarks', 'Tag Color']) await expect(field(label)).toBeVisible();
  for (const label of ['Plan Type', 'Color', 'Thickness']) await expect(field(label)).toHaveCount(0);
  await expect(field('Product Id')).toHaveCount(0);
  await expect(panel('Basic Info').getByRole('heading', { name: 'Office', exact: true })).toHaveCount(0);
  await expect(panel('Basic Info').getByRole('checkbox')).toHaveCount(0);
  await expect(field('Rev')).toHaveValue('');
  await expect(field('Selling Price')).toHaveValue('');
  await expect(field('MOQ')).toHaveValue('');
  await expect(panel('Basic Info').getByRole('radio', { name: 'Customer Setting', exact: true })).not.toBeChecked();
  await expect(dialog.getByLabel('Stock on hand *', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('searchbox', { name: 'Search sales modules', exact: true })).toHaveCount(0);
  async function invalidFromOtherTab(label, expectedWriteCount = 0) {
    await tabs['Link Supplies'].click();
    await save.click();
    await expect(tabs['Basic Info']).toHaveAttribute('aria-selected', 'true');
    await expect(field(label)).toBeFocused();
    await expect(dialog.getByRole('alert')).toBeVisible();
    assert.equal(writes.length, expectedWriteCount, 'A blank required field must prevent any API request, including when its tab is hidden.');
  }
  await invalidFromOtherTab('Code *');
  await field('Code *').fill('   ');
  await invalidFromOtherTab('Code *');
  await field('Code *').fill(' MOCK-PRODUCT ');
  await field('Rev').fill('1');
  await field('Description').fill(' Mock Product Description ');
  await invalidFromOtherTab('UOP *');
  await field('UOP *').selectOption('pcs');
  await invalidFromOtherTab('Currency *');
  await field('Currency *').selectOption('PHP');
  await field('UOP2').selectOption('box');
  await tabs['Inventory Sched'].click();
  await save.click();
  await expect(tabs['Basic Info']).toHaveAttribute('aria-selected', 'true');
  await expect(field('Qty per UOP2')).toBeFocused();
  assert.equal(writes.length, 0);
  const numbers = { 'Qty per UOP2': '12.000001', MOQ: '100', SPQ: '10', 'Unit Cost': '5.123456', 'Selling Price': '12.34', Divisor: '2.5', Weight: '3.000001' };
  for (const [label, value] of Object.entries(numbers)) await field(label).fill(value);
  const textValues = { 'Model / Item code': 'Model X', Remarks: ' Mock product remarks ', 'Tag Color': '#33ccff' };
  for (const [label, value] of Object.entries(textValues)) await field(label).fill(value);
  await field('Category / Platform').selectOption('Packaging');
  await field('Product Header').selectOption('20');
  await panel('Basic Info').getByRole('radio', { name: 'Inclusive', exact: true }).check();
  for (const [index, name] of ['Printing', 'Cutting'].entries()) {
    await panel('Basic Info').getByRole('button', { name: 'Add process', exact: true }).click();
    await panel('Basic Info').getByLabel('Process ' + (index + 1), { exact: true }).fill(name);
  }
  await screenshot('product-basic-info-mocked.png');
  await tabs.Customer.click();
  await panel('Customer').getByRole('button', { name: 'Add customer', exact: true }).click();
  await expect(panel('Customer').getByLabel('EOL Date 1', { exact: true })).toHaveCount(0);
  await expect(panel('Customer').getByLabel('EOL Remarks 1', { exact: true })).toHaveCount(0);
  await expect(panel('Customer').getByLabel('Customer Name 1', { exact: true }).locator('option[value="10"]')).toHaveText('Mock Customer A');
  await tabs['Basic Info'].click();
  await save.click();
  await expect(tabs.Customer).toHaveAttribute('aria-selected', 'true');
  await expect(panel('Customer').getByLabel('Customer Name 1', { exact: true })).toBeFocused();
  assert.equal(writes.length, 0);
  await panel('Customer').getByLabel('Customer Name 1', { exact: true }).selectOption('10');
  await panel('Customer').getByLabel('Approval Date 1', { exact: true }).fill('2026-11-13');
  await panel('Customer').getByLabel('Approval Remarks 1', { exact: true }).fill(' Approved sample ');
  await panel('Customer').getByRole('button', { name: 'Add customer', exact: true }).click();
  await panel('Customer').getByLabel('Customer Name 2', { exact: true }).selectOption('11');
  await screenshot('product-customers-mocked.png');
  await tabs['Inventory Sched'].click();
  const inventorySetup = panel('Inventory Sched').getByLabel('Inventory Setup', { exact: true });
  const schedule = panel('Inventory Sched').getByRole('table', { name: 'Inventory schedule', exact: true });
  const monthlyCells = ['Apr-30', 'April', 'Aug-31', 'August', 'Dec-31', 'December', 'Feb-28', 'February', 'Jan-31', 'January', 'Jul-31', 'July', 'Jun-30', 'June', 'Mar-31', 'March', 'May-31', 'May', 'Nov-30', 'November', 'Oct-31', 'October', 'Sep-30', 'September'];
  await expect(panel('Inventory Sched').getByRole('button', { name: 'Add schedule', exact: true })).toHaveCount(0);
  await expect(schedule.locator('input, select, button')).toHaveCount(0);
  await inventorySetup.selectOption('monthly');
  await expect(schedule.getByRole('cell')).toHaveText(monthlyCells);
  await inventorySetup.selectOption('quarterly');
  await expect(schedule.getByRole('cell')).toHaveText(['Dec-31', 'December', 'Jun-30', 'June', 'Mar-31', 'March', 'Sep-30', 'September']);
  await screenshot('product-inventory-quarterly-mocked.png');
  await inventorySetup.selectOption('');
  await expect(schedule.getByRole('cell')).toHaveText(['Select Monthly or Quarterly to view the schedule.']);
  await inventorySetup.selectOption('monthly');
  await screenshot('product-inventory-schedule-mocked.png');
  await tabs['Link Supplies'].click();
  await panel('Link Supplies').getByRole('button', { name: 'Add supply', exact: true }).click();
  await panel('Link Supplies').getByLabel('Supplies Name 1', { exact: true }).selectOption('30');
  await expect(panel('Link Supplies').getByText('Paper Roll', { exact: true })).toBeVisible();
  await expect(panel('Link Supplies').getByLabel('Supply UOM 1', { exact: true })).toHaveValue('kg');
  await expect(panel('Link Supplies').getByLabel('Supply UOM 1', { exact: true })).toHaveAttribute('readonly', '');
  await panel('Link Supplies').getByLabel('Supply Qty 1', { exact: true }).fill('0');
  await tabs['Basic Info'].click();
  await save.click();
  await expect(tabs['Link Supplies']).toHaveAttribute('aria-selected', 'true');
  await expect(panel('Link Supplies').getByLabel('Supply Qty 1', { exact: true })).toBeFocused();
  assert.equal(writes.length, 0);
  await panel('Link Supplies').getByLabel('Supply Qty 1', { exact: true }).fill('1.234567');
  await screenshot('product-linked-supplies-mocked.png');
  await save.click();
  await expect(dialog).toHaveCount(0);
  const expected = {
    sku: 'MOCK-PRODUCT', revision: '1', description: 'Mock Product Description', unit: 'pcs', secondaryUnit: 'box', currency: 'PHP',
    model: 'Model X', category: 'Packaging', remarks: 'Mock product remarks', tagColor: '#33ccff',
    quantityPerSecondaryUnit: 12.000001, moq: 100, spq: 10, unitCost: 5.123456, price: 12.34, divisor: 2.5, weight: 3.000001,
    vatMode: 'inclusive', productHeaderId: 20, processes: [{ name: 'Printing' }, { name: 'Cutting' }],
    customerApprovals: [{ customerId: 10, approvalDate: '2026-11-13', approvalRemarks: 'Approved sample' }, { customerId: 11, approvalDate: null, approvalRemarks: null }],
    inventorySetup: 'monthly',
    linkedSupplies: [{ suppliesId: 30, quantity: 1.234567, unit: 'kg' }], isActive: true,
  };
  assert.equal(writes.length, 1);
  assert.equal(writes[0].body.isActive, true, 'New products are always active.');
  assert.deepEqual(writes[0].body, expected);
  assert.equal(Object.hasOwn(writes[0].body, 'offices'), false, 'Product saves must never include company or Office associations.');
  assert.equal(Object.hasOwn(writes[0].body, 'stock'), false, 'Product metadata and raw-material links must not create finished-goods stock.');
  assert.equal(Object.hasOwn(writes[0].body, 'inventorySchedules'), false, 'Static display schedules must never be submitted for persistence.');
  assert.equal(header.stock, 50);
  await page.reload();
  await page.getByRole('button', { name: 'Product', exact: true }).click();
  await page.getByRole('row').filter({ hasText: 'Mock Product Description' }).getByRole('button', { name: 'Edit', exact: true }).click();
  const activeProduct = dialog.getByRole('checkbox', { name: 'Active product', exact: true });
  await expect(activeProduct).toBeVisible();
  await expect(activeProduct).toBeChecked();
  await activeProduct.uncheck();
  await expect(field('Product Id')).toHaveCount(0);
  for (const label of ['Plan Type', 'Color', 'Thickness']) await expect(field(label)).toHaveCount(0);
  await expect(panel('Basic Info').getByRole('heading', { name: 'Office', exact: true })).toHaveCount(0);
  await expect(panel('Basic Info').getByRole('checkbox')).toHaveCount(0);
  await expect(field('Code *')).toHaveValue('MOCK-PRODUCT');
  await expect(field('Qty per UOP2')).toHaveValue('12.000001');
  await tabs.Customer.click();
  await expect(panel('Customer').getByLabel('Approval Remarks 1', { exact: true })).toHaveValue('Approved sample');
  await tabs['Inventory Sched'].click();
  await expect(inventorySetup).toHaveValue('monthly');
  await expect(schedule.getByRole('cell')).toHaveText(monthlyCells);
  await expect(schedule.getByText('Legacy editable schedule', { exact: true })).toHaveCount(0);
  await expect(schedule.locator('input, select, button')).toHaveCount(0);
  await tabs['Link Supplies'].click();
  await expect(panel('Link Supplies').getByLabel('Supply Qty 1', { exact: true })).toHaveValue('1.234567');
  await tabs['Basic Info'].click();
  for (const [label, value] of [['Code *', 'MOCK-PRODUCT'], ['UOP *', 'pcs'], ['Currency *', 'PHP']]) {
    if (label === 'Code *') await field(label).fill('');
    else await field(label).selectOption('');
    await invalidFromOtherTab(label, 1);
    if (label === 'Code *') await field(label).fill(value);
    else await field(label).selectOption(value);
  }
  await field('Rev').fill('2');
  await save.click();
  await expect(dialog).toHaveCount(0);
  assert.equal(writes.length, 2);
  assert.equal(writes[1].method, 'PUT');
  assert.deepEqual(writes[1].body, { ...expected, revision: '2', isActive: false });
  await page.getByRole('row').filter({ hasText: 'Mock Product Description' }).getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(activeProduct).toBeVisible();
  await expect(activeProduct).not.toBeChecked();
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'New product', exact: false }).click();
  await field('Code *').fill('NULLABLE-PRODUCT');
  await field('UOP *').selectOption('pcs');
  await field('Currency *').selectOption('PHP');
  await save.click();
  await expect(dialog).toHaveCount(0);
  const emptyOptional = writes.at(-1).body;
  for (const key of ['revision', 'description', 'secondaryUnit', 'model', 'category', 'remarks', 'tagColor', 'quantityPerSecondaryUnit', 'moq', 'spq', 'unitCost', 'price', 'divisor', 'weight', 'vatMode', 'inventorySetup']) assert.equal(emptyOptional[key], null, key + ' must stay NULL when no value is entered.');
  for (const key of ['planType', 'color', 'thickness']) assert.equal(Object.hasOwn(emptyOptional, key), false);
  const nullableRow = page.getByRole('row').filter({ hasText: 'NULLABLE-PRODUCT' });
  await expect(nullableRow.locator('.product-price-cell')).toHaveText('\u2014');
  await nullableRow.getByRole('button', { name: 'Edit', exact: true }).click();
  await field('Selling Price').fill('0');
  await field('MOQ').fill('0');
  await save.click();
  await expect(dialog).toHaveCount(0);
  assert.equal(writes.at(-1).body.price, 0);
  assert.equal(writes.at(-1).body.moq, 0);
  assert.equal(writes.at(-1).body.revision, null);
  assertSafe();
});

test('Product monitoring shows retained catalog and approval details without retired fields on desktop and mobile', { timeout: 60_000 }, async t => {
  const actor = { id: 1, system: 'sales', name: 'Mock Administrator', username: 'mock_admin', role: 'admin', isActive: true };
  const product = {
    id: 10, sku: 'BOX-MONITOR', name: 'Printed export box', description: 'Printed export box\nReinforced packaging for shipment',
    model: 'ITEM-X', category: 'Platform A', revision: '0', unit: 'pcs', secondaryUnit: 'box', quantityPerSecondaryUnit: '12.000001', moq: 0, spq: 10,
    vatMode: 'customer', unitCost: 0, price: '0.115300', currency: 'USD', divisor: '2.5', weight: '3.000001',
    productHeaderCode: 'BOX-HEADER', productHeaderName: 'Export packaging header', tagColor: '#3366ff', inventorySetup: 'quarterly',
    remarks: 'Keep dry.\nUse approved packaging.', stock: '125.500', isActive: true, processes: [{ name: 'Printing' }, { name: 'Cutting' }],
    customerApprovals: [{ customerId: 20, customerName: 'Mock Customer A', approvalDate: '2026-11-13', approvalRemarks: 'Approved printed sample.', eolDate: '2099-01-01', eolRemarks: 'RETIRED EOL TEXT' }, { customerId: 21, customerName: 'Mock Customer B', approvalDate: null, approvalRemarks: null }],
    linkedSupplies: [{ suppliesId: 30, code: 'S-PAPER', name: 'Paper roll', quantity: '0.123456', unit: 'kg' }],
    planType: 'RETIRED PLAN TEXT', color: 'RETIRED COLOR TEXT', thickness: '999.123456',
  };
  const empty = { id: 11, sku: 'EMPTY-PRODUCT', name: 'EMPTY-PRODUCT', description: null, unit: 'pcs', currency: 'USD', price: null, stock: 0, isActive: false };
  const { page, origin, screenshot, apiRequests, assertSafe } = await mockBrowser(t, async ({ method, pathname }) => {
    if (method !== 'GET') throw new Error('Product monitoring checks must not save records.');
    if (pathname === '/api/auth/session') return { json: { user: actor } };
    if (pathname === '/api/products') return { json: { records: [product, empty] } };
    if (['/api/customers', '/api/sales-orders', '/api/sales-invoices', '/api/delivery-receipts', '/api/shipping-invoices', '/api/users'].includes(pathname)) return { json: { records: pathname === '/api/users' ? [actor] : [] } };
  }, { project: 'SalesSystem', viewport: { width: 1440, height: 1000 }, screenshotName: 'product-monitor-last.png' });
  await page.goto(origin);
  await expect(page.getByRole('heading', { name: 'Customer', level: 1, exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Product', exact: true }).click();
  const table = page.locator('.product-monitor .records-table');
  const headers = ['Code', 'Description', 'Model / Item code', 'Category / Platform', 'Rev', 'UOP', 'UOP2', 'Qty per UOP2', 'MOQ', 'SPQ', 'VAT setting', 'Unit cost', 'Selling price', 'Currency', 'Customer approvals', 'Process', 'Divisor', 'Weight', 'Product header', 'Tag color', 'Inventory setup', 'Linked supplies', 'Remarks', 'Stock on hand', 'Status', 'Actions'];
  await expect(table.getByRole('columnheader')).toHaveText(headers);
  const row = table.getByRole('row').filter({ hasText: product.sku });
  const cells = row.locator('td');
  for (const [index, value] of [[0, product.sku], [1, product.description], [2, product.model], [3, product.category], [4, '0'], [5, 'pcs'], [6, 'box'], [7, '12.000001'], [8, '0'], [9, '10'], [10, 'Customer setting'], [13, 'USD'], [15, 'Printing\nCutting'], [16, '2.5'], [17, '3.000001'], [19, product.tagColor], [20, 'Quarterly'], [22, product.remarks], [23, '125.5'], [24, 'Active']]) await expect(cells.nth(index)).toHaveText(value);
  const usd = value => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 6 }).format(value);
  await expect(cells.nth(11)).toHaveText(usd(0));
  await expect(cells.nth(12)).toHaveText(usd(0.1153));
  await expect(cells.nth(18)).toContainText(product.productHeaderCode);
  await expect(cells.nth(18)).toContainText(product.productHeaderName);
  for (const index of [1, 15, 22]) await expect(cells.nth(index)).toHaveCSS('white-space', 'pre-line');
  const approvals = cells.nth(14);
  await expect(approvals.locator('.product-related-block > strong')).toHaveText(['Mock Customer A', 'Mock Customer B']);
  await expect(approvals.locator('.product-related-block > span')).toHaveText(['Approval date · Nov 13, 2026', 'Approval date · —']);
  await expect(approvals.locator('p')).toHaveText(['Approved printed sample.', '—']);
  await expect(cells.nth(21)).toContainText('Paper roll');
  await expect(cells.nth(21)).toContainText('0.123456 kg');
  for (const retired of ['RETIRED PLAN TEXT', 'RETIRED COLOR TEXT', 'RETIRED EOL TEXT', '999.123456', '2099-01-01']) await expect(table.getByText(retired, { exact: true })).toHaveCount(0);
  const emptyCells = table.getByRole('row').filter({ hasText: empty.sku }).locator('td');
  for (const index of [1, 2, 3, 4, 6, 7, 8, 9, 10, 11, 12, 14, 15, 16, 17, 19, 20, 21, 22]) await expect(emptyCells.nth(index)).toHaveText('—');
  await expect(emptyCells.nth(23)).toHaveText('0');
  await expect(emptyCells.nth(24)).toHaveText('Inactive');
  const scroller = page.locator('.product-monitor .table-scroll');
  assert.ok(await scroller.evaluate(element => element.scrollWidth > element.clientWidth));
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await expect(cells.first()).toHaveCSS('position', 'sticky');
  await expect(cells.last()).toHaveCSS('position', 'sticky');
  await screenshot('product-monitor-dark-desktop.png');
  await approvals.scrollIntoViewIfNeeded();
  await screenshot('product-monitor-approvals-desktop.png');
  await page.setViewportSize({ width: 375, height: 812 });
  await page.evaluate(async () => { await Promise.all(document.getAnimations().filter(animation => animation.effect?.getComputedTiming().iterations !== Infinity).map(animation => animation.finished.catch(() => {}))); });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await expect(cells.first()).toHaveCSS('position', 'static');
  await expect(cells.last()).toHaveCSS('position', 'static');
  await approvals.scrollIntoViewIfNeeded();
  await screenshot('product-monitor-approvals-mobile.png');
  await scroller.evaluate(element => { element.scrollLeft = element.scrollWidth; });
  await expect(row.getByRole('button', { name: 'Edit', exact: true })).toBeVisible();
  await expect(row.getByRole('button', { name: 'Delete', exact: true })).toBeVisible();
  assert.ok(apiRequests.every(request => request.method === 'GET'));
  assertSafe();
});
