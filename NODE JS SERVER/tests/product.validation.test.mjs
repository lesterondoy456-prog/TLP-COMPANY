import assert from 'node:assert/strict';
import test from 'node:test';
import { validateCustomer, validateProduct } from '../../SalesSystem/src/helper/validation.js';
import { validateSupplier } from '../../PurchasingSystem/src/helper/validation.js';

const product = () => ({ sku: 'P-001', description: 'Finished Product', unit: 'pcs', currency: 'PHP', secondaryUnit: 'box', quantityPerSecondaryUnit: 12, linkedSupplies: [{ suppliesId: 10, quantity: 0.123456, unit: 'kg' }] });
const invalid = input => assert.throws(() => validateProduct(input), error => error.name === 'FormValidationError');

test('Customer and Supplier TIN values preserve leading zeros and hyphens as text', () => {
  const tin = '001-234-567-000';
  const customer = validateCustomer({ name: 'Mock Customer', shortName: 'Mock', businessStyle: 'Wholesale', address: 'Office', salesName: 'Customer', drName: 'Customer', vatCode: 'VS', tin });
  assert.equal(customer.tin, tin);
  assert.equal(typeof customer.tin, 'string');
  const supplier = { name: 'Mock Supplier', shortName: 'Mock', businessStyle: 'Wholesale', address: 'Office', vatCode: 'VS', decimalInPrice: 2, decimalInTotalPrice: 2, tin };
  assert.deepEqual(validateSupplier(supplier), {});
  assert.equal(supplier.tin, tin);
});

test('product links preserve six-place material quantities without creating finished-product stock', () => {
  const result = validateProduct(product());
  assert.equal(result.name, 'Finished Product');
  assert.equal(result.stock, 0);
  assert.equal(result.linkedSupplies[0].quantity, 0.123456);
  for (const change of [{ quantityPerSecondaryUnit: 0 }, { quantityPerSecondaryUnit: -1 }, { quantityPerSecondaryUnit: 1.1234567 }]) invalid({ ...product(), ...change });
  for (const quantity of [0, -1, 1.1234567]) invalid({ ...product(), linkedSupplies: [{ suppliesId: 10, quantity, unit: 'kg' }] });
  invalid({ ...product(), linkedSupplies: [{ suppliesId: 10, quantity: 1, unit: 'kg' }, { suppliesId: 10, quantity: 2, unit: 'kg' }] });
});

test('product approvals retain customer, approval date and remarks while ignoring retired fields', () => {
  const result = validateProduct({ ...product(), planType: 'Old plan', color: 'Old color', thickness: -100, tagColor: '#3366ff', customerApprovals: [{ customerId: 20, approvalDate: '', eolDate: 'not-a-date', approvalRemarks: ' Test ', eolRemarks: 'Old remarks' }] });
  assert.deepEqual(result.customerApprovals, [{ customerId: 20, approvalDate: null, approvalRemarks: 'Test' }]);
  for (const key of ['planType', 'color', 'thickness']) assert.equal(Object.hasOwn(result, key), false);
  assert.equal(result.tagColor, '#3366ff');
  const staleCurrent = { ...result, planType: 'Old plan', color: 'Old color', thickness: 1, customerApprovals: [{ ...result.customerApprovals[0], eolDate: '2026-01-01', eolRemarks: 'Old remarks' }] };
  const edited = validateProduct({ revision: '2' }, staleCurrent);
  for (const key of ['planType', 'color', 'thickness']) assert.equal(Object.hasOwn(edited, key), false);
  assert.deepEqual(edited.customerApprovals, result.customerApprovals);
  invalid({ ...product(), customerApprovals: [{ customerId: 20, approvalDate: '2026-02-30' }] });
  invalid({ ...product(), customerApprovals: [{ customerId: 20 }, { customerId: 20 }] });
});

test('partial product edits preserve child collections and stock, while explicit empty arrays clear only that collection', () => {
  const existing = validateProduct({ ...product(), stock: 5, processes: [{ name: 'Printing' }], offices: [{ name: 'TTI Laguna Philippines Inc.' }], inventorySetup: 'monthly' });
  const edited = validateProduct({ revision: '2' }, existing);
  assert.equal(edited.stock, 5);
  assert.deepEqual(edited.linkedSupplies, existing.linkedSupplies);
  assert.deepEqual(edited.processes, existing.processes);
  assert.equal(Object.hasOwn(existing, 'offices'), false);
  const staleOfficeInput = validateProduct({ offices: 'ignored stale client payload' }, existing);
  assert.equal(Object.hasOwn(staleOfficeInput, 'offices'), false);
  assert.equal(edited.inventorySetup, 'monthly');
  const setupChanged = validateProduct({ inventorySetup: 'quarterly' }, existing);
  assert.equal(setupChanged.inventorySetup, 'quarterly');
  assert.equal(setupChanged.stock, 5);
  const cleared = validateProduct({ linkedSupplies: [] }, existing);
  assert.deepEqual(cleared.linkedSupplies, []);
  assert.deepEqual(cleared.processes, existing.processes);
  invalid({ ...product(), processes: [{ name: 'Printing' }, { name: ' printing ' }] });
});


test('blank optional Sales fields remain null while explicit zero and false values are preserved', () => {
  const minimal = validateProduct({ sku: 'P-NULL', unit: 'pcs', currency: 'PHP', price: null, revision: '', vatMode: null, moq: null });
  assert.equal(minimal.revision, null);
  assert.equal(minimal.price, null);
  assert.equal(minimal.moq, null);
  assert.equal(minimal.vatMode, null);
  assert.equal(minimal.stock, 0);
  const zero = validateProduct({ sku: 'P-ZERO', unit: 'pcs', currency: 'PHP', price: 0, moq: 0 });
  assert.equal(zero.price, 0);
  assert.equal(zero.moq, 0);
  const requiredCustomer = { name: 'Customer', shortName: 'C', businessStyle: 'Trade', address: 'Office', salesName: 'Customer', drName: 'Customer', vatCode: 'VS' };
  const customer = validateCustomer({ ...requiredCustomer, discount: null, includePoInInvoice: null, vatInclusive: null });
  assert.equal(customer.discount, null);
  assert.equal(customer.contactPerson, null);
  assert.equal(customer.includePoInInvoice, null);
  const explicit = validateCustomer({ ...requiredCustomer, discountType: 'amount', discount: 0, includePoInInvoice: false, vatInclusive: false });
  assert.equal(explicit.discount, 0);
  assert.equal(explicit.includePoInInvoice, false);
  assert.equal(explicit.vatInclusive, false);
  assert.equal(validateCustomer({ ...requiredCustomer, discountType: null, discount: 4 }).discount, null);
});
