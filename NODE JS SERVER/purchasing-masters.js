import { request, sql, transaction } from './database.js';
import { ApiError } from './components/errors.js';
import { SUPPLIER_TEXT, SUPPLIES_TEXT, SUPPLIES_NUMBERS, validateSupplier, validateSupplies } from './components/purchasing-validation.js';
import { recordAudit } from './audit.js';
import { createConfigurationService } from './configuration.js';

const configuration = createConfigurationService({ request, sql, transaction, recordAudit });
const has = (object, key) => Object.hasOwn(object, key) && object[key] !== undefined;
const supplierFields = [...Object.keys(SUPPLIER_TEXT), 'decimalInPrice', 'decimalInTotalPrice', 'vatInclusive', 'isActive'];
const suppliesFields = [...Object.keys(SUPPLIES_TEXT), ...SUPPLIES_NUMBERS, 'productId', 'inventorySetup', 'isActive'];

export async function getSupplier(id, scope, lock = false) {
  const result = await request(scope).input('id', sql.Int, id)
    .query(`SELECT id,code,${supplierFields.map(field => `[${field}]`).join(',')} FROM dbo.Suppliers ${lock ? 'WITH (UPDLOCK,HOLDLOCK)' : ''} WHERE id=@id`);
  if (!result.recordset.length) throw new ApiError(404, 'Supplier could not be found.');
  return result.recordset[0];
}

export async function listSuppliers() {
  return (await request().query(`SELECT id,code,${supplierFields.map(field => `[${field}]`).join(',')} FROM dbo.Suppliers ORDER BY name,id`)).recordset;
}

async function configuredValue(scope, table, column, value, message, extra = '') {
  const result = await request(scope).input('value', sql.NVarChar(200), value)
    .query(`SELECT id FROM dbo.${table} WHERE [${column}]=@value AND isActive=1 ${extra}`);
  if (!result.recordset.length) throw new ApiError(400, message);
}

export async function saveSupplier(input, id, user) {
  const saved = await transaction(async scope => {
    const current = id ? await getSupplier(id, scope, true) : undefined;
    const supplier = validateSupplier(input, current);
    if (!current || supplier.vatCode !== current.vatCode) await configuredValue(scope, 'ConfigVatCodes', 'code', supplier.vatCode, 'Select an active configured Supplier VAT Code.');
    if (supplier.paymentTerm && supplier.paymentTerm !== current?.paymentTerm) await configuredValue(scope, 'ConfigPaymentTerms', 'description', supplier.paymentTerm, 'Select an active Supplier Payment Term.', 'AND forSupplier=1');
    const req = request(scope);
    for (const [field, maximum] of Object.entries(SUPPLIER_TEXT)) req.input(field, sql.NVarChar(maximum), supplier[field]);
    for (const field of ['decimalInPrice', 'decimalInTotalPrice']) req.input(field, sql.Int, supplier[field]);
    for (const field of ['vatInclusive', 'isActive']) req.input(field, sql.Bit, supplier[field]);
    let savedId = id;
    if (id) {
      await req.input('id', sql.Int, id).query(`UPDATE dbo.Suppliers SET ${supplierFields.map(field => `[${field}]=@${field}`).join(',')},updatedAt=SYSUTCDATETIME() WHERE id=@id`);
    } else {
      const result = await req.query(`INSERT INTO dbo.Suppliers(${supplierFields.map(field => `[${field}]`).join(',')}) OUTPUT INSERTED.id VALUES(${supplierFields.map(field => `@${field}`).join(',')})`);
      savedId = result.recordset[0].id;
    }
    await recordAudit(scope, user, 'suppliers', id ? 'update' : 'create', savedId);
    return savedId;
  });
  return getSupplier(saved);
}

async function loadSupplies(scope, id, lock = false) {
  const req = request(scope);
  if (id) req.input('id', sql.Int, id);
  const selected = suppliesFields.map(field => SUPPLIES_NUMBERS.includes(field) ? `CONVERT(varchar(60),s.[${field}]) AS [${field}]` : `s.[${field}]`).join(',');
  const result = await req.query(`SELECT s.id,s.code,${selected},CONVERT(varchar(60),COALESCE((SELECT SUM(i.quantity) FROM dbo.SupplyInventory i WHERE i.suppliesId=s.id),0)) AS stock
    FROM dbo.Supplies s ${lock ? 'WITH (UPDLOCK,HOLDLOCK)' : ''} ${id ? 'WHERE s.id=@id' : ''} ORDER BY s.name,s.id;
    SELECT suppliesId,name FROM dbo.SupplyOffices ${id ? 'WHERE suppliesId=@id' : ''} ORDER BY suppliesId,position;
    SELECT suppliesId,CONVERT(varchar(10),scheduleDate,23) AS scheduleDate,month FROM dbo.SupplyInventorySchedules ${id ? 'WHERE suppliesId=@id' : ''} ORDER BY suppliesId,position;
    SELECT l.suppliesId,l.supplierId,s.name AS supplierName,CONVERT(varchar(60),l.moq) AS moq,CONVERT(varchar(60),l.price) AS price,l.currency,l.remarks
    FROM dbo.SupplySuppliers l JOIN dbo.Suppliers s ON s.id=l.supplierId ${id ? 'WHERE l.suppliesId=@id' : ''} ORDER BY l.suppliesId,l.position;`);
  const grouped = new Map(result.recordsets[0].map(row => [row.id, { ...row, offices: [], inventorySchedules: [], suppliers: [] }]));
  ['offices', 'inventorySchedules', 'suppliers'].forEach((key, index) => {
    for (const { suppliesId, ...row } of result.recordsets[index + 1]) grouped.get(suppliesId)?.[key].push(row);
  });
  return [...grouped.values()];
}

export function listSupplies() { return loadSupplies(); }

export async function getSupplies(id, scope, lock = false) {
  const records = await loadSupplies(scope, id, lock);
  if (!records.length) throw new ApiError(404, 'Supplies could not be found.');
  return records[0];
}

async function validateSuppliesReferences(value, current, scope) {
  if (!current || value.unit !== current.unit) {
    await configuredValue(scope, 'ConfigUnits', 'shortName', value.unit, 'Select an active Unit marked For Supplies.', 'AND forSupplies=1');
    if (current) {
      const history = await request(scope).input('id', sql.Int, current.id).query(`SELECT TOP(1) suppliesId FROM (
        SELECT suppliesId FROM dbo.PurchaseRequestItems WHERE suppliesId=@id
        UNION ALL SELECT suppliesId FROM dbo.ProductSupplies WHERE suppliesId=@id
        UNION ALL SELECT suppliesId FROM dbo.SupplyInventory WHERE suppliesId=@id
      ) history`);
      if (history.recordset.length) throw new ApiError(409, 'Supplies UOM cannot change after purchasing history exists.');
    }
  }
  if (value.weightUnit && value.weightUnit !== current?.weightUnit) await configuredValue(scope, 'ConfigUnits', 'shortName', value.weightUnit, 'Select an active Weight Unit.');
  if (value.category && value.category !== current?.category) await configuredValue(scope, 'ConfigSuppliesCategories', 'name', value.category, 'Select an active Supplies Category.');
  if (value.productId && value.productId !== current?.productId) {
    const product = await request(scope).input('id', sql.Int, value.productId).query('SELECT id FROM dbo.Products WHERE id=@id AND isActive=1');
    if (!product.recordset.length) throw new ApiError(400, 'Select an active Product Link.');
  }
  const oldSuppliers = new Set(current?.suppliers.map(row => row.supplierId) || []);
  for (const row of value.suppliers) {
    const supplier = await getSupplier(row.supplierId, scope);
    if (!supplier.isActive && !oldSuppliers.has(row.supplierId)) throw new ApiError(400, 'Select an active Supplier.');
    if (row.currency) await configuredValue(scope, 'ConfigCurrencies', 'shortName', row.currency, 'Select an active Supplier Currency.');
  }
}

async function replaceSupplyChildren(scope, id, value, input, creating) {
  const definitions = [['offices', 'SupplyOffices'], ['inventorySchedules', 'SupplyInventorySchedules'], ['suppliers', 'SupplySuppliers']];
  for (const [key, table] of definitions) {
    if (!creating && !has(input, key)) continue;
    await request(scope).input('id', sql.Int, id).query(`DELETE FROM dbo.${table} WHERE suppliesId=@id`);
    for (const [position, row] of value[key].entries()) {
      const req = request(scope).input('id', sql.Int, id).input('position', sql.Int, position);
      if (key === 'offices') {
        await req.input('name', sql.NVarChar(150), row.name).query('INSERT INTO dbo.SupplyOffices(suppliesId,position,name) VALUES(@id,@position,@name)');
      } else if (key === 'inventorySchedules') {
        await req.input('scheduleDate', sql.VarChar(10), row.scheduleDate).input('month', sql.NVarChar(40), row.month)
          .query('INSERT INTO dbo.SupplyInventorySchedules(suppliesId,position,scheduleDate,month) VALUES(@id,@position,@scheduleDate,@month)');
      } else {
        await req.input('supplierId', sql.Int, row.supplierId).input('moq', sql.Decimal(18, 6), row.moq).input('price', sql.VarChar(60), row.price)
          .input('currency', sql.NVarChar(30), row.currency).input('remarks', sql.NVarChar(2000), row.remarks)
          .query('INSERT INTO dbo.SupplySuppliers(suppliesId,position,supplierId,moq,price,currency,remarks) VALUES(@id,@position,@supplierId,@moq,@price,@currency,@remarks)');
      }
    }
  }
}

export async function saveSupplies(input, id, user) {
  const saved = await transaction(async scope => {
    const current = id ? await getSupplies(id, scope, true) : undefined;
    const value = validateSupplies(input, current);
    await validateSuppliesReferences(value, current, scope);
    const req = request(scope);
    for (const [field, maximum] of Object.entries(SUPPLIES_TEXT)) req.input(field, sql.NVarChar(maximum), value[field]);
    for (const field of SUPPLIES_NUMBERS) req.input(field, sql.Decimal(18, 6), value[field]);
    req.input('productId', sql.Int, value.productId).input('inventorySetup', sql.NVarChar(20), value.inventorySetup).input('isActive', sql.Bit, value.isActive);
    let savedId = id;
    if (id) {
      await req.input('id', sql.Int, id).query(`UPDATE dbo.Supplies SET ${suppliesFields.map(field => `[${field}]=@${field}`).join(',')},updatedAt=SYSUTCDATETIME() WHERE id=@id`);
    } else {
      const result = await req.query(`INSERT INTO dbo.Supplies(${suppliesFields.map(field => `[${field}]`).join(',')}) OUTPUT INSERTED.id VALUES(${suppliesFields.map(field => `@${field}`).join(',')})`);
      savedId = result.recordset[0].id;
    }
    await replaceSupplyChildren(scope, savedId, value, input, !current);
    await recordAudit(scope, user, 'supplies', id ? 'update' : 'create', savedId);
    return savedId;
  });
  return getSupplies(saved);
}

export async function deactivatePurchasingMaster(kind, id, user) {
  const table = kind === 'suppliers' ? 'Suppliers' : 'Supplies';
  await transaction(async scope => {
    const result = await request(scope).input('id', sql.Int, id).query(`UPDATE dbo.${table} SET isActive=0,updatedAt=SYSUTCDATETIME() OUTPUT INSERTED.id WHERE id=@id`);
    if (!result.recordset.length) throw new ApiError(404, 'The master record could not be found.');
    await recordAudit(scope, user, kind, 'deactivate', id);
  });
}

export async function purchasingOptions() {
  const [suppliers, supplies, units, currencies, terms, vatCodes, taxCodes, countries, categories, warehouses, locations, users, products] = await Promise.all([
    listSuppliers(), listSupplies(), configuration.listConfiguration('units'), configuration.listConfiguration('currencies'),
    configuration.listConfiguration('payment-terms'), configuration.listConfiguration('vat-codes'), configuration.listConfiguration('atc'),
    configuration.listConfiguration('countries'), configuration.listConfiguration('supplies-categories'), configuration.listConfiguration('warehouses'), configuration.listConfiguration('locations'),
    request().query('SELECT id,name,username,role FROM dbo.SalesUserLogin WHERE isActive=1 ORDER BY name,username'),
    request().query('SELECT id,sku,name,description FROM dbo.Products WHERE isActive=1 ORDER BY sku'),
  ]);
  const active = rows => rows.filter(row => row.isActive);
  return {
    suppliers: active(suppliers), supplies: active(supplies), products: products.recordset, users: users.recordset,
    units: active(units).filter(row => row.forSupplies).map(row => ({ ...row, name: row.shortName })),
    currencies: active(currencies).map(row => ({ ...row, code: row.shortName, description: row.name })),
    paymentTerms: active(terms).filter(row => row.forSupplier), vatCodes: active(vatCodes), taxCodes: active(taxCodes),
    countries: active(countries), suppliesCategories: active(categories), warehouses: active(warehouses), locations: active(locations),
    shipments: ['By Air', 'By Land', 'By Boat', 'N/A'], offices: [process.env.COMPANY_NAME || 'TLP COMPANY'],
  };
}
