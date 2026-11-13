import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'node:net';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { chromium, expect } from '@playwright/test';

const backend = fileURLToPath(new URL('../', import.meta.url));
process.loadEnvFile(new URL('../.env', import.meta.url));
const require = createRequire(new URL('../package.json', import.meta.url));
const sql = require('mssql/msnodesqlv8');
const database = `TLP Company Browser Test ${process.pid} ${Date.now()}`;
const password = randomBytes(24).toString('base64url');
const photo = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6H8kAAAAASUVORK5CYII=', 'base64');
const connection = name => process.env.DB_CONNECTION_STRING.replace(/\bDatabase\s*=[^;]*/i, `Database=${name}`);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

test('sales workflow through desktop and mobile browser', { timeout: 180000 }, async t => {
  const socket = createServer().listen(0, '127.0.0.1');
  await once(socket, 'listening');
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  const origin = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['server.js', '--production'], {
    cwd: backend, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), DB_NAME: database, DB_CONNECTION_STRING: connection(database), ADMIN_USERNAME: 'browser_admin', ADMIN_PASSWORD: password, ADMIN_NAME: 'Browser Administrator', SESSION_SECRET: randomBytes(48).toString('hex') },
  });
  let logs = '';
  child.stdout.on('data', value => { logs = (logs + value).slice(-4000); });
  child.stderr.on('data', value => { logs = (logs + value).slice(-4000); });
  let browser;
  let page;
  t.after(async () => {
    if (page && !page.isClosed()) await page.screenshot({ path: fileURLToPath(new URL('../.qa/screenshots/last-screen.png', import.meta.url)), fullPage: true }).catch(() => {});
    await browser?.close();
    if (child.exitCode === null && child.signalCode === null) { const stopped = once(child, 'exit'); child.kill(); await Promise.race([stopped, sleep(5000)]); }
    assert.match(database, /^TLP Company Browser Test \d+ \d+$/);
    const pool = await new sql.ConnectionPool({ connectionString: connection('master') }).connect();
    try { await pool.request().query(`IF DB_ID(N'${database}') IS NOT NULL BEGIN ALTER DATABASE [${database}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [${database}]; END;`); }
    finally { await pool.close(); }
  });
  let healthy = false;
  for (let i = 0; i < 150; i++) {
    if (child.exitCode !== null) throw new Error(logs.replaceAll(password, '[redacted]'));
    try { const result = await (await fetch(origin + '/api/health')).json(); if (result.database?.name === database && result.database?.status === 'connected') { healthy = true; break; } } catch {}
    await sleep(200);
  }
  assert.ok(healthy, 'Isolated browser test server must be ready.');
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, locale: 'en-PH', timezoneId: 'Asia/Manila' });
  page.setDefaultTimeout(10000);
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await mkdir(new URL('../.qa/screenshots/', import.meta.url), { recursive: true });
  await page.goto(origin);
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  await page.screenshot({ path: fileURLToPath(new URL('../.qa/screenshots/login.png', import.meta.url)), fullPage: true });
  await page.getByLabel('Username', { exact: true }).fill('browser_admin');
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Customer', exact: true })).toBeVisible();

  async function tab(name) {
    await page.getByRole('button', { name: new RegExp('^' + name + '(?:\\s|$)') }).click();
    await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  }
  async function save(name) {
    await page.getByRole('dialog').getByRole('button', { name, exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Refresh records', exact: true })).toBeEnabled();
  }
  await page.getByRole('button', { name: 'New customer', exact: false }).click();
  await page.getByRole('dialog').getByLabel('Name *', { exact: true }).fill('Browser Customer');
  await page.getByLabel('Short Name *', { exact: true }).fill('Browser');
  await page.getByLabel('Business Style *', { exact: true }).fill('Wholesale');
  await page.getByLabel('Contact Person', { exact: true }).fill('Sample Receiver');
  await page.getByLabel('Phone No.', { exact: true }).fill('09170000000');
  await page.getByLabel('Email Address', { exact: true }).fill('browser@example.test');
  await page.getByLabel('Office Address *', { exact: true }).fill('Manila, Philippines');
  await page.getByRole('tab', { name: 'Sales/DR', exact: true }).click();
  await page.getByLabel('Sales Name', { exact: true }).fill('Browser Customer');
  await page.getByLabel('DR Name', { exact: true }).fill('Browser Customer');
  await page.getByLabel('VAT Code *', { exact: true }).fill('VS');
  await save('Save customer');
  await expect(page.getByText('Browser Customer', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText('Browser Customer', { exact: true })).toBeVisible();

  await tab('Product');
  await page.getByRole('button', { name: 'New product', exact: false }).click();
  await page.getByLabel('Product code / SKU *', { exact: true }).fill('BROW-P001');
  await page.getByLabel('Product name *', { exact: true }).fill('Browser Product');
  await page.getByLabel('Selling price (PHP) *', { exact: true }).fill('125.50');
  await page.getByLabel('Stock on hand *', { exact: true }).fill('10');
  await save('Save record');
  await expect(page.getByText('Browser Product', { exact: true })).toBeVisible();

  await tab('Sales Order');
  await page.getByRole('button', { name: 'New sales order', exact: false }).click();
  await page.getByLabel(/^Customer \*/).selectOption({ index: 1 });
  await page.getByLabel('Product 1', { exact: true }).selectOption({ index: 1 });
  await page.getByLabel('Quantity 1', { exact: true }).fill('2');
  await page.getByLabel(/^Status \*/).selectOption('confirmed');
  await save('Save sales order');
  await expect(page.getByText('SO-00000001', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'View', exact: true }).click();
  await expect(page.getByRole('dialog').getByText('Browser Product', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close', exact: true }).click();

  await tab('Invoice');
  await page.getByRole('button', { name: 'New invoice', exact: false }).click();
  await page.getByLabel(/^Sales order \*/).selectOption({ index: 1 });
  await save('Create invoice');
  await expect(page.getByText('SI-00000001', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Payment', exact: true }).click();
  await page.getByLabel(/^Total received to date/).fill('251');
  await save('Save payment');
  await expect(page.getByText('paid', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'View', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Print document', exact: true })).toBeVisible();
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.document-brand')).toBeVisible();
  await expect(page.locator('.modal-footer')).toBeHidden();
  await page.screenshot({ path: fileURLToPath(new URL('../.qa/screenshots/invoice-print.png', import.meta.url)), fullPage: true });
  await page.emulateMedia({ media: 'screen' });
  await page.screenshot({ path: fileURLToPath(new URL('../.qa/screenshots/invoice.png', import.meta.url)), fullPage: true });
  await page.getByRole('button', { name: 'Close', exact: true }).click();

  await tab('Shipping Invoice');
  await page.getByRole('button', { name: 'New shipping invoice', exact: false }).click();
  await page.getByLabel(/^Invoice \*/).selectOption({ index: 1 });
  await page.getByLabel('Carrier', { exact: true }).fill('Browser Carrier');
  await page.getByLabel('Tracking number', { exact: true }).fill('BROW-TRACK-001');
  await save('Create shipping invoice');
  await expect(page.getByText('SHI-00000001', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'View', exact: true }).click();
  const shippingDialog = page.getByRole('dialog');
  await expect(shippingDialog.getByText('Browser Product', { exact: true })).toBeVisible();
  await expect(shippingDialog.getByText('SI-00000001', { exact: true })).toBeVisible();
  await expect(shippingDialog.getByText('Carrier: Browser Carrier', { exact: true })).toBeVisible();
  await expect(shippingDialog.getByText('Tracking: BROW-TRACK-001', { exact: true })).toBeVisible();
  await expect(shippingDialog.getByRole('button', { name: 'Print document', exact: true })).toBeVisible();
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.document-brand')).toBeVisible();
  await expect(page.locator('.modal-footer')).toBeHidden();
  await page.screenshot({ path: fileURLToPath(new URL('../.qa/screenshots/shipping-invoice-print.png', import.meta.url)), fullPage: true });
  await page.emulateMedia({ media: 'screen' });
  await page.screenshot({ path: fileURLToPath(new URL('../.qa/screenshots/shipping-invoice.png', import.meta.url)), fullPage: true });
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.screenshot({ path: fileURLToPath(new URL('../.qa/screenshots/desktop-sales-workspace.png', import.meta.url)), fullPage: true });
  await tab('Product');
  await expect(page.getByRole('row').filter({ hasText: 'Browser Product' }).getByRole('cell', { name: '10', exact: true })).toBeVisible();

  await tab('Delivery Receipt');
  await page.getByRole('button', { name: 'New delivery receipt', exact: false }).click();
  await page.getByLabel(/^Sales order \*/).selectOption({ index: 1 });
  await save('Create delivery receipt');
  await expect(page.getByText('DR-00000001', { exact: true })).toBeVisible();
  await tab('Product');
  await expect(page.getByRole('row').filter({ hasText: 'Browser Product' }).getByRole('cell', { name: '8', exact: true })).toBeVisible();

  await tab('SalesUserLogin');
  await page.getByRole('button', { name: 'New user', exact: false }).click();
  await page.getByLabel('Full name *', { exact: true }).fill('Browser Sales User');
  await page.getByLabel(/^Username \*/).fill('browser_sales');
  await page.getByLabel(/^Password \*/).fill(password);
  await page.getByLabel(/^Role \*/).selectOption('sales');
  await page.getByLabel('Profile photo', { exact: true }).setInputFiles({ name: 'photo.png', mimeType: 'image/png', buffer: photo });
  await save('Save user');
  await expect(page.getByText('Browser Sales User', { exact: true })).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
  await page.getByRole('button', { name: /Browser Administrator/ }).click();
  await expect(page.getByRole('heading', { name: 'My profile', exact: true })).toBeVisible();
  await page.getByLabel('Mobile number', { exact: true }).fill('09990000000');
  await save('Save profile');
  await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
  const salesModules = ['Customer', 'Product', 'Sales Order', 'Invoice', 'Delivery Receipt', 'Shipping Invoice'];
  await expect(page.locator('#sales-module-navigation > button')).toHaveCount(6);
  for (const name of salesModules) {
    await expect(page.getByRole('button', { name: new RegExp('^' + name + '(?:\\s|$)') })).toBeVisible();
  }
  const salesGroup = page.getByRole('button', { name: 'Sales', exact: true });
  await salesGroup.click();
  await expect(salesGroup).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('button', { name: 'Shipping Invoice', exact: true })).toBeHidden();
  await salesGroup.click();
  await expect(salesGroup).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('searchbox', { name: 'Search sales modules', exact: true })).toHaveCount(0);
  await expect(page.locator('#sales-module-navigation > button')).toHaveCount(6);
  await page.screenshot({ path: fileURLToPath(new URL('../.qa/screenshots/mobile-sales-menu.png', import.meta.url)), fullPage: true });
  await tab('Customer');
  await expect.poll(() => page.locator('.sidebar').evaluate(element => element.getBoundingClientRect().right)).toBeLessThanOrEqual(0);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  assert.equal(overflow, false, 'Mobile viewport must not horizontally overflow.');
  await page.screenshot({ path: fileURLToPath(new URL('../.qa/screenshots/mobile.png', import.meta.url)), fullPage: true });
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  await page.getByLabel('Username', { exact: true }).fill('browser_sales');
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Customer', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
  await expect(page.getByRole('button', { name: 'SalesUserLogin', exact: true })).toHaveCount(0);
  for (const name of salesModules) {
    await expect(page.getByRole('button', { name: new RegExp('^' + name + '(?:\\s|$)') })).toBeVisible();
  }
  assert.deepEqual(pageErrors, [], 'Browser must have no uncaught application errors.');
});
