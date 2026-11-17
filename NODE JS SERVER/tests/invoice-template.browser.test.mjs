import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { expect } from '@playwright/test';
import { mockBrowser } from './helpers/mock-browser.mjs';

const actor = { id: 1, system: 'sales', name: 'Mock Current Administrator', username: 'mock_invoice_print', role: 'admin', isActive: true };
const currentCustomer = { id: 2, name: 'Changed current customer', tin: 'WRONG-CURRENT-TIN', drName: 'WRONG-CURRENT-DR-NAME', address: 'Changed current address', isActive: true };
const artifacts = new URL('../.qa/invoice-template/', import.meta.url);

function invoice(id, count, changes = {}) {
  return {
    id, number: `SI-TEMPLATE-${id}`, orderId: 50, orderNumber: 'SO-SNAPSHOT', customerId: 2,
    customerName: 'Original ordering customer', customerAddress: 'Original delivery address',
    billToName: 'Frozen Billing Company', billToAddress: 'Frozen billing address, Laguna', buyerTin: '001-234-567-00000',
    shipToName: 'Frozen DR receiver', preparedByName: 'Frozen invoice preparer',
    invoiceDate: '2026-11-17', dueDate: '2026-12-17', paymentTerm: '30 DAYS', currency: 'USD', sourceCurrency: 'USD',
    rate: '1.000000', vatCode: 'VS', vatClass: 'Vatable', vatRate: '12.000000', vatInclusive: false, decimalInTotalPrice: 6,
    // Deliberately different from the sum of the fixture items: the printed
    // invoice must display its frozen header, never recompute it from rows.
    grossAmount: '1234.567891', discountAmount: '23.456789', netAmount: '1211.111102', vatAmount: '145.333332',
    total: '1356.444434', paidAmount: '0.000000', status: 'unpaid',
    items: Array.from({ length: count }, (_, index) => ({
      id: id * 1000 + index, productId: index + 5, sku: `ITEM-${String(index + 1).padStart(3, '0')}`,
      productName: `Product ${index + 1}`, description: `Unique description ${String(index + 1).padStart(3, '0')}`,
      unit: 'PCS', quantity: '3.125', currency: 'USD', unitPrice: index === 1 ? '0.115305' : '0.115304', convertedUnitPrice: index === 1 ? '0.115305' : '0.115304',
      grossAmount: index === 1 ? '10.005000' : '10.000000', discountAmount: '0.123457', netAmount: '9.876543', vatAmount: '1.185185',
      amount: '11.061728', lineTotal: '11.061728', refNumber: 'PO-REFERENCE',
    })),
    ...changes,
  };
}

async function fixture(t, records, options = {}) {
  const { onExcel, ...browserOptions } = options;
  const excelRequests = [];
  const excelBytes = Buffer.from('PK\x03\x04Mocked Excel response bytes for browser download regression.');
  const order = {
    id: 50, number: 'SO-SNAPSHOT', customerId: 2, customerName: 'Original ordering customer', customerAddress: 'Original delivery address',
    currency: 'USD', orderDate: '2026-11-17', expectedDeliveryDate: '2026-11-20', total: '11.06', status: 'confirmed', items: [records[0].items[0]],
  };
  const delivery = { ...order, id: 60, number: 'DR-SNAPSHOT', orderId: 50, orderNumber: order.number, deliveryDate: '2026-11-20', receivedBy: 'Mock receiver' };
  const browser = await mockBrowser(t, async ({ method, pathname, requestPathname }) => {
    assert.equal(method, 'GET', 'Invoice template inspection must never save a business record.');
    if (pathname === '/api/auth/session') return { json: { user: actor } };
    const lists = {
      '/api/customers': [currentCustomer], '/api/products': [], '/api/sales-orders': [order],
      '/api/sales-invoices': records.map(({ items, ...header }) => header), '/api/delivery-receipts': [delivery],
      '/api/shipping-invoices': [], '/api/users': [actor],
    };
    if (Object.hasOwn(lists, pathname)) return { json: { records: lists[pathname] } };
    const excel = pathname.match(/^\/api\/sales-invoices\/(\d+)\/excel$/);
    if (excel) {
      const record = records.find(record => record.id === Number(excel[1]));
      excelRequests.push({ method, pathname, requestPathname });
      if (onExcel) return onExcel(excelRequests.length, record, excelBytes);
      return { contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', headers: { 'Content-Disposition': `attachment; filename="invoice-${record.number}.xlsx"` }, body: excelBytes };
    }
    const detail = pathname.match(/^\/api\/sales-invoices\/(\d+)$/);
    if (detail) return { json: { record: records.find(record => record.id === Number(detail[1])) } };
    if (pathname === '/api/sales-orders/50') return { json: { record: order } };
    if (pathname === '/api/delivery-receipts/60') return { json: { record: delivery } };
  }, { project: 'SalesSystem', viewport: { width: 1440, height: 1100 }, ...browserOptions });
  await browser.page.goto(browser.origin);
  await expect(browser.page.getByRole('heading', { name: 'Customer', exact: true })).toBeVisible();
  await browser.page.getByRole('button', { name: 'Invoice', exact: true }).click();
  return {
    ...browser, excelRequests, excelBytes,
    async open(record) {
      const row = browser.page.locator('.invoice-summary-row').filter({ hasText: record.number });
      await row.getByRole('button', { name: 'View', exact: true }).click();
      const dialog = browser.page.getByRole('dialog', { name: 'Invoice', exact: true });
      await expect(dialog).toBeVisible();
      // Print intentionally hides the modal heading, so its accessible name
      // disappears while the same open dialog remains the printable container.
      return browser.page.locator('dialog.invoice-view[open]');
    },
  };
}

async function printedPdf(page, filename, expectedPages) {
  await mkdir(artifacts, { recursive: true });
  await page.evaluate(async () => {
    await Promise.all(document.getAnimations().filter(animation => animation.effect?.getComputedTiming().iterations !== Infinity).map(animation => animation.finished.catch(() => {})));
  });
  const pdf = await page.pdf({ path: fileURLToPath(new URL(filename, artifacts)), preferCSSPageSize: true, printBackground: true, displayHeaderFooter: false });
  assert.equal((pdf.toString('latin1').match(/\/Type\s*\/Page\b/g) || []).length, expectedPages, 'Chromium must print exactly one physical A4 page per invoice sheet, without a trailing blank page.');
  const boxes = [...pdf.toString('latin1').matchAll(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/g)];
  assert.ok(boxes.length > 0, 'Generated PDF must expose its physical page dimensions.');
  for (const [, width, height] of boxes) {
    assert.ok(Math.abs(Number(width) - 595.28) < 1, 'Printed width must be A4.');
    assert.ok(Math.abs(Number(height) - 841.89) < 1, 'Printed height must be A4.');
  }
  return pdf;
}

const field = (scope, name) => scope.locator(`[data-invoice-field="${name}"]`);
const pages = scope => scope.locator('[data-invoice-page]');
const summary = scope => scope.locator('[data-invoice-summary]');

for (const count of [1, 14, 15, 100]) {
  test(`Invoice template keeps ${count} short items on ${Math.ceil(count / 14)} A4 sheets with totals only on the last sheet`, { timeout: 90_000 }, async t => {
    const record = invoice(count, count);
    const browser = await fixture(t, [record]);
    const { page } = browser;
    const dialog = await browser.open(record);
    const expectedPages = Math.ceil(count / 14);
    await expect(pages(dialog)).toHaveCount(expectedPages);
    await expect(dialog.locator('[data-invoice-item]')).toHaveCount(count);
    assert.deepEqual(await dialog.locator('[data-invoice-item]').evaluateAll(rows => rows.map(row => Number(row.dataset.invoiceItem))), Array.from({ length: count }, (_, index) => index), 'Every original item appears exactly once and in order.');
    await expect(summary(dialog)).toHaveCount(1);
    await expect(summary(pages(dialog).last())).toHaveCount(1);
    for (let index = 0; index < expectedPages - 1; index++) await expect(summary(pages(dialog).nth(index))).toHaveCount(0);
    for (let index = 0; index < expectedPages; index++) {
      await expect(field(pages(dialog).nth(index), 'invoiceNumber')).toHaveText(record.number);
      await expect(field(pages(dialog).nth(index), 'pageNumber')).toContainText(new RegExp('\\b' + (index + 1) + '\\b'));
      await expect(field(pages(dialog).nth(index), 'pageNumber')).toContainText(new RegExp('\\b' + expectedPages + '\\b'));
    }
    const chrome = dialog.locator('[data-template-chrome]');
    assert.ok(await chrome.count() >= expectedPages, 'Every preview sheet must show the complete preprinted form.');
    await expect(chrome.first()).toBeVisible();
    await expect(field(pages(dialog).first(), 'buyerName')).toHaveText(record.billToName);
    await expect(field(pages(dialog).first(), 'buyerTin')).toHaveText(record.buyerTin);
    await expect(field(pages(dialog).first(), 'shipToName')).toHaveText(record.shipToName);
    await expect(dialog).not.toContainText('WRONG-CURRENT');
    await expect(field(summary(dialog), 'preparedByName')).toHaveText(record.preparedByName);
    for (const [name, value] of [['vatableSales', '1,211.11'], ['vatExemptSales', '0.00'], ['zeroRatedSales', '0.00'], ['vatAmount', '145.33'], ['discountAmount', '23.46'], ['totalAmountDue', '1,356.44'], ['lessVat', '0.00'], ['addVat', '145.33']]) await expect(field(summary(dialog), name)).toHaveText(value);
    for (const name of ['totalSalesVatInclusive', 'amountNetOfVat', 'amountDue']) await expect(field(summary(dialog), name)).toBeEmpty();
    const first = dialog.locator('[data-invoice-item="0"]');
    await expect(first.locator('[data-invoice-column="unitPrice"] > span').last()).toHaveText('0.11530');
    await expect(first.locator('[data-invoice-column="grossAmount"]')).toHaveText('10.00');
    await expect(first.locator('[data-invoice-column="quantity"]')).toHaveText('3.125');
    await expect(first.locator('[data-invoice-column="unit"]')).toHaveText('PCS');
    if (count > 1) {
      const second = dialog.locator('[data-invoice-item="1"]');
      await expect(second.locator('[data-invoice-column="unitPrice"] > span').last()).toHaveText('0.11531');
      await expect(second.locator('[data-invoice-column="grossAmount"]')).toHaveText('10.01');
    }
    const last = dialog.locator(`[data-invoice-item="${count - 1}"]`);
    await expect(last.locator('[data-invoice-column="description"]')).toContainText(record.items.at(-1).sku);
    await last.scrollIntoViewIfNeeded();
    await browser.screenshot(`invoice-template-${count}-screen.png`);
    await page.emulateMedia({ media: 'print' });
    for (let index = 0; index < await chrome.count(); index++) await expect(chrome.nth(index)).toBeHidden();
    await expect(first.locator('[data-invoice-column="unitPrice"]')).toBeVisible();
    await expect(field(summary(dialog), 'totalAmountDue')).toBeVisible();
    await printedPdf(page, `invoice-${count}-items.pdf`, expectedPages);
    if (count === 1) await browser.screenshot('invoice-template-1-data-only-print.png');
    assert.ok(browser.apiRequests.every(request => request.method === 'GET'));
    browser.assertSafe();
  });
}

test('long invoice descriptions wrap across sheets without losing items, text, prices or final totals', { timeout: 90_000 }, async t => {
  const tokens = Array.from({ length: 180 }, (_, index) => `detail${String(index).padStart(3, '0')}`);
  const longSku = 'LONG-SKU-' + 'X'.repeat(160);
  const record = invoice(201, 2);
  record.items[0] = { ...record.items[0], sku: longSku, description: 'LONG-DESCRIPTION-START ' + tokens.join(' ') + ' LONG-DESCRIPTION-END' };
  record.items[1] = { ...record.items[1], sku: 'LAST-ITEM-AFTER-WRAP', description: 'Last item remains after the wrapped item', grossAmount: null };
  const browser = await fixture(t, [record]);
  const dialog = await browser.open(record);
  await expect(dialog.locator('[data-invoice-item]')).toHaveCount(2);
  assert.ok(await pages(dialog).count() > 1);
  assert.ok(await dialog.locator('[data-invoice-fragment]').count() > 14);
  const text = (await dialog.locator('[data-invoice-column="description"]').allTextContents()).join(' ').replace(/\s+/g, ' ');
  assert.ok(text.replace(/\s+/g, '').includes(longSku));
  for (const token of ['LONG-DESCRIPTION-START', ...tokens, 'LONG-DESCRIPTION-END', 'LAST-ITEM-AFTER-WRAP']) assert.ok(text.includes(token), `Wrapped invoice text must retain ${token}.`);
  assert.equal(await dialog.locator('[data-invoice-column="unitPrice"]').evaluateAll(cells => cells.filter(cell => cell.textContent.trim()).length), 2, 'Wrapped continuation lines must never repeat the unit price.');
  await expect(dialog.locator('[data-invoice-item="1"] [data-invoice-column="grossAmount"]')).toBeEmpty();
  await expect(summary(pages(dialog).last())).toHaveCount(1);
  await expect(field(summary(dialog), 'totalAmountDue')).toHaveText('1,356.44');
  const count = await pages(dialog).count();
  await browser.screenshot('invoice-template-wrapped-descriptions.png');
  await browser.page.emulateMedia({ media: 'print' });
  await printedPdf(browser.page, 'invoice-wrapped-descriptions.pdf', count);
  browser.assertSafe();
});

test('invoice VAT classification and mode preserve known snapshots and leave unknown legacy slots blank', { timeout: 90_000 }, async t => {
  const records = [
    invoice(301, 1, { vatClass: 'Vat-Exempt', vatRate: '0.000000', vatAmount: '0.000000', vatInclusive: true }),
    invoice(302, 1, { vatClass: 'Zero Rated', vatRate: '0.000000', vatAmount: '0.000000' }),
    invoice(303, 1, { buyerTin: null, shipToName: null, vatClass: null, vatInclusive: null }),
    invoice(304, 1, { vatClass: 'Vatable', vatInclusive: true }),
    invoice(305, 1, { vatClass: 'Vatable', vatInclusive: false, vatAmount: null }),
  ];
  const browser = await fixture(t, records);
  for (const record of records) {
    const dialog = await browser.open(record);
    const totals = summary(dialog);
    const expectedBucket = { 'Vatable': 'vatableSales', 'Vat-Exempt': 'vatExemptSales', 'Zero Rated': 'zeroRatedSales' }[record.vatClass];
    for (const name of ['vatableSales', 'vatExemptSales', 'zeroRatedSales']) {
      if (name === expectedBucket) await expect(field(totals, name)).toHaveText('1,211.11');
      else if (expectedBucket) await expect(field(totals, name)).toHaveText('0.00');
      else await expect(field(totals, name)).toBeEmpty();
    }
    if (record.vatInclusive === null || record.vatAmount === null) {
      await expect(field(totals, 'lessVat')).toBeEmpty(); await expect(field(totals, 'addVat')).toBeEmpty();
    } else {
      await expect(field(totals, 'lessVat')).toHaveText(record.vatInclusive ? (Number(record.vatAmount) ? '145.33' : '0.00') : '0.00');
      await expect(field(totals, 'addVat')).toHaveText(record.vatInclusive ? '0.00' : (Number(record.vatAmount) ? '145.33' : '0.00'));
    }
    if (record.buyerTin === null) {
      await expect(field(pages(dialog).first(), 'buyerTin')).toBeEmpty();
      await expect(field(pages(dialog).first(), 'shipToName')).toBeEmpty();
      await expect(dialog).not.toContainText('WRONG-CURRENT');
      await browser.screenshot('invoice-template-legacy-unknown-snapshots.png');
    }
    for (const name of ['totalSalesVatInclusive', 'amountNetOfVat', 'amountDue']) await expect(field(totals, name)).toBeEmpty();
    await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  }
  browser.assertSafe();
});

test('invoice preview fits mobile width, supports readable zoom and prints unscaled A4 pages', { timeout: 90_000 }, async t => {
  const record = invoice(401, 15);
  const browser = await fixture(t, [record]);
  const dialog = await browser.open(record);
  const zoom = dialog.getByRole('combobox', { name: 'Invoice zoom', exact: true });
  for (const width of [375, 320, 768]) {
    await browser.page.setViewportSize({ width, height: 900 });
    await zoom.selectOption({ index: 0 });
    await expect.poll(async () => (await pages(dialog).first().boundingBox()).width).toBeLessThanOrEqual(width);
    await expect.poll(() => browser.page.evaluate(() => document.documentElement.scrollWidth - innerWidth), { message: 'Fit preview must never widen the browser page.' }).toBeLessThanOrEqual(0);
  }
  await browser.page.setViewportSize({ width: 375, height: 844 });
  await zoom.selectOption({ label: '100%' });
  await expect.poll(async () => (await pages(dialog).first().boundingBox()).width).toBeGreaterThan(750);
  await expect.poll(() => browser.page.evaluate(() => document.documentElement.scrollWidth - innerWidth), { message: 'Zoomed sheets must pan inside the preview instead of overflowing the page.' }).toBeLessThanOrEqual(0);
  await zoom.selectOption({ index: 0 });
  await expect.poll(async () => (await pages(dialog).first().boundingBox()).width).toBeLessThanOrEqual(375);
  await browser.screenshot('invoice-template-mobile-fit.png');
  await browser.page.emulateMedia({ media: 'print' });
  await printedPdf(browser.page, 'invoice-mobile-two-pages.pdf', 2);
  browser.assertSafe();
});

test('invoice-specific print styles leave Sales Order and Delivery Receipt document forms intact', { timeout: 90_000 }, async t => {
  const record = invoice(501, 1);
  const browser = await fixture(t, [record]);
  const invoiceDialog = await browser.open(record);
  await invoiceDialog.getByRole('button', { name: 'Close', exact: true }).click();
  for (const [label, number, columns, filename] of [
    ['Sales Order', 'SO-SNAPSHOT', ['Product', 'Unit', 'Quantity', 'Unit price', 'Amount', 'Delivery date'], 'sales-order-after-invoice.pdf'],
    ['Delivery Receipt', 'DR-SNAPSHOT', ['Product', 'Unit', 'Quantity', 'Delivery date'], 'delivery-receipt-after-invoice.pdf'],
  ]) {
    await browser.page.getByRole('button', { name: label, exact: true }).click();
    const row = browser.page.getByRole('row').filter({ hasText: number });
    await row.getByRole('button', { name: 'View', exact: true }).click();
    const namedDialog = browser.page.getByRole('dialog', { name: label, exact: true });
    await expect(namedDialog).toBeVisible();
    const dialog = browser.page.locator('dialog.sales-document[open]');
    await expect(dialog.locator('[data-invoice-page]')).toHaveCount(0);
    await expect(dialog.locator('.document-table th')).toHaveText(columns);
    await browser.page.emulateMedia({ media: 'print' });
    await expect(dialog.locator('.document-brand')).toBeVisible();
    await expect(dialog.locator('.document-table th').first()).toBeVisible();
    assert.equal(await dialog.locator('.document-table td').first().evaluate(element => getComputedStyle(element).visibility), 'visible');
    await printedPdf(browser.page, filename, 1);
    await browser.page.emulateMedia({ media: 'screen' });
    await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  }
  browser.assertSafe();
});

test('long invoice header snapshots remain readable and conserve overflow text in labeled continuation rows', { timeout: 90_000 }, async t => {
  const values = Object.fromEntries([
    ['buyerName', 'Buyer', 45], ['buyerAddress', 'Address', 70], ['shipToName', 'Receiver', 45],
    ['paymentTerm', 'Term', 35], ['buyerTin', '001-TIN-', 40], ['preparedByName', 'Preparer', 45],
  ].map(([key, prefix, count]) => [key, Array.from({ length: count }, (_, index) => prefix + String(index).padStart(3, '0')).join(' ')]));
  const record = invoice(601, 1, { billToName: values.buyerName, billToAddress: values.buyerAddress, ...Object.fromEntries(Object.entries(values).filter(([key]) => !['buyerName', 'buyerAddress'].includes(key))) });
  const browser = await fixture(t, [record]);
  const dialog = await browser.open(record);
  assert.ok(await pages(dialog).count() > 1, 'Oversized snapshot headers must gain continuation rows instead of overflowing the form.');
  for (const [name, value] of Object.entries(values)) {
    const header = name === 'preparedByName' ? field(summary(dialog), name) : field(pages(dialog).first(), name);
    const overflow = dialog.locator(`[data-invoice-overflow-line="${name}"]`);
    assert.ok(await overflow.count() > 0, `${name} must have labeled continuation text.`);
    const visibleText = [await header.textContent(), ...(await overflow.allTextContents())].join(' ').replace(/\s+/g, '');
    for (const token of value.split(' ')) assert.ok(visibleText.includes(token), `${name} must retain ${token}.`);
    const geometry = await header.evaluate(element => ({ scroll: element.scrollHeight, client: element.clientHeight, height: element.getBoundingClientRect().height }));
    assert.ok(geometry.scroll <= geometry.client + 1, `${name} must not overflow its bounded header box.`);
    assert.ok(geometry.height > 0);
  }
  await expect(summary(dialog)).toHaveCount(1);
  await expect(summary(pages(dialog).last())).toHaveCount(1);
  await expect(dialog.locator('[data-invoice-item]')).toHaveCount(1);
  await browser.screenshot('invoice-template-long-header-continuations.png');
  await browser.page.emulateMedia({ media: 'print' });
  await printedPdf(browser.page, 'invoice-long-headers.pdf', await pages(dialog).count());
  browser.assertSafe();
});

test('long invoice remarks continue on real pages and leave final totals visible without text loss', { timeout: 90_000 }, async t => {
  const tokens = Array.from({ length: 190 }, (_, index) => `Remark${String(index).padStart(3, '0')}`);
  const record = invoice(602, 1, { notes: tokens.join(' ') });
  const browser = await fixture(t, [record]);
  const dialog = await browser.open(record);
  const count = await pages(dialog).count();
  assert.ok(count > 1);
  await expect(dialog.locator('[data-invoice-item]')).toHaveCount(1);
  await expect(summary(dialog)).toHaveCount(1);
  await expect(summary(pages(dialog).last())).toHaveCount(1);
  const text = (await dialog.locator('.invoice-note-line').allTextContents()).join(' ');
  assert.ok(text.includes('Remarks'));
  for (const token of tokens) assert.ok(text.includes(token), `Remark continuation must retain ${token}.`);
  await expect(field(summary(dialog), 'totalAmountDue')).toHaveText('1,356.44');
  await browser.screenshot('invoice-template-long-remarks-final-sheet.png');
  await browser.page.emulateMedia({ media: 'print' });
  await printedPdf(browser.page, 'invoice-long-remarks.pdf', count);
  browser.assertSafe();
});

test('Download Excel makes one scoped read, preserves filename and bytes, and reports failures without closing the invoice', { timeout: 90_000 }, async t => {
  let release;
  const ready = new Promise(resolve => { release = resolve; });
  t.after(() => release());
  const record = invoice(701, 1);
  const browser = await fixture(t, [record], {
    onExcel: async (attempt, record, bytes) => {
      if (attempt > 1) return { status: 503, json: { message: 'Mock Excel export is temporarily unavailable.' } };
      await ready;
      return { contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', headers: { 'Content-Disposition': `attachment; filename="invoice-${record.number}.xlsx"` }, body: bytes };
    },
  });
  const dialog = await browser.open(record);
  const downloadButton = dialog.getByRole('button', { name: 'Download Excel', exact: true });
  await expect(dialog.getByRole('button', { name: 'Print document', exact: true })).toHaveCount(0);
  const downloaded = browser.page.waitForEvent('download');
  await downloadButton.click();
  await expect.poll(() => browser.excelRequests.length).toBe(1);
  await expect(dialog.locator('.modal-footer button').last()).toBeDisabled();
  release();
  const download = await downloaded;
  assert.equal(download.suggestedFilename(), `invoice-${record.number}.xlsx`);
  assert.equal(await download.failure(), null);
  assert.deepEqual(await readFile(await download.path()), browser.excelBytes, 'The UI must download the received workbook bytes unchanged.');
  await expect(downloadButton).toBeEnabled();
  assert.deepEqual(browser.excelRequests, [{ method: 'GET', pathname: '/api/sales-invoices/701/excel', requestPathname: '/api/sales/sales-invoices/701/excel' }]);
  await downloadButton.click();
  await expect(dialog.getByText('Mock Excel export is temporarily unavailable.', { exact: false })).toBeVisible();
  await expect(downloadButton).toBeEnabled();
  await expect(field(pages(dialog).first(), 'buyerName')).toHaveText(record.billToName);
  assert.equal(browser.excelRequests.length, 2);
  assert.ok(browser.apiRequests.every(request => request.method === 'GET'));
  browser.assertSafe();
});
