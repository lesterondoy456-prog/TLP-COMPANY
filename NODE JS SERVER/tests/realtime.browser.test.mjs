import assert from 'node:assert/strict';
import test from 'node:test';
import { expect } from '@playwright/test';
import { mockBrowser } from './helpers/mock-browser.mjs';
import { loadApi } from './helpers/load-api.mjs';

const actor = system => ({ id: 1, system, name: 'Mock Administrator', username: 'mock_admin', role: 'admin', isActive: true });
const customer = (id, name) => ({ id, code: `C-${id}`, name, shortName: name, currency: 'PHP', category: '', address: '', email: '', cpnumber: '', isActive: true });

test('two Sales views receive actual Socket.IO events without navigation or clearing an open draft, and catch up after reconnect', { timeout: 60000 }, async t => {
  const records = [];
  let app;
  let reads = 0;
  app = await mockBrowser(t, async ({ method, pathname, body }) => {
    if (method === 'GET' && pathname === '/api/auth/session') return { json: { user: actor('sales') } };
    if (method === 'GET' && pathname === '/api/customer-options') return { json: { salesInCharges: [], countriesOfOrigin: [], countries: [], paymentTerms: [], categories: [], taxCodes: [] } };
    if (method === 'GET' && pathname === '/api/customers') { reads++; return { json: { records } }; }
    if (method === 'GET' && ['/api/products', '/api/sales-orders', '/api/sales-invoices', '/api/delivery-receipts', '/api/shipping-invoices', '/api/users'].includes(pathname)) return { json: { records: [] } };
    if (method === 'POST' && pathname === '/api/customers') {
      const record = customer(records.length + 1, body.name); records.push(record);
      app.emitChange('SalesSystem', ['customers']);
      return { json: { record } };
    }
  }, { realtime: true });
  const { page, origin } = app;
  const peer = await page.context().newPage();
  await Promise.all([page.goto(origin), peer.goto(origin)]);
  await expect.poll(() => app.realtimeClients()).toBe(2);
  await expect(peer.getByRole('heading', { name: 'Customer', exact: true })).toBeVisible();
  await peer.getByRole('button', { name: 'New customer', exact: false }).click();
  const draft = peer.getByRole('dialog');
  await draft.getByLabel('Name *', { exact: true }).fill('Keep this unsaved draft');
  await peer.evaluate(() => { window.realtimePageSentinel = 'same-page'; });
  const result = await page.evaluate(async () => (await fetch('/api/sales/customers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Realtime customer' }) })).json());
  assert.equal(result.record.name, 'Realtime customer');
  await expect(peer.locator('.records-table td.customer-name-column').getByText('Realtime customer', { exact: true })).toBeVisible();
  await expect(page.locator('.records-table td.customer-name-column').getByText('Realtime customer', { exact: true })).toBeVisible();
  await expect(draft.getByLabel('Name *', { exact: true })).toHaveValue('Keep this unsaved draft');
  assert.equal(await peer.evaluate(() => window.realtimePageSentinel), 'same-page');
  const beforeBurst = reads;
  records[0] = customer(1, 'Updated in place');
  for (let i = 0; i < 12; i++) app.emitChange('SalesSystem', ['customers']);
  await expect(peer.locator('.records-table td.customer-name-column').getByText('Updated in place', { exact: true })).toBeVisible();
  assert.ok(reads - beforeBurst <= 4, 'A burst must coalesce per connected view, not reload twelve times.');
  app.disconnectRealtime();
  records.push(customer(2, 'Missed while disconnected'));
  await expect.poll(() => app.realtimeClients(), { timeout: 15000 }).toBe(2);
  await expect(peer.locator('.records-table td.customer-name-column').getByText('Missed while disconnected', { exact: true })).toBeVisible();
  await expect(draft.getByLabel('Name *', { exact: true })).toHaveValue('Keep this unsaved draft');
  assert.equal(await peer.evaluate(() => window.realtimePageSentinel), 'same-page');
  app.assertSafe();
});

test('a mocked Purchasing receipt post updates the open Warehouse stock and expanded movements through Socket.IO', { timeout: 60000 }, async t => {
  let quantity = '1.000000';
  let app;
  app = await mockBrowser(t, async ({ method, pathname, system }) => {
    if (method === 'GET' && pathname === '/api/auth/session') return { json: { user: actor(system) } };
    if (method === 'GET' && system === 'purchasing') return { json: pathname.endsWith('options') ? {} : { records: [] } };
    if (method === 'GET' && pathname === '/api/inventory') return { json: { records: [{ id: 1, suppliesId: 30, code: 'S-TEST', name: 'Realtime paper', description: 'Paper roll', category: 'Raw materials', unit: 'kg', quantity, warehouseId: 200, locationId: 300, warehouseCode: 'WH-TEST', locationCode: 'LOC-TEST', imLot: 'LOT-TEST' }] } };
    if (method === 'GET' && pathname === '/api/inventory/movements') return { json: { records: [{ id: 1, receiptNumber: quantity === '1.000000' ? 'SRR-FIRST' : 'SRR-REALTIME', quantity, warehouseCode: 'WH-TEST', locationCode: 'LOC-TEST', imLot: 'LOT-TEST', receivedDate: '2026-11-13' }] } };
    if (method === 'POST' && pathname === '/api/receivings/1/post') {
      quantity = '5.000000';
      app.emitChange('PurchasingSystem', ['receivings']);
      app.emitChange('WarehouseSystem', ['inventory']);
      return { json: { record: { id: 1, status: 'posted' } } };
    }
  }, { project: 'PurchasingSystem', realtime: true });
  await app.page.goto(app.origin);
  const warehouseOrigin = await app.projectOrigin('WarehouseSystem');
  const warehouse = await app.page.context().newPage();
  await warehouse.goto(warehouseOrigin);
  await expect.poll(() => app.realtimeClients('WarehouseSystem')).toBe(1);
  await expect(warehouse.getByText('Realtime paper', { exact: true }).filter({ visible: true })).toBeVisible();
  await warehouse.getByRole('button', { name: 'View stock', exact: true }).click();
  await expect(warehouse.getByText('SRR-FIRST', { exact: true }).filter({ visible: true })).toBeVisible();
  await warehouse.evaluate(() => { window.realtimePageSentinel = 'warehouse-open'; });
  await app.page.evaluate(async () => { const response = await fetch('/api/purchasing/receivings/1/post', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }); if (!response.ok) throw new Error('Mock post failed'); });
  await expect(warehouse.getByText('SRR-REALTIME', { exact: true }).filter({ visible: true })).toBeVisible();
  await expect(warehouse.getByRole('button', { name: 'Hide stock', exact: true })).toBeVisible();
  await expect(warehouse.locator('.warehouse-summary-table > tbody > tr').first().locator('td').nth(4)).toHaveText('5');
  assert.equal(await warehouse.evaluate(() => window.realtimePageSentinel), 'warehouse-open');
  app.assertSafe();
});

test('Configuration realtime refresh preserves a master form draft while another view adds a record', { timeout: 60000 }, async t => {
  const modules = loadApi('configuration').configurationMetadata();
  const records = [];
  let app;
  app = await mockBrowser(t, async ({ method, pathname, body }) => {
    if (method === 'GET' && pathname === '/api/auth/session') return { json: { user: actor('configuration') } };
    if (method === 'GET' && pathname === '/api/configuration') return { json: { modules } };
    if (method === 'GET' && pathname === '/api/configuration/atc') return { json: { records } };
    if (method === 'POST' && pathname === '/api/configuration/atc') {
      records.push({ id: 1, code: body.code, description: 'Realtime reference', isActive: true });
      app.emitChange('ConfigurationSystem', ['masters']);
      return { json: { record: records[0] } };
    }
  }, { project: 'ConfigurationSystem', realtime: true });
  const peer = await app.page.context().newPage();
  await Promise.all([app.page.goto(app.origin), peer.goto(app.origin)]);
  await expect.poll(() => app.realtimeClients('ConfigurationSystem')).toBe(2);
  await peer.getByRole('button', { name: 'New record', exact: false }).click();
  const draft = peer.getByRole('dialog');
  const codeInput = draft.locator('input[name="code"]');
  await codeInput.fill('UNSAVED');
  await peer.evaluate(() => { window.realtimePageSentinel = 'configuration-open'; });
  await app.page.evaluate(async () => { const response = await fetch('/api/configuration/masters/atc', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: 'ATC-RT' }) }); if (!response.ok) throw new Error('Mock save failed'); });
  await expect(peer.locator('.records-table').getByText('ATC-RT', { exact: true })).toBeVisible();
  await expect(codeInput).toHaveValue('UNSAVED');
  assert.equal(await peer.evaluate(() => window.realtimePageSentinel), 'configuration-open');
  app.assertSafe();
});
