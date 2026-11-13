import assert from 'node:assert/strict';
import test from 'node:test';
import { expect } from '@playwright/test';
import { mockBrowser } from './helpers/mock-browser.mjs';
import { mockPurchasing } from './helpers/mock-purchasing.mjs';

test('independent Purchasing and Warehouse apps share mocked receipt state without sharing frontend entries', { timeout: 120_000 }, async t => {
  const actor = { id: 1, system: 'purchasing', name: 'Mock Purchasing Administrator', username: 'mock_admin', role: 'admin', isActive: true, cpnumber: '', email: '', photo: '' };
  const warehouseActor = { ...actor, id: 77, system: 'warehouse', name: 'Mock Warehouse Administrator' };
  const purchasing = mockPurchasing(actor, warehouseActor);
  const { page, origin, gotoProject, apiRequests, screenshot, assertSafe } = await mockBrowser(t, purchasing.onApi, { project: 'PurchasingSystem', screenshotName: 'purchasing-workflow-mock-last.png', viewport: { width: 1500, height: 1100 } });
  await page.goto(origin);
  await expect(page.getByRole('heading', { name: 'PR Monitoring', exact: true, level: 1 })).toBeVisible();
  for (const name of ['PR Monitoring', 'PO Monitoring', 'Supplier', 'Supplies', 'Receiving Receipt']) await expect(page.getByRole('button', { name, exact: true })).toBeVisible();
  for (const name of ['Customer', 'Product', 'Currency', 'Supplies Stock']) await expect(page.getByRole('button', { name, exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Production', exact: true })).toHaveCount(0);
  await expect(page.getByRole('searchbox', { name: 'Search sales modules', exact: true })).toHaveCount(0);
  const navigate = async name => {
    await page.getByRole('button', { name, exact: true }).click();
    await expect(page.getByRole('heading', { name, exact: true }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Refresh purchasing records', exact: true })).toBeEnabled();
  };
  const save = async label => {
    await page.getByRole('dialog').getByRole('button', { name: label, exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Refresh purchasing records', exact: true })).toBeEnabled();
  };
  const post = async title => {
    await page.getByRole('button', { name: 'Post', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Post ' + title, exact: true });
    await dialog.getByRole('button', { name: 'Confirm post', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Refresh purchasing records', exact: true })).toBeEnabled();
  };
  for (const master of [
    { page: 'Supplier', action: 'New supplier', save: 'Save supplier', required: ['Name *', 'Short Name *', 'Business Style *', 'Office Address *', 'Decimal in Price *', 'Decimal in Total Price *', 'VAT Code *'] },
    { page: 'Supplies', action: 'New supplies', save: 'Save supplies', required: ['Name *', 'Unit of Measure *'] },
  ]) {
    await navigate(master.page);
    await page.getByRole('button', { name: master.action, exact: false }).click();
    const emptyMaster = page.getByRole('dialog');
    for (const label of master.required) await expect(emptyMaster.getByLabel(label, { exact: true })).toBeVisible();
    await expect(emptyMaster.locator('.required-mark')).toHaveCount(master.required.length);
    for (const marker of await emptyMaster.locator('.required-mark').all()) {
      assert.equal(await marker.evaluate(element => getComputedStyle(element).color), 'rgb(255, 113, 130)', 'CAS-required master markers must be red in dark mode.');
    }
    await emptyMaster.getByRole('button', { name: master.save, exact: true }).click();
    await expect(emptyMaster).toBeVisible();
    await expect(emptyMaster.getByLabel('Name *', { exact: true })).toBeFocused();
    assert.equal(purchasing.writes.length, 0, 'Missing CAS-required master fields must not send a save request.');
    await emptyMaster.getByRole('button', { name: 'Cancel', exact: true }).click();
  }
  await navigate('PR Monitoring');
  await page.getByRole('button', { name: 'New purchase request', exact: false }).click();
  let dialog = page.getByRole('dialog');
  await dialog.getByLabel('PR Date *', { exact: true }).fill('2026-11-13');
  await dialog.getByLabel('PR Needed Date *', { exact: true }).fill('2026-12-01');
  await dialog.getByLabel('Requested By', { exact: true }).fill('Mock Requester');
  await dialog.getByLabel('Requested Dept', { exact: true }).fill('Purchasing');
  await dialog.getByLabel('Supplies 1', { exact: true }).selectOption('30');
  await expect(dialog.getByLabel('PR UOM 1', { exact: true })).toHaveValue('kg');
  await dialog.getByLabel('Needed Date 1', { exact: true }).fill('2026-12-01');
  await dialog.getByLabel('PR Qty 1', { exact: true }).fill('0');
  await dialog.getByRole('button', { name: 'Save purchase request', exact: true }).click();
  await expect(dialog.getByLabel('PR Qty 1', { exact: true })).toBeFocused();
  assert.equal(purchasing.writes.length, 0);
  await dialog.getByLabel('PR Qty 1', { exact: true }).fill('2');
  await save('Save purchase request');
  await expect(page.getByRole('cell', { name: 'PR-MOCK-001', exact: true })).toBeVisible();
  assert.equal(purchasing.writes[0].body.items[0].quantity, '2');
  await post('purchase request');
  await expect(page.getByRole('cell', { name: 'Posted', exact: true })).toBeVisible();
  await screenshot('purchase-request-monitor-mocked.png');

  await navigate('PO Monitoring');
  await page.getByRole('button', { name: 'New purchase order', exact: false }).click();
  dialog = page.getByRole('dialog');
  await expect(dialog.locator('.required-mark')).toHaveCount(9);
  const writesBeforeEmptyOrder = purchasing.writes.length;
  await dialog.getByRole('button', { name: 'Save purchase order', exact: true }).click();
  await expect(dialog.getByLabel('Supplier *', { exact: true })).toBeFocused();
  assert.equal(purchasing.writes.length, writesBeforeEmptyOrder, 'Missing required PO fields must block before sending a request.');
  await dialog.getByLabel('Supplier *', { exact: true }).selectOption('50');
  await dialog.getByLabel('PO Date *', { exact: true }).fill('2026-11-13');
  await dialog.getByLabel('Delivery Date *', { exact: true }).fill('2026-12-01');
  await dialog.getByLabel('Shipment *', { exact: true }).selectOption('By Land');
  await dialog.getByRole('button', { name: 'Load Open PR', exact: true }).click();
  await dialog.getByRole('checkbox', { name: 'Load PR line 100', exact: true }).check();
  await dialog.getByRole('button', { name: 'Load selected PR lines', exact: true }).click();
  await expect(dialog.getByLabel('PO Qty 1', { exact: true })).toHaveValue('2.000000');
  await dialog.getByLabel('PO Price 1', { exact: true }).fill('0.115300');
  await expect(dialog.getByLabel('Amount', { exact: true })).toHaveValue('₱0.26');
  await save('Save purchase order');
  const poWrite = purchasing.writes.find(write => write.method === 'POST' && write.pathname === '/api/purchase-orders');
  assert.equal(poWrite.body.items[0].requestItemId, 100);
  assert.equal(poWrite.body.items[0].unitPrice, '0.115300');
  assert.equal(poWrite.body.items[0].currency, 'PHP');
  await post('purchase order');
  await expect(page.getByRole('cell', { name: 'PO-MOCK-001', exact: true })).toBeVisible();
  await screenshot('purchase-order-monitor-mocked.png');

  await navigate('Receiving Receipt');
  await page.getByRole('button', { name: 'New receiving receipt', exact: false }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('PO Ref #', { exact: true }).selectOption('1');
  await dialog.getByLabel('SRR Date *', { exact: true }).fill('2026-11-13');
  await dialog.getByLabel('SI # *', { exact: true }).fill('MOCK-INVOICE-001');
  await dialog.getByLabel('SI Date', { exact: true }).fill('2026-11-12');
  await expect(dialog.getByLabel('Receipt Qty 1', { exact: true })).toHaveValue('2.000000');
  await dialog.getByRole('tab', { name: 'SRR Summary', exact: true }).click();
  for (const suffix of ['1-1', '1-2']) {
    await dialog.getByRole('button', { name: 'Add allocation', exact: true }).click();
    await dialog.getByLabel('Allocation Qty ' + suffix, { exact: true }).fill('1');
    await dialog.getByLabel('IMLot # ' + suffix, { exact: true }).fill('LOT-' + suffix);
    await dialog.getByLabel('MFG Date ' + suffix, { exact: true }).fill('2026-11-01');
    await dialog.getByLabel('Exp. Date ' + suffix, { exact: true }).fill('2027-11-01');
  }
  await screenshot('receiving-allocations-mocked.png');
  await save('Save receiving receipt');
  assert.deepEqual(purchasing.snapshot().inventory, {}, 'Saving a draft must not change stock.');
  await page.getByRole('button', { name: 'Post', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Post receiving receipt', exact: true });
  await expect(dialog.getByRole('button', { name: 'Confirm post', exact: true })).toBeDisabled();
  await expect(dialog.getByRole('alert')).toContainText('Warehouse and Location');
  assert.equal(purchasing.writes.some(write => write.pathname.endsWith('/receivings/1/post')), false);
  await dialog.getByRole('button', { name: 'Review first', exact: true }).click();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Edit receiving receipt', exact: true });
  await dialog.getByRole('tab', { name: 'SRR Summary', exact: true }).click();
  for (const suffix of ['1-1', '1-2']) {
    await dialog.getByLabel('Warehouse ' + suffix, { exact: true }).selectOption('200');
    await dialog.getByLabel('Location ' + suffix, { exact: true }).selectOption('300');
  }
  await save('Save receiving receipt');
  purchasing.rejectNextReceivingPost();
  await page.getByRole('button', { name: 'Post', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Post receiving receipt', exact: true });
  await dialog.getByRole('button', { name: 'Confirm post', exact: true }).click();
  await expect(dialog.getByRole('alert')).toHaveText('Mock receiving temporarily unavailable.');
  await expect(dialog.getByRole('button', { name: 'Confirm post', exact: true })).toBeEnabled();
  assert.deepEqual(purchasing.snapshot().inventory, {});
  await dialog.getByRole('button', { name: 'Confirm post', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('cell', { name: 'Posted', exact: true })).toBeVisible();
  assert.equal(purchasing.snapshot().ledger.length, 2);
  assert.equal(purchasing.snapshot().productStock, 7);
  await screenshot('receiving-posted-mocked.png');

  const warehouseOrigin = await gotoProject('WarehouseSystem');
  assert.notEqual(warehouseOrigin, origin, 'Purchasing and Warehouse must load different project origins.');
  await expect(page.getByRole('heading', { name: 'Supplies Stock', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: new RegExp(warehouseActor.name) })).toBeVisible();
  await expect(page.getByRole('button', { name: new RegExp(actor.name) })).toHaveCount(0);
  for (const name of ['PR Monitoring', 'PO Monitoring', 'Customer', 'Product', 'Currency']) await expect(page.getByRole('button', { name, exact: true })).toHaveCount(0);
  const stockRow = page.getByRole('row').filter({ hasText: 'Mock Paper' });
  await expect(stockRow.getByRole('cell', { name: '2', exact: true })).toBeVisible();
  await stockRow.getByRole('button', { name: 'View stock', exact: true }).click();
  await expect(page.getByRole('cell', { name: 'LOT-1-1', exact: true }).first()).toBeVisible();
  await expect(page.getByRole('cell', { name: 'SRR-MOCK-001', exact: true })).toHaveCount(2);
  assert.ok(apiRequests.some(call => call.project === 'WarehouseSystem' && call.pathname === '/api/inventory/movements' && call.search === '?suppliesId=30'));
  assert.ok(apiRequests.filter(call => call.pathname.startsWith('/api/purchase-')).every(call => call.project === 'PurchasingSystem'));
  assert.ok(apiRequests.filter(call => call.pathname.startsWith('/api/inventory')).every(call => call.project === 'WarehouseSystem'));
  assert.ok(apiRequests.every(call => call.requestPathname.startsWith(`/api/${call.system}/`)));
  await expect(page.getByRole('button', { name: /New stock|Adjust stock|Save stock/ })).toHaveCount(0);
  await screenshot('warehouse-supplies-stock-mocked.png');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
  await page.getByRole('button', { name: 'Supplies Stock', exact: true }).click();
  await expect.poll(() => page.locator('.sidebar').evaluate(element => element.getBoundingClientRect().right)).toBeLessThanOrEqual(0);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await screenshot('warehouse-mobile-mocked.png');
  assertSafe();
});
