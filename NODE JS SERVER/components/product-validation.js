import { ApiError } from './errors.js';
import * as v from './validation.js';

export const PRODUCT_TEXT_LENGTHS = Object.freeze({
  sku: 40, name: 180, description: 1000, unit: 30, revision: 30,
  secondaryUnit: 30, currency: 30, model: 150, category: 100,
  planType: 100, color: 80, remarks: 2000, tagColor: 30,
});
export const PRODUCT_QUANTITIES = Object.freeze([
  'quantityPerSecondaryUnit', 'moq', 'spq', 'unitCost', 'divisor', 'thickness', 'weight',
]);
const legacyFields = new Set(['id', 'sku', 'name', 'description', 'unit', 'price', 'stock', 'isActive']);
const has = (object, key) => Object.hasOwn(object, key) && object[key] !== undefined;

function rows(value, label, maximum) {
  if (!Array.isArray(value) || value.length > maximum) throw new ApiError(400, `${label} must contain at most ${maximum} rows.`);
  for (const row of value) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) throw new ApiError(400, `Each ${label} row must be an object.`);
  }
  return value;
}

function optionalDate(row, key) {
  if (row[key] === undefined || row[key] === null || row[key] === '') return null;
  return v.date(row, key);
}

function namedRows(value, label, maximum) {
  const names = new Set();
  return rows(value, label, maximum).map(row => {
    const name = v.text(row, 'name', 150, true);
    const comparison = name.toLowerCase();
    if (names.has(comparison)) throw new ApiError(400, `${label} cannot contain duplicate names.`);
    names.add(comparison);
    return { name };
  });
}

export function validateProduct(input, current) {
  const result = {
    ...Object.fromEntries(Object.keys(PRODUCT_TEXT_LENGTHS).map(key => [key, ''])),
    ...Object.fromEntries(PRODUCT_QUANTITIES.map(key => [key, 0])),
    revision: '0', vatMode: 'customer', productHeaderId: null,
    price: 0, stock: 0, isActive: true,
    processes: [], offices: [], customerApprovals: [], linkedSupplies: [],
    inventorySetup: '', inventorySchedules: [],
    ...(current || {}),
  };
  const creating = !current;
  const expanded = Object.keys(input).some(key => !legacyFields.has(key));
  for (const [key, maximum] of Object.entries(PRODUCT_TEXT_LENGTHS)) {
    const required = key === 'sku' || key === 'unit' || (key === 'currency' && creating && expanded);
    if (has(input, key) || (creating && required)) result[key] = v.text(input, key, maximum, required);
  }
  if (!has(input, 'name') && (creating || has(input, 'description'))) {
    result.name = (result.description || result.sku).slice(0, PRODUCT_TEXT_LENGTHS.name);
  }
  if (!result.name) result.name = result.sku;
  for (const key of PRODUCT_QUANTITIES) {
    if (has(input, key)) result[key] = v.numeric(input, key, { places: 6 });
  }
  if (has(input, 'price')) result.price = v.numeric(input, 'price', { places: 6 });
  if (has(input, 'stock')) result.stock = v.numeric(input, 'stock', { places: 3 });
  if (has(input, 'isActive')) result.isActive = v.bool(input, 'isActive');
  if (has(input, 'vatMode')) {
    if (!['customer', 'inclusive', 'exclusive'].includes(input.vatMode)) throw new ApiError(400, 'VAT mode must be customer, inclusive or exclusive.');
    result.vatMode = input.vatMode;
  }
  if (has(input, 'productHeaderId')) result.productHeaderId = input.productHeaderId === null ? null : v.idValue(input.productHeaderId, 'product header');
  if (has(input, 'inventorySetup')) {
    if (!['', 'monthly', 'quarterly'].includes(input.inventorySetup)) throw new ApiError(400, 'Inventory Setup must be blank, Monthly or Quarterly.');
    result.inventorySetup = input.inventorySetup;
  }
  if (result.secondaryUnit && result.quantityPerSecondaryUnit <= 0) throw new ApiError(400, 'Qty per UOP2 must be greater than zero when UOP2 is selected.');
  if (has(input, 'processes')) result.processes = namedRows(input.processes, 'Processes', 100);
  if (has(input, 'offices')) result.offices = namedRows(input.offices, 'Offices', 50);
  if (has(input, 'customerApprovals')) {
    const customers = new Set();
    result.customerApprovals = rows(input.customerApprovals, 'Customer approvals', 100).map(row => {
      const customerId = v.idValue(row.customerId, 'customer');
      if (customers.has(customerId)) throw new ApiError(400, 'A customer can appear only once in Product Customer settings.');
      customers.add(customerId);
      const approvalDate = optionalDate(row, 'approvalDate');
      const eolDate = optionalDate(row, 'eolDate');
      if (approvalDate && eolDate && eolDate < approvalDate) throw new ApiError(400, 'EOL date cannot be earlier than approval date.');
      return { customerId, approvalDate, eolDate, approvalRemarks: v.text(row, 'approvalRemarks', 2000), eolRemarks: v.text(row, 'eolRemarks', 2000) };
    });
  }
  if (has(input, 'linkedSupplies')) {
    const supplies = new Set();
    result.linkedSupplies = rows(input.linkedSupplies, 'Linked supplies', 200).map(row => {
      const suppliesId = v.idValue(row.suppliesId, 'supplies');
      if (supplies.has(suppliesId)) throw new ApiError(400, 'Each Supplies record can be linked only once to a product.');
      supplies.add(suppliesId);
      return { suppliesId, quantity: v.numeric(row, 'quantity', { min: 0.000001, places: 6 }), unit: v.text(row, 'unit', 30) };
    });
  }
  if (has(input, 'inventorySchedules')) {
    result.inventorySchedules = rows(input.inventorySchedules, 'Inventory schedules', 100).map(row => ({
      scheduleDate: optionalDate(row, 'scheduleDate'),
      month: v.text(row, 'month', 40),
    }));
  }
  return result;
}
