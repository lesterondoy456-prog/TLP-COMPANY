import { ApiError } from './errors.js';
import * as v from './validation.js';
import { decimalUnits, decimalString } from './purchasing-workflow.js';

export const SUPPLIER_TEXT = Object.freeze({
  name: 180, shortName: 80, businessStyle: 180, address: 500, remarks: 2000,
  tin: 50, contactPerson: 150, email: 254, countryOfOrigin: 100, country: 100,
  cpnumber: 30, faxNo: 30, paymentTerm: 100, vatCode: 80, taxCode: 80,
});
export const SUPPLIES_TEXT = Object.freeze({
  maker: 150, name: 180, description: 1000, remarks: 2000, color: 80,
  unit: 30, weightUnit: 30, category: 100,
});
export const SUPPLIES_NUMBERS = Object.freeze(['minimumStock', 'thickness', 'netWeight']);
const supplied = (object, key) => Object.hasOwn(object, key) && object[key] !== undefined;

export function exactDecimal(value, scale, label, positive = false, maximum = '1000000000') {
  const units = decimalUnits(value, scale, label, maximum);
  if (positive && units === 0n) throw new ApiError(400, `${label} must be greater than zero.`);
  return decimalString(units, scale);
}

export function optionalDate(input, key) {
  return input[key] === undefined || input[key] === null || input[key] === '' ? null : v.date(input, key);
}

export function entryRows(value, label, maximum = 100) {
  if (!Array.isArray(value) || !value.length || value.length > maximum) throw new ApiError(400, `${label} needs 1–${maximum} rows.`);
  if (value.some(row => !row || typeof row !== 'object' || Array.isArray(row))) throw new ApiError(400, `${label} rows must be objects.`);
  return value;
}

function optionalRows(value, label, maximum = 100) {
  if (Array.isArray(value) && !value.length) return [];
  return entryRows(value, label, maximum);
}

export function validateSupplier(input, current) {
  const result = { ...Object.fromEntries(Object.keys(SUPPLIER_TEXT).map(key => [key, ''])), decimalInPrice: 2, decimalInTotalPrice: 2, vatInclusive: false, isActive: true, ...(current || {}) };
  const required = new Set(['name', 'shortName', 'businessStyle', 'address', 'vatCode']);
  for (const [key, maximum] of Object.entries(SUPPLIER_TEXT)) {
    if (supplied(input, key) || (!current && required.has(key))) result[key] = key === 'email' ? v.email(input) : v.text(input, key, maximum, required.has(key));
  }
  for (const key of ['decimalInPrice', 'decimalInTotalPrice']) {
    if (!supplied(input, key)) continue;
    if (!Number.isInteger(input[key]) || input[key] < 0 || input[key] > 6) throw new ApiError(400, `${key} must be an integer from 0 to 6.`);
    result[key] = input[key];
  }
  for (const key of ['vatInclusive', 'isActive']) if (supplied(input, key)) result[key] = v.bool(input, key);
  return result;
}

export function validateSupplies(input, current) {
  if (supplied(input, 'stock') || supplied(input, 'openingStock')) throw new ApiError(400, 'Supplies stock changes only when a receiving receipt is posted.');
  const result = {
    ...Object.fromEntries(Object.keys(SUPPLIES_TEXT).map(key => [key, ''])),
    ...Object.fromEntries(SUPPLIES_NUMBERS.map(key => [key, '0.000000'])),
    productId: null, inventorySetup: '', offices: [], inventorySchedules: [], suppliers: [], isActive: true,
    ...(current || {}),
  };
  for (const [key, maximum] of Object.entries(SUPPLIES_TEXT)) {
    const required = ['name', 'unit'].includes(key);
    if (supplied(input, key) || (!current && required)) result[key] = v.text(input, key, maximum, required);
  }
  for (const key of SUPPLIES_NUMBERS) if (supplied(input, key)) result[key] = exactDecimal(input[key], 6, key);
  if (supplied(input, 'productId')) result.productId = input.productId === null ? null : v.idValue(input.productId, 'product link');
  if (supplied(input, 'isActive')) result.isActive = v.bool(input, 'isActive');
  if (supplied(input, 'inventorySetup')) {
    if (!['', 'monthly', 'quarterly'].includes(input.inventorySetup)) throw new ApiError(400, 'Inventory Setup must be blank, Monthly or Quarterly.');
    result.inventorySetup = input.inventorySetup;
  }
  if (supplied(input, 'offices')) result.offices = optionalRows(input.offices, 'Offices', 50).map(row => ({ name: v.text(row, 'name', 150, true) }));
  if (supplied(input, 'inventorySchedules')) result.inventorySchedules = optionalRows(input.inventorySchedules, 'Inventory schedules').map(row => ({ scheduleDate: optionalDate(row, 'scheduleDate'), month: v.text(row, 'month', 40) }));
  if (supplied(input, 'suppliers')) {
    const ids = new Set();
    result.suppliers = optionalRows(input.suppliers, 'Suppliers').map(row => {
      const supplierId = v.idValue(row.supplierId, 'supplier');
      if (ids.has(supplierId)) throw new ApiError(400, 'A supplier can appear only once in the Supplies supplier grid.');
      ids.add(supplierId);
      return { supplierId, moq: exactDecimal(row.moq ?? 0, 6, 'MOQ'), price: exactDecimal(row.price ?? 0, 6, 'Price'), currency: v.text(row, 'currency', 30), remarks: v.text(row, 'remarks', 2000) };
    });
  }
  return result;
}

export function validatePurchaseRequest(input, current) {
  const value = { ...(current || {}), ...input };
  const result = { number: v.text(value, 'number', 40), prDate: v.date(value, 'prDate'), neededDate: v.date(value, 'neededDate') };
  for (const key of ['requestedBy', 'requestedDept', 'checkedBy', 'approvedBy', 'approvedBy2']) result[key] = v.text(value, key, 150);
  result.remarks = v.text(value, 'remarks', 2000);
  result.items = entryRows(value.items, 'Purchase Request').map(row => ({
    suppliesId: v.idValue(row.suppliesId, 'supplies'), quantity: exactDecimal(row.quantity, 6, 'Quantity', true),
    unit: v.text(row, 'unit', 30), neededDate: row.neededDate ? v.date(row, 'neededDate') : result.neededDate,
    remarks: v.text(row, 'remarks', 2000),
  }));
  return result;
}

export function validatePurchaseOrder(input, current) {
  const value = { ...(current || {}), ...input };
  const result = {
    supplierId: v.idValue(value.supplierId, 'supplier'), poDate: v.date(value, 'poDate'), deliveryDate: v.date(value, 'deliveryDate'),
    currency: v.text(value, 'currency', 30, true), rate: exactDecimal(value.rate ?? 1, 5, 'Rate', true),
    paymentTerm: v.text(value, 'paymentTerm', 100, true), shipment: v.text(value, 'shipment', 20, true),
    suppliesCategory: v.text(value, 'suppliesCategory', 100), vatCode: v.text(value, 'vatCode', 80, true),
    deliveryAddress: v.text(value, 'deliveryAddress', 500), remarks: v.text(value, 'remarks', 2000),
  };
  if (result.deliveryDate < result.poDate) throw new ApiError(400, 'Delivery date cannot be before PO date.');
  if (!['By Air', 'By Land', 'By Boat', 'N/A'].includes(result.shipment)) throw new ApiError(400, 'Select a supported shipment method.');
  const ids = new Set();
  result.items = entryRows(value.items, 'Purchase Order').map(row => {
    const requestItemId = v.idValue(row.requestItemId, 'purchase request item');
    if (ids.has(requestItemId)) throw new ApiError(400, 'A PR line can appear only once in a purchase order.');
    ids.add(requestItemId);
    const currency = v.text(row, 'currency', 30) || result.currency;
    if (currency !== result.currency) throw new ApiError(400, 'PO line currency must match the header currency.');
    return { requestItemId, quantity: exactDecimal(row.quantity, 6, 'Quantity', true), unitPrice: exactDecimal(row.unitPrice, 6, 'Unit price'),
      discountRate: exactDecimal(row.discountRate ?? 0, 6, 'Discount rate', false, '100'), currency, remarks: v.text(row, 'remarks', 2000), unit: v.text(row, 'unit', 30) };
  });
  return result;
}

export function validateReceiving(input, current) {
  const value = { ...(current || {}), ...input };
  const result = {
    purchaseOrderId: v.idValue(value.purchaseOrderId, 'purchase order'), srrDate: v.date(value, 'srrDate'),
    drNumber: v.text(value, 'drNumber', 80), pezaReference: v.text(value, 'pezaReference', 80),
    invoiceNumber: v.text(value, 'invoiceNumber', 80, true), invoiceDate: optionalDate(value, 'invoiceDate'),
    rate: supplied(value, 'rate') ? exactDecimal(value.rate, 5, 'Rate', true) : undefined,
    remarks: v.text(value, 'remarks', 2000),
  };
  const ids = new Set();
  result.items = entryRows(value.items, 'Receiving receipt').map(row => {
    const orderItemId = v.idValue(row.orderItemId, 'purchase order item');
    if (ids.has(orderItemId)) throw new ApiError(400, 'A PO line can appear only once in a receiving receipt.');
    ids.add(orderItemId);
    const allocations = optionalRows(row.allocations || [], 'Allocations', 200).map(allocation => {
      const expiryDate = optionalDate(allocation, 'expiryDate');
      const mfgDate = optionalDate(allocation, 'mfgDate');
      if (expiryDate && mfgDate && expiryDate < mfgDate) throw new ApiError(400, 'Expiry date cannot be earlier than MFG date.');
      return { quantity: exactDecimal(allocation.quantity, 6, 'Allocation quantity', true), expiryDate, mfgDate,
        imLot: v.text(allocation, 'imLot', 100), qcStatus: v.text(allocation, 'qcStatus', 50),
        warehouseId: allocation.warehouseId == null ? null : v.idValue(allocation.warehouseId, 'warehouse'),
        locationId: allocation.locationId == null ? null : v.idValue(allocation.locationId, 'location') };
    });
    return { orderItemId, quantity: exactDecimal(row.quantity, 6, 'Receiving quantity', true), remarks: v.text(row, 'remarks', 2000), unit: v.text(row, 'unit', 30), allocations };
  });
  return result;
}
