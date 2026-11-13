import assert from 'node:assert/strict';
import test from 'node:test';
import { expect } from '@playwright/test';
import { mockBrowser } from './helpers/mock-browser.mjs';

const admin = { id: 1, name: 'Mock Administrator', username: 'mock_admin', cpnumber: '', email: '', photo: '', role: 'admin', isActive: true };
const salesAccounts = [
  admin,
  { id: 2, name: 'Mock Sales Head', username: 'mock_head', role: 'saleshead', isActive: true },
  { id: 3, name: 'Inactive Salesperson', username: 'inactive_sales', role: 'sales', isActive: false },
  { id: 4, name: 'Shared Sales Name', username: 'sales_a', role: 'sales', isActive: true },
  { id: 5, name: 'Shared Sales Name', username: 'sales_b', role: 'sales', isActive: true },
];

test('customer form CAS fields, cross-tab validation, and mocked create/edit roundtrip', { timeout: 120_000 }, async t => {
  const customerWrites = [];
  const records = [];
  const resolved = record => ({ ...record, salesInCharge: salesAccounts.find(account => account.id === record.salesInChargeId)?.name || record.salesInCharge || '' });
  const { page, origin, screenshot, assertSafe } = await mockBrowser(t, async ({ method, pathname, body }) => {
    if (method === 'GET' && pathname === '/api/auth/session') return { json: { user: admin } };
    if (method === 'GET' && pathname === '/api/customer-options') return { json: {
      salesInCharges: salesAccounts, countriesOfOrigin: ['TEST ORIGIN'], countries: ['PHILIPPINES'],
      paymentTerms: ['7 DAYS'], categories: ['Mock Category'], taxCodes: ['TAX-MOCK'],
    } };
    if (method === 'GET' && pathname === '/api/customers') return { json: { records: records.map(resolved) } };
    if (method === 'GET' && /^\/api\/customers\/\d+$/.test(pathname)) {
      const record = records.find(item => item.id === Number(pathname.split('/').pop()));
      return { status: record ? 200 : 404, json: record ? { record: resolved(record) } : { message: 'Mock customer not found.' } };
    }
    if (method === 'GET' && ['/api/products', '/api/sales-orders', '/api/sales-invoices', '/api/delivery-receipts', '/api/shipping-invoices', '/api/users'].includes(pathname)) {
      return { json: { records: pathname === '/api/users' ? salesAccounts : [] } };
    }
    if ((method === 'POST' && pathname === '/api/customers') || (method === 'PUT' && /^\/api\/customers\/\d+$/.test(pathname))) {
      customerWrites.push({ method, pathname, body });
      const id = method === 'POST' ? 101 : Number(pathname.split('/').pop());
      const index = records.findIndex(item => item.id === id);
      const record = resolved({ ...(records[index] || {}), ...body, id, code: 'C-MOCK-000001' });
      if (body.salesInChargeId === null) record.salesInCharge = '';
      if (index === -1) records.push(record); else records[index] = record;
      return { status: method === 'POST' ? 201 : 200, json: { record } };
    }
  }, { screenshotName: 'customer-form-mock-last.png' });
  await page.goto(origin);
  await expect(page.getByRole('heading', { name: 'Customer', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'New customer', exact: false }).click();
  const dialog = page.getByRole('dialog');
  const basicTab = dialog.getByRole('tab', { name: 'Basic Info', exact: true });
  const salesTab = dialog.getByRole('tab', { name: 'Sales/DR', exact: true });
  const basic = dialog.getByRole('tabpanel', { name: 'Basic Info', exact: true });
  const sales = dialog.getByRole('tabpanel', { name: 'Sales/DR', exact: true });
  const save = dialog.getByRole('button', { name: 'Save customer', exact: true });
  const basicField = label => label === 'Sales In-charge'
    ? basic.getByRole('combobox', { name: label, exact: true })
    : basic.getByLabel(label, { exact: true });
  const salesField = label => label === 'Discount Type'
    ? sales.getByRole('combobox', { name: label, exact: true })
    : sales.getByLabel(label, { exact: true });

  await expect(basicTab).toHaveAttribute('aria-selected', 'true');
  await expect(salesTab).toHaveAttribute('aria-selected', 'false');
  for (const label of ['Sales In-charge', 'Name *', 'Short Name *', 'Business Style *', 'Office Address *', 'TIN', 'Contact Person', 'Email Address', 'Country Of Origin', 'Country', 'Fax No.', 'Phone No.', 'Category', 'Remarks']) {
    await expect(basicField(label)).toBeVisible();
  }
  for (const title of ['Basic Information', 'Address', 'Other Information']) await expect(basic.getByRole('heading', { name: title, exact: true })).toBeVisible();
  await expect(dialog.getByLabel('Company Id', { exact: true })).toHaveCount(0);
  await expect(dialog.getByText('Company Id', { exact: true })).toHaveCount(0);
  const salesAssignee = basicField('Sales In-charge');
  assert.equal(await salesAssignee.evaluate(element => element.tagName), 'SELECT');
  await expect.poll(() => salesAssignee.evaluate(element => [...element.options].map(option => option.value).sort())).toEqual(['', '4', '5']);
  for (const [id, username] of [['4', 'sales_a'], ['5', 'sales_b']]) {
    const label = await salesAssignee.locator(`option[value="${id}"]`).textContent();
    assert.ok(label.includes('Shared Sales Name') && label.includes(username), 'Duplicate display names must be distinguished by username.');
  }
  await assert.rejects(() => salesAssignee.fill('Arbitrary salesperson'), 'A native account select must reject free typing.');
  await salesTab.click();
  for (const label of ['Sales Name', 'Decimal in Price *', 'Decimal in Total Price *', 'Payment Term', 'Discount', 'Discount Type', 'DR Name', 'VAT Code *', 'Tax Code']) {
    await expect(salesField(label)).toBeVisible();
  }
  for (const title of ['Sales', 'Delivery Receipt', 'TAX']) await expect(sales.getByRole('heading', { name: title, exact: true })).toBeVisible();
  await expect(salesField('Decimal in Price *')).toHaveValue('2');
  await expect(salesField('Decimal in Total Price *')).toHaveValue('2');
  await expect(salesField('Discount Type')).toHaveValue('percent');
  const optionsFor = field => field.evaluate(element => [...document.getElementById(element.getAttribute('list')).options].map(option => option.value));
  const vatCodes = await optionsFor(salesField('VAT Code *'));
  for (const code of ['VS', 'VE', 'VZ']) assert.ok(vatCodes.includes(code));
  const paymentTerms = await optionsFor(salesField('Payment Term'));
  assert.ok(paymentTerms.includes('7 DAYS'), 'Configured payment terms must replace fallback suggestions.');
  assert.equal(paymentTerms.includes('30 DAYS'), false);
  await expect(sales.getByRole('radio', { name: 'Exclusive', exact: true })).toBeChecked();
  await expect(sales.getByRole('radio', { name: 'Inclusive', exact: true })).not.toBeChecked();
  await expect(sales.getByRole('checkbox', { name: 'Include P.O. in Invoice', exact: true })).not.toBeChecked();
  const salesAddress = sales.getByRole('group', { name: 'Sales Address', exact: true });
  const drAddress = sales.getByRole('group', { name: 'Delivery Receipt Address', exact: true });
  await expect(salesAddress.getByRole('radio', { name: 'Office Address', exact: true })).toBeChecked();
  await expect(drAddress.getByRole('radio', { name: 'Office Address', exact: true })).toBeChecked();
  assert.equal(customerWrites.length, 0);

  async function invalidFromOtherTab(targetTab, field) {
    await (targetTab === basicTab ? salesTab : basicTab).click();
    await save.click();
    await expect(targetTab).toHaveAttribute('aria-selected', 'true');
    await expect(field).toBeFocused();
    await expect(dialog.getByRole('alert')).toBeVisible();
    assert.equal(customerWrites.length, 0, 'Invalid or hidden required fields must prevent any API request.');
  }
  const basicRequired = [
    ['Name *', '  Mock CAS Customer  '],
    ['Short Name *', '  MOCK CAS  '],
    ['Business Style *', '  Wholesale supplier  '],
    ['Office Address *', '  Makati headquarters  '],
  ];
  for (const [label, value] of basicRequired) {
    await invalidFromOtherTab(basicTab, basicField(label));
    await basicField(label).fill(value);
  }
  await salesTab.click();
  for (const label of ['Sales Name', 'DR Name', 'VAT Code *']) await salesField(label).fill('');
  for (const [label, value] of [['Sales Name', 'MOCK SALES NAME'], ['DR Name', 'MOCK DR NAME'], ['VAT Code *', 'VAT-MOCK']]) {
    await invalidFromOtherTab(salesTab, salesField(label));
    await salesField(label).fill(value);
  }

  await basicTab.click();
  const optionalBasic = {
    TIN: '  123-456-789  ', 'Contact Person': '  Casey Mock  ',
    'Email Address': 'customer@example.test', 'Country Of Origin': 'Philippines', Country: 'Philippines',
    'Fax No.': '0288881111', 'Phone No.': '09171234567', Category: 'Wholesale', Remarks: '  Mock customer form scenario  ',
  };
  for (const [label, value] of Object.entries(optionalBasic)) await basicField(label).fill(value);
  await salesAssignee.selectOption('5');
  const categories = await optionsFor(basicField('Category'));
  assert.ok(categories.includes('Mock Category'));
  const origins = await optionsFor(basicField('Country Of Origin'));
  assert.ok(origins.includes('TEST ORIGIN'));
  const countries = await optionsFor(basicField('Country'));
  assert.ok(countries.includes('PHILIPPINES'));
  await basic.getByRole('button', { name: 'Add delivery address', exact: true }).click();
  await basicField('Delivery Address 1').fill('  Warehouse A  ');
  await basic.getByRole('button', { name: 'Add delivery address', exact: true }).click();
  await basicField('Delivery Address 2').fill('Temporary address');
  await basic.getByRole('button', { name: 'Add delivery address', exact: true }).click();
  await basicField('Delivery Address 3').fill('  Warehouse C  ');
  await basic.getByRole('button', { name: 'Remove delivery address 2', exact: true }).click();
  await expect(basicField('Delivery Address 2')).toHaveValue('  Warehouse C  ');
  await expect(basic.getByLabel('Delivery Address 3', { exact: true })).toHaveCount(0);
  await screenshot('customer-basic-info-mocked.png');

  await salesTab.click();
  await salesField('Decimal in Price *').fill('3');
  await salesField('Decimal in Total Price *').fill('4');
  await salesField('Decimal in Price *').fill('7');
  await invalidFromOtherTab(salesTab, salesField('Decimal in Price *'));
  await salesField('Decimal in Price *').fill('3');
  await salesField('Decimal in Total Price *').fill('-1');
  await invalidFromOtherTab(salesTab, salesField('Decimal in Total Price *'));
  await salesField('Decimal in Total Price *').fill('4');
  await salesField('Payment Term').fill('30 days');
  await salesAddress.getByRole('radio', { name: 'Delivery Address', exact: true }).check();
  await drAddress.getByRole('radio', { name: 'Delivery Address', exact: true }).check();
  await salesField('Discount').fill('101');
  await invalidFromOtherTab(salesTab, salesField('Discount'));
  await salesField('Discount Type').selectOption('amount');
  await salesField('Discount').fill('1000000001');
  await invalidFromOtherTab(salesTab, salesField('Discount'));
  await salesField('Discount').fill('1250.1234567');
  await invalidFromOtherTab(salesTab, salesField('Discount'));
  await salesField('Discount').fill('1250.123456');
  await sales.getByRole('checkbox', { name: 'Include P.O. in Invoice', exact: true }).check();
  await sales.getByRole('radio', { name: 'Inclusive', exact: true }).check();
  await salesField('Tax Code').fill('TAX-MOCK');
  assert.ok((await optionsFor(salesField('Tax Code'))).includes('TAX-MOCK'));
  await screenshot('customer-sales-dr-mocked.png');
  assert.equal(customerWrites.length, 0, 'Only explicitly saving the valid form may send the intercepted request.');
  await save.click();
  await expect(dialog).toHaveCount(0);
  assert.equal(customerWrites.length, 1);
  assert.equal(customerWrites[0].method, 'POST');
  const expected = {
    name: 'Mock CAS Customer', shortName: 'MOCK CAS', businessStyle: 'Wholesale supplier', salesInChargeId: 5,
    address: 'Makati headquarters', deliveryAddresses: ['Warehouse A', 'Warehouse C'], contactPerson: 'Casey Mock',
    cpnumber: '09171234567', email: 'customer@example.test', tin: '123-456-789', faxNo: '0288881111',
    countryOfOrigin: 'Philippines', country: 'Philippines', category: 'Wholesale', remarks: 'Mock customer form scenario',
    salesName: 'MOCK SALES NAME', drName: 'MOCK DR NAME', decimalInPrice: 3, decimalInTotalPrice: 4,
    paymentTerm: '30 days', salesAddressType: 'delivery', drAddressType: 'delivery', discount: 1250.123456,
    discountType: 'amount', includePoInInvoice: true, vatCode: 'VAT-MOCK', vatInclusive: true, taxCode: 'TAX-MOCK', isActive: true,
  };
  const createBody = { ...customerWrites[0].body };
  assert.deepEqual(createBody, expected, 'The mocked request must contain every customer field with its intended type.');
  assert.equal(Object.hasOwn(createBody, 'salesDeliveryAddressIndex'), false);
  assert.equal(Object.hasOwn(createBody, 'drDeliveryAddressIndex'), false);
  assert.equal(Object.hasOwn(createBody, 'salesInCharge'), false, 'Only the stable account ID is submitted; the backend supplies the name.');
  assert.equal(records[0].salesInCharge, 'Shared Sales Name');

  salesAccounts.find(account => account.id === 5).name = 'Renamed Mock Salesperson';
  await page.reload();
  const row = page.getByRole('row').filter({ hasText: expected.name });
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(dialog.getByLabel('Company Id', { exact: true })).toHaveCount(0);
  await expect(salesAssignee).toHaveValue('5');
  await expect(salesAssignee.locator('option[value="5"]')).toHaveText('Renamed Mock Salesperson (sales_b)');
  for (const [label, value] of [...basicRequired.map(([label]) => [label, ({ 'Name *': expected.name, 'Short Name *': expected.shortName, 'Business Style *': expected.businessStyle, 'Office Address *': expected.address })[label]]), ...Object.entries(optionalBasic).map(([label, value]) => [label, value.trim()])]) {
    await expect(basicField(label)).toHaveValue(value);
  }
  await expect(basicField('Delivery Address 1')).toHaveValue('Warehouse A');
  await expect(basicField('Delivery Address 2')).toHaveValue('Warehouse C');
  await salesTab.click();
  for (const [label, value] of [['Sales Name', expected.salesName], ['DR Name', expected.drName], ['Decimal in Price *', '3'], ['Decimal in Total Price *', '4'], ['Payment Term', '30 days'], ['Discount', '1250.123456'], ['Discount Type', 'amount'], ['VAT Code *', 'VAT-MOCK'], ['Tax Code', 'TAX-MOCK']]) {
    await expect(salesField(label)).toHaveValue(value);
  }
  await expect(salesAddress.getByRole('radio', { name: 'Delivery Address', exact: true })).toBeChecked();
  await expect(drAddress.getByRole('radio', { name: 'Delivery Address', exact: true })).toBeChecked();
  await expect(sales.getByRole('checkbox', { name: 'Include P.O. in Invoice', exact: true })).toBeChecked();
  await expect(sales.getByRole('radio', { name: 'Inclusive', exact: true })).toBeChecked();
  await basicTab.click();
  await basicField('Name *').fill('Edited mock customer');
  await salesTab.click();
  await expect(salesField('Discount')).toHaveValue('1250.123456');
  await save.click();
  await expect(dialog).toHaveCount(0);
  assert.equal(customerWrites.length, 2);
  assert.equal(customerWrites[1].method, 'PUT');
  assert.equal(customerWrites[1].pathname, '/api/customers/101');
  const editBody = { ...customerWrites[1].body };
  assert.deepEqual(editBody, { ...expected, name: 'Edited mock customer' });
  records[0] = { ...records[0], salesInChargeId: null, salesInCharge: 'Legacy salesperson' };
  await page.reload();
  await page.getByRole('row').filter({ hasText: 'Edited mock customer' }).getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(salesAssignee).toHaveValue('__legacy__');
  await expect(salesAssignee.locator('option[value="__legacy__"]')).toBeDisabled();
  await save.click();
  await expect(dialog).toHaveCount(0);
  assert.equal(customerWrites.length, 3);
  const preservedLegacy = { ...expected, name: 'Edited mock customer' };
  delete preservedLegacy.salesInChargeId;
  assert.deepEqual(customerWrites[2].body, preservedLegacy, 'Unchanged historical text must not be reassigned or cleared by editing other fields.');
  await page.getByRole('row').filter({ hasText: 'Edited mock customer' }).getByRole('button', { name: 'Edit', exact: true }).click();
  await salesAssignee.selectOption('');
  await save.click();
  await expect(dialog).toHaveCount(0);
  assert.equal(customerWrites.length, 4);
  assert.deepEqual(customerWrites[3].body, { ...expected, name: 'Edited mock customer', salesInChargeId: null });
  assertSafe();
});
