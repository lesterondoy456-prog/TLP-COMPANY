import { decimalUnits, validDecimal } from '../purchaseMath.js';

export const SUPPLIER_TEXT = {
  name: { label: 'Name', max: 180, required: true },
  shortName: { label: 'Short Name', max: 80, required: true },
  businessStyle: { label: 'Business Style', max: 180, required: true },
  address: { label: 'Office Address', max: 500, required: true },
  remarks: { label: 'Remarks', max: 2000 },
  tin: { label: 'TIN', max: 50 },
  contactPerson: { label: 'Contact Person', max: 150 },
  email: { label: 'Email Address', max: 254 },
  countryOfOrigin: { label: 'Country Of Origin', max: 100 },
  country: { label: 'Country', max: 100 },
  cpnumber: { label: 'Phone No.', max: 30 },
  faxNo: { label: 'Fax No.', max: 30 },
  paymentTerm: { label: 'Payment Term', max: 100 },
  vatCode: { label: 'VAT Code', max: 80, required: true },
  taxCode: { label: 'Tax Code', max: 80 },
};

export const SUPPLIES_TEXT = {
  maker: { label: 'Maker', max: 150 },
  name: { label: 'Name', max: 180, required: true },
  description: { label: 'Description', max: 1000 },
  remarks: { label: 'Remarks', max: 2000 },
  color: { label: 'Color', max: 80 },
  unit: { label: 'Unit of Measure', max: 30, required: true },
  weightUnit: { label: 'Weight Unit', max: 30 },
  category: { label: 'Category', max: 100 },
};

function textErrors(fields, form) {
  const errors = {};
  for (const [key, field] of Object.entries(fields)) {
    const value = String(form[key] || '').trim();
    if (field.required && !value) errors[key] = field.label + ' is required.';
    else if (value.includes('\0')) errors[key] = 'Remove unsupported characters.';
    else if (value.length > field.max) errors[key] = 'Use ' + field.max + ' characters or fewer.';
  }
  return errors;
}

function validNumber(value, places, min = 0) { return validDecimal(value, places) && Number(value) >= min; }

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value && value >= '1900-01-01';
}
const dateValid = validDate;

export function validateSupplier(form, fields = SUPPLIER_TEXT) {
  const invalid = textErrors(fields, form);
  if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) invalid.email = 'Enter a valid Email Address.';
  for (const key of ['decimalInPrice', 'decimalInTotalPrice']) {
    if (form[key] === '' || !Number.isInteger(Number(form[key])) || Number(form[key]) < 0 || Number(form[key]) > 6) invalid[key] = 'Enter a whole number from 0 to 6.';
  }
  return invalid;
}

export function validateSupplies(form, fields = SUPPLIES_TEXT) {
  const invalid = textErrors(fields, form);
  for (const key of ['minimumStock', 'thickness', 'netWeight']) {
    if (!validNumber(form[key], 6)) invalid[key] = 'Enter a value from 0 to 1,000,000,000 with up to 6 decimal places.';
  }
  const seenSuppliers = new Set();
  form.suppliers.forEach((row, index) => {
    const key = 'suppliers.' + index;
    if (!row.supplierId) invalid[key + '.supplierId'] = 'Select a supplier.';
    else if (seenSuppliers.has(Number(row.supplierId))) invalid[key + '.supplierId'] = 'Use one row per supplier.';
    seenSuppliers.add(Number(row.supplierId));
    if (!validNumber(row.moq, 6)) invalid[key + '.moq'] = 'Enter a valid MOQ with up to 6 decimal places.';
    if (!validNumber(row.price, 6)) invalid[key + '.price'] = 'Enter a valid Price with up to 6 decimal places.';
    if ((row.remarks || '').length > 2000) invalid[key + '.remarks'] = 'Use 2,000 characters or fewer.';
  });
  form.inventorySchedules.forEach((row, index) => {
    const key = 'inventorySchedules.' + index;
    if (row.scheduleDate && !validDate(row.scheduleDate)) invalid[key + '.scheduleDate'] = 'Enter a valid Sched date.';
    if ((row.month || '').length > 40) invalid[key + '.month'] = 'Use 40 characters or fewer.';
  });
  if (!['', 'monthly', 'quarterly'].includes(form.inventorySetup)) invalid.inventorySetup = 'Choose Monthly or Quarterly.';
  if (form.offices.length > 50) invalid.offices = 'Use no more than 50 offices.';
  form.offices.forEach((row, index) => {
    if (!String(row.name || '').trim() || row.name.length > 150) invalid['offices.' + index + '.name'] = 'Enter an office name up to 150 characters.';
  });
  if (form.suppliers.length > 100) invalid.suppliers = 'Use no more than 100 supplier rows.';
  if (form.inventorySchedules.length > 100) invalid.inventorySchedules = 'Use no more than 100 schedule rows.';
  return invalid;
}

export function validatePurchaseRequest(form) {
  const invalid = {};
  for (const key of ['prDate', 'neededDate']) if (!dateValid(form[key])) invalid[key] = 'Enter a valid date.';
  if (form.number.length > 40) invalid.number = 'Use 40 characters or fewer.';
  for (const key of ['requestedBy', 'requestedDept', 'checkedBy', 'approvedBy', 'approvedBy2']) if (form[key].length > 150) invalid[key] = 'Use 150 characters or fewer.';
  if (form.remarks.length > 2000) invalid.remarks = 'Use 2,000 characters or fewer.';
  if (!form.items.length || form.items.length > 100) invalid.items = 'Add between 1 and 100 supply lines.';
  form.items.forEach((row, index) => {
    const key = 'items.' + index;
    if (!row.suppliesId) invalid[key + '.suppliesId'] = 'Select a supply.';
    if (!validDecimal(row.quantity, 6, { positive: true })) invalid[key + '.quantity'] = 'Enter a positive quantity with up to 6 decimal places.';
    if (row.neededDate && !dateValid(row.neededDate)) invalid[key + '.neededDate'] = 'Enter a valid Needed Date.';
    if ((row.remarks || '').length > 2000) invalid[key + '.remarks'] = 'Use 2,000 characters or fewer.';
  });
  return invalid;
}

export function validatePurchaseOrder(form) {
  const invalid = {};
  for (const key of ['supplierId', 'currency', 'paymentTerm', 'shipment', 'vatCode']) if (!form[key]) invalid[key] = 'Select a value for this field.';
  for (const key of ['poDate', 'deliveryDate']) if (!dateValid(form[key])) invalid[key] = 'Enter a valid date.';
  if (form.deliveryDate && form.poDate && form.deliveryDate < form.poDate) invalid.deliveryDate = 'Delivery Date cannot be earlier than PO Date.';
  if (!validDecimal(form.rate, 5, { positive: true })) invalid.rate = 'Enter a positive Rate with up to 5 decimal places.';
  if (!form.items.length || form.items.length > 100) invalid.items = 'Load between 1 and 100 open PR lines.';
  form.items.forEach((row, index) => {
    if (!validDecimal(row.quantity, 6, { positive: true })) invalid['items.' + index + '.quantity'] = 'Enter a positive quantity with up to 6 decimal places.';
    if (!validDecimal(row.unitPrice, 6)) invalid['items.' + index + '.unitPrice'] = 'Enter a nonnegative Price with up to 6 decimal places.';
    if (!validDecimal(row.discountRate, 6, { maximum: 100 })) invalid['items.' + index + '.discountRate'] = 'Discount must be from 0 to 100.';
  });
  if (form.deliveryAddress.length > 500) invalid.deliveryAddress = 'Use 500 characters or fewer.';
  if (form.remarks.length > 2000) invalid.remarks = 'Use 2,000 characters or fewer.';
  if (!['By Air', 'By Land', 'By Boat', 'N/A'].includes(form.shipment)) invalid.shipment = 'Select a supported shipment method.';
  const seen = new Set();
  form.items.forEach((row, index) => {
    const key = 'items.' + index;
    if (!row.requestItemId) invalid[key + '.requestItemId'] = 'Select a posted PR line.';
    else if (seen.has(Number(row.requestItemId))) invalid[key + '.requestItemId'] = 'Use one row per PR line.';
    seen.add(Number(row.requestItemId));
    if ((row.remarks || '').length > 2000) invalid[key + '.remarks'] = 'Use 2,000 characters or fewer.';
  });
  return invalid;
}

export function validateReceiving(form) {
  const invalid = {};
  if (!form.purchaseOrderId) invalid.purchaseOrderId = 'Select a posted purchase order.';
  if (!dateValid(form.srrDate)) invalid.srrDate = 'Enter a valid SRR Date.';
  if (!form.invoiceNumber.trim()) invalid.invoiceNumber = 'SI # is required.';
  for (const key of ['drNumber', 'pezaReference', 'invoiceNumber']) if (form[key].length > 80) invalid[key] = 'Use 80 characters or fewer.';
  if (form.invoiceDate && !dateValid(form.invoiceDate)) invalid.invoiceDate = 'Enter a valid SI Date.';
  if (!validDecimal(form.rate, 5, { positive: true })) invalid.rate = 'Enter a positive Rate with up to 5 decimal places.';
  if (form.remarks.length > 2000) invalid.remarks = 'Use 2,000 characters or fewer.';
  if (!form.items.length || form.items.length > 100) invalid.items = 'Select a PO with open lines to receive.';
  form.items.forEach((item, itemIndex) => {
    const key = 'items.' + itemIndex;
    if (!validDecimal(item.quantity, 6, { positive: true })) invalid[key + '.quantity'] = 'Enter a positive receiving quantity with up to 6 decimal places.';
    if (item.allocations.length > 200) invalid[key + '.allocations'] = 'Use no more than 200 allocations.';
    item.allocations.forEach((row, index) => {
      const allocation = key + '.allocations.' + index;
      if (!validDecimal(row.quantity, 6, { positive: true })) invalid[allocation + '.quantity'] = 'Enter a positive allocation quantity with up to 6 decimal places.';
      if (row.expiryDate && !dateValid(row.expiryDate)) invalid[allocation + '.expiryDate'] = 'Enter a valid Exp. Date.';
      if (row.mfgDate && !dateValid(row.mfgDate)) invalid[allocation + '.mfgDate'] = 'Enter a valid MFG Date.';
      if (row.expiryDate && row.mfgDate && row.expiryDate < row.mfgDate) invalid[allocation + '.expiryDate'] = 'Exp. Date cannot be earlier than MFG Date.';
      if ((row.imLot || '').length > 100) invalid[allocation + '.imLot'] = 'Use 100 characters or fewer.';
      if ((row.qcStatus || '').length > 50) invalid[allocation + '.qcStatus'] = 'Use 50 characters or fewer.';
    });
  });
  const seen = new Set();
  form.items.forEach((row, index) => {
    const key = 'items.' + index;
    if (!row.orderItemId) invalid[key + '.orderItemId'] = 'Select a PO line.';
    else if (seen.has(Number(row.orderItemId))) invalid[key + '.orderItemId'] = 'Use one row per PO line.';
    seen.add(Number(row.orderItemId));
    if ((row.remarks || '').length > 2000) invalid[key + '.remarks'] = 'Use 2,000 characters or fewer.';
  });
  return invalid;
}

export function validateAccount(form, { creating = false } = {}) {
  const errors = {};
  for (const [key, maximum] of Object.entries({ name: 150, username: 80, cpnumber: 30, email: 254, photo: 750000 })) {
    const value = String(form[key] || '').trim();
    if (['name', 'username'].includes(key) && !value) errors[key] = key === 'name' ? 'Full name is required.' : 'Username is required.';
    else if (value.length > maximum || value.includes('\0')) errors[key] = key + ' exceeds its supported length.';
  }
  if (form.username && !/^[a-z0-9._-]{3,80}$/i.test(form.username.trim())) errors.username = 'Username must contain 3-80 letters, numbers, dots, underscores or hyphens.';
  if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) errors.email = 'Enter a valid email address.';
  if (Object.hasOwn(form, 'role') && !['admin', 'purchasing'].includes(form.role)) errors.role = 'Choose Administrator or Purchasing.';
  if (creating || form.password) {
    if (typeof form.password !== 'string' || form.password.length < 6 || form.password.length > 128) errors.password = 'Password must contain 6-128 characters.';
  }
  if (form.photo && !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(form.photo)) {
    try { const url = new URL(form.photo); if (url.protocol !== 'https:' || url.username || url.password) throw new Error(); }
    catch { errors.photo = 'Choose a PNG, JPEG or WebP photo, or a valid HTTPS image URL.'; }
  }
  return errors;
}

export function validateLogin({ username, password }) {
  const errors = {};
  if (!username.trim()) errors.username = 'Enter your username.';
  else if (username.trim().length > 80) errors.username = 'Username must be 80 characters or fewer.';
  if (!password) errors.password = 'Enter your password.';
  else if (password.length > 128) errors.password = 'Password must be 128 characters or fewer.';
  return errors;
}

export function receivingPostingIssue(record) {
  let issue = '';
  for (const item of record.items || []) {
    try {
      const total = (item.allocations || []).reduce((sum, row) => sum + decimalUnits(row.quantity, 6), 0n);
      if (!item.allocations?.length || total !== decimalUnits(item.quantity, 6)) issue = 'Allocate every receipt quantity in full in SRR Summary before posting.';
      if (item.allocations?.some(row => !row.warehouseId || !row.locationId)) issue = 'Choose a Warehouse and Location for every allocation before posting.';
    } catch { issue = 'Review the receipt quantities and allocations before posting.'; }
  }
  return issue;
}

export function photoFileError(file) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return 'Choose a JPG, PNG, or WebP image.';
  if (file.size > 250 * 1024) return 'Choose a photo smaller than 250 KB.';
  return '';
}
