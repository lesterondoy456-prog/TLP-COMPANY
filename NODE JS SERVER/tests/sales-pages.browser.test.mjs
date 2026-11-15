import assert from 'node:assert/strict';
import test from 'node:test';
import { expect } from '@playwright/test';
import { mockBrowser } from './helpers/mock-browser.mjs';

test('named Invoice, Shipping Invoice and Delivery Receipt pages save and view mocked documents on desktop and mobile', { timeout: 60_000 }, async t => {
  const actor = { id: 1, system: 'sales', name: 'Mock Administrator', username: 'mock_admin', role: 'admin', isActive: true };
  const customer = { id: 2, name: 'Mock Customer', address: 'Office Address', contactPerson: 'Receiver', isActive: true };
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

test('Customer monitoring shows CAS details with one labeled address column and contained mobile scrolling', { timeout: 60_000 }, async t => {
  const actor = { id: 1, system: 'sales', name: 'Mock Administrator', username: 'mock_admin', role: 'admin', isActive: true };
  const customer = {
    id: 2, code: 'C-LEGACY-HIDDEN', name: 'Aster Packaging Corporation', shortName: 'Aster', businessStyle: 'Manufacturing and trading',
    address: 'Building 3, Industrial Estate\nSanta Rosa, Laguna, Philippines',
    deliveryAddresses: ['Warehouse Gate 2, Packaging Avenue, Calamba, Laguna', 'Distribution Hub, Export Drive, Cabuyao, Laguna'],
    salesAddressType: 'office', drAddressType: 'delivery', tin: '001-023-045-000', contactPerson: 'Mock Purchasing Contact',
    cpnumber: '09171234567', faxNo: '049-555-0101', countryOfOrigin: 'Japan', country: 'Philippines', email: 'orders@aster.test',
    paymentTerm: '30 DAYS', category: 'Local Sales', decimalInPrice: 0, decimalInTotalPrice: 4,
    vatInclusive: false, vatCode: 'VS', taxCode: 'WC010', lastSalesDate: '2026-11-13',
    remarks: 'Deliver before 10 AM.\nContact the receiving desk on arrival.', isActive: true,
  };
  const empty = {
    id: 3, name: 'Empty Field Customer', isActive: false, address: null, deliveryAddresses: null,
    salesAddressType: 'delivery', drAddressType: 'office', decimalInPrice: null, decimalInTotalPrice: null, vatInclusive: null, lastSalesDate: null,
  };
  const officeOnly = { id: 4, name: 'Office Only Customer', address: 'Main office, Santa Rosa, Laguna', deliveryAddresses: [], salesAddressType: 'office', drAddressType: 'office', isActive: true };
  const { page, origin, screenshot, apiRequests, assertSafe } = await mockBrowser(t, async ({ method, pathname }) => {
    if (method !== 'GET') throw new Error('Customer monitoring checks must never save records.');
    if (pathname === '/api/auth/session') return { json: { user: actor } };
    if (pathname === '/api/customers') return { json: { records: [customer, empty, officeOnly] } };
    if (['/api/products', '/api/sales-orders', '/api/sales-invoices', '/api/delivery-receipts', '/api/shipping-invoices', '/api/users'].includes(pathname)) return { json: { records: pathname === '/api/users' ? [actor] : [] } };
  }, { project: 'SalesSystem', viewport: { width: 1440, height: 1000 }, screenshotName: 'customer-monitor-last.png' });
  await page.goto(origin);
  await expect(page.getByRole('heading', { name: 'Customer', level: 1, exact: true })).toBeVisible();
  const table = page.locator('.customer-monitor .records-table');
  const headers = ['Name', 'Short name', 'Business style', 'Address', 'TIN', 'Contact person', 'Phone', 'Fax', 'Country of origin', 'Country', 'Email', 'Payment term', 'Category', 'Price decimals', 'Total decimals', 'VAT mode', 'VAT code', 'Tax code', 'Last sales date', 'Remarks', 'Status', 'Actions'];
  await expect(table.getByRole('columnheader')).toHaveText(headers);
  await expect(table.getByRole('columnheader', { name: 'Address', exact: true })).toHaveCount(1);
  const row = table.getByRole('row').filter({ hasText: customer.name });
  const cells = row.locator('td');
  for (const [index, value] of [[0, customer.name], [1, customer.shortName], [2, customer.businessStyle], [4, customer.tin], [5, customer.contactPerson], [6, customer.cpnumber], [7, customer.faxNo], [8, customer.countryOfOrigin], [9, customer.country], [10, customer.email], [11, customer.paymentTerm], [12, customer.category], [13, '0'], [14, '4'], [15, 'Exclusive'], [16, 'VS'], [17, 'WC010'], [20, 'Active']]) {
    await expect(cells.nth(index)).toHaveText(value);
  }
  await expect(cells.nth(18)).toHaveText(new Intl.DateTimeFormat('en-PH', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date('2026-11-13T00:00:00Z')));
  await expect(cells.nth(19)).toHaveText(customer.remarks);
  const address = cells.nth(3);
  await expect(address.locator('.customer-address-label')).toHaveText(['Sales · Office address', 'DR · Delivery address']);
  await expect(address.locator('p')).toHaveText([customer.address, ...customer.deliveryAddresses]);
  await expect(page.getByText('C-LEGACY-HIDDEN', { exact: true })).toHaveCount(0);
  await expect(row.locator('.entity-cell small')).toHaveCount(0);
  const emptyCells = table.getByRole('row').filter({ hasText: empty.name }).locator('td');
  for (const index of [1, 2, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19]) await expect(emptyCells.nth(index)).toHaveText('—');
  await expect(emptyCells.nth(3).locator('.customer-address-label')).toHaveText(['DR · Office address', 'Sales · Delivery address']);
  await expect(emptyCells.nth(3).locator('p')).toHaveText(['—', '—']);
  await expect(emptyCells.nth(20)).toHaveText('Inactive');
  const officeAddress = table.getByRole('row').filter({ hasText: officeOnly.name }).locator('.customer-address-column');
  await expect(officeAddress.locator('.customer-address-label')).toHaveText(['Sales / DR · Office address']);
  await expect(officeAddress.locator('p')).toHaveText([officeOnly.address]);
  const scroller = page.locator('.customer-monitor .table-scroll');
  assert.ok(await scroller.evaluate(element => element.scrollWidth > element.clientWidth));
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await expect(cells.first()).toHaveCSS('position', 'sticky');
  await expect(cells.last()).toHaveCSS('position', 'sticky');
  await screenshot('customer-monitor-dark-desktop.png');
  await page.getByRole('button', { name: 'Switch to light mode', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await screenshot('customer-monitor-light-desktop.png');
  await page.setViewportSize({ width: 375, height: 812 });
  await page.evaluate(async () => {
    await Promise.all(document.getAnimations().filter(animation => animation.effect?.getComputedTiming().iterations !== Infinity).map(animation => animation.finished.catch(() => {})));
  });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Only the Customer table may scroll sideways.');
  await expect(scroller).toBeHidden();
  const mobileCard = page.locator('.customer-monitor .record-mobile-card').filter({ hasText: customer.name });
  const mobileAddress = mobileCard.locator('dt').filter({ hasText: /^Address$/ }).locator('..').locator('dd');
  await mobileAddress.scrollIntoViewIfNeeded();
  await expect(mobileAddress).toContainText(customer.address);
  await expect(mobileAddress).toContainText(customer.deliveryAddresses[0]);
  await screenshot('customer-monitor-address-mobile.png');
  await mobileCard.locator('.record-mobile-details > summary').click();
  await expect(mobileCard.getByText(customer.tin, { exact: true })).toBeVisible();
  await expect(mobileCard.getByRole('button', { name: 'Edit', exact: true })).toBeVisible();
  await expect(mobileCard.getByRole('button', { name: 'Delete', exact: true })).toBeVisible();
  assert.ok(apiRequests.every(request => request.method === 'GET'));
  assertSafe();
});
