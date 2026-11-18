import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { expect } from '@playwright/test';
import { mockBrowser } from './helpers/mock-browser.mjs';

test('named Invoice, Shipping Invoice and Delivery Receipt pages save and view mocked documents on desktop and mobile', { timeout: 60_000 }, async t => {
  const actor = { id: 1, system: 'sales', name: 'Mock Administrator', username: 'mock_admin', role: 'admin', isActive: true };
  const customer = { id: 2, name: 'Mock Customer', address: 'Office Address', contactPerson: 'Receiver', drName: 'Frozen delivery receiver', businessStyle: 'Manufacturing', isActive: true };
  const product = { id: 3, sku: 'P3', name: 'Product', unit: 'PCS', price: '0.115300', currency: 'USD', stock: 5, isActive: true };
  const item = { productId: 3, productName: 'Product', sku: 'P3', unit: 'PCS', quantity: 2, unitPrice: '0.115300', lineTotal: '0.23' };
  const order = { id: 7, number: 'SO-MOCK', customerId: 2, customerName: customer.name, customerAddress: customer.address, currency: 'USD', orderDate: '2026-11-13', total: '0.23', status: 'confirmed', invoiced: false, delivered: false, items: [item] };
  const invoices = [], shipments = [], deliveries = [], writes = [], movements = [];
  const { page, origin, assertSafe } = await mockBrowser(t, async ({ method, pathname, body }) => {
    if (method === 'GET' && pathname === '/api/auth/session') return { json: { user: actor } };
    const lists = { '/api/customers': [customer], '/api/products': [product], '/api/sales-orders': [order], '/api/sales-invoices': invoices, '/api/shipping-invoices': shipments, '/api/delivery-receipts': deliveries, '/api/users': [actor] };
    if (method === 'GET' && lists[pathname]) return { json: { records: lists[pathname] } };
    for (const [path, records] of [['/api/sales-invoices/', invoices], ['/api/shipping-invoices/', shipments], ['/api/delivery-receipts/', deliveries]]) {
      if (method === 'GET' && pathname.startsWith(path)) return { json: { record: records.find(row => String(row.id) === pathname.slice(path.length)) } };
    }
    if (method === 'POST' && pathname === '/api/sales-invoices') {
      writes.push({ pathname, body }); order.invoiced = true;
      const before = product.stock;
      product.stock -= 2;
      movements.push({ id: 'invoice:1', type: 'invoice-out', quantity: '2.000', stockBefore: before.toFixed(3), stockAfter: product.stock.toFixed(3), invoiceNumber: 'INV-MOCK' });
      const record = { ...body, id: 9, number: 'INV-MOCK', orderId: 7, orderNumber: order.number, customerName: customer.name, customerAddress: customer.address, billToName: customer.name, billToAddress: customer.address, shipToName: customer.drName, buyerBusinessStyle: customer.businessStyle, currency: 'USD', total: order.total, paidAmount: '0.00', status: 'unpaid', delivered: false, items: structuredClone(order.items) };
      invoices.push(record); return { status: 201, json: { record } };
    }
    if (method === 'POST' && pathname === '/api/shipping-invoices') {
      writes.push({ pathname, body });
      const record = { ...body, id: 11, number: 'SHI-MOCK', orderId: 7, orderNumber: order.number, invoiceNumber: 'INV-MOCK', customerName: customer.name, customerAddress: customer.address, currency: 'USD', total: order.total, items: [item] };
      shipments.push(record); return { status: 201, json: { record } };
    }
    if (method === 'POST' && pathname === '/api/delivery-receipts') {
      assert.equal(body.invoiceId, 9); assert.equal(Object.hasOwn(body, 'orderId'), false);
      writes.push({ pathname, body }); order.delivered = true;
      const invoice = invoices[0];
      invoice.delivered = true; invoice.deliveryReceiptId = 10; invoice.deliveryReceiptNumber = 'DR-MOCK';
      const record = { ...body, id: 10, number: 'DR-MOCK', invoiceId: invoice.id, invoiceNumber: invoice.number, orderId: 7, orderNumber: order.number, customerName: invoice.customerName, deliveredTo: invoice.shipToName, businessStyle: invoice.buyerBusinessStyle, preparedByName: actor.name, purchaseOrderNumber: null, items: invoice.items.map(({ productId, productName, sku, description, unit, quantity }) => ({ productId, productName, sku, description, unit, quantity })) };
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
  assert.equal(product.stock, 3, 'Invoice creation is the stock-out event.');
  assert.deepEqual(movements.map(({ type, stockBefore, stockAfter }) => ({ type, stockBefore, stockAfter })), [{ type: 'invoice-out', stockBefore: '5.000', stockAfter: '3.000' }]);

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
  await dialog.getByRole('combobox', { name: /^Invoice \*/ }).selectOption('9');
  await dialog.getByLabel('Delivery date *', { exact: true }).fill('2026-11-13');
  await dialog.getByLabel('Received by', { exact: true }).fill('Receiver');
  await dialog.getByRole('button', { name: 'Create delivery receipt', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  assert.equal(product.stock, 3, 'Printing or issuing a DR must not deduct invoice stock again.');
  assert.equal(movements.length, 1);
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

test('Customer monitoring shows CAS details with separate selected Sales and DR addresses on desktop and phone cards', { timeout: 60_000 }, async t => {
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
  const reverse = { ...customer, id: 5, name: 'Reversed Address Customer', salesAddressType: 'delivery', drAddressType: 'office' };
  const missingDelivery = { id: 6, name: 'Missing Delivery Customer', address: 'Existing office must not be used for delivery', deliveryAddresses: [], salesAddressType: 'delivery', drAddressType: 'delivery', isActive: true };
  const unselected = { id: 7, name: 'Unselected Address Customer', address: 'Office is not selected', deliveryAddresses: ['Delivery is not selected'], salesAddressType: null, isActive: true };
  const { page, origin, screenshot, apiRequests, assertSafe } = await mockBrowser(t, async ({ method, pathname }) => {
    if (method !== 'GET') throw new Error('Customer monitoring checks must never save records.');
    if (pathname === '/api/auth/session') return { json: { user: actor } };
    if (pathname === '/api/customers') return { json: { records: [customer, empty, officeOnly, reverse, missingDelivery, unselected] } };
    if (['/api/products', '/api/sales-orders', '/api/sales-invoices', '/api/delivery-receipts', '/api/shipping-invoices', '/api/users'].includes(pathname)) return { json: { records: pathname === '/api/users' ? [actor] : [] } };
  }, { project: 'SalesSystem', viewport: { width: 1440, height: 1000 }, screenshotName: 'customer-monitor-last.png' });
  await page.goto(origin);
  await expect(page.getByRole('heading', { name: 'Customer', level: 1, exact: true })).toBeVisible();
  const table = page.locator('.customer-monitor .records-table');
  const headers = ['Name', 'Short name', 'Business style', 'Sales address', 'DR address', 'TIN', 'Contact person', 'Phone', 'Fax', 'Country of origin', 'Country', 'Email', 'Payment term', 'Category', 'Price decimals', 'Total decimals', 'VAT mode', 'VAT code', 'Tax code', 'Last sales date', 'Remarks', 'Status', 'Actions'];
  await expect(table.getByRole('columnheader')).toHaveText(headers);
  await expect(table.getByRole('columnheader', { name: 'Address', exact: true })).toHaveCount(0);
  const row = table.getByRole('row').filter({ hasText: customer.name });
  const cells = row.locator('td');
  for (const [index, value] of [[0, customer.name], [1, customer.shortName], [2, customer.businessStyle], [5, customer.tin], [6, customer.contactPerson], [7, customer.cpnumber], [8, customer.faxNo], [9, customer.countryOfOrigin], [10, customer.country], [11, customer.email], [12, customer.paymentTerm], [13, customer.category], [14, '0'], [15, '4'], [16, 'Exclusive'], [17, 'VS'], [18, 'WC010'], [21, 'Active']]) {
    await expect(cells.nth(index)).toHaveText(value);
  }
  await expect(cells.nth(19)).toHaveText(new Intl.DateTimeFormat('en-PH', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date('2026-11-13T00:00:00Z')));
  await expect(cells.nth(20)).toHaveText(customer.remarks);
  for (const [record, expected] of [
    [customer, [['Office address', [customer.address]], ['Delivery address', customer.deliveryAddresses]]],
    [reverse, [['Delivery address', customer.deliveryAddresses], ['Office address', [customer.address]]]],
    [empty, [['Delivery address', ['—']], ['Office address', ['—']]]],
    [officeOnly, [['Office address', [officeOnly.address]], ['Office address', [officeOnly.address]]]],
    [missingDelivery, [['Delivery address', ['—']], ['Delivery address', ['—']]]],
    [unselected, [[null, []], [null, []]]],
  ]) {
    const addresses = table.getByRole('row').filter({ hasText: record.name }).locator('.customer-address-column');
    await expect(addresses).toHaveCount(2);
    for (const [index, [caption, values]] of expected.entries()) {
      if (caption) {
        await expect(addresses.nth(index).locator('.customer-address-label')).toHaveText(caption);
        await expect(addresses.nth(index).locator('p')).toHaveText(values);
      } else {
        await expect(addresses.nth(index)).toHaveText('—');
        await expect(addresses.nth(index).locator('.customer-address-label')).toHaveCount(0);
      }
    }
  }
  await expect(table.getByRole('row').filter({ hasText: missingDelivery.name })).not.toContainText(missingDelivery.address);
  await expect(table.getByRole('row').filter({ hasText: unselected.name })).not.toContainText(unselected.address);
  await expect(table.getByRole('row').filter({ hasText: unselected.name })).not.toContainText(unselected.deliveryAddresses[0]);
  await expect(page.getByText('C-LEGACY-HIDDEN', { exact: true })).toHaveCount(0);
  await expect(row.locator('.entity-cell small')).toHaveCount(0);
  const emptyCells = table.getByRole('row').filter({ hasText: empty.name }).locator('td');
  for (const index of [1, 2, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]) await expect(emptyCells.nth(index)).toHaveText('—');
  await expect(emptyCells.nth(21)).toHaveText('Inactive');
  const scroller = page.locator('.customer-monitor .table-scroll');
  assert.ok(await scroller.evaluate(element => element.scrollWidth > element.clientWidth));
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await expect(cells.first()).toHaveCSS('position', 'sticky');
  await expect(cells.last()).toHaveCSS('position', 'sticky');
  await page.evaluate(async () => {
    await Promise.all(document.getAnimations().filter(animation => animation.effect?.getComputedTiming().iterations !== Infinity).map(animation => animation.finished.catch(() => {})));
  });
  await page.screenshot({ path: fileURLToPath(new URL('../.qa/screenshots/customer-monitor-dark-desktop.png', import.meta.url)), fullPage: false });
  await page.getByRole('button', { name: 'Switch to light mode', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.screenshot({ path: fileURLToPath(new URL('../.qa/screenshots/customer-monitor-light-desktop.png', import.meta.url)), fullPage: false });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.evaluate(async () => {
    await Promise.all(document.getAnimations().filter(animation => animation.effect?.getComputedTiming().iterations !== Infinity).map(animation => animation.finished.catch(() => {})));
  });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Only the Customer table may scroll sideways.');
  await expect(scroller).toBeHidden();
  const mobileCard = page.locator('.customer-monitor .record-mobile-card').filter({ hasText: customer.name });
  const mobileSales = mobileCard.locator('dt').filter({ hasText: /^Sales address$/ }).locator('..').locator('dd');
  const mobileDr = mobileCard.locator('dt').filter({ hasText: /^DR address$/ }).locator('..').locator('dd');
  await mobileSales.scrollIntoViewIfNeeded();
  await expect(mobileSales.locator('.customer-address-label')).toHaveText('Office address');
  await expect(mobileSales.locator('p')).toHaveText(customer.address);
  await expect(mobileSales).not.toContainText(customer.deliveryAddresses[0]);
  await mobileDr.scrollIntoViewIfNeeded();
  await expect(mobileDr.locator('.customer-address-label')).toHaveText('Delivery address');
  await expect(mobileDr.locator('p')).toHaveText(customer.deliveryAddresses);
  await expect(mobileDr).not.toContainText(customer.address);
  await screenshot('customer-monitor-address-mobile.png');
  await mobileCard.locator('.record-mobile-details > summary').click();
  await expect(mobileCard.getByText(customer.tin, { exact: true })).toBeVisible();
  await expect(mobileCard.getByRole('button', { name: 'Edit', exact: true })).toBeVisible();
  await expect(mobileCard.getByRole('button', { name: 'Delete', exact: true })).toBeVisible();
  assert.ok(apiRequests.every(request => request.method === 'GET'));
  assertSafe();
});
