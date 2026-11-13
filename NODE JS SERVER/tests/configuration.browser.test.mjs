import assert from 'node:assert/strict';
import test from 'node:test';
import { expect } from '@playwright/test';
import { configurationMetadata, validateConfiguration } from '../configuration.js';
import { mockBrowser } from './helpers/mock-browser.mjs';

async function configurationPage(t, role) {
  const actor = { id: 1, system: 'configuration', name: 'Mock ' + role, username: 'mock_' + role, role, isActive: true, cpnumber: '', email: '', photo: '' };
  const state = { currencies: [], countries: [{ id: 20, name: 'Mock Country', isActive: true, deletedDate: null }], 'audit-trail': [{ id: 501, userName: actor.name, module: 'currencies', action: 'create', recordId: '101', createdAt: '2026-11-13T00:00:00.000Z' }] };
  const writes = [];
  let rejectNext = false;
  const browser = await mockBrowser(t, async ({ method, pathname, body }) => {
    if (method === 'GET' && pathname === '/api/auth/session') return { json: { user: actor } };
    if (method === 'GET' && pathname === '/api/configuration') return { json: { modules: configurationMetadata() } };
    const match = pathname.match(/^\/api\/configuration\/([^/]+)(?:\/(\d+))?$/);
    if (match) {
      const [, kind, rawId] = match;
      if (method === 'GET') return { json: { records: state[kind] || [] } };
      if (['POST', 'PUT'].includes(method)) {
        writes.push({ method, pathname, body });
        if (rejectNext) { rejectNext = false; return { status: 409, json: { message: 'Mock currency code already exists.' } }; }
        const records = state[kind] ||= [];
        const id = rawId ? Number(rawId) : 101;
        const index = records.findIndex(row => row.id === id);
        const values = validateConfiguration(kind, body, records[index]);
        const record = { ...values, id, deletedDate: values.isActive ? null : '2026-11-13T00:00:00.000Z' };
        if (index === -1) records.push(record); else records[index] = record;
        return { status: method === 'POST' ? 201 : 200, json: { record } };
      }
    }
    if (method === 'GET' && ['/api/customers', '/api/products', '/api/sales-orders', '/api/sales-invoices', '/api/delivery-receipts', '/api/shipping-invoices', '/api/users'].includes(pathname)) return { json: { records: [] } };
  }, { project: 'ConfigurationSystem', screenshotName: `configuration-${role}-mocked.png` });
  await browser.page.goto(browser.origin);
  await expect(browser.page.getByRole('heading', { name: 'ATC', exact: true, level: 1 })).toBeVisible();
  for (const title of ['Customer', 'Product', 'PR Monitoring', 'Supplies Stock']) await expect(browser.page.getByRole('button', { name: title, exact: true })).toHaveCount(0);
  await expect(browser.page.getByRole('button', { name: 'Production', exact: true })).toHaveCount(0);
  await expect(browser.page.getByRole('searchbox', { name: 'Search sales modules', exact: true })).toHaveCount(0);
  return { ...browser, writes, state, rejectOnce: () => { rejectNext = true; } };
}

test('configuration metadata forms preserve failed input, save, and soft deactivate for Admin only', { timeout: 60_000 }, async t => {
  const { page, writes, state, rejectOnce, assertSafe } = await configurationPage(t, 'admin');
  await page.getByRole('button', { name: 'Currency', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Currency', exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'New record', exact: false }).click();
  const dialog = page.getByRole('dialog', { name: 'New Currency', exact: true });
  for (const label of ['Name *', 'Short Name *', 'Check Name', 'Symbol']) await expect(dialog.getByLabel(label, { exact: true })).toBeVisible();
  await dialog.getByLabel('Name *', { exact: true }).fill('Philippine Peso');
  await dialog.getByLabel('Short Name *', { exact: true }).fill('PHP');
  await dialog.getByLabel('Check Name', { exact: true }).fill('PESO');
  await dialog.getByLabel('Symbol', { exact: true }).fill('₱');
  await dialog.getByRole('checkbox', { name: 'Default', exact: true }).check();
  const save = dialog.getByRole('button', { name: 'Save record', exact: true });
  rejectOnce();
  await save.click();
  await expect(dialog.getByRole('alert')).toHaveText('Mock currency code already exists.');
  await expect(save).toBeEnabled();
  await expect(dialog.getByLabel('Check Name', { exact: true })).toHaveValue('PESO');
  assert.equal(state.currencies.length, 0);
  await save.click();
  await expect(dialog).toHaveCount(0);
  assert.equal(writes.length, 2);
  assert.deepEqual(writes[1].body, { name: 'Philippine Peso', shortName: 'PHP', checkName: 'PESO', symbol: '₱', isDefault: true, isActive: true });
  const row = page.getByRole('row').filter({ hasText: 'Philippine Peso' });
  await row.getByRole('button', { name: 'Deactivate', exact: true }).click();
  await expect(row.getByRole('button', { name: 'Activate', exact: true })).toBeVisible();
  assert.equal(state.currencies[0].isActive, false);
  assert.ok(state.currencies[0].deletedDate);
  await page.getByLabel('Configuration status', { exact: true }).selectOption('inactive');
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: 'Activate', exact: true }).click();
  await page.getByLabel('Configuration status', { exact: true }).selectOption('all');
  await expect(row.getByRole('button', { name: 'Deactivate', exact: true })).toBeVisible();
  assert.equal(state.currencies[0].isActive, true);
  assert.equal(state.currencies[0].deletedDate, null);
  await page.getByRole('button', { name: 'Audit Trail', exact: true }).click();
  await expect(page.getByRole('cell', { name: 'currencies', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'New record', exact: false })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Edit', exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Configuration status', { exact: true })).toHaveCount(0);
  assertSafe();
});

test('Configuration worker can read records without maintenance controls or writes', { timeout: 45_000 }, async t => {
  const { page, writes, assertSafe } = await configurationPage(t, 'configuration');
  await page.getByRole('button', { name: 'Country', exact: true }).click();
  await expect(page.getByRole('cell', { name: 'Mock Country', exact: true })).toBeVisible();
  for (const name of ['New record', 'Edit', 'Activate', 'Deactivate']) await expect(page.getByRole('button', { name, exact: name !== 'New record' })).toHaveCount(0);
  assert.deepEqual(writes, []);
  assertSafe();
});
