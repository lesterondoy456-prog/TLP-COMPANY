import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import test from 'node:test';
import express from 'express';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { loadRouterWithDatabase } from './helpers/load-api.mjs';

const amounts = { grossAmount: '1500.000000', lineDiscountAmount: '12.000000', headerDiscountAmount: '5.000000', discountAmount: '17.000000', netAmount: '1356.444434', vatAmount: '123.555566', amount: '1480.000000', total: '1480.000000' };
const baseInvoice = { id: 31, orderId: 7, number: 'SI-EXCEL-0031', customerId: 2, billToCustomerId: 3, customerName: 'Frozen order customer', customerAddress: 'Frozen order office', billToName: 'Frozen billing customer', billToAddress: 'Frozen billing office', buyerTin: '001-023-045-000', shipToName: 'Frozen original customer DR name', preparedByName: 'Frozen invoice creator', invoiceDate: '2026-11-17', paymentTerm: '30 DAYS', currency: 'USD', vatClass: 'Vatable', vatInclusive: false, discount: '5.000000', notes: null, ...amounts };
const baseItem = { id: 101, invoiceId: 31, orderItemId: 11, productId: 5, sku: 'P5', productName: 'Product', description: 'Product', unit: 'PCS', quantity: '1.000', unitPrice: '0.115300', convertedUnitPrice: '0.115304', grossAmount: '10.004434', amount: '11.060000', lineTotal: '11.060000' };

async function fixture(t, { invoice = {}, items = [baseItem], missing = false, system = 'sales' } = {}) {
  const record = { ...baseInvoice, ...invoice };
  const calls = [];
  const database = {
    sql: new Proxy({}, { get: (_target, type) => type === 'MAX' ? -1 : (...args) => ({ type, args }) }),
    transaction() { throw new Error('Excel downloads must never open a business transaction.'); },
    request() {
      const values = {};
      return {
        input(name, _type, value) { values[name] = value; return this; },
        async query(query) {
          assert.match(query, /^SELECT /, 'Only read-only SQL is permitted.');
          calls.push({ query, values: { ...values } });
          if (query.startsWith('SELECT i.id')) {
            for (const key of Object.keys(amounts)) assert.ok(query.includes('CONVERT(varchar(60),i.' + key + ') AS ' + key), key);
            assert.match(query, /i\.buyerTin,i\.shipToName,i\.vatClass,COALESCE\(i\.preparedByName,invoiceCreator\.name\) AS preparedByName/);
            assert.doesNotMatch(query, /JOIN dbo\.(?:Customers|ConfigVatCodes)/);
            return { recordset: missing || values.id !== 31 ? [] : [{ ...record }] };
          }
          if (query.includes('FROM dbo.SalesInvoiceItems WHERE invoiceId=@invoiceId')) {
            assert.equal(values.invoiceId, 31); assert.equal(values.orderId, 7);
            assert.doesNotMatch(query, /FROM dbo\.SalesOrderItems/);
            return { recordset: structuredClone(items) };
          }
          throw new Error('Unexpected fake Excel SQL: ' + query.slice(0, 100));
        },
      };
    },
  };
  const app = express();
  app.use((_req, res, next) => { res.locals.user = { id: 1, system, role: 'sales', isActive: true }; next(); });
  app.use('/api/sales', loadRouterWithDatabase('sales', database));
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ message: error.message }));
  const server = createServer(app);
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  const origin = 'http://127.0.0.1:' + server.address().port;
  return {
    calls, record,
    async request(id = '31', method = 'GET') { return fetch(origin + '/api/sales/sales-invoices/' + id + '/excel', { method }); },
    async download() {
      const response = await this.request();
      assert.equal(response.status, 200);
      assert.match(response.headers.get('content-type'), /^application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet/);
      assert.equal(response.headers.get('content-disposition'), 'attachment; filename="SI-EXCEL-0031.xlsx"');
      assert.equal(response.headers.get('cache-control'), 'no-store');
      const buffer = Buffer.from(await response.arrayBuffer());
      assert.equal(buffer.subarray(0, 2).toString(), 'PK', 'The endpoint returns a genuine XLSX ZIP workbook.');
      const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(buffer);
      return { workbook, buffer };
    },
  };
}

function bodyText(sheet, pages) {
  const values = [];
  for (let page = 0; page < pages; page++) for (let row = 11; row <= 24; row++) values.push(sheet.getCell('J' + (row + page * 51)).text);
  return values.join(' ').replace(/\s+/g, '');
}

test('Excel endpoint returns a styled data-only workbook using frozen invoice values and original cell placement', async t => {
  const api = await fixture(t);
  const { workbook, buffer } = await api.download();
  await mkdir(new URL('../.qa/invoice-template/', import.meta.url), { recursive: true });
  await writeFile(new URL('../.qa/invoice-template/invoice-excel-1.xlsx', import.meta.url), buffer);
  assert.equal(workbook.worksheets.length, 1);
  const sheet = workbook.worksheets[0];
  for (const [address, value] of [['G2', baseInvoice.billToName], ['C5', baseInvoice.billToAddress], ['G8', baseInvoice.shipToName], ['X5', baseInvoice.paymentTerm], ['X8', baseInvoice.buyerTin], ['F45', baseInvoice.preparedByName], ['V51', baseInvoice.number]]) assert.equal(sheet.getCell(address).value, value, address);
  assert.equal(sheet.getCell('X2').value.toISOString().slice(0, 10), '2026-11-17');
  assert.equal(sheet.getCell('A11').value, 1);
  assert.equal(sheet.getCell('A11').numFmt, '#,##0');
  assert.equal(sheet.getCell('A25').numFmt, '#,##0');
  assert.equal(sheet.getCell('H11').value, 'PCS');
  assert.equal(sheet.getCell('T11').value, 0.115304, 'Retain the six-place saved value under the five-place display format.');
  assert.equal(sheet.getCell('T11').numFmt, '#,##0.00000');
  assert.equal(sheet.getCell('W11').value, 10.004434, 'Print the saved line gross, not tax-inclusive amount or quantity times price.');
  assert.equal(sheet.getCell('W11').numFmt, '#,##0.00');
  for (const [address, value] of [['M29', 1356.444434], ['M30', 0], ['M33', 0], ['M35', 123.555566], ['Y31', 0], ['Y36', 17], ['Y41', 123.555566], ['Y43', 1480]]) assert.equal(sheet.getCell(address).value, value, address);
  for (const address of ['Y29', 'Y34', 'Y39', 'E47', 'E49']) assert.equal(sheet.getCell(address).value, null, address);
  assert.equal(sheet.getCell('X43').value, '$');
  assert.equal(sheet.getCell('Q11').value, '$');
  assert.equal(sheet.getColumn('C').hidden, true);
  assert.equal(sheet.model.merges.length, 116);
  assert.equal(sheet.pageSetup.paperSize, 9);
  assert.equal(sheet.pageSetup.orientation, 'portrait');
  assert.equal(sheet.pageSetup.scale, 100);
  assert.equal(sheet.pageSetup.fitToPage, false);
  assert.deepEqual(sheet.pageSetup.margins, { left: 0.23, right: 0.27, top: 0.3, bottom: 0.2, header: 0.3, footer: 0.3 });
  assert.match(sheet.headerFooter.oddFooter, /SI-EXCEL-0031.*Page &P of &N/);
  assert.equal(api.calls.length, 2);
  const zip = await JSZip.loadAsync(buffer);
  for (const entry of Object.values(zip.files).filter(entry => /^xl\/worksheets\/sheet\d+\.xml$/.test(entry.name))) assert.doesNotMatch(await entry.async('string'), /<f(?:\s|>)/, 'Printed values must never be spreadsheet formulas.');
  const source = new ExcelJS.Workbook(); await source.xlsx.load(await readFile(new URL('../templates/SalesInvoice.xlsx', import.meta.url)));
  let filled = 0; source.worksheets[0].eachRow(row => row.eachCell(cell => { if (cell.value != null) filled++; }));
  assert.equal(filled, 0, 'The source template contains no company/customer/sample data.');
});

test('14, 15 and 100 invoice items paginate on the active worksheet with repeated headers and final-page totals only', async t => {
  for (const count of [14, 15, 100]) {
    const items = Array.from({ length: count }, (_value, index) => ({ ...baseItem, id: 101 + index, sku: 'P' + (index + 1), description: 'Item ' + (index + 1) }));
    const api = await fixture(t, { items });
    const { workbook, buffer } = await api.download();
    if (count === 15 || count === 100) await writeFile(new URL('../.qa/invoice-template/invoice-excel-' + count + '.xlsx', import.meta.url), buffer);
    assert.equal(workbook.worksheets.length, 1);
    const sheet = workbook.worksheets[0], pages = Math.ceil(count / 14);
    assert.equal(sheet.pageSetup.printArea.replace(/\$/g, ''), 'A1:AA' + (51 * pages));
    assert.equal(sheet.model.merges.length, 116 * pages);
    const zip = await JSZip.loadAsync(buffer);
    const xml = await zip.file('xl/worksheets/sheet1.xml').async('string');
    const breaks = [...xml.matchAll(/<brk\b[^>]*\bid="(\d+)"/g)].map(match => Number(match[1]));
    assert.deepEqual(breaks, Array.from({ length: pages - 1 }, (_value, index) => 51 * (index + 1)), 'ExcelJS does not restore manual breaks on read; inspect their actual workbook XML.');
    let recorded = 0;
    for (let page = 0; page < pages; page++) {
      const offset = 51 * page, final = page === pages - 1;
      assert.equal(sheet.getCell('G' + (2 + offset)).value, baseInvoice.billToName);
      assert.equal(sheet.getCell('V' + (51 + offset)).value, baseInvoice.number);
      assert.equal(sheet.getCell('Y' + (43 + offset)).value, final ? 1480 : null);
      assert.equal(sheet.getCell('F' + (45 + offset)).value, final ? baseInvoice.preparedByName : null);
      assert.equal(sheet.getCell('A' + (25 + offset)).value, final ? count : null);
      for (let row = 11; row <= 24; row++) if (sheet.getCell('A' + (row + offset)).value != null) recorded++;
    }
    assert.equal(recorded, count);
  }
});

test('VAT classes and inclusive, exclusive or unknown VAT data use only saved totals and leave the three intermediate slots blank', async t => {
  for (const vatClass of ['Vatable', 'Vat-Exempt', 'Zero Rated', null]) for (const vatInclusive of [true, false, null]) {
    const api = await fixture(t, { invoice: { vatClass, vatInclusive } });
    const { workbook } = await api.download(); const sheet = workbook.worksheets[0];
    for (const [address, name] of [['M29', 'Vatable'], ['M30', 'Vat-Exempt'], ['M33', 'Zero Rated']]) assert.equal(sheet.getCell(address).value, vatClass == null ? null : vatClass === name ? 1356.444434 : 0);
    assert.equal(sheet.getCell('Y31').value, vatInclusive == null ? null : vatInclusive ? 123.555566 : 0);
    assert.equal(sheet.getCell('Y41').value, vatInclusive == null ? null : vatInclusive ? 0 : 123.555566);
    assert.equal(sheet.getCell('Y36').value, 17); assert.equal(sheet.getCell('Y43').value, 1480);
    for (const address of ['Y29', 'Y34', 'Y39']) assert.equal(sheet.getCell(address).value, null);
  }
  const unknown = await fixture(t, { invoice: { vatAmount: null, vatInclusive: false, vatClass: null, buyerTin: null, shipToName: null } });
  const { workbook } = await unknown.download(); const sheet = workbook.worksheets[0];
  for (const address of ['M29', 'M30', 'M33', 'M35', 'Y31', 'Y41', 'X8', 'G8']) assert.equal(sheet.getCell(address).value, null, address);
});

test('long headers, UOP, descriptions and remarks continue without losing text or repeating item quantities and money', async t => {
  const buyer = 'Wide billing name ' + 'W'.repeat(180), address = 'Office ' + 'Building Block '.repeat(35), unit = 'MICROMETER-WIDE-UNIT-LABEL';
  const description = 'Product description ' + 'ExtraordinarySpecification'.repeat(30), notes = 'Dispatch instructions ' + 'Keep all cartons sealed. '.repeat(60);
  const api = await fixture(t, { invoice: { billToName: buyer, billToAddress: address, notes }, items: [{ ...baseItem, unit, description }] });
  const { workbook } = await api.download(); const sheet = workbook.worksheets[0];
  const pages = sheet.model.merges.length / 116;
  assert.ok(pages > 1);
  assert.equal(sheet.getCell('G2').value, 'See continuation');
  assert.equal(sheet.getCell('C5').value, 'See continuation');
  const text = bodyText(sheet, pages);
  for (const value of [buyer, address, unit, description, notes]) assert.ok(text.includes(value.replace(/\s+/g, '')), 'Missing continuation text: ' + value.slice(0, 30));
  let quantityCells = 0, priceCells = 0, grossCells = 0;
  for (let page = 0; page < pages; page++) for (let row = 11; row <= 24; row++) {
    const number = row + page * 51;
    if (sheet.getCell('A' + number).value != null) quantityCells++;
    if (sheet.getCell('T' + number).value != null) priceCells++;
    if (sheet.getCell('W' + number).value != null) grossCells++;
    if (sheet.getCell('H' + number).value != null) assert.ok(sheet.getCell('H' + number).font.size >= 7);
  }
  assert.equal(quantityCells, 1); assert.equal(priceCells, 1); assert.equal(grossCells, 1);
});

test('Excel export keeps large five-place prices as exact text and retains safe legacy buyer snapshots', async t => {
  const api = await fixture(t, { invoice: { billToCustomerId: null, billToName: null, billToAddress: null, buyerTin: null, shipToName: null, vatClass: null }, items: [{ ...baseItem, convertedUnitPrice: '999999999999.123455' }] });
  const { workbook } = await api.download(); const sheet = workbook.worksheets[0];
  assert.equal(sheet.getCell('T11').value, '999,999,999,999.12346');
  assert.equal(sheet.getCell('G2').value, baseInvoice.customerName);
  assert.equal(sheet.getCell('C5').value, baseInvoice.customerAddress);
  for (const address of ['X8', 'G8', 'M29', 'M30', 'M33']) assert.equal(sheet.getCell(address).value, null);
});

test('invalid IDs, missing invoices, unsupported methods and foreign system users produce no workbook or business writes', async t => {
  const api = await fixture(t);
  for (const id of ['0', '-1', 'bad', '2147483648']) assert.equal((await api.request(id)).status, 400);
  assert.equal(api.calls.length, 0);
  const missing = await api.request('999'); assert.equal(missing.status, 404); assert.equal((await missing.json()).message, 'Sales invoice could not be found.');
  assert.equal(api.calls.length, 1);
  const unsupported = await api.request('31', 'POST'); assert.equal(unsupported.status, 405); assert.equal(unsupported.headers.get('allow'), 'GET');
  const foreign = await fixture(t, { system: 'configuration' });
  assert.equal((await foreign.request()).status, 401); assert.equal(foreign.calls.length, 0);
});
