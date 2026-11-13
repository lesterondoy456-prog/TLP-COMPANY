import assert from 'node:assert/strict';
import test from 'node:test';
import { configurationMetadata, createConfigurationService, validateConfiguration } from '../configuration.js';

const rejects400 = action => assert.throws(action, error => error.status === 400);

test('configuration metadata includes the observed modules and a read-only own-app audit trail', () => {
  const modules = configurationMetadata();
  assert.deepEqual(modules.map(module => module.kind).sort(), ['atc', 'audit-trail', 'banks', 'countries', 'currencies', 'customer-categories', 'locations', 'payment-terms', 'product-categories', 'supplies-categories', 'units', 'vat-codes', 'warehouses']);
  assert.equal(modules.find(module => module.kind === 'audit-trail').readOnly, true);
  assert.ok(modules.filter(module => module.kind !== 'audit-trail').every(module => module.readOnly === false));
  const vat = modules.find(module => module.kind === 'vat-codes');
  assert.deepEqual(vat.fields.find(field => field.key === 'type').options, ['Vat Output', 'Vat Input']);
  assert.deepEqual(vat.fields.find(field => field.key === 'class').options, ['Vatable', 'Vat-Exempt', 'Zero Rated']);
  vat.fields[0].key = 'changed-by-client';
  assert.equal(configurationMetadata().find(module => module.kind === 'vat-codes').fields[0].key, 'code');
});

test('VAT and ATC validate percentage ranges, options, and decimal precision', () => {
  const vat = { code: ' VS ', description: ' Vatable Sales ', type: 'Vat Output', class: 'Vatable', rate: 12, prodVatInd: true, accountCode: ' OUTPUT-VAT ' };
  assert.deepEqual(validateConfiguration('vat-codes', vat), { code: 'VS', description: 'Vatable Sales', type: 'Vat Output', class: 'Vatable', rate: 12, prodVatInd: true, accountCode: 'OUTPUT-VAT', isActive: true });
  for (const invalid of [{ rate: -1 }, { rate: 101 }, { rate: 12.1234567 }, { type: 'Unknown' }, { class: 'Unknown' }, { prodVatInd: 'true' }, { code: '' }]) rejects400(() => validateConfiguration('vat-codes', { ...vat, ...invalid }));
  assert.equal(validateConfiguration('atc', { code: 'WC010', description: 'Withholding', rate: 10.123456 }).rate, 10.123456);
  rejects400(() => validateConfiguration('atc', { code: 'WC010', description: 'Withholding', rate: 100.000001 }));
});

test('unit precision and payment-term calendar controls accept only supported values', () => {
  const unit = { description: ' Piece ', shortName: ' pc ', forProduct: true, forSupplies: false, decimal: 6 };
  assert.deepEqual(validateConfiguration('units', unit), { description: 'Piece', shortName: 'pc', forProduct: true, forSupplies: false, decimal: 6, isActive: true });
  for (const invalid of [{ decimal: 7 }, { decimal: -1 }, { decimal: 1.5 }, { shortName: '' }, { forProduct: 1 }]) rejects400(() => validateConfiguration('units', { ...unit, ...invalid }));
  const term = validateConfiguration('payment-terms', { description: '30 DAYS', days: 30, dateOfMonth: 31, dueDateEom: true, forCustomer: true });
  assert.equal(term.month, 0);
  assert.equal(term.dayOfMonth, 0);
  assert.equal(term.forSupplier, false);
  for (const invalid of [{ days: -1 }, { days: 1.5 }, { dateOfMonth: 32 }, { dayOfMonth: -1 }, { dueDateEom: 'false' }]) rejects400(() => validateConfiguration('payment-terms', { description: 'Terms', ...invalid }));
});

test('bank and currency fields roundtrip without accepting writable audit or identity fields', () => {
  const bank = validateConfiguration('banks', {
    name: ' Bank Name ', shortName: ' BN ', accountNo: '001234567890', accountName: 'TLP COMPANY', swiftCode: 'SWIFT123',
    branchName: 'Makati', address: 'Office Address', accountType: 'Current', currency: 'PHP', account: '1010',
    id: 999, deletedDate: 'forged', createdAt: 'forged', isActive: false,
  });
  assert.equal(bank.name, 'Bank Name');
  assert.equal(bank.accountNo, '001234567890');
  assert.equal(bank.currency, 'PHP');
  assert.equal(bank.isActive, false);
  for (const readonly of ['id', 'deletedDate', 'createdAt']) assert.equal(Object.hasOwn(bank, readonly), false);
  assert.deepEqual(validateConfiguration('currencies', { name: 'Philippine Peso', shortName: 'PHP', symbol: '₱', isDefault: true }), {
    name: 'Philippine Peso', shortName: 'PHP', checkName: '', symbol: '₱', isDefault: true, isActive: true,
  });
});

test('partial configuration edits preserve omitted values and never treat readonly fields as updates', () => {
  const existing = validateConfiguration('payment-terms', { description: '30 DAYS', days: 30, month: 1, forCustomer: true, forSupplier: true, isActive: false });
  const updated = validateConfiguration('payment-terms', { description: ' Revised Terms ', id: 99, deletedDate: null }, existing);
  assert.equal(updated.description, 'Revised Terms');
  assert.equal(updated.days, 30);
  assert.equal(updated.month, 1);
  assert.equal(updated.forCustomer, true);
  assert.equal(updated.forSupplier, true);
  assert.equal(updated.isActive, false);
  assert.equal(Object.hasOwn(updated, 'id'), false);
  assert.throws(() => validateConfiguration('audit-trail', {}), error => error.status === 405);
  for (const kind of ['__proto__', 'countries; DROP TABLE Customers', 'unknown']) assert.throws(() => validateConfiguration(kind, {}), error => error.status === 404);
});

test('non-admin configuration writes are rejected before any transaction or database request', async () => {
  let databaseCalls = 0;
  const unexpectedDatabase = () => { databaseCalls++; throw new Error('Database access is forbidden in this policy test.'); };
  const service = createConfigurationService({ request: unexpectedDatabase, sql: {}, transaction: unexpectedDatabase });
  for (const actor of [{ role: 'saleshead' }, { role: 'sales' }, { role: 'owner' }, null]) {
    await assert.rejects(service.saveConfiguration('countries', { name: 'Mock Country' }, actor), error => error.status === 403);
    await assert.rejects(service.deactivateConfiguration('countries', 1, actor), error => error.status === 403);
  }
  await assert.rejects(service.saveConfiguration('audit-trail', {}, { role: 'admin' }), error => error.status === 405);
  await assert.rejects(service.deactivateConfiguration('audit-trail', 1, { role: 'admin' }), error => error.status === 405);
  assert.equal(databaseCalls, 0);
});
