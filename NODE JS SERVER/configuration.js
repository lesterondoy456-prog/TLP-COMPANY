import { ApiError } from './components/errors.js';

const text = (key, label, maxLength = 150, required = false) => ({ key, label, type: 'text', maxLength, required, default: '' });
const number = (key, label, { max = 2147483647, integer = false, defaultValue = 0 } = {}) => ({ key, label, type: 'number', min: 0, max, integer, step: integer ? 1 : 0.000001, precision: integer ? 0 : 6, default: defaultValue });
const boolean = (key, label) => ({ key, label, type: 'boolean', default: false });
const select = (key, label, options, defaultValue) => ({ key, label, type: 'select', options, maxLength: 80, required: true, default: defaultValue });
const category = (table, title) => ({ table, title, fields: [text('name', 'Name', 100, true)] });
const specs = {
  atc: { table: 'ConfigAtc', title: 'ATC', fields: [text('code', 'Code', 40, true), text('description', 'Description', 500, true), number('rate', 'Rate (%)', { max: 100 }), text('accountCode', 'Account Code', 100)] },
  countries: category('ConfigCountries', 'Countries'),
  'customer-categories': category('ConfigCustomerCategories', 'Customer Categories'),
  'product-categories': category('ConfigProductCategories', 'Product Categories'),
  'supplies-categories': category('ConfigSuppliesCategories', 'Supplies Categories'),
  warehouses: { table: 'ConfigWarehouses', title: 'Warehouses', fields: [text('code', 'Code', 40, true), text('description', 'Description', 500, true)] },
  locations: { table: 'ConfigLocations', title: 'Locations', fields: [text('code', 'Code', 40, true), text('description', 'Description', 500, true)] },
  'payment-terms': { table: 'ConfigPaymentTerms', title: 'Payment Terms', fields: [
    text('description', 'Description', 100, true), number('days', 'Days', { integer: true }), number('month', 'Month', { integer: true }),
    number('dateOfMonth', 'Date Of Month', { integer: true, max: 31 }), number('dayOfMonth', 'Day Of Month', { integer: true, max: 31 }),
    boolean('dueDateEom', 'Due Date EOM'), boolean('forCustomer', 'For Customer'), boolean('forSupplier', 'For Supplier'),
  ] },
  units: { table: 'ConfigUnits', title: 'Unit Product', fields: [text('description', 'Description', 150, true), text('shortName', 'Short Name', 30, true), boolean('forProduct', 'For Product'), boolean('forSupplies', 'For Supplies'), number('decimal', 'Decimal', { integer: true, max: 6 })] },
  currencies: { table: 'ConfigCurrencies', title: 'Currency', fields: [text('name', 'Name', 150, true), text('shortName', 'Short Name', 30, true), text('checkName', 'Check Name', 150), text('symbol', 'Symbol', 20), boolean('isDefault', 'Default')] },
  banks: { table: 'ConfigBanks', title: 'Bank', fields: [text('name', 'Name', 200, true), text('shortName', 'Short Name', 80, true), text('accountNo', 'Account No.', 100), text('accountName', 'Account Name', 150), text('swiftCode', 'Swift Code', 50), text('branchName', 'Branch Name', 150), text('address', 'Address', 500), text('accountType', 'Account Type', 80), text('currency', 'Curr', 30), text('account', 'Account', 100)] },
  'vat-codes': { table: 'ConfigVatCodes', title: 'VAT Code', fields: [
    text('code', 'Code', 40, true), text('description', 'Description', 500, true),
    select('type', 'Type', ['Vat Output', 'Vat Input'], 'Vat Output'), select('class', 'Class', ['Vatable', 'Vat-Exempt', 'Zero Rated'], 'Vatable'),
    number('rate', 'Rate (%)', { max: 100 }), boolean('prodVatInd', 'Prod. VAT Ind.'), text('accountCode', 'Account Code', 100),
  ] },
};

export const CONFIGURATION_KINDS = Object.freeze(Object.keys(specs));

export function configurationMetadata() {
  return [
    ...Object.entries(specs).map(([kind, spec]) => ({ kind, title: spec.title, readOnly: false, fields: spec.fields.map(field => ({ ...field, ...(field.options ? { options: [...field.options] } : {}) })) })),
    { kind: 'audit-trail', title: 'Audit Trail', readOnly: true, fields: [text('createdAt', 'Date'), text('userName', 'User'), text('module', 'Module'), text('action', 'Action'), text('recordId', 'Record')] },
  ];
}

function specification(kind) {
  if (kind === 'audit-trail') throw new ApiError(405, 'Audit Trail is read-only.');
  if (!Object.hasOwn(specs, kind)) throw new ApiError(404, 'Configuration module was not found.');
  return specs[kind];
}

function identifier(value) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0 || id > 2147483647) throw new ApiError(400, 'Select a valid configuration record.');
  return id;
}

export function requireConfigurationAdmin(user) {
  if (user?.role !== 'admin') throw new ApiError(403, 'Only administrators can change configuration.');
}

export function validateConfiguration(kind, input, current) {
  const spec = specification(kind);
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new ApiError(400, 'Send a valid configuration object.');
  const result = {};
  for (const field of [...spec.fields, { key: 'isActive', label: 'Active', type: 'boolean', default: true }]) {
    const value = input[field.key] !== undefined ? input[field.key] : current?.[field.key] ?? field.default;
    if (field.type === 'boolean') {
      if (typeof value !== 'boolean') throw new ApiError(400, `${field.label} must be true or false.`);
      result[field.key] = value;
    } else if (field.type === 'number') {
      if ((typeof value !== 'number' && typeof value !== 'string') || String(value).trim() === '' || !Number.isFinite(Number(value))) throw new ApiError(400, `${field.label} must be a number.`);
      const numeric = Number(value);
      if (numeric < field.min || numeric > field.max || (field.integer && !Number.isInteger(numeric)) || (!field.integer && Math.abs(numeric * 10 ** field.precision - Math.round(numeric * 10 ** field.precision)) > 1e-5)) throw new ApiError(400, `${field.label} is outside its supported range or decimal precision.`);
      result[field.key] = numeric;
    } else {
      if (typeof value !== 'string' || value.trim().length > field.maxLength || value.includes('\0')) throw new ApiError(400, `${field.label} must contain at most ${field.maxLength} characters.`);
      const clean = value.trim();
      if (field.required && !clean) throw new ApiError(400, `${field.label} is required.`);
      if (field.options && !field.options.includes(clean)) throw new ApiError(400, `Choose a supported ${field.label}.`);
      result[field.key] = clean;
    }
  }
  return result;
}

export function createConfigurationService({ request, sql, transaction, recordAudit = async () => {} }) {
  const columns = spec => ['id', ...spec.fields.map(field => field.key), 'isActive', 'deletedDate', 'createdAt', 'updatedAt'].map(key => `[${key}]`).join(', ')
    + (spec.table === 'ConfigUnits' ? ', [shortName] AS [name]' : spec.table === 'ConfigCurrencies' ? ', [shortName] AS [code], [name] AS [description]' : '');
  const sqlType = field => field.type === 'boolean' ? sql.Bit : field.type === 'number' ? field.integer ? sql.Int : sql.Decimal(18, field.precision) : sql.NVarChar(field.maxLength);

  async function getConfiguration(kind, value, scope, lock = false) {
    const spec = specification(kind);
    const result = await request(scope).input('id', sql.Int, identifier(value))
      .query(`SELECT ${columns(spec)} FROM dbo.${spec.table} ${lock ? 'WITH (UPDLOCK,HOLDLOCK)' : ''} WHERE id=@id`);
    if (!result.recordset.length) throw new ApiError(404, 'The configuration record was not found.');
    return result.recordset[0];
  }

  async function listAuditTrail() {
    return (await request().query('SELECT TOP (1000) id,userId,userName,module,action,recordId,createdAt FROM dbo.AuditTrail ORDER BY id DESC')).recordset;
  }

  return {
    configurationMetadata,
    listAuditTrail,
    async listConfiguration(kind) {
      if (kind === 'audit-trail') return listAuditTrail();
      const spec = specification(kind);
      return (await request().query(`SELECT ${columns(spec)} FROM dbo.${spec.table} ORDER BY id DESC`)).recordset;
    },
    getConfiguration,
    async saveConfiguration(kind, input, user, value) {
      requireConfigurationAdmin(user);
      const spec = specification(kind);
      const id = value === undefined ? undefined : identifier(value);
      return transaction(async scope => {
        const current = id ? await getConfiguration(kind, id, scope, true) : undefined;
        const values = validateConfiguration(kind, input, current);
        if (kind === 'currencies' && values.isActive && values.isDefault) {
          await request(scope).input('id', sql.Int, id || 0).query('UPDATE dbo.ConfigCurrencies WITH (UPDLOCK,HOLDLOCK) SET isDefault=0,updatedAt=SYSUTCDATETIME() WHERE isActive=1 AND isDefault=1 AND id<>@id');
        }
        const req = request(scope);
        for (const field of spec.fields) req.input(field.key, sqlType(field), values[field.key]);
        req.input('isActive', sql.Bit, values.isActive);
        const fields = spec.fields.map(field => field.key);
        let savedId;
        if (id) {
          const result = await req.input('id', sql.Int, id).query(`UPDATE dbo.${spec.table} SET ${fields.map(key => `[${key}]=@${key}`).join(',')},isActive=@isActive,deletedDate=CASE WHEN @isActive=1 THEN NULL ELSE COALESCE(deletedDate,SYSUTCDATETIME()) END,updatedAt=SYSUTCDATETIME() OUTPUT INSERTED.id WHERE id=@id`);
          if (!result.recordset.length) throw new ApiError(404, 'The configuration record was not found.');
          savedId = result.recordset[0].id;
        } else {
          const result = await req.query(`INSERT INTO dbo.${spec.table} (${fields.map(key => `[${key}]`).join(',')},isActive,deletedDate) OUTPUT INSERTED.id VALUES (${fields.map(key => `@${key}`).join(',')},@isActive,CASE WHEN @isActive=1 THEN NULL ELSE SYSUTCDATETIME() END)`);
          savedId = result.recordset[0].id;
        }
        await recordAudit(scope, user, kind, id ? 'update' : 'create', String(savedId));
        return getConfiguration(kind, savedId, scope);
      });
    },
    async deactivateConfiguration(kind, value, user) {
      requireConfigurationAdmin(user);
      const spec = specification(kind);
      const id = identifier(value);
      return transaction(async scope => {
        const current = await getConfiguration(kind, id, scope, true);
        if (!current.isActive) return current;
        await request(scope).input('id', sql.Int, id).query(`UPDATE dbo.${spec.table} SET isActive=0,deletedDate=COALESCE(deletedDate,SYSUTCDATETIME()),updatedAt=SYSUTCDATETIME() WHERE id=@id`);
        await recordAudit(scope, user, kind, 'deactivate', String(id));
        return getConfiguration(kind, id, scope);
      });
    },
  };
}
