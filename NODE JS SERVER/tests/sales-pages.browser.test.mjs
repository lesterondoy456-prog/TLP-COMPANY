import assert from 'node:assert/strict';
import test from 'node:test';
import { expect } from '@playwright/test';
import { mockBrowser } from './helpers/mock-browser.mjs';

test('named Invoice, Shipping Invoice and Delivery Receipt pages save and view mocked documents on desktop and mobile', { timeout: 60_000 }, async t => {
  const actor = { id: 1, system: 'sales', name: 'Mock Administrator', username: 'mock_admin', role: 'admin', isActive: true };
  const customer = { id: 2, code: 'C-MOCK', name: 'Mock Customer', address: 'Office Address', contactPerson: 'Receiver', isActive: true };
  const product = { id: 3, sku: 'P3', name: 'Product', unit: 'PCS', price: '0.115300', currency: 'USD', stock: 5, isActive: true };
  const item = { productId: 3, productName: 'Product', sku: 'P3', unit: 'PCS', quantity: 2, unitPrice: '0.115300', lineTotal: '0.23' };
  const order = { id: 7, number: 'SO-MOCK', customerId: 2, customerName: customer.name, customerAddress: customer.address, currency: 'USD', orderDate: '2026-11-13', total: '0.23', status: 'confirmed', invoiced: false, delivered: false, items: [item] };
  const invoices = [], shipments = [], deliveries = [], writes = [];
  const { page, origin, assertSafe } = await mockBrowser(t, async ({ method, pathname, body }) => {
    if (method === 'GET' && pathname === '/api/auth/session') return { json: { user: actor } };
    const lists = { '/api/customers': [customer], '/api/products': [product], '/api/sales-orders': [order], '/api/sales-invoices': invoices, '/api/shipping-invoices': shipments, '/api/delivery-receipts': deliveries, '/api/users': [actor] };
    if (method === 'GET' && lists[pathname]) return { json: { records: lists[pathname] } };
    for (const [path, records] of [['/api/sales-invoices/', invoices], ['/api/shipping-invoices/', shipments], ['/api/delivery-receipts/', deliveries]]) {
      if (method === 'GET' && pathname.startsWith(path)) return { json: { record: records.find(row => String(row.id) === pathname.slice(path.length)) } };
    }
    if (method === 'POST' && pathname === '/api/sales-invoices') {
      writes.push({ pathname, body }); order.invoiced = true;
      const record = { ...body, id: 9, number: 'INV-MOCK', orderId: 7, orderNumber: order.number, customerName: customer.name, customerAddress: customer.address, currency: 'USD', total: order.total, paidAmount: '0.00', status: 'unpaid', items: [item] };
      invoices.push(record); return { status: 201, json: { record } };
    }
    if (method === 'POST' && pathname === '/api/shipping-invoices') {
      writes.push({ pathname, body });
      const record = { ...body, id: 11, number: 'SHI-MOCK', orderId: 7, orderNumber: order.number, invoiceNumber: 'INV-MOCK', customerName: customer.name, customerAddress: customer.address, currency: 'USD', total: order.total, items: [item] };
      shipments.push(record); return { status: 201, json: { record } };
    }
    if (method === 'POST' && pathname === '/api/delivery-receipts') {
      writes.push({ pathname, body }); order.delivered = true; product.stock -= 2;
      const record = { ...body, id: 10, number: 'DR-MOCK', orderId: 7, orderNumber: order.number, customerName: customer.name, currency: 'USD', items: [item] };
      deliveries.push(record); return { status: 201, json: { record } };
    }
  }, { screenshotName: 'sales-named-pages-mocked.png' });

  await page.goto(origin);
  await expect(page.getByRole('heading', { name: 'Customer', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Invoice', exact: true }).click();
  await page.getByRole('button', { name: 'New invoice', exact: false }).click();
  let dialog = page.getByRole('dialog');
  await dialog.getByRole('combobox', { name: /^Sales order \*/ }).selectOption('7');
  await dialog.getByLabel('Invoice date *', { exact: true }).fill('2026-11-13');
  await dialog.getByLabel('Due date *', { exact: true }).fill('2026-11-13');
  await dialog.getByRole('button', { name: 'Create invoice', exact: true }).click();
  await expect(dialog).toHaveCount(0);

  await page.getByRole('button', { name: 'Shipping Invoice', exact: true }).click();
  await page.getByRole('button', { name: 'New shipping invoice', exact: false }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByRole('combobox', { name: /^Invoice \*/ }).selectOption('9');
  await dialog.getByLabel('Shipping date *', { exact: true }).fill('2026-11-13');
  await dialog.getByLabel('Carrier', { exact: true }).fill('Mock Carrier');
  await dialog.getByLabel('Tracking number', { exact: true }).fill('TRACK-MOCK');
  await dialog.getByRole('button', { name: 'Create shipping invoice', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole('button', { name: 'View', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Shipping Invoice', exact: true });
  await expect(dialog).toContainText('TRACK-MOCK');
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();

  await page.getByRole('button', { name: 'Delivery Receipt', exact: true }).click();
  await page.getByRole('button', { name: 'New delivery receipt', exact: false }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByRole('combobox', { name: /^Sales order \*/ }).selectOption('7');
  await dialog.getByLabel('Delivery date *', { exact: true }).fill('2026-11-13');
  await expect(dialog.getByLabel('Received by *', { exact: true })).toHaveValue('Receiver');
  await dialog.getByRole('button', { name: 'Create delivery receipt', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole('button', { name: 'View', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Delivery Receipt', exact: true })).toContainText('DR-MOCK');
  await page.getByRole('button', { name: 'Close', exact: true }).click();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
  await page.getByRole('button', { name: 'Shipping Invoice', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Shipping Invoice', exact: true })).toBeVisible();
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  assert.deepEqual(writes.map(write => write.pathname), ['/api/sales-invoices', '/api/shipping-invoices', '/api/delivery-receipts']);
  assertSafe();
});
