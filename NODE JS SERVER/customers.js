import { request, sql, transaction } from './database.js';
import { ApiError } from './components/auth.js';
import * as v from './components/validation.js';
import { isActiveSalesAccount } from './components/roles.js';
import { recordAudit } from './audit.js';

const textLengths = {
  code: 40, name: 180, contactPerson: 150, cpnumber: 30, email: 254, address: 500,
  shortName: 80, businessStyle: 180, salesInCharge: 150, tin: 50, faxNo: 30,
  countryOfOrigin: 100, country: 100, category: 100, remarks: 2000,
  salesName: 180, drName: 180, paymentTerm: 100, vatCode: 80, taxCode: 80,
};
const defaults = {
  ...Object.fromEntries(Object.keys(textLengths).map(key => [key, ''])),
  isActive: true, decimalInPrice: 2, decimalInTotalPrice: 2,
  salesAddressType: 'office', drAddressType: 'office', discount: 0,
  discountType: 'percent', includePoInInvoice: false, vatInclusive: false,
  deliveryAddresses: [], salesInChargeId: null,
};
const requiredExpanded = new Set(['address', 'shortName', 'businessStyle', 'salesName', 'drName', 'vatCode']);
const legacyKeys = new Set(['id', 'code', 'name', 'contactPerson', 'cpnumber', 'email', 'address', 'isActive']);
const extendedKeys = Object.keys(defaults).filter(key => !legacyKeys.has(key));
const extraColumns = ['isActive', 'decimalInPrice', 'decimalInTotalPrice', 'salesAddressType', 'drAddressType', 'discount', 'discountType', 'includePoInInvoice', 'vatInclusive', 'salesInChargeId'];
const columns = ['id', ...Object.keys(textLengths), ...extraColumns]
  .map(key => key === 'salesInCharge' ? 'COALESCE(u.name,c.salesInCharge) AS salesInCharge' : `c.[${key}]`).join(',');
const accountJoin = 'LEFT JOIN dbo.SalesUserLogin u ON u.id=c.salesInChargeId';

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
  for (const key of ['isActive', 'includePoInInvoice', 'vatInclusive']) if (has(input, key)) result[key] = v.bool(input, key);
  for (const key of ['decimalInPrice', 'decimalInTotalPrice']) if (has(input, key)) result[key] = decimalPlaces(input, key);
  for (const key of ['salesAddressType', 'drAddressType']) if (has(input, key)) result[key] = choice(input, key, ['office', 'delivery']);
  if (has(input, 'discountType')) result.discountType = choice(input, 'discountType', ['percent', 'amount']);
  if (has(input, 'discount')) result.discount = v.numeric(input, 'discount', { min: 0, max: 1e9, places: 6 });
  if (result.discountType === 'percent' && result.discount > 100) throw new ApiError(400, 'Percentage discount cannot exceed 100.');
  if (has(input, 'deliveryAddresses')) result.deliveryAddresses = deliveryAddresses(input.deliveryAddresses);
  if (current && !result.code) result.code = current.code;
  return result;
}

async function addressesFor(scope, id) {
  const req = request(scope);
  if (id) req.input('id', sql.Int, id);
  return (await req.query(`SELECT customerId,position,address FROM dbo.CustomerDeliveryAddresses ${id ? 'WHERE customerId=@id' : ''} ORDER BY customerId,position`)).recordset;
}

export async function listCustomers() {
  const result = await request().query(`SELECT ${columns} FROM dbo.Customers c ${accountJoin} ORDER BY c.id DESC`);
  const addressRows = await addressesFor();
  const grouped = new Map();
  for (const row of addressRows) {
    if (!grouped.has(row.customerId)) grouped.set(row.customerId, []);
    grouped.get(row.customerId).push(row.address);
  }
  return result.recordset.map(record => ({ ...record, deliveryAddresses: grouped.get(record.id) || [] }));
}

export async function customerOptions() {
  const fields = [
    ['countriesOfOrigin', 'countryOfOrigin'],
    ['countries', 'country'],
    ['paymentTerms', 'paymentTerm'],
    ['categories', 'category'],
    ['taxCodes', 'taxCode'],
  ];
  const result = await request().query(`SELECT id,name,username,role FROM dbo.SalesUserLogin WHERE isActive=1 AND role='sales' ORDER BY name,username,id;
    ${fields.map(([, field]) => `SELECT DISTINCT LTRIM(RTRIM([${field}])) AS value FROM dbo.Customers WHERE LEN(LTRIM(RTRIM([${field}])))>0 ORDER BY value;`).join('\n')}
    SELECT name FROM dbo.ConfigCountries WHERE isActive=1 ORDER BY name;
    SELECT description FROM dbo.ConfigPaymentTerms WHERE isActive=1 AND forCustomer=1 ORDER BY description;
    SELECT name FROM dbo.ConfigCustomerCategories WHERE isActive=1 ORDER BY name;
    SELECT code FROM dbo.ConfigAtc WHERE isActive=1 ORDER BY code;
    SELECT id,code,description,rate FROM dbo.ConfigVatCodes WHERE isActive=1 ORDER BY code;`);
  const existing = Object.fromEntries(fields.map(([key], index) => [key, result.recordsets[index + 1].map(row => row.value)]));
  const countries = result.recordsets[6].map(row => row.name);
  const merged = (left, right) => [...new Set([...left, ...right])].sort((leftValue, rightValue) => leftValue.localeCompare(rightValue));
  return {
    salesInCharges: result.recordsets[0],
    countriesOfOrigin: merged(countries, existing.countriesOfOrigin),
    countries: merged(countries, existing.countries),
    paymentTerms: merged(result.recordsets[7].map(row => row.description), existing.paymentTerms),
    categories: merged(result.recordsets[8].map(row => row.name), existing.categories),
    taxCodes: merged(result.recordsets[9].map(row => row.code), existing.taxCodes),
    vatCodes: result.recordsets[10],
  };
}

export async function getCustomer(id, scope, lock = false) {
  const result = await request(scope).input('id', sql.Int, id)
    .query(`SELECT ${columns}${lock ? ',c.salesInCharge AS _salesInChargeSnapshot' : ''} FROM dbo.Customers c ${lock ? 'WITH (UPDLOCK,HOLDLOCK)' : ''} ${accountJoin} WHERE c.id=@id`);
  if (!result.recordset.length) throw new ApiError(404, 'The customer could not be found.');
  const addresses = await addressesFor(scope, id);
  return { ...result.recordset[0], deliveryAddresses: addresses.map(row => row.address) };
}

async function resolveSalesAssignment(input, current, scope) {
  const storedName = current?._salesInChargeSnapshot ?? current?.salesInCharge ?? '';
  const existing = { id: current?.salesInChargeId ?? null, name: storedName };
  if (has(input, 'salesInChargeId')) {
    const id = input.salesInChargeId;
    if (id === null) return { id: null, name: '' };
    if (typeof id !== 'number' || !Number.isInteger(id) || id <= 0 || id > 2147483647) {
      throw new ApiError(400, 'Select a valid Sales account.');
    }
    // Existing account links are historical assignments. Deactivation, rename,
    // or promotion must not prevent an unrelated customer field from changing.
    if (current && id === current.salesInChargeId) return existing;
    const result = await request(scope).input('id', sql.Int, id)
      .query('SELECT id,name,role,isActive FROM dbo.SalesUserLogin WHERE id=@id');
    const account = result.recordset[0];
    if (!isActiveSalesAccount(account)) throw new ApiError(400, 'Sales In-charge must be an active Sales account.');
    return { id: account.id, name: account.name };
  }
  if (!has(input, 'salesInCharge')) return existing;
  const name = v.text(input, 'salesInCharge', 150);
  if (current && (name === current.salesInCharge || name === storedName)) return existing;
  if (!name) return { id: null, name: '' };
  const result = await request(scope).input('name', sql.NVarChar(150), name)
    .query("SELECT id,name FROM dbo.SalesUserLogin WHERE name=@name AND role='sales' AND isActive=1");
  if (result.recordset.length !== 1) throw new ApiError(400, 'Select an active Sales account; names must resolve to one account.');
  return { id: result.recordset[0].id, name: result.recordset[0].name };
}

async function generatedCode(tx) {
  // Hold the customer table while reading its next identity, so generated codes
  // remain tied to Company Id even when multiple customers are saved together.
  await request(tx).query('SELECT COUNT_BIG(*) AS total FROM dbo.Customers WITH (TABLOCKX,HOLDLOCK)');
  const result = await request(tx).query(`SELECT COALESCE(CONVERT(bigint,last_value)+CONVERT(bigint,increment_value),CONVERT(bigint,seed_value)) AS nextId
    FROM sys.identity_columns WHERE object_id=OBJECT_ID(N'dbo.Customers') AND name=N'id'`);
  const id = Number(result.recordset[0]?.nextId);
  if (!Number.isSafeInteger(id) || id <= 0 || id > 2147483647) throw new ApiError(409, 'A customer identifier could not be allocated.');
  const base = `C-${String(id).padStart(8, '0')}`;
  let code = base;
  let suffix = 0;
  while ((await request(tx).input('code', sql.NVarChar(40), code).query('SELECT id FROM dbo.Customers WHERE code=@code')).recordset.length) {
    code = `${base}-${++suffix}`;
  }
  return code;
}

function saveRequest(tx, customer) {
  const req = request(tx);
  for (const [key, length] of Object.entries(textLengths)) req.input(key, sql.NVarChar(length), customer[key]);
  for (const key of ['isActive', 'includePoInInvoice', 'vatInclusive']) req.input(key, sql.Bit, customer[key]);
  for (const key of ['decimalInPrice', 'decimalInTotalPrice']) req.input(key, sql.Int, customer[key]);
  for (const key of ['salesAddressType', 'drAddressType', 'discountType']) req.input(key, sql.NVarChar(10), customer[key]);
  req.input('discount', sql.Decimal(18, 6), customer.discount);
  req.input('salesInChargeId', sql.Int, customer.salesInChargeId);
  return req;
}

export async function saveCustomer(input, id, user) {
  const savedId = await transaction(async tx => {
    const current = id ? await getCustomer(id, tx, true) : undefined;
    const customer = validateCustomer(input, current);
    const assignment = await resolveSalesAssignment(input, current, tx);
    customer.salesInChargeId = assignment.id;
    customer.salesInCharge = assignment.name;
    if (!customer.code) customer.code = await generatedCode(tx);
    const fields = [...Object.keys(textLengths), ...extraColumns];
    const req = saveRequest(tx, customer);
    let saved = id;
    if (id) {
      await req.input('id', sql.Int, id).query(`UPDATE dbo.Customers SET ${fields.map(key => `[${key}]=@${key}`).join(',')},updatedAt=SYSUTCDATETIME() WHERE id=@id`);
    } else {
      const result = await req.query(`INSERT INTO dbo.Customers (${fields.map(key => `[${key}]`).join(',')}) OUTPUT INSERTED.id VALUES (${fields.map(key => `@${key}`).join(',')})`);
      saved = result.recordset[0].id;
    }
    if (!current || has(input, 'deliveryAddresses')) {
      await request(tx).input('id', sql.Int, saved).query('DELETE FROM dbo.CustomerDeliveryAddresses WHERE customerId=@id');
      for (const [position, address] of customer.deliveryAddresses.entries()) {
        await request(tx).input('id', sql.Int, saved).input('position', sql.Int, position).input('address', sql.NVarChar(500), address)
          .query('INSERT INTO dbo.CustomerDeliveryAddresses(customerId,position,address) VALUES(@id,@position,@address)');
      }
    }
    if (user) await recordAudit(tx, user, 'customers', id ? 'update' : 'create', saved);
    return saved;
  });
  return getCustomer(savedId);
}
