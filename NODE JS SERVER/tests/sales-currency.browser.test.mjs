import assert from 'node:assert/strict';
import test from 'node:test';
import { expect } from '@playwright/test';
import { mockBrowser } from './helpers/mock-browser.mjs';

test('USD sales preserves micro-prices, rejects mixed currencies, and displays USD invoices and payments', { timeout: 60_000 }, async t => {
  const actor = { id: 1, system: 'sales', name: 'Mock Administrator', username: 'mock_admin', role: 'admin', isActive: true, cpnumber: '', email: '', photo: '' };
  const customer = { id: 20, code: 'C-MOCK', name: 'Mock USD Customer', isActive: true };
  const products = [
    { id: 10, sku: 'USD-MICRO', name: 'USD Micro Product', unit: 'pcs', price: '0.115300', currency: 'USD', stock: 0, isActive: true },
    { id: 11, sku: 'PHP-LOCAL', name: 'PHP Product', unit: 'pcs', price: '10.000000', currency: 'PHP', stock: 0, isActive: true },
  ];
  const orders = [];
  const writes = [];
  const invoice = () => orders[0] ? { id: 1, number: 'SI-MOCK-USD', orderId: 1, orderNumber: orders[0].number, customerName: customer.name, invoiceDate: '2026-11-13', dueDate: '2026-12-13', currency: 'USD', total: '207.54', paidAmount: '0.00', status: 'unpaid', items: orders[0].items } : null;
  const { page, origin, screenshot, assertSafe } = await mockBrowser(t, async ({ method, pathname, body }) => {
    if (method === 'GET' && pathname === '/api/auth/session') return { json: { user: actor } };
    if (method === 'GET' && pathname === '/api/customers') return { json: { records: [customer] } };
    if (method === 'GET' && pathname === '/api/products') return { json: { records: products } };
    if (method === 'GET' && pathname === '/api/sales-orders') return { json: { records: orders } };
    if (method === 'GET' && pathname === '/api/sales-orders/1') return { json: { record: orders[0] } };
    if (method === 'GET' && pathname === '/api/sales-invoices') return { json: { records: invoice() ? [invoice()] : [] } };
    if (method === 'GET' && pathname === '/api/sales-invoices/1') return { json: { record: invoice() } };
    if (method === 'GET' && ['/api/delivery-receipts', '/api/shipping-invoices', '/api/users'].includes(pathname)) return { json: { records: pathname === '/api/users' ? [actor] : [] } };
    if (method === 'PATCH' && pathname === '/api/sales-invoices/1/payment') {
      writes.push({ method, pathname, body });
      return { json: { record: { ...invoice(), paidAmount: body.paidAmount } } };
    }
    if (method === 'POST' && pathname === '/api/sales-orders') {
      writes.push({ method, pathname, body });
      const record = { ...body, id: 1, number: 'SO-MOCK-USD', customerName: customer.name, currency: 'USD', total: '207.54', invoiced: true, delivered: false, items: [{ productId: 10, productName: 'USD Micro Product', sku: 'USD-MICRO', unit: 'pcs', quantity: 1800, unitPrice: '0.115300', lineTotal: '207.54' }] };
      orders.push(record);
      return { status: 201, json: { record } };
    }
  }, { project: 'SalesSystem', screenshotName: 'sales-currency-mock-last.png' });
  await page.goto(origin);
  await expect(page.getByRole('heading', { name: 'Customer', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Sales Order', exact: true }).click();
  await page.getByRole('button', { name: 'New sales order', exact: false }).click();
  let dialog = page.getByRole('dialog');
  await dialog.getByRole('combobox', { name: 'Customer *', exact: true }).selectOption('20');
  await dialog.getByLabel('Product 1', { exact: true }).selectOption('10');
  await dialog.getByLabel('Quantity 1', { exact: true }).fill('1800');
  await dialog.getByRole('combobox', { name: 'Status *', exact: true }).selectOption('confirmed');
  await expect(dialog.getByLabel('Currency', { exact: true })).toHaveValue('USD');
  await expect(dialog.getByLabel('Currency', { exact: true })).toHaveAttribute('readonly', '');
  await expect(dialog.getByLabel('Unit price 1', { exact: true })).toHaveValue('0.115300');
  const usdTotal = await page.evaluate(() => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'USD' }).format(207.54));
  await expect(dialog.locator('.order-bottom strong')).toHaveText(usdTotal);
  await screenshot('sales-usd-order-mocked.png');
  await dialog.getByRole('button', { name: '+ Add product', exact: true }).click();
  await dialog.getByLabel('Product 2', { exact: true }).selectOption('11');
  await dialog.getByRole('button', { name: 'Save sales order', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('same currency');
  assert.equal(writes.length, 0, 'Mixed currency must be rejected before submitting an order.');
  await dialog.getByRole('button', { name: 'Remove product 2', exact: true }).click();
  await expect(dialog.locator('.line-head .required-mark')).toHaveCount(3);
  await dialog.getByLabel('Unit price 1', { exact: true }).fill('');
  await dialog.locator('form').evaluate(form => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  await expect(dialog.getByRole('alert')).toContainText('Enter a quantity and unit price');
  assert.equal(writes.length, 0, 'A blank unit price must be rejected before numeric conversion or a request.');
  await dialog.getByLabel('Unit price 1', { exact: true }).fill('0');
  assert.equal(await dialog.getByLabel('Unit price 1', { exact: true }).evaluate(input => input.checkValidity()), true, 'A numeric zero price remains valid.');
  await dialog.getByLabel('Unit price 1', { exact: true }).fill('0.115300');
  await dialog.getByRole('button', { name: 'Save sales order', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].body.currency, 'USD');
  assert.deepEqual(writes[0].body.items, [{ productId: 10, quantity: 1800, unitPrice: 0.1153 }]);
  await page.getByRole('button', { name: 'Invoice', exact: true }).click();
  await page.getByRole('button', { name: 'View', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Invoice', exact: true });
  await expect(dialog.locator('.document-totals')).toContainText(usdTotal);
  await expect(dialog.getByRole('cell', { name: /0\.1153/ })).toBeVisible();
  assert.equal((await dialog.innerText()).includes('₱'), false, 'USD documents must not be formatted as PHP.');
  await screenshot('sales-usd-invoice-mocked.png');
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'Payment', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Record payment', exact: true });
  await expect(dialog.getByLabel(/^Total received to date \(USD\)/)).toBeVisible();
  await expect(dialog.locator('.document-summary')).toContainText(usdTotal);
  assert.equal((await dialog.innerText()).includes('₱'), false);
  const received = dialog.getByLabel(/^Total received to date \(USD\)/);
  await received.fill('');
  await dialog.locator('form').evaluate(form => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  await expect(dialog.getByRole('alert')).toContainText('Total received to date is required.');
  assert.equal(writes.length, 1, 'A blank payment must not be converted to zero and submitted.');
  await received.fill('0');
  await dialog.getByRole('button', { name: 'Save payment', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  assert.equal(writes.at(-1).pathname, '/api/sales-invoices/1/payment');
  assert.equal(writes.at(-1).body.paidAmount, 0, 'An explicit numeric zero remains valid.');
  assertSafe();
});
