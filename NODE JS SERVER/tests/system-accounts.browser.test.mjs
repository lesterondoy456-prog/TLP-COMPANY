import { loadApi } from './helpers/load-api.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { expect } from '@playwright/test';
const { configurationMetadata } = loadApi('configuration');
import { mockBrowser } from './helpers/mock-browser.mjs';

const systems = [
  { project: 'PurchasingSystem', system: 'purchasing', title: 'PR Monitoring', manager: 'PurchasingUserLogin', label: 'Purchasing' },
  { project: 'WarehouseSystem', system: 'warehouse', title: 'Supplies Stock', manager: 'WarehouseUserLogin', label: 'Warehouse' },
  { project: 'ConfigurationSystem', system: 'configuration', title: 'ATC', manager: 'ConfigurationUserLogin', label: 'Configuration' },
];
const password = 'Mock12';

for (const settings of systems) {
  test(`${settings.project} authenticates and manages only its own account roles`, { timeout: 60_000 }, async t => {
    const accounts = [
      { id: 1, name: 'Mock Local Administrator', username: 'same_admin', role: 'admin' },
      { id: 2, name: 'Mock Local Worker', username: 'local_worker', role: settings.system },
    ].map(account => ({ system: settings.system, isActive: true, cpnumber: '', email: '', photo: '', ...account }));
    let actor = null;
    const writes = [];
    const { page, origin, apiRequests, assertSafe } = await mockBrowser(t, async ({ method, pathname, body }) => {
      if (method === 'GET' && pathname === '/api/auth/session') return actor ? { json: { user: actor } } : { status: 401, json: { message: 'Sign in to this system.' } };
      if (method === 'POST' && pathname === '/api/auth/login') {
        const account = accounts.find(record => record.username === body.username);
        if (!account || body.password !== password) return { status: 401, json: { message: 'Invalid local credentials.' } };
        actor = account;
        return { json: { user: actor } };
      }
      if (method === 'POST' && pathname === '/api/auth/logout') { actor = null; return { json: { success: true } }; }
      if (method === 'PUT' && pathname === '/api/auth/profile') {
        writes.push({ method, pathname, body });
        actor = { ...actor, ...body };
        return { json: { user: actor } };
      }
      if (method === 'GET' && pathname === '/api/users') return actor?.role === 'admin'
        ? { json: { records: [...accounts, { ...accounts[0], system: 'sales', name: 'Foreign Sales Administrator' }] } }
        : { status: 403, json: { message: 'Local administrators only.' } };
      const accountMatch = pathname.match(/^\/api\/users(?:\/(\d+))?$/);
      if (accountMatch && ['POST', 'PUT'].includes(method)) {
        if (actor?.role !== 'admin' || !['admin', settings.system].includes(body.role)) return { status: 403, json: { message: 'Invalid local account role.' } };
        writes.push({ method, pathname, body });
        const id = accountMatch[1] ? Number(accountMatch[1]) : 100 + accounts.length;
        const index = accounts.findIndex(record => record.id === id);
        const { password: ignoredPassword, ...profile } = body;
        const record = { ...(accounts[index] || {}), ...profile, id, system: settings.system };
        if (index === -1) accounts.push(record); else accounts[index] = record;
        return { status: method === 'POST' ? 201 : 200, json: { record } };
      }
      if (method === 'GET' && accountMatch?.[1]) return { json: { record: accounts.find(record => record.id === Number(accountMatch[1])) } };
      if (method === 'GET' && pathname === '/api/configuration') return { json: { modules: configurationMetadata() } };
      if (method === 'GET' && pathname.startsWith('/api/configuration/')) return { json: { records: [] } };
      if (method === 'GET' && pathname === '/api/purchasing-options') return { json: { suppliers: [], supplies: [], users: [], products: [], offices: [], units: [], currencies: [], paymentTerms: [], vatCodes: [], taxCodes: [], countries: [], suppliesCategories: [], warehouses: [], locations: [] } };
      if (method === 'GET' && ['/api/suppliers', '/api/supplies', '/api/purchase-requests', '/api/purchase-orders', '/api/receivings', '/api/inventory'].includes(pathname)) return { json: { records: [] } };
    }, { project: settings.project, screenshotName: `${settings.system}-own-accounts-mocked.png` });

    await page.goto(origin);
    const signIn = page.getByRole('button', { name: 'Sign in', exact: true });
    await expect(signIn).toBeVisible();
    const login = async username => {
      await page.getByLabel('Username', { exact: true }).fill(username);
      await page.getByLabel('Password', { exact: true }).fill(password);
      await signIn.click();
      await expect(page.getByRole('heading', { name: settings.title, exact: true, level: 1 })).toBeVisible();
    };
    await login('same_admin');
    for (const other of ['SalesUserLogin', ...systems.filter(item => item.system !== settings.system).map(item => item.manager)]) await expect(page.getByRole('button', { name: other, exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: settings.manager, exact: true }).click();
    await expect(page.getByRole('heading', { name: settings.manager, exact: true, level: 1 })).toBeVisible();
    await expect(page.getByRole('cell', { name: /Foreign Sales Administrator/ })).toHaveCount(0);
    for (const role of ['admin', settings.system]) {
      await page.getByRole('button', { name: 'New user', exact: false }).click();
      const dialog = page.getByRole('dialog');
      await expect(dialog.getByRole('checkbox', { name: 'Account is active', exact: true })).toHaveCount(0);
      const select = dialog.getByRole('combobox', { name: 'Role *', exact: true });
      assert.deepEqual(await select.locator('option').evaluateAll(options => options.map(option => option.value).sort()), ['admin', settings.system].sort());
      await dialog.getByLabel('Full name *', { exact: true }).fill('New ' + role);
      await dialog.getByLabel(/^Username \*/).fill('new_' + role);
      await select.selectOption(role);
      if (role === 'admin') {
        const previousWrites = writes.length;
        await dialog.getByLabel(/^Password \*/).fill('Mock1');
        await dialog.getByRole('button', { name: 'Save user', exact: true }).click();
        await expect(dialog).toBeVisible();
        assert.equal(writes.length, previousWrites, 'Five-character passwords must not submit an account.');
      }
      await dialog.getByLabel(/^Password \*/).fill(password);
      await dialog.getByRole('button', { name: 'Save user', exact: true }).click();
      await expect(dialog).toHaveCount(0);
      assert.equal(writes.at(-1).body.role, role);
      assert.equal(writes.at(-1).body.isActive, true, 'New accounts must start active.');
      assert.equal(writes.at(-1).body.password, password, 'Exactly six characters must be accepted for new accounts.');
      for (const key of ['cpnumber', 'email', 'photo']) assert.equal(writes.at(-1).body[key], null, 'Blank optional account fields must submit NULL.');
    }
    await page.getByRole('row').filter({ hasText: 'Mock Local Worker' }).getByRole('button', { name: 'Edit', exact: true }).click();
    const edit = page.getByRole('dialog');
    const active = edit.getByRole('checkbox', { name: 'Account is active', exact: true });
    await expect(active).toBeChecked();
    await active.uncheck();
    await edit.getByLabel('Full name *', { exact: true }).fill('Edited Local Worker');
    await edit.getByRole('button', { name: 'Save user', exact: true }).click();
    await expect(edit).toHaveCount(0);
    assert.equal(writes.at(-1).method, 'PUT');
    assert.equal(writes.at(-1).body.role, settings.system);
    assert.equal(writes.at(-1).body.isActive, false, 'Existing accounts can be made inactive.');
    assert.equal(Object.hasOwn(writes.at(-1).body, 'password'), false);

    await page.getByRole('row').filter({ hasText: 'Edited Local Worker' }).getByRole('button', { name: 'Edit', exact: true }).click();
    const reset = page.getByRole('dialog');
    await expect(reset.getByRole('checkbox', { name: 'Account is active', exact: true })).not.toBeChecked();
    await reset.getByRole('checkbox', { name: 'Account is active', exact: true }).check();
    await reset.getByLabel(/^New password \(optional\)/).fill(password);
    await reset.getByRole('button', { name: 'Save user', exact: true }).click();
    await expect(reset).toHaveCount(0);
    assert.equal(writes.at(-1).method, 'PUT');
    assert.equal(writes.at(-1).body.isActive, true);
    assert.equal(writes.at(-1).body.password, password, 'Exactly six characters must be accepted when resetting passwords.');

    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(signIn).toBeVisible();
    const workerStart = apiRequests.length;
    await login('local_worker');
    await expect(page.getByRole('button', { name: settings.manager, exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: /Edited Local Worker/ }).click();
    const profile = page.getByRole('dialog', { name: 'My profile', exact: true });
    await expect(profile.getByLabel('Role', { exact: true })).toHaveValue(settings.label);
    await expect(profile.getByLabel('Role', { exact: true })).toBeDisabled();
    await profile.getByRole('button', { name: 'Save profile', exact: true }).click();
    await expect(profile).toHaveCount(0);
    for (const key of ['cpnumber', 'email', 'photo']) assert.equal(writes.at(-1).body[key], null, 'Blank optional profile fields must submit NULL.');
    assert.equal(Object.hasOwn(writes.at(-1).body, 'role'), false);
    assert.equal(apiRequests.slice(workerStart).some(call => call.pathname === '/api/users'), false, 'Workers must not load the account manager.');
    assert.equal(writes.length, 5);
    assert.ok(apiRequests.every(call => call.system === settings.system && call.requestPathname.startsWith(`/api/${settings.system}/`)));
    assertSafe();
  });
}

test('every app rejects foreign and unscoped identities from session and login responses', { timeout: 60_000 }, async t => {
  const settings = [
    { project: 'SalesSystem', system: 'sales', title: 'Customer' },
    ...systems,
  ];
  let identityMode = 'foreign';
  const { page, origin, gotoProject, apiRequests, assertSafe } = await mockBrowser(t, async ({ system, method, pathname }) => {
    if ((pathname === '/api/auth/session' && method === 'GET') || (pathname === '/api/auth/login' && method === 'POST')) {
      const user = { id: 1, name: 'Wrong System Administrator', username: 'same_admin', role: 'admin', isActive: true, cpnumber: '', email: '', photo: '' };
      if (identityMode === 'foreign') user.system = system === 'sales' ? 'purchasing' : 'sales';
      return { json: { user } };
    }
  }, { project: 'SalesSystem', screenshotName: 'wrong-system-identities-rejected-mocked.png' });
  for (const [index, app] of settings.entries()) {
    for (const mode of ['foreign', 'unscoped']) {
      identityMode = mode;
      if (index === 0 && mode === 'foreign') await page.goto(origin); else await gotoProject(app.project);
      const signIn = page.getByRole('button', { name: 'Sign in', exact: true });
      await expect(signIn).toBeVisible();
      await expect(page.getByRole('heading', { name: app.title, exact: true, level: 1 })).toHaveCount(0);
      await page.getByLabel('Username', { exact: true }).fill('same_admin');
      await page.getByLabel('Password', { exact: true }).fill(password);
      await signIn.click();
      await expect(signIn).toBeEnabled();
      await expect(page.getByRole('alert')).toBeVisible();
      await expect(page.getByRole('heading', { name: app.title, exact: true, level: 1 })).toHaveCount(0);
    }
  }
  assert.ok(apiRequests.every(call => ['/api/auth/session', '/api/auth/login'].includes(call.pathname)), 'A wrong-system identity must never load business or account records.');
  assertSafe();
});
