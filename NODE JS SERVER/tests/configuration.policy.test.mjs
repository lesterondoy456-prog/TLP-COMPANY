import { loadRouterWithDatabase, invokeRoute } from './helpers/load-api.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
const forbiddenDatabase = () => { throw new Error('Metadata must not access a database.'); };
const metadataRouter = loadRouterWithDatabase('configuration', { request: forbiddenDatabase, sql: {}, transaction: forbiddenDatabase });
const readMetadata = async () => (await invokeRoute(metadataRouter, 'GET', '/masters', {})).body.modules;
const formMetadata = await readMetadata();
const configurationMetadata = () => structuredClone(formMetadata);
import { validateConfiguration as validateForm, withConfigurationValidation } from '../../ConfigurationSystem/src/helper/validation.js';
const validateConfiguration = (kind, input, current) => {
  const metadata = configurationMetadata().find(module => module.kind === kind);
  if (!metadata) throw new Error('Unknown configuration form.');
  return validateForm(metadata, input, current);
};

const rejects400 = action => assert.throws(action, Error);

test('Machines provide stable code/name/description metadata with one active state', () => {
  assert.deepEqual(validateConfiguration('machines', { code: ' MC-01 ', name: ' Cutting Machine ', description: ' Line A ', isActive: true }), { code: 'MC-01', name: 'Cutting Machine', description: 'Line A', isActive: true });
  assert.equal(validateConfiguration('machines', { code: 'MC-02', name: 'Spare Machine' }).description, null);
  rejects400(() => validateConfiguration('machines', { code: '', name: 'Machine' }));
  rejects400(() => validateConfiguration('machines', { code: 'MC-01', name: '' }));
  rejects400(() => validateConfiguration('machines', { code: 'M'.repeat(41), name: 'Machine' }));
});

test('configuration metadata includes the observed modules and a read-only own-app audit trail', async () => {
  const modules = await readMetadata();
  assert.deepEqual(modules.map(module => module.kind).sort(), ['atc', 'audit-trail', 'banks', 'countries', 'currencies', 'customer-categories', 'locations', 'machines', 'payment-terms', 'product-categories', 'supplies-categories', 'units', 'vat-codes', 'warehouses']);
  assert.equal(modules.find(module => module.kind === 'audit-trail').readOnly, true);
  assert.ok(modules.filter(module => module.kind !== 'audit-trail').every(module => module.readOnly === false));
  assert.ok(modules.every(module => module.fields.every(field => !Object.hasOwn(field, 'maxLength'))), 'Backend metadata must not own form text-length limits.');
  const vat = modules.find(module => module.kind === 'vat-codes');
  const localVat = withConfigurationValidation(vat);
  assert.equal(localVat.fields.find(field => field.key === 'code').maxLength, 40);
  assert.equal(localVat.fields.find(field => field.key === 'description').maxLength, 500);
  assert.equal(Object.hasOwn(vat.fields[0], 'maxLength'), false, 'Frontend decoration must not mutate the server response.');
  assert.deepEqual(vat.fields.find(field => field.key === 'type').options, ['Vat Output', 'Vat Input']);
  assert.deepEqual(vat.fields.find(field => field.key === 'class').options, ['Vatable', 'Vat-Exempt', 'Zero Rated']);
  vat.fields[0].key = 'changed-by-client';
  assert.equal((await readMetadata()).find(module => module.kind === 'vat-codes').fields[0].key, 'code');
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
  assert.equal(term.month, null);
  assert.equal(term.dayOfMonth, null);
  assert.equal(term.forSupplier, false);
  for (const invalid of [{ days: -1 }, { days: 1.5 }, { dateOfMonth: 32 }, { dayOfMonth: -1 }, { dueDateEom: 'false' }]) rejects400(() => validateConfiguration('payment-terms', { description: 'Terms', ...invalid }));
});

test('bank and currency fields roundtrip without accepting writable audit or identity fields', () => {
  const bank = validateConfiguration('banks', {
    name: ' Bank Name ', shortName: ' BN ', accountNo: '001234567890', accountName: 'TTI Laguna Philippines Inc.', swiftCode: 'SWIFT123',
    branchName: 'Makati', address: 'Office Address', accountType: 'Current', currency: 'PHP', account: '1010',
    id: 999, deletedDate: 'forged', createdAt: 'forged', isActive: false,
  });
  assert.equal(bank.name, 'Bank Name');
  assert.equal(bank.accountNo, '001234567890');
  assert.equal(bank.currency, 'PHP');
  assert.equal(bank.isActive, false);
  for (const readonly of ['id', 'deletedDate', 'createdAt']) assert.equal(Object.hasOwn(bank, readonly), false);
  assert.deepEqual(validateConfiguration('currencies', { name: 'Philippine Peso', shortName: 'PHP', symbol: '₱', isDefault: true }), {
    name: 'Philippine Peso', shortName: 'PHP', checkName: null, symbol: '₱', isDefault: true, isActive: true,
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
  assert.throws(() => validateConfiguration('audit-trail', {}), Error);
  for (const kind of ['__proto__', 'countries; DROP TABLE Customers', 'unknown']) assert.throws(() => validateConfiguration(kind, {}), Error);
});

test('non-admin configuration writes are rejected before any transaction or database request', async () => {
  let databaseCalls = 0;
  const unexpectedDatabase = () => { databaseCalls++; throw new Error('Database access is forbidden in this policy test.'); };
  const router = loadRouterWithDatabase('configuration', { request: unexpectedDatabase, sql: {}, transaction: unexpectedDatabase });
  const call = (method, actor, kind) => invokeRoute(router, method, method === 'POST' ? '/masters/:kind' : '/masters/:kind/:id', { configurationUser: actor, params: { kind, id: '1' }, body: { name: 'Mock Country' }, get: () => 'application/json', is: () => true });
  for (const actor of [{ role: 'saleshead' }, { role: 'sales' }, { role: 'owner' }, { system: 'configuration', role: 'configuration' }, { system: 'sales', role: 'admin' }, null]) {
    await assert.rejects(call('POST', actor, 'countries'), error => error.status === 403);
    await assert.rejects(call('DELETE', actor, 'countries'), error => error.status === 403);
  }
  await assert.rejects(call('POST', { system: 'configuration', role: 'admin' }, 'audit-trail'), error => error.status === 405);
  await assert.rejects(call('DELETE', { system: 'configuration', role: 'admin' }, 'audit-trail'), error => error.status === 405);
  assert.equal(databaseCalls, 0);
});

test('configuration API stores absent optional values as NULL and enforces former SQL checks', async () => {
  let record;
  let writes = 0;
  const database = {
    sql: new Proxy({}, { get: () => () => ({}) }),
    transaction: async work => work({}),
    request: () => {
      const values = {};
      return {
        input(key, type, value) { values[key] = value; return this; },
        async query(statement) {
          if (statement.startsWith('SELECT ')) return { recordset: record ? [structuredClone(record)] : [] };
          if (statement.startsWith('INSERT INTO dbo.AuditTrail')) { assert.match(statement, /createdAt\).*SYSUTCDATETIME\(\)/); return { recordset: [] }; }
          writes++;
          if (statement.startsWith('INSERT INTO ')) assert.match(statement, /createdAt,updatedAt\).*SYSUTCDATETIME\(\),SYSUTCDATETIME\(\)/);
          record = { ...record, ...values, id: 101 };
          return { recordset: [{ id: 101 }] };
        },
      };
    },
  };
  const router = loadRouterWithDatabase('configuration', database);
  const call = (method, kind, body) => invokeRoute(router, method, method === 'POST' ? '/masters/:kind' : '/masters/:kind/:id', {
    configurationUser: { id: 1, system: 'configuration', role: 'admin', name: 'Mock Administrator' },
    params: { kind, id: '101' }, body, get: () => 'application/json',
  });
  const created = (await call('POST', 'payment-terms', { description: 'Mock Terms' })).body.record;
  for (const key of ['days', 'month', 'dateOfMonth', 'dayOfMonth']) assert.equal(created[key], null);
  assert.equal(created.forSupplier, false);
  const edited = (await call('PUT', 'payment-terms', { days: 0, month: '' })).body.record;
  assert.equal(edited.days, 0, 'An explicitly supplied zero must be retained.');
  assert.equal(edited.month, null);
  const machine = (await call('POST', 'machines', { code: 'MC-API-01', name: 'Machine API' })).body.record;
  assert.equal(machine.code, 'MC-API-01');
  assert.equal(machine.name, 'Machine API');
  assert.equal(machine.description, null);
  const revisedMachine = (await call('PUT', 'machines', { description: 'Planning reference' })).body.record;
  assert.equal(revisedMachine.id, machine.id);
  assert.equal(revisedMachine.code, 'MC-API-01');
  assert.equal(revisedMachine.description, 'Planning reference');
  const beforeInvalid = writes;
  for (const method of ['POST', 'PUT']) for (const [kind, body] of [
    ['machines', { code: '', name: 'Machine' }],
    ['machines', { code: 'MC-01', name: '' }],
    ['atc', { code: 'MOCK', description: 'Mock', rate: 101 }],
    ['vat-codes', { code: 'MOCK', description: 'Mock', rate: -1 }],
    ['vat-codes', { code: 'MOCK', description: 'Mock', type: 'forged' }],
    ['vat-codes', { code: 'MOCK', description: 'Mock', class: 'forged' }],
    ['payment-terms', { description: 'Mock', days: -1 }],
    ['payment-terms', { description: 'Mock', month: -1 }],
    ['payment-terms', { description: 'Mock', dateOfMonth: 32 }],
    ['payment-terms', { description: 'Mock', dayOfMonth: -1 }],
    ['units', { description: 'Mock', shortName: 'mock', decimal: 7 }],
  ]) await assert.rejects(call(method, kind, body), error => error.status === 400);
  assert.equal(writes, beforeInvalid, 'Constraint-invalid values must be rejected before any table write.');
});
