import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import test from 'node:test';
import express from 'express';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { loadRouterWithDatabase } from './helpers/load-api.mjs';

const delivery = { id: 41, number: 'DR-EXCEL-0041', invoiceId: 31, invoiceNumber: 'SI-SAVED-0031', deliveredTo: 'Frozen invoice delivery name', address: 'Actual dispatch destination', receivedBy: null, notes: 'Handle with care.', deliveryDate: '2026-11-18', paymentTerm: '30 DAYS', buyerTin: '001-023-045-000', businessStyle: 'Manufacturing', preparedByName: 'Saved receipt creator', purchaseOrderNumber: null };
const item = { id: 101, productId: 5, productName: 'Saved Product', sku: 'P5', description: 'Saved Product', unit: 'PCS', quantity: '12.345', refNumber: 'ITEM-REF-IS-NOT-A-PO' };

async function fixture(t, { record = {}, items = [item], missing = false, system = 'sales' } = {}) {
  const calls = [];
  const database = {
    sql: new Proxy({}, { get: (_target, type) => type === 'MAX' ? -1 : (...args) => ({ type, args }) }),
    transaction() { throw new Error('Delivery Excel downloads cannot open business transactions.'); },
    request() {
      const values = {};
      return {
        input(name, _type, value) { values[name] = value; return this; },
        async query(query) {
          assert.match(query, /^SELECT /, 'Only read-only SQL is permitted.');
          assert.doesNotMatch(query, /\b(?:unitPrice|convertedUnitPrice|lineTotal|grossAmount|discountAmount|netAmount|vatAmount|paidAmount|currency)\b/);
          assert.doesNotMatch(query, /si\.billTo(?:Name|Address)|dbo\.Products|dbo\.ProductStockMovements/);
          calls.push({ query, values: { ...values } });
          if (query.startsWith('SELECT d.id,d.number,d.invoiceId')) {
            assert.match(query, /si\.buyerBusinessStyle AS businessStyle/);
            assert.match(query, /COALESCE\(si\.shipToName,o\.billToName,o\.customerName\) AS deliveredTo/);
            assert.match(query, /CAST\(NULL AS nvarchar\(max\)\) AS purchaseOrderNumber/);
            return { recordset: missing || values.id !== 41 ? [] : [{ ...delivery, ...record, total: '987654321.99', currency: 'USD', vatAmount: '123456789.99' }] };
          }
          if (query.includes('FROM dbo.DeliveryReceiptItems WHERE deliveryReceiptId=@deliveryReceiptId')) {
            assert.equal(values.deliveryReceiptId, 41);
            assert.doesNotMatch(query, /FROM dbo\.(?:SalesOrderItems|SalesInvoiceItems)/);
            return { recordset: items.map(row => ({ ...row, unitPrice: '876543210.99', amount: '765432109.99', currency: 'USD' })) };
          }
          throw new Error('Unexpected fake delivery Excel SQL: ' + query.slice(0, 100));
        },
      };
    },
  };
  const app = express();
  app.use((_req, res, next) => { res.locals.user = { id: 1, system, role: 'sales', isActive: true }; next(); });
  app.use('/api/sales', loadRouterWithDatabase('sales', database));
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ message: error.message }));
  const server = createServer(app); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  const origin = 'http://127.0.0.1:' + server.address().port;
  return {
    calls,
    request(id = '41', method = 'GET') { return fetch(origin + '/api/sales/delivery-receipts/' + id + '/excel', { method }); },
    async download() {
      const response = await this.request();
      assert.equal(response.status, 200);
      assert.match(response.headers.get('content-type'), /^application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet/);
      assert.equal(response.headers.get('content-disposition'), 'attachment; filename="DR-EXCEL-0041.xlsx"');
      assert.equal(response.headers.get('cache-control'), 'no-store');
      const buffer = Buffer.from(await response.arrayBuffer());
      assert.equal(buffer.subarray(0, 2).toString(), 'PK');
      const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(buffer);
      return { workbook, buffer };
    },
  };
}

function populatedValues(sheet) {
  const values = [];
  sheet.eachRow(row => row.eachCell(cell => { if (cell.type !== ExcelJS.ValueType.Merge && cell.value != null) values.push(cell.value); }));
  return values;
}

test('delivery Excel is a genuine price-free Letter workbook with frozen SI, TIN, business style and optional receiver', async t => {
  const api = await fixture(t);
  const { workbook, buffer } = await api.download(); const sheet = workbook.worksheets[0];
  await mkdir(new URL('../.qa/delivery-receipt/', import.meta.url), { recursive: true });
  await writeFile(new URL('../.qa/delivery-receipt/dr-excel-1.xlsx', import.meta.url), buffer);
  assert.equal(workbook.worksheets.length, 1);
  for (const [address, value] of [['H2', delivery.deliveredTo], ['G5', delivery.address], ['M5', delivery.paymentTerm], ['M7', delivery.buyerTin], ['H10', delivery.businessStyle], ['H11', delivery.invoiceNumber], ['F31', delivery.preparedByName], ['D37', delivery.number]]) assert.equal(sheet.getCell(address).value, value, address);
  assert.equal(sheet.getCell('M2').value.toISOString().slice(0, 10), '2026-11-18');
  assert.equal(sheet.getCell('M33').value, null); assert.equal(sheet.getCell('M10').value, null, 'An item reference is not a customer PO number.');
  assert.equal(sheet.getCell('A12').value, 12.345); assert.equal(sheet.getCell('A12').numFmt, '#,##0.000');
  assert.equal(sheet.getCell('B26').value, 12.345); assert.equal(sheet.getCell('F12').value, 'PCS');
  assert.equal(sheet.getCell('J12').value, 'P5 Saved Product'); assert.equal(sheet.getCell('C28').value, delivery.notes);
  assert.equal(sheet.getCell('J12').alignment.horizontal, 'left');
  assert.equal(sheet.getCell('G5').alignment.vertical, 'top');
  assert.equal(sheet.getCell('H10').alignment.vertical, 'top');
  assert.equal(sheet.model.merges.length, 60);
  assert.equal(sheet.pageSetup.paperSize, 1); assert.equal(sheet.pageSetup.orientation, 'portrait'); assert.equal(sheet.pageSetup.scale, 100); assert.equal(sheet.pageSetup.fitToPage, false);
  assert.equal(sheet.pageSetup.printArea.replace(/\$/g, ''), 'A1:N37');
  assert.deepEqual(sheet.pageSetup.margins, { left: 0.23, right: 0.27, top: 0.15, bottom: 0.2, header: 0.3, footer: 0.3 });
  assert.equal(api.calls.length, 2);
  for (const value of populatedValues(sheet)) assert.ok(!['987654321.99', '123456789.99', '876543210.99', '765432109.99', 'USD'].includes(String(value)), 'Fiscal trap values must never enter a delivery workbook.');
  sheet.eachRow(row => row.eachCell(cell => assert.doesNotMatch(cell.numFmt || '', /[$₱]|USD|PHP|VAT|0\.00000/)));
  const zip = await JSZip.loadAsync(buffer);
  assert.ok(Object.keys(zip.files).every(name => !/vbaProject|macros|activeX/i.test(name)));
  assert.doesNotMatch(await zip.file('[Content_Types].xml').async('string'), /macroEnabled/i);
  assert.doesNotMatch(await zip.file('xl/worksheets/sheet1.xml').async('string'), /<f(?:\s|>)/);
  const template = new ExcelJS.Workbook(); await template.xlsx.load(await readFile(new URL('../templates/DeliveryReceipt.xlsx', import.meta.url)));
  assert.deepEqual(populatedValues(template.worksheets[0]), [], 'The template contains formatting only, with no source-company/customer/sample values.');
});

test('14, 15 and 100 delivery items retain all 14 slots, short remarks and final-only signatures on one active worksheet', async t => {
  for (const count of [14, 15, 100]) {
    const items = Array.from({ length: count }, (_value, index) => ({ ...item, id: 101 + index, sku: 'P' + (index + 1), description: 'Saved item ' + (index + 1), quantity: '1.000' }));
    const api = await fixture(t, { items }); const { workbook, buffer } = await api.download(); const sheet = workbook.worksheets[0];
    if (count !== 14) await writeFile(new URL('../.qa/delivery-receipt/dr-excel-' + count + '.xlsx', import.meta.url), buffer);
    const pages = Math.ceil(count / 14);
    assert.equal(workbook.worksheets.length, 1); assert.equal(sheet.model.merges.length, 60 * pages);
    assert.equal(sheet.pageSetup.printArea.replace(/\$/g, ''), 'A1:N' + (37 * pages));
    const zip = await JSZip.loadAsync(buffer); const xml = await zip.file('xl/worksheets/sheet1.xml').async('string');
    const breaks = [...xml.matchAll(/<brk\b[^>]*\bid="(\d+)"/g)].map(match => Number(match[1]));
    assert.deepEqual(breaks, Array.from({ length: pages - 1 }, (_value, index) => 37 * (index + 1)));
    let quantityCells = 0;
    for (let page = 0; page < pages; page++) {
      const offset = 37 * page, final = page === pages - 1;
      assert.equal(sheet.getCell('H' + (2 + offset)).value, delivery.deliveredTo);
      assert.equal(sheet.getCell('H' + (11 + offset)).value, delivery.invoiceNumber);
      assert.equal(sheet.getCell('D' + (37 + offset)).value, delivery.number);
      assert.equal(sheet.getCell('B' + (26 + offset)).value, final ? count : null);
      assert.equal(sheet.getCell('F' + (31 + offset)).value, final ? delivery.preparedByName : null);
      assert.equal(sheet.getCell('C' + (28 + offset)).value, final ? delivery.notes : null);
      for (let row = 12; row <= 25; row++) if (sheet.getCell('A' + (row + offset)).value != null) { quantityCells++; assert.equal(sheet.getCell('A' + (row + offset)).numFmt, '#,##0'); }
    }
    assert.equal(quantityCells, count);
  }
});

test('short two-line remarks use their original footer cells without an extra item page or a font below seven points', async t => {
  const notes = 'Keep cartons upright.\nContact receiving before arrival.';
  const items = Array.from({ length: 14 }, (_value, index) => ({ ...item, id: index + 1, quantity: '1.000' }));
  const api = await fixture(t, { record: { notes, receivedBy: 'Actual receiver' }, items });
  const { workbook } = await api.download(); const sheet = workbook.worksheets[0];
  assert.equal(sheet.model.merges.length, 60); assert.equal(sheet.getCell('C28').value, 'Keep cartons upright.'); assert.equal(sheet.getCell('C29').value, 'Contact receiving before arrival.');
  assert.ok(sheet.getCell('C28').font.size >= 7); assert.ok(sheet.getCell('C29').font.size >= 7); assert.equal(sheet.getCell('M33').value, 'Actual receiver');
});

test('long headers, UOP, descriptions and remarks conserve full text through body continuations without duplicating quantities', async t => {
  const deliveredTo = 'Recipient ' + 'W'.repeat(180), address = 'Building Block '.repeat(40), businessStyle = 'Manufacturing ' + 'W'.repeat(180);
  const unit = 'W'.repeat(30), description = 'Specification ' + 'ExtraordinaryProduct'.repeat(45), notes = 'Instructions ' + 'Retain all packaging materials. '.repeat(65);
  const api = await fixture(t, { record: { deliveredTo, address, businessStyle, notes }, items: [{ ...item, unit, description }] });
  const { workbook } = await api.download(); const sheet = workbook.worksheets[0], pages = sheet.model.merges.length / 60;
  assert.ok(pages > 1); assert.equal(sheet.getCell('H2').value, 'See continuation'); assert.equal(sheet.getCell('G5').value, 'See continuation');
  let text = '', quantities = 0;
  for (let page = 0; page < pages; page++) for (let row = 12; row <= 25; row++) {
    const number = row + page * 37; text += sheet.getCell('J' + number).text;
    if (sheet.getCell('A' + number).value != null) quantities++;
    if (sheet.getCell('F' + number).value != null) assert.ok(sheet.getCell('F' + number).font.size >= 7);
  }
  text = text.replace(/\s+/g, '');
  for (const value of [deliveredTo, address, businessStyle, unit, description, notes]) assert.ok(text.includes(value.replace(/\s+/g, '')), 'Missing continuation content: ' + value.slice(0, 30));
  assert.equal(quantities, 1);
});

test('saved three-place quantities remain exact while unknown header values and quantities stay blank', async t => {
  for (const quantity of ['0.001', '1000000.000', '999999999999999.999']) {
    const api = await fixture(t, { record: { invoiceNumber: null, buyerTin: null, businessStyle: null, receivedBy: null, notes: null }, items: [{ ...item, quantity }] });
    const { workbook } = await api.download(); const sheet = workbook.worksheets[0];
    const expected = quantity === '999999999999999.999' ? '999,999,999,999,999.999' : Number(quantity);
    assert.equal(sheet.getCell('A12').value, expected); assert.equal(sheet.getCell('B26').value, expected);
    for (const address of ['H11', 'M7', 'H10', 'M10', 'M33', 'C28', 'C29']) assert.equal(sheet.getCell(address).value, null);
  }
  const unknown = await fixture(t, { items: [{ ...item, quantity: null }] }); const { workbook } = await unknown.download();
  assert.equal(workbook.worksheets[0].getCell('A12').value, null); assert.equal(workbook.worksheets[0].getCell('B26').value, null);
});

test('independent cell styles preserve mixed quantity formats, left-aligned descriptions and header fonts beside a long UOP', async t => {
  const items = [{ ...item, id: 101, quantity: '1.125' }, { ...item, id: 102, sku: 'P6', quantity: '2.000' }, { ...item, id: 103, sku: 'P7', quantity: '1.000', unit: 'W'.repeat(30) }];
  const api = await fixture(t, { items }); const { workbook } = await api.download(); const sheet = workbook.worksheets[0];
  assert.equal(sheet.getCell('A12').value, 1.125); assert.equal(sheet.getCell('A12').numFmt, '#,##0.000');
  assert.equal(sheet.getCell('A13').value, 2); assert.equal(sheet.getCell('A13').numFmt, '#,##0');
  assert.equal(sheet.getCell('B26').value, 4.125); assert.equal(sheet.getCell('B26').numFmt, '#,##0.000');
  assert.equal(sheet.getCell('F12').font.size, 9); assert.equal(sheet.getCell('F13').font.size, 9); assert.equal(sheet.getCell('F14').font.size, 7);
  for (const address of ['J12', 'J13', 'J14']) { assert.equal(sheet.getCell(address).alignment.horizontal, 'left'); assert.equal(sheet.getCell(address).font.size, 9); }
  for (const address of ['H2', 'G5', 'H10', 'H11']) { assert.equal(sheet.getCell(address).font.size, 9); assert.equal(sheet.getCell(address).alignment.vertical, 'top'); }
  assert.equal(sheet.getCell('G5').alignment.wrapText, true); assert.notEqual(sheet.getCell('J12').alignment.wrapText, true);
  assert.equal(sheet.getCell('F12').alignment.horizontal, 'center'); assert.equal(sheet.getCell('A12').alignment.horizontal, 'right');
});

test('delivery export rejects invalid IDs, missing documents, foreign systems and mutations without business writes', async t => {
  const api = await fixture(t);
  for (const id of ['0', '-1', 'bad', '2147483648']) assert.equal((await api.request(id)).status, 400);
  assert.equal(api.calls.length, 0);
  const missing = await api.request('999'); assert.equal(missing.status, 404); assert.equal((await missing.json()).message, 'Delivery receipt could not be found.'); assert.equal(api.calls.length, 1);
  const unsupported = await api.request('41', 'POST'); assert.equal(unsupported.status, 405); assert.equal(unsupported.headers.get('allow'), 'GET'); assert.equal(api.calls.length, 1);
  const foreign = await fixture(t, { system: 'configuration' }); assert.equal((await foreign.request()).status, 401); assert.equal(foreign.calls.length, 0);
});
