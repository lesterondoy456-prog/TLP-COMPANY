import assert from 'node:assert/strict';
import test from 'node:test';
import { expect } from '@playwright/test';
import { mockBrowser } from './helpers/mock-browser.mjs';

const baseAccounts = [
  { id: 1, name: 'Mock Administrator', username: 'mock_admin', role: 'admin' },
  { id: 2, name: 'Mock Sales Head', username: 'mock_head', role: 'saleshead' },
  { id: 3, name: 'Mock Sales User', username: 'mock_sales', role: 'sales' },
].map(account => ({ cpnumber: '', email: '', photo: '', isActive: true, ...account }));
const roleLabels = { admin: 'Administrator', saleshead: 'Sales Head', sales: 'Sales' };

async function workspace(t, actorRole) {
  const accounts = structuredClone(baseAccounts);
  const actor = accounts.find(account => account.role === actorRole);
  const writes = [];
  const browser = await mockBrowser(t, async ({ method, pathname, body }) => {
    if (method === 'GET' && pathname === '/api/auth/session') return { json: { user: actor } };
    if (method === 'GET' && pathname === '/api/users') {
      // Return mixed roles deliberately: the Sales Head UI must still show Sales only.
      return actorRole === 'sales' ? { status: 403, json: { message: 'No account access.' } } : { json: { records: accounts } };
    }
    if (method === 'GET' && ['/api/customers', '/api/products', '/api/sales-orders', '/api/sales-invoices', '/api/delivery-receipts', '/api/shipping-invoices'].includes(pathname)) return { json: { records: [] } };
    if (method === 'POST' && pathname === '/api/users') {
      writes.push({ method, pathname, body });
      const { password, ...profile } = body;
      const record = { id: accounts.length + 100, ...profile };
      accounts.push(record);
      return { status: 201, json: { record } };
    }
    if (method === 'PUT' && /^\/api\/users\/\d+$/.test(pathname)) {
      writes.push({ method, pathname, body });
      const index = accounts.findIndex(account => account.id === Number(pathname.split('/').pop()));
      const { password, ...profile } = body;
      const record = { ...accounts[index], ...profile };
      accounts[index] = record;
      return { json: { record } };
    }
  }, { screenshotName: `user-roles-${actorRole}-mocked.png` });
  await browser.page.goto(browser.origin);
  await expect(browser.page.getByRole('heading', { name: 'Customer', exact: true })).toBeVisible();
  await expect(browser.page.getByRole('button', { name: 'Refresh records', exact: true })).toBeEnabled();
  return { ...browser, actor, writes, accounts };
}

async function profileRole(page, actor, label) {
  await page.getByRole('button', { name: new RegExp(actor.name) }).click();
  const profile = page.getByRole('dialog', { name: 'My profile', exact: true });
  await expect(profile.getByLabel('Role', { exact: true })).toHaveValue(label);
  await expect(profile.getByLabel('Role', { exact: true })).toBeDisabled();
  await profile.getByRole('button', { name: 'Cancel', exact: true }).click();
}

async function fillNewAccount(dialog, suffix) {
  await dialog.getByLabel('Full name *', { exact: true }).fill('Mock New ' + suffix);
  await dialog.getByLabel(/^Username \*/).fill('mock_new_' + suffix);
  await dialog.getByLabel(/^Password \*/).fill('Mock-Password-Only-123');
}

test('admin can create all three account roles and edit existing accounts', { timeout: 60_000 }, async t => {
  const { page, actor, writes, assertSafe } = await workspace(t, 'admin');
  await profileRole(page, actor, 'Administrator');
  await page.getByRole('button', { name: 'SalesUserLogin', exact: true }).click();
  for (const label of Object.values(roleLabels)) await expect(page.getByRole('cell', { name: label, exact: true })).toBeVisible();
  for (const role of ['admin', 'saleshead', 'sales']) {
    await page.getByRole('button', { name: 'New user', exact: false }).click();
    const dialog = page.getByRole('dialog');
    const roleSelect = dialog.getByRole('combobox', { name: 'Role *', exact: true });
    await expect(roleSelect).toBeEnabled();
    assert.deepEqual(await roleSelect.locator('option').evaluateAll(options => options.map(option => option.value).sort()), ['admin', 'sales', 'saleshead']);
    await fillNewAccount(dialog, role);
    await roleSelect.selectOption(role);
    await dialog.getByRole('button', { name: 'Save user', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Refresh records', exact: true })).toBeEnabled();
    assert.equal(writes.at(-1).method, 'POST');
    assert.equal(writes.at(-1).body.role, role);
  }
  await page.getByRole('row').filter({ hasText: 'Mock Sales User' }).getByRole('button', { name: 'Edit', exact: true }).click();
  const edit = page.getByRole('dialog');
  await edit.getByLabel('Full name *', { exact: true }).fill('Edited Sales User');
  await edit.getByRole('combobox', { name: 'Role *', exact: true }).selectOption('saleshead');
  await edit.getByRole('button', { name: 'Save user', exact: true }).click();
  await expect(edit).toHaveCount(0);
  assert.equal(writes.length, 4);
  assert.equal(writes.at(-1).method, 'PUT');
  assert.equal(writes.at(-1).pathname, '/api/users/3');
  assert.equal(writes.at(-1).body.role, 'saleshead');
  assert.equal(Object.hasOwn(writes.at(-1).body, 'password'), false, 'Editing a profile must preserve a blank optional password.');
  assertSafe();
});

test('Sales Head sees Sales accounts and creates only Sales without edit controls', { timeout: 60_000 }, async t => {
  const { page, actor, writes, assertSafe } = await workspace(t, 'saleshead');
  await profileRole(page, actor, 'Sales Head');
  await page.getByRole('button', { name: 'SalesUserLogin', exact: true }).click();
  await expect(page.getByRole('cell', { name: 'Mock Sales User', exact: false })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Mock Administrator', exact: false })).toHaveCount(0);
  await expect(page.getByRole('cell', { name: 'Mock Sales Head', exact: false })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Edit', exact: true })).toHaveCount(0);
  await expect(page.getByRole('columnheader', { name: 'Actions', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'New user', exact: false }).click();
  const dialog = page.getByRole('dialog');
  const roleSelect = dialog.getByRole('combobox', { name: 'Role *', exact: true });
  await expect(roleSelect).toBeDisabled();
  await expect(roleSelect).toHaveValue('sales');
  assert.deepEqual(await roleSelect.locator('option').evaluateAll(options => options.map(option => option.value)), ['sales']);
  await fillNewAccount(dialog, 'head_created_sales');
  // A forged DOM value still must not elevate the submitted role.
  await roleSelect.evaluate(element => {
    element.append(new Option('Forged Administrator', 'admin'));
    element.value = 'admin';
    element.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await dialog.getByRole('button', { name: 'Save user', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].method, 'POST');
  assert.equal(writes[0].body.role, 'sales');
  await expect(page.getByRole('button', { name: 'Edit', exact: true })).toHaveCount(0);
  assertSafe();
});

test('Sales has its profile role and no account-management navigation or reads', { timeout: 60_000 }, async t => {
  const { page, actor, apiRequests, writes, assertSafe } = await workspace(t, 'sales');
  await expect(page.getByRole('button', { name: 'SalesUserLogin', exact: true })).toHaveCount(0);
  await profileRole(page, actor, 'Sales');
  assert.equal(apiRequests.some(call => call.pathname === '/api/users'), false);
  assert.deepEqual(writes, []);
  assertSafe();
});
