const express = require("express");
const router = express.Router();
const { request, sql, transaction } = require("../db");
const SYSTEM = 'configuration';

const specs = {
  "atc": {
    "table": "ConfigAtc",
    "title": "ATC",
    "fields": [
      {
        "key": "code",
        "label": "Code",
        "type": "text",
        "required": true,
        "default": ""
      },
      {
        "key": "description",
        "label": "Description",
        "type": "text",
        "required": true,
        "default": ""
      },
      {
        "key": "rate",
        "label": "Rate (%)",
        "type": "number",
        "min": 0,
        "max": 100,
        "integer": false,
        "step": 1e-06,
        "precision": 6,
        "default": 0
      },
      {
        "key": "accountCode",
        "label": "Account Code",
        "type": "text",
        "required": false,
        "default": ""
      }
    ]
  },
  "countries": {
    "table": "ConfigCountries",
    "title": "Countries",
    "fields": [
      {
        "key": "name",
        "label": "Name",
        "type": "text",
        "required": true,
        "default": ""
      }
    ]
  },
  "customer-categories": {
    "table": "ConfigCustomerCategories",
    "title": "Customer Categories",
    "fields": [
      {
        "key": "name",
        "label": "Name",
        "type": "text",
        "required": true,
        "default": ""
      }
    ]
  },
  "product-categories": {
    "table": "ConfigProductCategories",
    "title": "Product Categories",
    "fields": [
      {
        "key": "name",
        "label": "Name",
        "type": "text",
        "required": true,
        "default": ""
      }
    ]
  },
  "supplies-categories": {
    "table": "ConfigSuppliesCategories",
    "title": "Supplies Categories",
    "fields": [
      {
        "key": "name",
        "label": "Name",
        "type": "text",
        "required": true,
        "default": ""
      }
    ]
  },
  "warehouses": {
    "table": "ConfigWarehouses",
    "title": "Warehouses",
    "fields": [
      {
        "key": "code",
        "label": "Code",
        "type": "text",
        "required": true,
        "default": ""
      },
      {
        "key": "description",
        "label": "Description",
        "type": "text",
        "required": true,
        "default": ""
      }
    ]
  },
  "locations": {
    "table": "ConfigLocations",
    "title": "Locations",
    "fields": [
      {
        "key": "code",
        "label": "Code",
        "type": "text",
        "required": true,
        "default": ""
      },
      {
        "key": "description",
        "label": "Description",
        "type": "text",
        "required": true,
        "default": ""
      }
    ]
  },
  "payment-terms": {
    "table": "ConfigPaymentTerms",
    "title": "Payment Terms",
    "fields": [
      {
        "key": "description",
        "label": "Description",
        "type": "text",
        "required": true,
        "default": ""
      },
      {
        "key": "days",
        "label": "Days",
        "type": "number",
        "min": 0,
        "max": 2147483647,
        "integer": true,
        "step": 1,
        "precision": 0,
        "default": 0
      },
      {
        "key": "month",
        "label": "Month",
        "type": "number",
        "min": 0,
        "max": 2147483647,
        "integer": true,
        "step": 1,
        "precision": 0,
        "default": 0
      },
      {
        "key": "dateOfMonth",
        "label": "Date Of Month",
        "type": "number",
        "min": 0,
        "max": 31,
        "integer": true,
        "step": 1,
        "precision": 0,
        "default": 0
      },
      {
        "key": "dayOfMonth",
        "label": "Day Of Month",
        "type": "number",
        "min": 0,
        "max": 31,
        "integer": true,
        "step": 1,
        "precision": 0,
        "default": 0
      },
      {
        "key": "dueDateEom",
        "label": "Due Date EOM",
        "type": "boolean",
        "default": false
      },
      {
        "key": "forCustomer",
        "label": "For Customer",
        "type": "boolean",
        "default": false
      },
      {
        "key": "forSupplier",
        "label": "For Supplier",
        "type": "boolean",
        "default": false
      }
    ]
  },
  "units": {
    "table": "ConfigUnits",
    "title": "Unit Product",
    "fields": [
      {
        "key": "description",
        "label": "Description",
        "type": "text",
        "required": true,
        "default": ""
      },
      {
        "key": "shortName",
        "label": "Short Name",
        "type": "text",
        "required": true,
        "default": ""
      },
      {
        "key": "forProduct",
        "label": "For Product",
        "type": "boolean",
        "default": false
      },
      {
        "key": "forSupplies",
        "label": "For Supplies",
        "type": "boolean",
        "default": false
      },
      {
        "key": "decimal",
        "label": "Decimal",
        "type": "number",
        "min": 0,
        "max": 6,
        "integer": true,
        "step": 1,
        "precision": 0,
        "default": 0
      }
    ]
  },
  "currencies": {
    "table": "ConfigCurrencies",
    "title": "Currency",
    "fields": [
      {
        "key": "name",
        "label": "Name",
        "type": "text",
        "required": true,
        "default": ""
      },
      {
        "key": "shortName",
        "label": "Short Name",
        "type": "text",
        "required": true,
        "default": ""
      },
      {
        "key": "checkName",
        "label": "Check Name",
        "type": "text",
        "required": false,
        "default": ""
      },
      {
        "key": "symbol",
        "label": "Symbol",
        "type": "text",
        "required": false,
        "default": ""
      },
      {
        "key": "isDefault",
        "label": "Default",
        "type": "boolean",
        "default": false
      }
    ]
  },
  "banks": {
    "table": "ConfigBanks",
    "title": "Bank",
    "fields": [
      {
        "key": "name",
        "label": "Name",
        "type": "text",
        "required": true,
        "default": ""
      },
      {
        "key": "shortName",
        "label": "Short Name",
        "type": "text",
        "required": true,
        "default": ""
      },
      {
        "key": "accountNo",
        "label": "Account No.",
        "type": "text",
        "required": false,
        "default": ""
      },
      {
        "key": "accountName",
        "label": "Account Name",
        "type": "text",
        "required": false,
        "default": ""
      },
      {
        "key": "swiftCode",
        "label": "Swift Code",
        "type": "text",
        "required": false,
        "default": ""
      },
      {
        "key": "branchName",
        "label": "Branch Name",
        "type": "text",
        "required": false,
        "default": ""
      },
      {
        "key": "address",
        "label": "Address",
        "type": "text",
        "required": false,
        "default": ""
      },
      {
        "key": "accountType",
        "label": "Account Type",
        "type": "text",
        "required": false,
        "default": ""
      },
      {
        "key": "currency",
        "label": "Curr",
        "type": "text",
        "required": false,
        "default": ""
      },
      {
        "key": "account",
        "label": "Account",
        "type": "text",
        "required": false,
        "default": ""
      }
    ]
  },
  "vat-codes": {
    "table": "ConfigVatCodes",
    "title": "VAT Code",
    "fields": [
      {
        "key": "code",
        "label": "Code",
        "type": "text",
        "required": true,
        "default": ""
      },
      {
        "key": "description",
        "label": "Description",
        "type": "text",
        "required": true,
        "default": ""
      },
      {
        "key": "type",
        "label": "Type",
        "type": "select",
        "options": [
          "Vat Output",
          "Vat Input"
        ],
        "required": true,
        "default": "Vat Output"
      },
      {
        "key": "class",
        "label": "Class",
        "type": "select",
        "options": [
          "Vatable",
          "Vat-Exempt",
          "Zero Rated"
        ],
        "required": true,
        "default": "Vatable"
      },
      {
        "key": "rate",
        "label": "Rate (%)",
        "type": "number",
        "min": 0,
        "max": 100,
        "integer": false,
        "step": 1e-06,
        "precision": 6,
        "default": 0
      },
      {
        "key": "prodVatInd",
        "label": "Prod. VAT Ind.",
        "type": "boolean",
        "default": false
      },
      {
        "key": "accountCode",
        "label": "Account Code",
        "type": "text",
        "required": false,
        "default": ""
      }
    ]
  }
};

const auditTrail = {
  "kind": "audit-trail",
  "title": "Audit Trail",
  "readOnly": true,
  "fields": [
    {
      "key": "createdAt",
      "label": "Date",
      "type": "text",
      "required": false,
      "default": ""
    },
    {
      "key": "system",
      "label": "System",
      "type": "text",
      "required": false,
      "default": ""
    },
    {
      "key": "userName",
      "label": "User",
      "type": "text",
      "required": false,
      "default": ""
    },
    {
      "key": "module",
      "label": "Module",
      "type": "text",
      "required": false,
      "default": ""
    },
    {
      "key": "action",
      "label": "Action",
      "type": "text",
      "required": false,
      "default": ""
    },
    {
      "key": "recordId",
      "label": "Record",
      "type": "text",
      "required": false,
      "default": ""
    }
  ]
};

router.get('/masters', (_req, res) => res.json({ modules: [
  ...Object.entries(specs).map(([kind, spec]) => ({ kind, title: spec.title, readOnly: false, fields: spec.fields.map(field => ({ ...field, ...(field.options ? { options: [...field.options] } : {}) })) })),
  { ...auditTrail, fields: auditTrail.fields.map(field => ({ ...field })) },
] }));
router.get('/masters/:kind', async (req, res) => {
  if (req.params.kind === 'audit-trail') {
    const result = await request().query('SELECT TOP (1000) id,userId,userName,system,module,action,recordId,createdAt FROM dbo.AuditTrail ORDER BY id DESC');
    return res.json({ records: result.recordset });
  }
  const kind = req.params.kind;
  if (kind === 'audit-trail') throw Object.assign(new Error('Audit Trail is read-only.'), { status: 405 });
  if (!Object.hasOwn(specs, kind)) throw Object.assign(new Error('Configuration module was not found.'), { status: 404 });
  const spec = specs[kind];
  let result;
  switch (kind) {
    case 'atc': result = await request().query(`SELECT [id], [code], [description], [rate], [accountCode], [isActive], [deletedDate], [createdAt], [updatedAt] FROM dbo.ConfigAtc ORDER BY id DESC`); break;
    case 'countries': result = await request().query(`SELECT [id], [name], [isActive], [deletedDate], [createdAt], [updatedAt] FROM dbo.ConfigCountries ORDER BY id DESC`); break;
    case 'customer-categories': result = await request().query(`SELECT [id], [name], [isActive], [deletedDate], [createdAt], [updatedAt] FROM dbo.ConfigCustomerCategories ORDER BY id DESC`); break;
    case 'product-categories': result = await request().query(`SELECT [id], [name], [isActive], [deletedDate], [createdAt], [updatedAt] FROM dbo.ConfigProductCategories ORDER BY id DESC`); break;
    case 'supplies-categories': result = await request().query(`SELECT [id], [name], [isActive], [deletedDate], [createdAt], [updatedAt] FROM dbo.ConfigSuppliesCategories ORDER BY id DESC`); break;
    case 'warehouses': result = await request().query(`SELECT [id], [code], [description], [isActive], [deletedDate], [createdAt], [updatedAt] FROM dbo.ConfigWarehouses ORDER BY id DESC`); break;
    case 'locations': result = await request().query(`SELECT [id], [code], [description], [isActive], [deletedDate], [createdAt], [updatedAt] FROM dbo.ConfigLocations ORDER BY id DESC`); break;
    case 'payment-terms': result = await request().query(`SELECT [id], [description], [days], [month], [dateOfMonth], [dayOfMonth], [dueDateEom], [forCustomer], [forSupplier], [isActive], [deletedDate], [createdAt], [updatedAt] FROM dbo.ConfigPaymentTerms ORDER BY id DESC`); break;
    case 'units': result = await request().query(`SELECT [id], [description], [shortName], [forProduct], [forSupplies], [decimal], [isActive], [deletedDate], [createdAt], [updatedAt], [shortName] AS [name] FROM dbo.ConfigUnits ORDER BY id DESC`); break;
    case 'currencies': result = await request().query(`SELECT [id], [name], [shortName], [checkName], [symbol], [isDefault], [isActive], [deletedDate], [createdAt], [updatedAt], [shortName] AS [code], [name] AS [description] FROM dbo.ConfigCurrencies ORDER BY id DESC`); break;
    case 'banks': result = await request().query(`SELECT [id], [name], [shortName], [accountNo], [accountName], [swiftCode], [branchName], [address], [accountType], [currency], [account], [isActive], [deletedDate], [createdAt], [updatedAt] FROM dbo.ConfigBanks ORDER BY id DESC`); break;
    case 'vat-codes': result = await request().query(`SELECT [id], [code], [description], [type], [class], [rate], [prodVatInd], [accountCode], [isActive], [deletedDate], [createdAt], [updatedAt] FROM dbo.ConfigVatCodes ORDER BY id DESC`); break;
    default: throw Object.assign(new Error('Configuration query was not found.'), { status: 404 });
  }
  res.json({ records: result.recordset });
});
router.get('/masters/:kind/:id', async (req, res) => {
  const kind = req.params.kind;
  if (kind === 'audit-trail') throw Object.assign(new Error('Audit Trail is read-only.'), { status: 405 });
  if (!Object.hasOwn(specs, kind)) throw Object.assign(new Error('Configuration module was not found.'), { status: 404 });
  const spec = specs[kind];
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0 || id > 2147483647) throw Object.assign(new Error('Select a valid configuration record.'), { status: 400 });
  let result;
  switch (kind) {
    case 'atc': result = await request().input('id', sql.Int, id).query(`SELECT [id], [code], [description], [rate], [accountCode], [isActive], [deletedDate], [createdAt], [updatedAt] FROM dbo.ConfigAtc WHERE id=@id`); break;
    case 'countries': result = await request().input('id', sql.Int, id).query(`SELECT [id], [name], [isActive], [deletedDate], [createdAt], [updatedAt] FROM dbo.ConfigCountries WHERE id=@id`); break;
    case 'customer-categories': result = await request().input('id', sql.Int, id).query(`SELECT [id], [name], [isActive], [deletedDate], [createdAt], [updatedAt] FROM dbo.ConfigCustomerCategories WHERE id=@id`); break;
    case 'product-categories': result = await request().input('id', sql.Int, id).query(`SELECT [id], [name], [isActive], [deletedDate], [createdAt], [updatedAt] FROM dbo.ConfigProductCategories WHERE id=@id`); break;
    case 'supplies-categories': result = await request().input('id', sql.Int, id).query(`SELECT [id], [name], [isActive], [deletedDate], [createdAt], [updatedAt] FROM dbo.ConfigSuppliesCategories WHERE id=@id`); break;
    case 'warehouses': result = await request().input('id', sql.Int, id).query(`SELECT [id], [code], [description], [isActive], [deletedDate], [createdAt], [updatedAt] FROM dbo.ConfigWarehouses WHERE id=@id`); break;
    case 'locations': result = await request().input('id', sql.Int, id).query(`SELECT [id], [code], [description], [isActive], [deletedDate], [createdAt], [updatedAt] FROM dbo.ConfigLocations WHERE id=@id`); break;
    case 'payment-terms': result = await request().input('id', sql.Int, id).query(`SELECT [id], [description], [days], [month], [dateOfMonth], [dayOfMonth], [dueDateEom], [forCustomer], [forSupplier], [isActive], [deletedDate], [createdAt], [updatedAt] FROM dbo.ConfigPaymentTerms WHERE id=@id`); break;
    case 'units': result = await request().input('id', sql.Int, id).query(`SELECT [id], [description], [shortName], [forProduct], [forSupplies], [decimal], [isActive], [deletedDate], [createdAt], [updatedAt], [shortName] AS [name] FROM dbo.ConfigUnits WHERE id=@id`); break;
    case 'currencies': result = await request().input('id', sql.Int, id).query(`SELECT [id], [name], [shortName], [checkName], [symbol], [isDefault], [isActive], [deletedDate], [createdAt], [updatedAt], [shortName] AS [code], [name] AS [description] FROM dbo.ConfigCurrencies WHERE id=@id`); break;
    case 'banks': result = await request().input('id', sql.Int, id).query(`SELECT [id], [name], [shortName], [accountNo], [accountName], [swiftCode], [branchName], [address], [accountType], [currency], [account], [isActive], [deletedDate], [createdAt], [updatedAt] FROM dbo.ConfigBanks WHERE id=@id`); break;
    case 'vat-codes': result = await request().input('id', sql.Int, id).query(`SELECT [id], [code], [description], [type], [class], [rate], [prodVatInd], [accountCode], [isActive], [deletedDate], [createdAt], [updatedAt] FROM dbo.ConfigVatCodes WHERE id=@id`); break;
    default: throw Object.assign(new Error('Configuration query was not found.'), { status: 404 });
  }
  if (!result.recordset.length) throw Object.assign(new Error('The configuration record was not found.'), { status: 404 });
  res.json({ record: result.recordset[0] });
});

router.post('/masters/:kind', async (req, res) => {
  if (req.configurationUser?.system !== 'configuration' || req.configurationUser.role !== 'admin') throw Object.assign(new Error('Only administrators can change configuration.'), { status: 403 });
  if (!req.get('content-type')?.toLowerCase().startsWith('application/json')) throw Object.assign(new Error('Send this request as JSON.'), { status: 415 });
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) throw Object.assign(new Error('Send a valid JSON object.'), { status: 400 });
  const input = req.body, kind = req.params.kind, actor = req.configurationUser;
  if (kind === 'audit-trail') throw Object.assign(new Error('Audit Trail is read-only.'), { status: 405 });
  if (!Object.hasOwn(specs, kind)) throw Object.assign(new Error('Configuration module was not found.'), { status: 404 });
  const spec = specs[kind];
  const record = await transaction(async scope => {

    const auditUser = actor;
    if (auditUser?.system !== 'configuration' || auditUser.role !== 'admin') throw Object.assign(new Error('Only administrators can change configuration.'), { status: 403 });
    const current = undefined;

    const values = {};
    for (const field of [...spec.fields, { key: 'isActive', type: 'boolean', default: true }]) {
      const raw = input[field.key] !== undefined ? input[field.key] : current?.[field.key] ?? field.default;
      if (field.type === 'boolean') {
        if (typeof raw !== 'boolean') throw Object.assign(new Error('Invalid stored checkbox value.'), { status: 400 });
        values[field.key] = raw;
      } else if (field.type === 'number') {
        const number = Number(raw);
        if (!Number.isFinite(number) || (field.integer && (!Number.isInteger(number) || number < -2147483648 || number > 2147483647))
          || (!field.integer && (Math.abs(number) > 999999999999.999999 || Math.abs(number * 1e6 - Math.round(number * 1e6)) > 1e-5))) throw Object.assign(new Error('Numeric value exceeds the database precision.'), { status: 400 });
        values[field.key] = number;
      } else {
        if (typeof raw !== 'string' || raw.includes('\0')) throw Object.assign(new Error('Text must be a string without null characters.'), { status: 400 });
        values[field.key] = raw.trim();
      }
    }

    if (kind === 'currencies' && values.isActive && values.isDefault) {
      await request(scope).input('id', sql.Int, current?.id || 0).query('UPDATE dbo.ConfigCurrencies WITH (UPDLOCK,HOLDLOCK) SET isDefault=0,updatedAt=SYSUTCDATETIME() WHERE isActive=1 AND isDefault=1 AND id<>@id');
    }
    const query = request(scope);
    for (const field of spec.fields) query.input(field.key, field.type === 'boolean' ? sql.Bit : field.type === 'number' ? field.integer ? sql.Int : sql.Decimal(18, field.precision) : sql.NVarChar(sql.MAX), values[field.key]);
    query.input('isActive', sql.Bit, values.isActive);

    let result;
    switch (kind) {
      case 'atc': result = await query.query(`INSERT INTO dbo.ConfigAtc ([code], [description], [rate], [accountCode], isActive, deletedDate) OUTPUT INSERTED.id VALUES (@code, @description, @rate, @accountCode, @isActive, CASE WHEN @isActive=1 THEN NULL ELSE SYSUTCDATETIME() END)`); break;
      case 'countries': result = await query.query(`INSERT INTO dbo.ConfigCountries ([name], isActive, deletedDate) OUTPUT INSERTED.id VALUES (@name, @isActive, CASE WHEN @isActive=1 THEN NULL ELSE SYSUTCDATETIME() END)`); break;
      case 'customer-categories': result = await query.query(`INSERT INTO dbo.ConfigCustomerCategories ([name], isActive, deletedDate) OUTPUT INSERTED.id VALUES (@name, @isActive, CASE WHEN @isActive=1 THEN NULL ELSE SYSUTCDATETIME() END)`); break;
      case 'product-categories': result = await query.query(`INSERT INTO dbo.ConfigProductCategories ([name], isActive, deletedDate) OUTPUT INSERTED.id VALUES (@name, @isActive, CASE WHEN @isActive=1 THEN NULL ELSE SYSUTCDATETIME() END)`); break;
      case 'supplies-categories': result = await query.query(`INSERT INTO dbo.ConfigSuppliesCategories ([name], isActive, deletedDate) OUTPUT INSERTED.id VALUES (@name, @isActive, CASE WHEN @isActive=1 THEN NULL ELSE SYSUTCDATETIME() END)`); break;
      case 'warehouses': result = await query.query(`INSERT INTO dbo.ConfigWarehouses ([code], [description], isActive, deletedDate) OUTPUT INSERTED.id VALUES (@code, @description, @isActive, CASE WHEN @isActive=1 THEN NULL ELSE SYSUTCDATETIME() END)`); break;
      case 'locations': result = await query.query(`INSERT INTO dbo.ConfigLocations ([code], [description], isActive, deletedDate) OUTPUT INSERTED.id VALUES (@code, @description, @isActive, CASE WHEN @isActive=1 THEN NULL ELSE SYSUTCDATETIME() END)`); break;
      case 'payment-terms': result = await query.query(`INSERT INTO dbo.ConfigPaymentTerms ([description], [days], [month], [dateOfMonth], [dayOfMonth], [dueDateEom], [forCustomer], [forSupplier], isActive, deletedDate) OUTPUT INSERTED.id VALUES (@description, @days, @month, @dateOfMonth, @dayOfMonth, @dueDateEom, @forCustomer, @forSupplier, @isActive, CASE WHEN @isActive=1 THEN NULL ELSE SYSUTCDATETIME() END)`); break;
      case 'units': result = await query.query(`INSERT INTO dbo.ConfigUnits ([description], [shortName], [forProduct], [forSupplies], [decimal], isActive, deletedDate) OUTPUT INSERTED.id VALUES (@description, @shortName, @forProduct, @forSupplies, @decimal, @isActive, CASE WHEN @isActive=1 THEN NULL ELSE SYSUTCDATETIME() END)`); break;
      case 'currencies': result = await query.query(`INSERT INTO dbo.ConfigCurrencies ([name], [shortName], [checkName], [symbol], [isDefault], isActive, deletedDate) OUTPUT INSERTED.id VALUES (@name, @shortName, @checkName, @symbol, @isDefault, @isActive, CASE WHEN @isActive=1 THEN NULL ELSE SYSUTCDATETIME() END)`); break;
      case 'banks': result = await query.query(`INSERT INTO dbo.ConfigBanks ([name], [shortName], [accountNo], [accountName], [swiftCode], [branchName], [address], [accountType], [currency], [account], isActive, deletedDate) OUTPUT INSERTED.id VALUES (@name, @shortName, @accountNo, @accountName, @swiftCode, @branchName, @address, @accountType, @currency, @account, @isActive, CASE WHEN @isActive=1 THEN NULL ELSE SYSUTCDATETIME() END)`); break;
      case 'vat-codes': result = await query.query(`INSERT INTO dbo.ConfigVatCodes ([code], [description], [type], [class], [rate], [prodVatInd], [accountCode], isActive, deletedDate) OUTPUT INSERTED.id VALUES (@code, @description, @type, @class, @rate, @prodVatInd, @accountCode, @isActive, CASE WHEN @isActive=1 THEN NULL ELSE SYSUTCDATETIME() END)`); break;
      default: throw Object.assign(new Error('Configuration query was not found.'), { status: 404 });
    }
    const savedId = result.recordset[0].id;

    await request(scope).input('userId', sql.Int, auditUser.id).input('userName', sql.NVarChar(sql.MAX), auditUser.name)
      .input('system', sql.NVarChar(sql.MAX), SYSTEM).input('module', sql.NVarChar(sql.MAX), kind)
      .input('action', sql.NVarChar(sql.MAX), 'create').input('recordId', sql.NVarChar(sql.MAX), String(savedId))
      .query('INSERT INTO dbo.AuditTrail(userId,userName,system,module,action,recordId) VALUES(@userId,@userName,@system,@module,@action,@recordId)');
    let selectedResult;
    switch (kind) {
      case 'atc': selectedResult = await request(scope).input('id', sql.Int, savedId).query(`SELECT [id], [code], [description], [rate], [accountCode], [isActive], [deletedDate], [createdAt], [updatedAt] FROM dbo.ConfigAtc WHERE id=@id`); break;
      case 'countries': selectedResult = await request(scope).input('id', sql.Int, savedId).query(`SELECT [id], [name], [isActive], [deletedDate], [createdAt], [updatedAt] FROM dbo.ConfigCountries WHERE id=@id`); break;
      case 'customer-categories': selectedResult = await request(scope).input('id', sql.Int, savedId).query(`SELECT [id], [name], [isActive], [deletedDate], [createdAt], [updatedAt] FROM dbo.ConfigCustomerCategories WHERE id=@id`); break;
      case 'product-categories': selectedResult = await request(scope).input('id', sql.Int, savedId).query(`SELECT [id], [name], [isActive], [deletedDate], [createdAt], [updatedAt] FROM dbo.ConfigProductCategories WHERE id=@id`); break;
      case 'supplies-categories': selectedResult = await request(scope).input('id', sql.Int, savedId).query(`SELECT [id], [name], [isActive], [deletedDate], [createdAt], [updatedAt] FROM dbo.ConfigSuppliesCategories WHERE id=@id`); break;
      case 'warehouses': selectedResult = await request(scope).input('id', sql.Int, savedId).query(`SELECT [id], [code], [description], [isActive], [deletedDate], [createdAt], [updatedAt] FROM dbo.ConfigWarehouses WHERE id=@id`); break;
      case 'locations': selectedResult = await request(scope).input('id', sql.Int, savedId).query(`SELECT [id], [code], [description], [isActive], [deletedDate], [createdAt], [updatedAt] FROM dbo.ConfigLocations WHERE id=@id`); break;
      case 'payment-terms': selectedResult = await request(scope).input('id', sql.Int, savedId).query(`SELECT [id], [description], [days], [month], [dateOfMonth], [dayOfMonth], [dueDateEom], [forCustomer], [forSupplier], [isActive], [deletedDate], [createdAt], [updatedAt] FROM dbo.ConfigPaymentTerms WHERE id=@id`); break;
      case 'units': selectedResult = await request(scope).input('id', sql.Int, savedId).query(`SELECT [id], [description], [shortName], [forProduct], [forSupplies], [decimal], [isActive], [deletedDate], [createdAt], [updatedAt], [shortName] AS [name] FROM dbo.ConfigUnits WHERE id=@id`); break;
      case 'currencies': selectedResult = await request(scope).input('id', sql.Int, savedId).query(`SELECT [id], [name], [shortName], [checkName], [symbol], [isDefault], [isActive], [deletedDate], [createdAt], [updatedAt], [shortName] AS [code], [name] AS [description] FROM dbo.ConfigCurrencies WHERE id=@id`); break;
      case 'banks': selectedResult = await request(scope).input('id', sql.Int, savedId).query(`SELECT [id], [name], [shortName], [accountNo], [accountName], [swiftCode], [branchName], [address], [accountType], [currency], [account], [isActive], [deletedDate], [createdAt], [updatedAt] FROM dbo.ConfigBanks WHERE id=@id`); break;
      case 'vat-codes': selectedResult = await request(scope).input('id', sql.Int, savedId).query(`SELECT [id], [code], [description], [type], [class], [rate], [prodVatInd], [accountCode], [isActive], [deletedDate], [createdAt], [updatedAt] FROM dbo.ConfigVatCodes WHERE id=@id`); break;
      default: throw Object.assign(new Error('Configuration query was not found.'), { status: 404 });
    }
    return selectedResult.recordset[0];
  });
  res.status(201).json({ record });
});

router.put('/masters/:kind/:id', async (req, res) => {
  if (req.configurationUser?.system !== 'configuration' || req.configurationUser.role !== 'admin') throw Object.assign(new Error('Only administrators can change configuration.'), { status: 403 });
  if (!req.get('content-type')?.toLowerCase().startsWith('application/json')) throw Object.assign(new Error('Send this request as JSON.'), { status: 415 });
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) throw Object.assign(new Error('Send a valid JSON object.'), { status: 400 });
  const input = req.body, kind = req.params.kind, actor = req.configurationUser;
  if (kind === 'audit-trail') throw Object.assign(new Error('Audit Trail is read-only.'), { status: 405 });
  if (!Object.hasOwn(specs, kind)) throw Object.assign(new Error('Configuration module was not found.'), { status: 404 });
  const spec = specs[kind];
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0 || id > 2147483647) throw Object.assign(new Error('Select a valid configuration record.'), { status: 400 });
  const record = await transaction(async scope => {

    const auditUser = actor;
    if (auditUser?.system !== 'configuration' || auditUser.role !== 'admin') throw Object.assign(new Error('Only administrators can change configuration.'), { status: 403 });
    let lockedResult;
    switch (kind) {
      case 'atc': lockedResult = await request(scope).input('id', sql.Int, id).query(`SELECT [id], [code], [description], [rate], [accountCode], [isActive], [deletedDate], [createdAt], [updatedAt] FROM dbo.ConfigAtc WITH (UPDLOCK,HOLDLOCK) WHERE id=@id`); break;
      case 'countries': lockedResult = await request(scope).input('id', sql.Int, id).query(`SELECT [id], [name], [isActive], [deletedDate], [createdAt], [updatedAt] FROM dbo.ConfigCountries WITH (UPDLOCK,HOLDLOCK) WHERE id=@id`); break;
      case 'customer-categories': lockedResult = await request(scope).input('id', sql.Int, id).query(`SELECT [id], [name], [isActive], [deletedDate], [createdAt], [updatedAt] FROM dbo.ConfigCustomerCategories WITH (UPDLOCK,HOLDLOCK) WHERE id=@id`); break;
      case 'product-categories': lockedResult = await request(scope).input('id', sql.Int, id).query(`SELECT [id], [name], [isActive], [deletedDate], [createdAt], [updatedAt] FROM dbo.ConfigProductCategories WITH (UPDLOCK,HOLDLOCK) WHERE id=@id`); break;
      case 'supplies-categories': lockedResult = await request(scope).input('id', sql.Int, id).query(`SELECT [id], [name], [isActive], [deletedDate], [createdAt], [updatedAt] FROM dbo.ConfigSuppliesCategories WITH (UPDLOCK,HOLDLOCK) WHERE id=@id`); break;
      case 'warehouses': lockedResult = await request(scope).input('id', sql.Int, id).query(`SELECT [id], [code], [description], [isActive], [deletedDate], [createdAt], [updatedAt] FROM dbo.ConfigWarehouses WITH (UPDLOCK,HOLDLOCK) WHERE id=@id`); break;
      case 'locations': lockedResult = await request(scope).input('id', sql.Int, id).query(`SELECT [id], [code], [description], [isActive], [deletedDate], [createdAt], [updatedAt] FROM dbo.ConfigLocations WITH (UPDLOCK,HOLDLOCK) WHERE id=@id`); break;
      case 'payment-terms': lockedResult = await request(scope).input('id', sql.Int, id).query(`SELECT [id], [description], [days], [month], [dateOfMonth], [dayOfMonth], [dueDateEom], [forCustomer], [forSupplier], [isActive], [deletedDate], [createdAt], [updatedAt] FROM dbo.ConfigPaymentTerms WITH (UPDLOCK,HOLDLOCK) WHERE id=@id`); break;
      case 'units': lockedResult = await request(scope).input('id', sql.Int, id).query(`SELECT [id], [description], [shortName], [forProduct], [forSupplies], [decimal], [isActive], [deletedDate], [createdAt], [updatedAt], [shortName] AS [name] FROM dbo.ConfigUnits WITH (UPDLOCK,HOLDLOCK) WHERE id=@id`); break;
      case 'currencies': lockedResult = await request(scope).input('id', sql.Int, id).query(`SELECT [id], [name], [shortName], [checkName], [symbol], [isDefault], [isActive], [deletedDate], [createdAt], [updatedAt], [shortName] AS [code], [name] AS [description] FROM dbo.ConfigCurrencies WITH (UPDLOCK,HOLDLOCK) WHERE id=@id`); break;
      case 'banks': lockedResult = await request(scope).input('id', sql.Int, id).query(`SELECT [id], [name], [shortName], [accountNo], [accountName], [swiftCode], [branchName], [address], [accountType], [currency], [account], [isActive], [deletedDate], [createdAt], [updatedAt] FROM dbo.ConfigBanks WITH (UPDLOCK,HOLDLOCK) WHERE id=@id`); break;
      case 'vat-codes': lockedResult = await request(scope).input('id', sql.Int, id).query(`SELECT [id], [code], [description], [type], [class], [rate], [prodVatInd], [accountCode], [isActive], [deletedDate], [createdAt], [updatedAt] FROM dbo.ConfigVatCodes WITH (UPDLOCK,HOLDLOCK) WHERE id=@id`); break;
      default: throw Object.assign(new Error('Configuration query was not found.'), { status: 404 });
    }
    const current = lockedResult.recordset[0];
    if (!current) throw Object.assign(new Error('The configuration record was not found.'), { status: 404 });

    const values = {};
    for (const field of [...spec.fields, { key: 'isActive', type: 'boolean', default: true }]) {
      const raw = input[field.key] !== undefined ? input[field.key] : current?.[field.key] ?? field.default;
      if (field.type === 'boolean') {
        if (typeof raw !== 'boolean') throw Object.assign(new Error('Invalid stored checkbox value.'), { status: 400 });
        values[field.key] = raw;
      } else if (field.type === 'number') {
        const number = Number(raw);
        if (!Number.isFinite(number) || (field.integer && (!Number.isInteger(number) || number < -2147483648 || number > 2147483647))
          || (!field.integer && (Math.abs(number) > 999999999999.999999 || Math.abs(number * 1e6 - Math.round(number * 1e6)) > 1e-5))) throw Object.assign(new Error('Numeric value exceeds the database precision.'), { status: 400 });
        values[field.key] = number;
      } else {
        if (typeof raw !== 'string' || raw.includes('\0')) throw Object.assign(new Error('Text must be a string without null characters.'), { status: 400 });
        values[field.key] = raw.trim();
      }
    }

    if (kind === 'currencies' && values.isActive && values.isDefault) {
      await request(scope).input('id', sql.Int, current?.id || 0).query('UPDATE dbo.ConfigCurrencies WITH (UPDLOCK,HOLDLOCK) SET isDefault=0,updatedAt=SYSUTCDATETIME() WHERE isActive=1 AND isDefault=1 AND id<>@id');
    }
    const query = request(scope);
    for (const field of spec.fields) query.input(field.key, field.type === 'boolean' ? sql.Bit : field.type === 'number' ? field.integer ? sql.Int : sql.Decimal(18, field.precision) : sql.NVarChar(sql.MAX), values[field.key]);
    query.input('isActive', sql.Bit, values.isActive);

    let result;
    switch (kind) {
      case 'atc': result = await query.input('id', sql.Int, id).query(`UPDATE dbo.ConfigAtc SET [code]=@code, [description]=@description, [rate]=@rate, [accountCode]=@accountCode, isActive=@isActive, deletedDate=CASE WHEN @isActive=1 THEN NULL ELSE COALESCE(deletedDate,SYSUTCDATETIME()) END, updatedAt=SYSUTCDATETIME() OUTPUT INSERTED.id WHERE id=@id`); break;
      case 'countries': result = await query.input('id', sql.Int, id).query(`UPDATE dbo.ConfigCountries SET [name]=@name, isActive=@isActive, deletedDate=CASE WHEN @isActive=1 THEN NULL ELSE COALESCE(deletedDate,SYSUTCDATETIME()) END, updatedAt=SYSUTCDATETIME() OUTPUT INSERTED.id WHERE id=@id`); break;
      case 'customer-categories': result = await query.input('id', sql.Int, id).query(`UPDATE dbo.ConfigCustomerCategories SET [name]=@name, isActive=@isActive, deletedDate=CASE WHEN @isActive=1 THEN NULL ELSE COALESCE(deletedDate,SYSUTCDATETIME()) END, updatedAt=SYSUTCDATETIME() OUTPUT INSERTED.id WHERE id=@id`); break;
      case 'product-categories': result = await query.input('id', sql.Int, id).query(`UPDATE dbo.ConfigProductCategories SET [name]=@name, isActive=@isActive, deletedDate=CASE WHEN @isActive=1 THEN NULL ELSE COALESCE(deletedDate,SYSUTCDATETIME()) END, updatedAt=SYSUTCDATETIME() OUTPUT INSERTED.id WHERE id=@id`); break;
      case 'supplies-categories': result = await query.input('id', sql.Int, id).query(`UPDATE dbo.ConfigSuppliesCategories SET [name]=@name, isActive=@isActive, deletedDate=CASE WHEN @isActive=1 THEN NULL ELSE COALESCE(deletedDate,SYSUTCDATETIME()) END, updatedAt=SYSUTCDATETIME() OUTPUT INSERTED.id WHERE id=@id`); break;
      case 'warehouses': result = await query.input('id', sql.Int, id).query(`UPDATE dbo.ConfigWarehouses SET [code]=@code, [description]=@description, isActive=@isActive, deletedDate=CASE WHEN @isActive=1 THEN NULL ELSE COALESCE(deletedDate,SYSUTCDATETIME()) END, updatedAt=SYSUTCDATETIME() OUTPUT INSERTED.id WHERE id=@id`); break;
      case 'locations': result = await query.input('id', sql.Int, id).query(`UPDATE dbo.ConfigLocations SET [code]=@code, [description]=@description, isActive=@isActive, deletedDate=CASE WHEN @isActive=1 THEN NULL ELSE COALESCE(deletedDate,SYSUTCDATETIME()) END, updatedAt=SYSUTCDATETIME() OUTPUT INSERTED.id WHERE id=@id`); break;
      case 'payment-terms': result = await query.input('id', sql.Int, id).query(`UPDATE dbo.ConfigPaymentTerms SET [description]=@description, [days]=@days, [month]=@month, [dateOfMonth]=@dateOfMonth, [dayOfMonth]=@dayOfMonth, [dueDateEom]=@dueDateEom, [forCustomer]=@forCustomer, [forSupplier]=@forSupplier, isActive=@isActive, deletedDate=CASE WHEN @isActive=1 THEN NULL ELSE COALESCE(deletedDate,SYSUTCDATETIME()) END, updatedAt=SYSUTCDATETIME() OUTPUT INSERTED.id WHERE id=@id`); break;
      case 'units': result = await query.input('id', sql.Int, id).query(`UPDATE dbo.ConfigUnits SET [description]=@description, [shortName]=@shortName, [forProduct]=@forProduct, [forSupplies]=@forSupplies, [decimal]=@decimal, isActive=@isActive, deletedDate=CASE WHEN @isActive=1 THEN NULL ELSE COALESCE(deletedDate,SYSUTCDATETIME()) END, updatedAt=SYSUTCDATETIME() OUTPUT INSERTED.id WHERE id=@id`); break;
      case 'currencies': result = await query.input('id', sql.Int, id).query(`UPDATE dbo.ConfigCurrencies SET [name]=@name, [shortName]=@shortName, [checkName]=@checkName, [symbol]=@symbol, [isDefault]=@isDefault, isActive=@isActive, deletedDate=CASE WHEN @isActive=1 THEN NULL ELSE COALESCE(deletedDate,SYSUTCDATETIME()) END, updatedAt=SYSUTCDATETIME() OUTPUT INSERTED.id WHERE id=@id`); break;
      case 'banks': result = await query.input('id', sql.Int, id).query(`UPDATE dbo.ConfigBanks SET [name]=@name, [shortName]=@shortName, [accountNo]=@accountNo, [accountName]=@accountName, [swiftCode]=@swiftCode, [branchName]=@branchName, [address]=@address, [accountType]=@accountType, [currency]=@currency, [account]=@account, isActive=@isActive, deletedDate=CASE WHEN @isActive=1 THEN NULL ELSE COALESCE(deletedDate,SYSUTCDATETIME()) END, updatedAt=SYSUTCDATETIME() OUTPUT INSERTED.id WHERE id=@id`); break;
      case 'vat-codes': result = await query.input('id', sql.Int, id).query(`UPDATE dbo.ConfigVatCodes SET [code]=@code, [description]=@description, [type]=@type, [class]=@class, [rate]=@rate, [prodVatInd]=@prodVatInd, [accountCode]=@accountCode, isActive=@isActive, deletedDate=CASE WHEN @isActive=1 THEN NULL ELSE COALESCE(deletedDate,SYSUTCDATETIME()) END, updatedAt=SYSUTCDATETIME() OUTPUT INSERTED.id WHERE id=@id`); break;
      default: throw Object.assign(new Error('Configuration query was not found.'), { status: 404 });
    }
    const savedId = result.recordset[0].id;

    await request(scope).input('userId', sql.Int, auditUser.id).input('userName', sql.NVarChar(sql.MAX), auditUser.name)
      .input('system', sql.NVarChar(sql.MAX), SYSTEM).input('module', sql.NVarChar(sql.MAX), kind)
      .input('action', sql.NVarChar(sql.MAX), 'update').input('recordId', sql.NVarChar(sql.MAX), String(savedId))
      .query('INSERT INTO dbo.AuditTrail(userId,userName,system,module,action,recordId) VALUES(@userId,@userName,@system,@module,@action,@recordId)');
    let selectedResult;
    switch (kind) {
      case 'atc': selectedResult = await request(scope).input('id', sql.Int, savedId).query(`SELECT [id], [code], [description], [rate], [accountCode], [isActive], [deletedDate], [createdAt], [updatedAt] FROM dbo.ConfigAtc WHERE id=@id`); break;
      case 'countries': selectedResult = await request(scope).input('id', sql.Int, savedId).query(`SELECT [id], [name], [isActive], [deletedDate], [createdAt], [updatedAt] FROM dbo.ConfigCountries WHERE id=@id`); break;
      case 'customer-categories': selectedResult = await request(scope).input('id', sql.Int, savedId).query(`SELECT [id], [name], [isActive], [deletedDate], [createdAt], [updatedAt] FROM dbo.ConfigCustomerCategories WHERE id=@id`); break;
      case 'product-categories': selectedResult = await request(scope).input('id', sql.Int, savedId).query(`SELECT [id], [name], [isActive], [deletedDate], [createdAt], [updatedAt] FROM dbo.ConfigProductCategories WHERE id=@id`); break;
      case 'supplies-categories': selectedResult = await request(scope).input('id', sql.Int, savedId).query(`SELECT [id], [name], [isActive], [deletedDate], [createdAt], [updatedAt] FROM dbo.ConfigSuppliesCategories WHERE id=@id`); break;
      case 'warehouses': selectedResult = await request(scope).input('id', sql.Int, savedId).query(`SELECT [id], [code], [description], [isActive], [deletedDate], [createdAt], [updatedAt] FROM dbo.ConfigWarehouses WHERE id=@id`); break;
      case 'locations': selectedResult = await request(scope).input('id', sql.Int, savedId).query(`SELECT [id], [code], [description], [isActive], [deletedDate], [createdAt], [updatedAt] FROM dbo.ConfigLocations WHERE id=@id`); break;
      case 'payment-terms': selectedResult = await request(scope).input('id', sql.Int, savedId).query(`SELECT [id], [description], [days], [month], [dateOfMonth], [dayOfMonth], [dueDateEom], [forCustomer], [forSupplier], [isActive], [deletedDate], [createdAt], [updatedAt] FROM dbo.ConfigPaymentTerms WHERE id=@id`); break;
      case 'units': selectedResult = await request(scope).input('id', sql.Int, savedId).query(`SELECT [id], [description], [shortName], [forProduct], [forSupplies], [decimal], [isActive], [deletedDate], [createdAt], [updatedAt], [shortName] AS [name] FROM dbo.ConfigUnits WHERE id=@id`); break;
      case 'currencies': selectedResult = await request(scope).input('id', sql.Int, savedId).query(`SELECT [id], [name], [shortName], [checkName], [symbol], [isDefault], [isActive], [deletedDate], [createdAt], [updatedAt], [shortName] AS [code], [name] AS [description] FROM dbo.ConfigCurrencies WHERE id=@id`); break;
      case 'banks': selectedResult = await request(scope).input('id', sql.Int, savedId).query(`SELECT [id], [name], [shortName], [accountNo], [accountName], [swiftCode], [branchName], [address], [accountType], [currency], [account], [isActive], [deletedDate], [createdAt], [updatedAt] FROM dbo.ConfigBanks WHERE id=@id`); break;
      case 'vat-codes': selectedResult = await request(scope).input('id', sql.Int, savedId).query(`SELECT [id], [code], [description], [type], [class], [rate], [prodVatInd], [accountCode], [isActive], [deletedDate], [createdAt], [updatedAt] FROM dbo.ConfigVatCodes WHERE id=@id`); break;
      default: throw Object.assign(new Error('Configuration query was not found.'), { status: 404 });
    }
    return selectedResult.recordset[0];
  });
  res.json({ record });
});

router.delete('/masters/:kind/:id', async (req, res) => {
  if (req.configurationUser?.system !== 'configuration' || req.configurationUser.role !== 'admin') throw Object.assign(new Error('Only administrators can change configuration.'), { status: 403 });
  const kind = req.params.kind, actor = req.configurationUser;
  if (kind === 'audit-trail') throw Object.assign(new Error('Audit Trail is read-only.'), { status: 405 });
  if (!Object.hasOwn(specs, kind)) throw Object.assign(new Error('Configuration module was not found.'), { status: 404 });
  const spec = specs[kind];
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0 || id > 2147483647) throw Object.assign(new Error('Select a valid configuration record.'), { status: 400 });
  const record = await transaction(async scope => {

    const auditUser = actor;

    if (auditUser?.system !== 'configuration' || auditUser.role !== 'admin') throw Object.assign(new Error('Only administrators can change configuration.'), { status: 403 });
    let lockedResult;
    switch (kind) {
      case 'atc': lockedResult = await request(scope).input('id', sql.Int, id).query(`SELECT [id], [code], [description], [rate], [accountCode], [isActive], [deletedDate], [createdAt], [updatedAt] FROM dbo.ConfigAtc WITH (UPDLOCK,HOLDLOCK) WHERE id=@id`); break;
      case 'countries': lockedResult = await request(scope).input('id', sql.Int, id).query(`SELECT [id], [name], [isActive], [deletedDate], [createdAt], [updatedAt] FROM dbo.ConfigCountries WITH (UPDLOCK,HOLDLOCK) WHERE id=@id`); break;
      case 'customer-categories': lockedResult = await request(scope).input('id', sql.Int, id).query(`SELECT [id], [name], [isActive], [deletedDate], [createdAt], [updatedAt] FROM dbo.ConfigCustomerCategories WITH (UPDLOCK,HOLDLOCK) WHERE id=@id`); break;
      case 'product-categories': lockedResult = await request(scope).input('id', sql.Int, id).query(`SELECT [id], [name], [isActive], [deletedDate], [createdAt], [updatedAt] FROM dbo.ConfigProductCategories WITH (UPDLOCK,HOLDLOCK) WHERE id=@id`); break;
      case 'supplies-categories': lockedResult = await request(scope).input('id', sql.Int, id).query(`SELECT [id], [name], [isActive], [deletedDate], [createdAt], [updatedAt] FROM dbo.ConfigSuppliesCategories WITH (UPDLOCK,HOLDLOCK) WHERE id=@id`); break;
      case 'warehouses': lockedResult = await request(scope).input('id', sql.Int, id).query(`SELECT [id], [code], [description], [isActive], [deletedDate], [createdAt], [updatedAt] FROM dbo.ConfigWarehouses WITH (UPDLOCK,HOLDLOCK) WHERE id=@id`); break;
      case 'locations': lockedResult = await request(scope).input('id', sql.Int, id).query(`SELECT [id], [code], [description], [isActive], [deletedDate], [createdAt], [updatedAt] FROM dbo.ConfigLocations WITH (UPDLOCK,HOLDLOCK) WHERE id=@id`); break;
      case 'payment-terms': lockedResult = await request(scope).input('id', sql.Int, id).query(`SELECT [id], [description], [days], [month], [dateOfMonth], [dayOfMonth], [dueDateEom], [forCustomer], [forSupplier], [isActive], [deletedDate], [createdAt], [updatedAt] FROM dbo.ConfigPaymentTerms WITH (UPDLOCK,HOLDLOCK) WHERE id=@id`); break;
      case 'units': lockedResult = await request(scope).input('id', sql.Int, id).query(`SELECT [id], [description], [shortName], [forProduct], [forSupplies], [decimal], [isActive], [deletedDate], [createdAt], [updatedAt], [shortName] AS [name] FROM dbo.ConfigUnits WITH (UPDLOCK,HOLDLOCK) WHERE id=@id`); break;
      case 'currencies': lockedResult = await request(scope).input('id', sql.Int, id).query(`SELECT [id], [name], [shortName], [checkName], [symbol], [isDefault], [isActive], [deletedDate], [createdAt], [updatedAt], [shortName] AS [code], [name] AS [description] FROM dbo.ConfigCurrencies WITH (UPDLOCK,HOLDLOCK) WHERE id=@id`); break;
      case 'banks': lockedResult = await request(scope).input('id', sql.Int, id).query(`SELECT [id], [name], [shortName], [accountNo], [accountName], [swiftCode], [branchName], [address], [accountType], [currency], [account], [isActive], [deletedDate], [createdAt], [updatedAt] FROM dbo.ConfigBanks WITH (UPDLOCK,HOLDLOCK) WHERE id=@id`); break;
      case 'vat-codes': lockedResult = await request(scope).input('id', sql.Int, id).query(`SELECT [id], [code], [description], [type], [class], [rate], [prodVatInd], [accountCode], [isActive], [deletedDate], [createdAt], [updatedAt] FROM dbo.ConfigVatCodes WITH (UPDLOCK,HOLDLOCK) WHERE id=@id`); break;
      default: throw Object.assign(new Error('Configuration query was not found.'), { status: 404 });
    }
    const current = lockedResult.recordset[0];
    if (!current) throw Object.assign(new Error('The configuration record was not found.'), { status: 404 });
    if (!current.isActive) return current;
    switch (kind) {
      case 'atc': await request(scope).input('id', sql.Int, id).query(`UPDATE dbo.ConfigAtc SET isActive=0, deletedDate=COALESCE(deletedDate,SYSUTCDATETIME()), updatedAt=SYSUTCDATETIME() WHERE id=@id`); break;
      case 'countries': await request(scope).input('id', sql.Int, id).query(`UPDATE dbo.ConfigCountries SET isActive=0, deletedDate=COALESCE(deletedDate,SYSUTCDATETIME()), updatedAt=SYSUTCDATETIME() WHERE id=@id`); break;
      case 'customer-categories': await request(scope).input('id', sql.Int, id).query(`UPDATE dbo.ConfigCustomerCategories SET isActive=0, deletedDate=COALESCE(deletedDate,SYSUTCDATETIME()), updatedAt=SYSUTCDATETIME() WHERE id=@id`); break;
      case 'product-categories': await request(scope).input('id', sql.Int, id).query(`UPDATE dbo.ConfigProductCategories SET isActive=0, deletedDate=COALESCE(deletedDate,SYSUTCDATETIME()), updatedAt=SYSUTCDATETIME() WHERE id=@id`); break;
      case 'supplies-categories': await request(scope).input('id', sql.Int, id).query(`UPDATE dbo.ConfigSuppliesCategories SET isActive=0, deletedDate=COALESCE(deletedDate,SYSUTCDATETIME()), updatedAt=SYSUTCDATETIME() WHERE id=@id`); break;
      case 'warehouses': await request(scope).input('id', sql.Int, id).query(`UPDATE dbo.ConfigWarehouses SET isActive=0, deletedDate=COALESCE(deletedDate,SYSUTCDATETIME()), updatedAt=SYSUTCDATETIME() WHERE id=@id`); break;
      case 'locations': await request(scope).input('id', sql.Int, id).query(`UPDATE dbo.ConfigLocations SET isActive=0, deletedDate=COALESCE(deletedDate,SYSUTCDATETIME()), updatedAt=SYSUTCDATETIME() WHERE id=@id`); break;
      case 'payment-terms': await request(scope).input('id', sql.Int, id).query(`UPDATE dbo.ConfigPaymentTerms SET isActive=0, deletedDate=COALESCE(deletedDate,SYSUTCDATETIME()), updatedAt=SYSUTCDATETIME() WHERE id=@id`); break;
      case 'units': await request(scope).input('id', sql.Int, id).query(`UPDATE dbo.ConfigUnits SET isActive=0, deletedDate=COALESCE(deletedDate,SYSUTCDATETIME()), updatedAt=SYSUTCDATETIME() WHERE id=@id`); break;
      case 'currencies': await request(scope).input('id', sql.Int, id).query(`UPDATE dbo.ConfigCurrencies SET isActive=0, deletedDate=COALESCE(deletedDate,SYSUTCDATETIME()), updatedAt=SYSUTCDATETIME() WHERE id=@id`); break;
      case 'banks': await request(scope).input('id', sql.Int, id).query(`UPDATE dbo.ConfigBanks SET isActive=0, deletedDate=COALESCE(deletedDate,SYSUTCDATETIME()), updatedAt=SYSUTCDATETIME() WHERE id=@id`); break;
      case 'vat-codes': await request(scope).input('id', sql.Int, id).query(`UPDATE dbo.ConfigVatCodes SET isActive=0, deletedDate=COALESCE(deletedDate,SYSUTCDATETIME()), updatedAt=SYSUTCDATETIME() WHERE id=@id`); break;
      default: throw Object.assign(new Error('Configuration query was not found.'), { status: 404 });
    }

    await request(scope).input('userId', sql.Int, auditUser.id).input('userName', sql.NVarChar(sql.MAX), auditUser.name)
      .input('system', sql.NVarChar(sql.MAX), SYSTEM).input('module', sql.NVarChar(sql.MAX), kind)
      .input('action', sql.NVarChar(sql.MAX), 'deactivate').input('recordId', sql.NVarChar(sql.MAX), String(id))
      .query('INSERT INTO dbo.AuditTrail(userId,userName,system,module,action,recordId) VALUES(@userId,@userName,@system,@module,@action,@recordId)');

    let selectedResult;
    switch (kind) {
      case 'atc': selectedResult = await request(scope).input('id', sql.Int, id).query(`SELECT [id], [code], [description], [rate], [accountCode], [isActive], [deletedDate], [createdAt], [updatedAt] FROM dbo.ConfigAtc WHERE id=@id`); break;
      case 'countries': selectedResult = await request(scope).input('id', sql.Int, id).query(`SELECT [id], [name], [isActive], [deletedDate], [createdAt], [updatedAt] FROM dbo.ConfigCountries WHERE id=@id`); break;
      case 'customer-categories': selectedResult = await request(scope).input('id', sql.Int, id).query(`SELECT [id], [name], [isActive], [deletedDate], [createdAt], [updatedAt] FROM dbo.ConfigCustomerCategories WHERE id=@id`); break;
      case 'product-categories': selectedResult = await request(scope).input('id', sql.Int, id).query(`SELECT [id], [name], [isActive], [deletedDate], [createdAt], [updatedAt] FROM dbo.ConfigProductCategories WHERE id=@id`); break;
      case 'supplies-categories': selectedResult = await request(scope).input('id', sql.Int, id).query(`SELECT [id], [name], [isActive], [deletedDate], [createdAt], [updatedAt] FROM dbo.ConfigSuppliesCategories WHERE id=@id`); break;
      case 'warehouses': selectedResult = await request(scope).input('id', sql.Int, id).query(`SELECT [id], [code], [description], [isActive], [deletedDate], [createdAt], [updatedAt] FROM dbo.ConfigWarehouses WHERE id=@id`); break;
      case 'locations': selectedResult = await request(scope).input('id', sql.Int, id).query(`SELECT [id], [code], [description], [isActive], [deletedDate], [createdAt], [updatedAt] FROM dbo.ConfigLocations WHERE id=@id`); break;
      case 'payment-terms': selectedResult = await request(scope).input('id', sql.Int, id).query(`SELECT [id], [description], [days], [month], [dateOfMonth], [dayOfMonth], [dueDateEom], [forCustomer], [forSupplier], [isActive], [deletedDate], [createdAt], [updatedAt] FROM dbo.ConfigPaymentTerms WHERE id=@id`); break;
      case 'units': selectedResult = await request(scope).input('id', sql.Int, id).query(`SELECT [id], [description], [shortName], [forProduct], [forSupplies], [decimal], [isActive], [deletedDate], [createdAt], [updatedAt], [shortName] AS [name] FROM dbo.ConfigUnits WHERE id=@id`); break;
      case 'currencies': selectedResult = await request(scope).input('id', sql.Int, id).query(`SELECT [id], [name], [shortName], [checkName], [symbol], [isDefault], [isActive], [deletedDate], [createdAt], [updatedAt], [shortName] AS [code], [name] AS [description] FROM dbo.ConfigCurrencies WHERE id=@id`); break;
      case 'banks': selectedResult = await request(scope).input('id', sql.Int, id).query(`SELECT [id], [name], [shortName], [accountNo], [accountName], [swiftCode], [branchName], [address], [accountType], [currency], [account], [isActive], [deletedDate], [createdAt], [updatedAt] FROM dbo.ConfigBanks WHERE id=@id`); break;
      case 'vat-codes': selectedResult = await request(scope).input('id', sql.Int, id).query(`SELECT [id], [code], [description], [type], [class], [rate], [prodVatInd], [accountCode], [isActive], [deletedDate], [createdAt], [updatedAt] FROM dbo.ConfigVatCodes WHERE id=@id`); break;
      default: throw Object.assign(new Error('Configuration query was not found.'), { status: 404 });
    }
    return selectedResult.recordset[0];
  });
  res.json({ record, success: true });
});
for (const [path, methods] of [
  ['/masters', ['GET']], ['/masters/:kind', ['GET', 'POST']], ['/masters/:kind/:id', ['GET', 'PUT', 'DELETE']],
]) router.all(path, (_req, res) => res.set('Allow', methods.join(', ')).status(405).json({ message: 'This request method is not supported.' }));

module.exports = router;
