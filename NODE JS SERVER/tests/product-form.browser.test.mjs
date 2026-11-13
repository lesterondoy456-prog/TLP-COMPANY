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
    customers: [{ id: 10, code: 'C-001', name: 'Mock Customer A', isActive: true }, { id: 11, code: 'C-002', name: 'Mock Customer B', isActive: true }],
    headers: [header], offices: ['TLP COMPANY', 'Branch A'], processes: ['Printing', 'Cutting'],
    supplies: [{ id: 30, code: 'RM-001', name: 'Paper', description: 'Paper Roll', unit: 'kg', isActive: true }],
  };
  const { page, origin, screenshot, assertSafe } = await mockBrowser(t, async ({ method, pathname, body }) => {
    if (method === 'GET' && pathname === '/api/auth/session') return { json: { user: admin } };
    if (method === 'GET' && pathname === '/api/configuration') return { json: { modules: configurationMetadata() } };
    if (method === 'GET' && pathname === '/api/product-options') return { json: options };
    if (method === 'GET' && pathname === '/api/products') return { json: { records } };
    if (method === 'GET' && /^\/api\/products\/\d+$/.test(pathname)) return { json: { record: records.find(record => record.id === Number(pathname.split('/').pop())) } };
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
  for (const label of ['Product Id', 'Code *', 'Rev', 'Description', 'UOP *', 'UOP2', 'Qty per UOP2', 'MOQ', 'SPQ', 'Unit Cost', 'Selling Price', 'Currency *', 'Model', 'Category', 'Plan Type', 'Color', 'Divisor', 'Thickness', 'Weight', 'Product Header', 'Remarks', 'Tag Color']) await expect(field(label)).toBeVisible();
  await expect(field('Product Id')).toHaveAttribute('readonly', '');
  await expect(field('Rev')).toHaveValue('0');
  await expect(panel('Basic Info').getByRole('radio', { name: 'Customer Setting', exact: true })).toBeChecked();
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
  const numbers = { 'Qty per UOP2': '12.000001', MOQ: '100', SPQ: '10', 'Unit Cost': '5.123456', 'Selling Price': '12.34', Divisor: '2.5', Thickness: '0.25', Weight: '3.000001' };
  for (const [label, value] of Object.entries(numbers)) await field(label).fill(value);
  const textValues = { Model: 'Model X', 'Plan Type': 'Make to order', Color: 'Blue', Remarks: ' Mock product remarks ', 'Tag Color': '#33ccff' };
  for (const [label, value] of Object.entries(textValues)) await field(label).fill(value);
  await field('Category').selectOption('Packaging');
  await field('Product Header').selectOption('20');
  await panel('Basic Info').getByRole('radio', { name: 'Inclusive', exact: true }).check();
  for (const [index, name] of ['Printing', 'Cutting'].entries()) {
    await panel('Basic Info').getByRole('button', { name: 'Add process', exact: true }).click();
    await panel('Basic Info').getByLabel('Process ' + (index + 1), { exact: true }).fill(name);
  }
  for (const name of ['TLP COMPANY', 'Branch A']) await panel('Basic Info').getByRole('checkbox', { name, exact: true }).check();
  await screenshot('product-basic-info-mocked.png');
  await tabs.Customer.click();
  await panel('Customer').getByRole('button', { name: 'Add customer', exact: true }).click();
  await panel('Customer').getByLabel('Customer Name 1', { exact: true }).selectOption('10');
  await panel('Customer').getByLabel('Approval Date 1', { exact: true }).fill('2026-11-13');
  await panel('Customer').getByLabel('EOL Date 1', { exact: true }).fill('2026-11-12');
  await tabs['Basic Info'].click();
  await save.click();
  await expect(tabs.Customer).toHaveAttribute('aria-selected', 'true');
  await expect(panel('Customer').getByLabel('EOL Date 1', { exact: true })).toBeFocused();
  assert.equal(writes.length, 0);
  await panel('Customer').getByLabel('EOL Date 1', { exact: true }).fill('2026-12-31');
  await panel('Customer').getByLabel('Approval Remarks 1', { exact: true }).fill(' Approved sample ');
  await panel('Customer').getByLabel('EOL Remarks 1', { exact: true }).fill(' Review at year end ');
  await panel('Customer').getByRole('button', { name: 'Add customer', exact: true }).click();
  await panel('Customer').getByLabel('Customer Name 2', { exact: true }).selectOption('11');
  await screenshot('product-customers-mocked.png');
  await tabs['Inventory Sched'].click();
  await panel('Inventory Sched').getByLabel('Inventory Setup', { exact: true }).selectOption('monthly');
  for (const [index, row] of [{ date: '2026-11-13', month: 'November' }, { date: '', month: 'Quarter 1' }].entries()) {
    await panel('Inventory Sched').getByRole('button', { name: 'Add schedule', exact: true }).click();
    if (row.date) await panel('Inventory Sched').getByLabel('Sched ' + (index + 1), { exact: true }).fill(row.date);
    await panel('Inventory Sched').getByLabel('Month ' + (index + 1), { exact: true }).fill(row.month);
  }
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
    model: 'Model X', category: 'Packaging', planType: 'Make to order', color: 'Blue', remarks: 'Mock product remarks', tagColor: '#33ccff',
    quantityPerSecondaryUnit: 12.000001, moq: 100, spq: 10, unitCost: 5.123456, price: 12.34, divisor: 2.5, thickness: 0.25, weight: 3.000001,
    vatMode: 'inclusive', productHeaderId: 20, processes: [{ name: 'Printing' }, { name: 'Cutting' }], offices: [{ name: 'TLP COMPANY' }, { name: 'Branch A' }],
    customerApprovals: [{ customerId: 10, approvalDate: '2026-11-13', eolDate: '2026-12-31', approvalRemarks: 'Approved sample', eolRemarks: 'Review at year end' }, { customerId: 11, approvalDate: null, eolDate: null, approvalRemarks: '', eolRemarks: '' }],
    inventorySetup: 'monthly', inventorySchedules: [{ scheduleDate: '2026-11-13', month: 'November' }, { scheduleDate: null, month: 'Quarter 1' }],
    linkedSupplies: [{ suppliesId: 30, quantity: 1.234567, unit: 'kg' }], isActive: true,
  };
  assert.equal(writes.length, 1);
  assert.equal(writes[0].body.isActive, true, 'New products are always active.');
  assert.deepEqual(writes[0].body, expected);
  assert.equal(Object.hasOwn(writes[0].body, 'stock'), false, 'Product metadata and raw-material links must not create finished-goods stock.');
  assert.equal(header.stock, 50);
  await page.reload();
  await page.getByRole('button', { name: 'Product', exact: true }).click();
  await page.getByRole('row').filter({ hasText: 'Mock Product Description' }).getByRole('button', { name: 'Edit', exact: true }).click();
  const activeProduct = dialog.getByRole('checkbox', { name: 'Active product', exact: true });
  await expect(activeProduct).toBeVisible();
  await expect(activeProduct).toBeChecked();
  await activeProduct.uncheck();
  await expect(field('Product Id')).toHaveValue('101');
  await expect(field('Code *')).toHaveValue('MOCK-PRODUCT');
  await expect(field('Qty per UOP2')).toHaveValue('12.000001');
  await tabs.Customer.click();
  await expect(panel('Customer').getByLabel('Approval Remarks 1', { exact: true })).toHaveValue('Approved sample');
  await tabs['Inventory Sched'].click();
  await expect(panel('Inventory Sched').getByLabel('Month 2', { exact: true })).toHaveValue('Quarter 1');
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
  assertSafe();
});
