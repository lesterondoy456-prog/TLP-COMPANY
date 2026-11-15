// Form input rules run before the browser sends a Sales API request.
class ApiError extends Error {
  constructor(_status, message) { super(message); this.name = 'FormValidationError'; }
}

function text(input, key, max, required = false) {
  const value = input[key] ?? '';
  if (typeof value !== 'string' || value.trim().length > max || /\x00/.test(value)) throw new ApiError(400, `${key} must be text with at most ${max} characters.`);
  const result = value.trim();
  if (required && !result) throw new ApiError(400, `${key} is required.`);
  return required ? result : result || null;
}

function email(input) {
  const result = text(input, 'email', 254);
  if (result && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result)) throw new ApiError(400, 'Enter a valid email address.');
  return result;
}

function bool(input, key, fallback = true) {
  if (input[key] === undefined) return fallback;
  if (typeof input[key] !== 'boolean') throw new ApiError(400, `${key} must be true or false.`);
  return input[key];
}

function numeric(input, key, { min = 0, max = 1e9, places = 2 } = {}) {
  const value = input[key];
  if ((typeof value !== 'number' && typeof value !== 'string') || value === '' || !Number.isFinite(Number(value))) throw new ApiError(400, `${key} must be a valid number.`);
  const number = Number(value);
  if (number < min || number > max || Math.abs(number * 10 ** places - Math.round(number * 10 ** places)) > 1e-5) {
    throw new ApiError(400, `${key} must be between ${min} and ${max}, with at most ${places} decimal places.`);
  }
  return number;
}

function idValue(value, label = 'id') {
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result <= 0 || result > 2147483647) throw new ApiError(400, `Enter a valid ${label}.`);
  return result;
}

function date(input, key) {
  const value = text(input, key, 10, true);
  const parsed = new Date(`${value}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value || value < '1900-01-01') {
    throw new ApiError(400, `${key} must be a valid date in YYYY-MM-DD format.`);
  }
  return value;
}

function photo(input) {
  const raw = input.photo ?? '';
  if (typeof raw !== 'string' || raw.includes('\0')) throw new ApiError(400, 'Photo must be a PNG, JPEG or WebP upload, or an HTTPS image URL.');
  const value = raw.trim();
  if (!value) return null;
  if (isPhotoDataUrl(value)) return value;
  try { const url = new URL(value); if (url.protocol === 'https:' && !url.username && !url.password) return value; } catch { /* Invalid URL below. */ }
  throw new ApiError(400, 'Photo must be a PNG, JPEG or WebP upload, or an HTTPS image URL.');
}

function password(input, required = true) {
  if (!required && (input.password === undefined || input.password === '')) return undefined;
  if (typeof input.password !== 'string' || input.password.length < 6 || input.password.length > 128) throw new ApiError(400, 'Password must contain 6-128 characters.');
  return input.password;
}

function username(input) {
  const value = text(input, 'username', 80, true).toLowerCase();
  if (!/^[a-z0-9._-]{3,80}$/.test(value)) throw new ApiError(400, 'Username must contain 3–80 letters, numbers, dots, underscores or hyphens.');
  return value;
}

function has(object, key) { return Object.hasOwn(object, key) && object[key] !== undefined; }

function decimalPlaces(input, key) {
  if (typeof input[key] !== 'number' || !Number.isInteger(input[key]) || input[key] < 0 || input[key] > 6) {
    throw new ApiError(400, `${key} must be a whole number from 0 to 6.`);
  }
  return input[key];
}

function choice(input, key, options) {
  if (!options.includes(input[key])) throw new ApiError(400, `${key} must be ${options.join(' or ')}.`);
  return input[key];
}

function deliveryAddresses(value) {
  if (!Array.isArray(value) || value.length > 50) throw new ApiError(400, 'Enter at most 50 delivery addresses.');
  return value.map(address => {
    if (typeof address !== 'string') throw new ApiError(400, 'Each delivery address must be text.');
    return v.text({ address }, 'address', 500, true);
  });
}

function validateCustomer(input, current) {
  const creating = !current;
  const expanded = extendedKeys.some(key => has(input, key));
  const result = { ...defaults, ...(current || {}) };
  for (const key of Object.keys(textLengths)) {
    const required = key === 'name' || (requiredExpanded.has(key) && expanded && (creating || has(input, key)));
    if (has(input, key) || (creating && required)) {
      result[key] = key === 'email' ? v.email(input) : v.text(input, key, textLengths[key], required);
    }
  }
  for (const key of ['isActive', 'includePoInInvoice', 'vatInclusive']) if (has(input, key)) result[key] = key !== 'isActive' && input[key] === null ? null : v.bool(input, key);
  for (const key of ['decimalInPrice', 'decimalInTotalPrice']) if (has(input, key)) result[key] = decimalPlaces(input, key);
  for (const key of ['salesAddressType', 'drAddressType']) if (has(input, key)) result[key] = input[key] === null || input[key] === '' ? null : choice(input, key, ['office', 'delivery']);
  if (has(input, 'discountType')) result.discountType = input.discountType === null || input.discountType === '' ? null : choice(input, 'discountType', ['percent', 'amount']);
  if (result.discountType === null) result.discount = null;
  else if (has(input, 'discount')) result.discount = input.discount === null || String(input.discount).trim() === '' ? null : v.numeric(input, 'discount', { min: 0, max: 1e9, places: 6 });
  if (result.discountType === 'percent' && result.discount > 100) throw new ApiError(400, 'Percentage discount cannot exceed 100.');
  if (has(input, 'deliveryAddresses')) result.deliveryAddresses = deliveryAddresses(input.deliveryAddresses);
  return result;
}

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

function validateProduct(input, current) {
  const result = {
    ...Object.fromEntries(Object.keys(PRODUCT_TEXT_LENGTHS).map(key => [key, null])),
    ...Object.fromEntries(PRODUCT_QUANTITIES.map(key => [key, null])),
    revision: null, vatMode: null, productHeaderId: null,
    price: null, stock: 0, isActive: true,
    processes: [], customerApprovals: [], linkedSupplies: [],
    inventorySetup: null,
    ...(current || {}),
  };
  delete result.planType;
  delete result.color;
  delete result.thickness;
  result.customerApprovals = result.customerApprovals.map(({ customerId, approvalDate, approvalRemarks }) => ({ customerId, approvalDate, approvalRemarks }));
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
    if (has(input, key)) result[key] = input[key] === null || String(input[key]).trim() === '' ? null : v.numeric(input, key, { places: 6 });
  }
  if (has(input, 'price')) result.price = input.price === null || String(input.price).trim() === '' ? null : v.numeric(input, 'price', { places: 6 });
  if (has(input, 'stock')) result.stock = v.numeric(input, 'stock', { places: 3 });
  if (has(input, 'isActive')) result.isActive = v.bool(input, 'isActive');
  if (has(input, 'vatMode')) {
    if (input.vatMode !== null && input.vatMode !== '' && !['customer', 'inclusive', 'exclusive'].includes(input.vatMode)) throw new ApiError(400, 'VAT mode must be customer, inclusive or exclusive.');
    result.vatMode = input.vatMode || null;
  }
  if (has(input, 'productHeaderId')) result.productHeaderId = input.productHeaderId === null ? null : v.idValue(input.productHeaderId, 'product header');
  if (has(input, 'inventorySetup')) {
    if (input.inventorySetup !== null && !['', 'monthly', 'quarterly'].includes(input.inventorySetup)) throw new ApiError(400, 'Inventory Setup must be blank, Monthly or Quarterly.');
    result.inventorySetup = input.inventorySetup || null;
  }
  if (result.secondaryUnit && result.quantityPerSecondaryUnit <= 0) throw new ApiError(400, 'Qty per UOP2 must be greater than zero when UOP2 is selected.');
  if (has(input, 'processes')) result.processes = namedRows(input.processes, 'Processes', 100);
  if (has(input, 'customerApprovals')) {
    const customers = new Set();
    result.customerApprovals = rows(input.customerApprovals, 'Customer approvals', 100).map(row => {
      const customerId = v.idValue(row.customerId, 'customer');
      if (customers.has(customerId)) throw new ApiError(400, 'A customer can appear only once in Product Customer settings.');
      customers.add(customerId);
      const approvalDate = optionalDate(row, 'approvalDate');
      return { customerId, approvalDate, approvalRemarks: v.text(row, 'approvalRemarks', 2000) };
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
  return result;
}

const v = { text, email, bool, numeric, idValue, date, photo, password, username };

const textLengths = {
  name: 180, contactPerson: 150, cpnumber: 30, email: 254, address: 500,
  shortName: 80, businessStyle: 180, salesInCharge: 150, tin: 50, faxNo: 30,
  countryOfOrigin: 100, country: 100, category: 100, remarks: 2000,
  salesName: 180, drName: 180, paymentTerm: 100, vatCode: 80, taxCode: 80,
};

const defaults = {
  ...Object.fromEntries(Object.keys(textLengths).map(key => [key, null])),
  isActive: true, decimalInPrice: 2, decimalInTotalPrice: 2,
  salesAddressType: null, drAddressType: null, discount: null,
  discountType: null, includePoInInvoice: null, vatInclusive: null,
  deliveryAddresses: [], salesInChargeId: null,
};

const requiredExpanded = new Set(['address', 'shortName', 'businessStyle', 'salesName', 'drName', 'vatCode']);

const legacyKeys = new Set(['id', 'name', 'contactPerson', 'cpnumber', 'email', 'address', 'isActive']);

const extendedKeys = Object.keys(defaults).filter(key => !legacyKeys.has(key));

const PRODUCT_TEXT_LENGTHS = {
  sku: 40, name: 180, description: 1000, unit: 30, revision: 30,
  secondaryUnit: 30, currency: 30, model: 150, category: 100,
  remarks: 2000, tagColor: 30,
};

const PRODUCT_QUANTITIES = [
  'quantityPerSecondaryUnit', 'moq', 'spq', 'unitCost', 'divisor', 'weight',
];

const legacyFields = new Set(['id', 'sku', 'name', 'description', 'unit', 'price', 'stock', 'isActive']);

export function validateSalesRequest(path, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  if (!['POST', 'PUT', 'PATCH'].includes(method) || !options.body) return;
  const input = options.body;
  const route = path.split('?')[0].replace(/^\/api\/sales(?=\/|$)/, '');
  if (route === '/auth/login') {
    text(input, 'username', 80, true);
    text(input, 'password', 128, true);
    return;
  }
  if (route === '/auth/profile' || /^\/users(?:\/\d+)?$/.test(route)) {
    text(input, 'name', 150, true);
    if (method === 'POST' && route === '/users') username(input);
    text(input, 'cpnumber', 30);
    email(input);
    photo(input);
    if (route !== '/auth/profile') {
      if (!['admin', 'saleshead', 'sales'].includes(input.role)) throw new Error('Choose a valid role.');
      bool(input, 'isActive');
      password(input, method === 'POST');
    }
    return;
  }
  if (/^\/customers(?:\/\d+)?$/.test(route)) { validateCustomer(input, method === 'PUT' ? {} : undefined); return; }
  if (/^\/products(?:\/\d+)?$/.test(route)) { validateProduct(input, method === 'PUT' ? {} : undefined); return; }
  if (/^\/sales-orders(?:\/\d+)?$/.test(route)) {
    text(input, 'currency', 30, true);
    idValue(input.customerId, 'customer');
    idValue(input.billToCustomerId, 'billing customer');
    text(input, 'billToName', 180, true);
    text(input, 'billToAddress', 500);
    const orderDate = date(input, 'orderDate');
    if (date(input, 'expectedDeliveryDate') < orderDate) throw new Error('Expected delivery date cannot be earlier than the order date.');
    numeric(input, 'rate', { min: 0.000001, max: 1e6, places: 6 });
    text(input, 'paymentTerm', 100, true);
    choice(input, 'shipment', ['air', 'land', 'boat', 'na']);
    text(input, 'countryOfOrigin', 100);
    text(input, 'vatCode', 80, true);
    if (typeof input.vatInclusive !== 'boolean') throw new Error('Choose Inclusive or Exclusive VAT pricing.');
    if (input.discountType != null && input.discountType !== '') choice(input, 'discountType', ['percent', 'amount']);
    if (input.discountType && input.discount != null && String(input.discount).trim() !== '') numeric(input, 'discount', { min: 0, max: input.discountType === 'percent' ? 100 : 1e12, places: 6 });
    text(input, 'notes', 2000);
    if (!['draft', 'confirmed'].includes(input.status)) throw new Error('Choose Draft or Confirmed for the order status.');
    if (!Array.isArray(input.items) || input.items.length < 1 || input.items.length > 100) throw new Error('Add between 1 and 100 order items.');
    const products = new Set();
    for (const item of input.items) {
      const productId = idValue(item.productId, 'product');
      if (products.has(productId)) throw new Error('Use one line per product.');
      products.add(productId);
      numeric(item, 'quantity', { min: 0.001, max: 1e6, places: 3 });
      numeric(item, 'unitPrice', { min: 0, max: 1e8, places: 6 });
      text(item, 'refNumber', 100);
      text(item, 'quotationNumber', 100);
      if (item.discountRate != null && String(item.discountRate).trim() !== '') numeric(item, 'discountRate', { min: 0, max: 100, places: 6 });
      if (item.deliveryDate && date(item, 'deliveryDate') < orderDate) throw new Error('An item delivery date cannot be earlier than the order date.');
    }
    return;
  }
  if (/^\/sales-invoices\/\d+\/payment$/.test(route)) { numeric(input, 'paidAmount', { min: 0, max: 1e12, places: 6 }); return; }
  if (route === '/sales-invoices') {
    idValue(input.orderId, 'sales order');
    const invoiceDate = date(input, 'invoiceDate');
    if (date(input, 'dueDate') < invoiceDate) throw new Error('Due date cannot be earlier than invoice date.');
    text(input, 'notes', 2000);
    return;
  }
  if (route === '/delivery-receipts') {
    idValue(input.orderId, 'sales order');
    date(input, 'deliveryDate');
    text(input, 'receivedBy', 150, true);
    text(input, 'address', 500, true);
    text(input, 'notes', 2000);
    return;
  }
  if (route === '/shipping-invoices') {
    idValue(input.invoiceId, 'sales invoice');
    date(input, 'shippingDate');
    text(input, 'carrier', 150);
    text(input, 'trackingNumber', 100);
    text(input, 'notes', 2000);
  }
}

export { validateCustomer, validateProduct };


const CUSTOMER_FORM_FIELDS = {
  name: { label: 'Name', max: 180, required: true, tab: 'basic' },
  shortName: { label: 'Short Name', max: 80, required: true, tab: 'basic' },
  businessStyle: { label: 'Business Style', max: 180, required: true, tab: 'basic' },
  address: { label: 'Office Address', max: 500, required: true, tab: 'basic' },
  tin: { label: 'TIN', max: 50, tab: 'basic' },
  contactPerson: { label: 'Contact Person', max: 150, tab: 'basic' },
  email: { label: 'Email Address', max: 254, tab: 'basic' },
  countryOfOrigin: { label: 'Country Of Origin', max: 100, tab: 'basic' },
  country: { label: 'Country', max: 100, tab: 'basic' },
  faxNo: { label: 'Fax No.', max: 30, tab: 'basic' },
  cpnumber: { label: 'Phone No.', max: 30, tab: 'basic' },
  category: { label: 'Category', max: 100, tab: 'basic' },
  remarks: { label: 'Remarks', max: 2000, tab: 'basic' },
  salesName: { label: 'Sales Name', max: 180, required: true, tab: 'sales' },
  drName: { label: 'DR Name', max: 180, required: true, tab: 'sales' },
  paymentTerm: { label: 'Payment Term', max: 100, tab: 'sales' },
  vatCode: { label: 'VAT Code', max: 80, required: true, tab: 'sales' },
  taxCode: { label: 'Tax Code', max: 80, tab: 'sales' },
};

export function validateOrderCurrency(currency, configuredCurrencies, productCurrencies = [], rate = 1) {
  const selected = String(currency || '').trim().toUpperCase();
  const configured = configuredCurrencies.some(option => option.isActive !== false && option.isActive !== 0 && String(option.code || '').trim().toUpperCase() === selected);
  if (!selected || !configured) return 'Choose an active currency from Configuration before saving.';
  const prices = [...new Set(productCurrencies.map(code => String(code || '').trim().toUpperCase()))];
  if (prices.length > 1) return 'Use products with the same currency in one sales order.';
  if (prices.some(code => !code)) return 'Set a currency on each selected product before creating an order.';
  if (prices.length === 1 && prices[0] === selected && Number(rate) !== 1) return 'Use a rate of 1 when the product and order currencies are the same.';
  return '';
}

export function validateOrderForm(form, items, options, products, customers) {
  const errors = {};
  const selectedProducts = items.map(item => products.find(product => String(product.id) === String(item.productId))).filter(Boolean);
  const currencyError = validateOrderCurrency(form.currency, options.currencies, selectedProducts.map(product => product.currency), form.rate);
  if (currencyError) errors.currency = currencyError;
  if (!customers.some(customer => String(customer.id) === String(form.customerId))) errors.customerId = 'Choose a customer.';
  const billTo = customers.find(customer => String(customer.id) === String(form.billToCustomerId));
  if (!billTo) errors.billToCustomerId = 'Choose a billing customer.';
  const knownAddresses = [billTo?.address, ...(billTo?.deliveryAddresses || [])].filter(Boolean);
  if (form.billToAddress && !knownAddresses.includes(form.billToAddress)) errors.billToAddress = 'Choose an address saved on the billing customer.';
  if (!dateIsValid(form.orderDate)) errors.orderDate = 'Order date is required. Enter a valid date.';
  if (!dateIsValid(form.expectedDeliveryDate)) errors.expectedDeliveryDate = 'Expected delivery date is required. Enter a valid date.';
  else if (dateIsValid(form.orderDate) && form.expectedDeliveryDate < form.orderDate) errors.expectedDeliveryDate = 'Expected delivery date cannot be earlier than the order date.';
  if (!numberIsValid(form.rate, 6, 0.000001) || Number(form.rate) > 1e6) errors.rate = 'Enter a positive conversion rate with up to 6 decimal places.';
  if (!options.paymentTerms.some(option => (option.name || option.description) === form.paymentTerm)) errors.paymentTerm = 'Choose a payment term from Configuration.';
  if (!options.shipments.some(option => option.value === form.shipment)) errors.shipment = 'Choose a shipment method.';
  if (form.countryOfOrigin && !options.countries.some(option => option.name === form.countryOfOrigin)) errors.countryOfOrigin = 'Choose a country from Configuration or leave it blank.';
  const vat = options.vatCodes.find(option => option.code === form.vatCode);
  if (!vat) errors.vatCode = 'Choose a VAT code from Configuration.';
  else if (vat.rate == null || String(vat.rate).trim() === '' || !numberIsValid(vat.rate, 6)) errors.vatCode = 'Set the VAT rate in Configuration before saving.';
  if (typeof form.vatInclusive !== 'boolean') errors.vatInclusive = 'Choose Inclusive or Exclusive VAT pricing.';
  if (form.discountType && !['percent', 'amount'].includes(form.discountType)) errors.discountType = 'Choose Percent, Amount or None.';
  if (form.discountType && String(form.discount ?? '').trim() !== '' && (!numberIsValid(form.discount, 6) || form.discountType === 'percent' && Number(form.discount) > 100)) errors.discount = form.discountType === 'percent' ? 'Enter a discount from 0 to 100 percent with up to 6 decimal places.' : 'Enter a valid discount amount with up to 6 decimal places.';
  if (!['draft', 'confirmed'].includes(form.status)) errors.status = 'Choose Draft or Confirmed.';
  if (String(form.notes ?? '').length > 2000) errors.notes = 'Use 2,000 characters or fewer.';
  if (!items.length || items.length > 100) errors['items.0.productId'] = 'Add between 1 and 100 order items.';
  const seen = new Set();
  items.forEach((item, index) => {
    const key = 'items.' + index + '.';
    if (!products.some(product => String(product.id) === String(item.productId))) errors[key + 'productId'] = 'Choose a product.';
    else if (seen.has(String(item.productId))) errors[key + 'productId'] = 'Use one line per product. Combine repeated quantities.';
    seen.add(String(item.productId));
    if (!numberIsValid(item.quantity, 3, 0.001) || Number(item.quantity) > 1e6) errors[key + 'quantity'] = 'Enter a quantity greater than zero with up to 3 decimal places.';
    if (!numberIsValid(item.unitPrice, 6) || Number(item.unitPrice) > 1e8) errors[key + 'unitPrice'] = 'Enter a quantity and unit price for every order item. Unit price must be zero or more, with up to 6 decimal places.';
    if (String(item.discountRate ?? '').trim() && (!numberIsValid(item.discountRate, 6) || Number(item.discountRate) > 100)) errors[key + 'discountRate'] = 'Enter a line discount from 0 to 100 percent.';
    if (item.deliveryDate && (!dateIsValid(item.deliveryDate) || item.deliveryDate < form.orderDate)) errors[key + 'deliveryDate'] = 'Choose a valid delivery date on or after the order date.';
    for (const field of ['refNumber', 'quotationNumber']) if (String(item[field] ?? '').length > 100) errors[key + field] = 'Use 100 characters or fewer.';
  });
  return errors;
}

export function validateInvoicePayment(amount, total) {
  if (String(amount ?? '').trim() === '') return 'Total received to date is required.';
  if (!/^\d+(?:\.\d{1,6})?$/.test(String(amount).trim())) return 'Enter a received amount of zero or more with up to 6 decimal places.';
  try { numeric({ paidAmount: amount }, 'paidAmount', { min: 0, max: 1e12, places: 6 }); }
  catch { return 'Enter a received amount of zero or more with up to 6 decimal places.'; }
  const values = [amount, total].map(value => String(value).split('.')).map(parts => BigInt(parts[0] + (parts[1] || '').padEnd(6, '0').slice(0, 6)));
  return values[0] > values[1] ? 'Total received cannot exceed the invoice total.' : '';
}

export function validateCustomerForm(form) {
  const errors = {};
  for (const [key, definition] of Object.entries(CUSTOMER_FORM_FIELDS)) {
    const value = String(form[key] ?? '').trim();
    if (definition.required && !value) errors[key] = definition.label + ' is required.';
    else if (value.length > definition.max) errors[key] = definition.label + ' must be ' + definition.max + ' characters or fewer.';
  }
  if (String(form.email ?? '').trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(form.email ?? '').trim())) errors.email = 'Enter a valid Email Address.';
  form.deliveryAddresses.forEach((address, index) => {
    if (String(address).trim().length > 500) errors['deliveryAddresses.' + index] = 'Use 500 characters or fewer for this delivery address.';
  });
  for (const [key, label] of [['decimalInPrice', 'Decimal in Price'], ['decimalInTotalPrice', 'Decimal in Total Price']]) {
    if (String(form[key] ?? '').trim() === '' || !Number.isInteger(Number(form[key])) || Number(form[key]) < 0 || Number(form[key]) > 6) errors[key] = label + ' must be a whole number from 0 to 6.';
  }
  const discount = !form.discountType || String(form.discount ?? '').trim() === '' ? null : Number(form.discount);
  if (discount !== null && (!Number.isFinite(discount) || discount < 0 || discount > 1e9 || Math.abs(discount * 1e6 - Math.round(discount * 1e6)) > 0.00001)) errors.discount = 'Enter a discount from 0 to 1,000,000,000 with up to 6 decimal places.';
  else if (form.discountType === 'percent' && discount > 100) errors.discount = 'A Percent discount cannot exceed 100.';
  return errors;
}

const PRODUCT_FORM_FIELDS = {
  sku: { label: 'Code', max: 40, required: true },
  revision: { label: 'Rev', max: 30 },
  description: { label: 'Description', max: 1000 },
  unit: { label: 'UOP', max: 30, required: true },
  secondaryUnit: { label: 'UOP2', max: 30 },
  currency: { label: 'Currency', max: 30, required: true },
  model: { label: 'Model / Item code', max: 150 },
  category: { label: 'Category / Platform', max: 100 },
  remarks: { label: 'Remarks', max: 2000 },
  tagColor: { label: 'Tag Color', max: 30 },
};

const PRODUCT_FORM_NUMBERS = {
  quantityPerSecondaryUnit: { label: 'Qty per UOP2', places: 6 },
  moq: { label: 'MOQ', places: 6 },
  spq: { label: 'SPQ', places: 6 },
  unitCost: { label: 'Unit Cost', places: 6 },
  price: { label: 'Selling Price', places: 6 },
  divisor: { label: 'Divisor', places: 6 },
  weight: { label: 'Weight', places: 6 },
};

const PRODUCT_FORM_ROW_LIMITS = { processes: 100, customerApprovals: 100, linkedSupplies: 200 };

function dateIsValid(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value && value >= '1900-01-01';
}

function numberIsValid(value, places, min = 0) {
  const number = Number(value);
  return String(value ?? '').trim() !== '' && Number.isFinite(number) && number >= min && number <= 1e9
    && Math.abs(number * 10 ** places - Math.round(number * 10 ** places)) <= 1e-5;
}

export function validateProductForm(form) {
  const errors = {};
  for (const [key, limit] of Object.entries(PRODUCT_FORM_ROW_LIMITS)) {
    if (form[key].length > limit) errors[key] = 'Use no more than ' + limit + ' rows.';
  }
  for (const [key, field] of Object.entries(PRODUCT_FORM_FIELDS)) {
    const value = String(form[key] ?? '').trim();
    if (field.required && !value) errors[key] = field.label + ' is required.';
    else if (value.length > field.max) errors[key] = 'Use ' + field.max + ' characters or fewer.';
  }
  for (const [key, field] of Object.entries(PRODUCT_FORM_NUMBERS)) {
    if (String(form[key] ?? '').trim() !== '' && !numberIsValid(form[key], field.places)) errors[key] = 'Enter a value from 0 to 1,000,000,000 with up to ' + field.places + ' decimal places.';
  }
  if (form.secondaryUnit && Number(form.quantityPerSecondaryUnit) <= 0) errors.quantityPerSecondaryUnit = 'Enter a positive conversion quantity when UOP2 is selected.';
  const seenCustomers = new Set();
  form.customerApprovals.forEach((row, index) => {
    const key = 'customerApprovals.' + index;
    if (!row.customerId) errors[key + '.customerId'] = 'Select a customer.';
    else if (seenCustomers.has(Number(row.customerId))) errors[key + '.customerId'] = 'Use one row per customer.';
    seenCustomers.add(Number(row.customerId));
    if (row.approvalDate && !dateIsValid(row.approvalDate)) errors[key + '.approvalDate'] = 'Enter a valid Approval Date.';
    if ((row.approvalRemarks || '').length > 2000) errors[key + '.approvalRemarks'] = 'Use 2,000 characters or fewer.';
  });
  form.processes.forEach((row, index) => {
    if (!row.name.trim() || row.name.trim().length > 150) errors['processes.' + index + '.name'] = 'Enter a process name with up to 150 characters.';
  });
  const seenSupplies = new Set();
  form.linkedSupplies.forEach((row, index) => {
    const key = 'linkedSupplies.' + index;
    if (!row.suppliesId) errors[key + '.suppliesId'] = 'Select a supply.';
    else if (seenSupplies.has(Number(row.suppliesId))) errors[key + '.suppliesId'] = 'Use one row per supply.';
    seenSupplies.add(Number(row.suppliesId));
    if (!numberIsValid(row.quantity, 6, 0.000001)) errors[key + '.quantity'] = 'Enter a positive quantity with up to 6 decimal places.';
  });
  return errors;
}

export function validateCustomerAssignment(form, record, options) {
  if (form.salesInChargeId !== '' && form.salesInChargeId !== '__legacy__') {
    const selectedId = Number(form.salesInChargeId);
    const unchanged = record?.salesInChargeId != null && selectedId === Number(record.salesInChargeId);
    if (!Number.isInteger(selectedId) || selectedId <= 0 || (!unchanged && !options.some(account => Number(account.id) === selectedId))) return 'Choose an active Sales account.';
  } else if (form.salesInChargeId === '__legacy__' && !(record?.salesInChargeId == null && record?.salesInCharge)) return 'Choose an active Sales account.';
  return '';
}

export function validatePhotoFile(file) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return 'Choose a JPG, PNG, or WebP image.';
  return '';
}

function isPhotoDataUrl(value) {
  if (typeof value !== 'string') return false;
  const separator = value.indexOf(',');
  if (separator < 0 || !['data:image/png;base64', 'data:image/jpeg;base64', 'data:image/webp;base64'].includes(value.slice(0, separator))) return false;
  const content = value.slice(separator + 1).replace(/={1,2}$/, '');
  return content.length > 0 && !/[^A-Za-z0-9+/]/.test(content);
}
