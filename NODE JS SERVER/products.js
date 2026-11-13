import { request, sql, transaction } from './database.js';
import { ApiError } from './components/errors.js';
import { PRODUCT_TEXT_LENGTHS, PRODUCT_QUANTITIES, validateProduct } from './components/product-validation.js';
import { recordAudit } from './audit.js';

const scalarFields = [
  ...Object.keys(PRODUCT_TEXT_LENGTHS), ...PRODUCT_QUANTITIES,
  'price', 'stock', 'isActive', 'vatMode', 'productHeaderId', 'inventorySetup',
];
const has = (object, key) => Object.hasOwn(object, key) && object[key] !== undefined;
const children = [
  ['processes', 'ProductProcesses', 'name'],
  ['offices', 'ProductOffices', 'name'],
  ['customerApprovals', 'ProductCustomerApprovals', `customerId,CONVERT(varchar(10),approvalDate,23) AS approvalDate,CONVERT(varchar(10),eolDate,23) AS eolDate,approvalRemarks,eolRemarks`],
  ['inventorySchedules', 'ProductInventorySchedules', 'CONVERT(varchar(10),scheduleDate,23) AS scheduleDate,month'],
];

async function loadProducts(scope, id, lock = false) {
  const req = request(scope);
  if (id) req.input('id', sql.Int, id);
  const where = id ? 'WHERE p.id=@id' : '';
  const result = await req.query(`SELECT p.id,${scalarFields.map(field => field === 'price' ? 'CONVERT(varchar(60),p.price) AS price' : `p.[${field}]`).join(',')},h.sku AS productHeaderCode,h.name AS productHeaderName
    FROM dbo.Products p ${lock ? 'WITH (UPDLOCK,HOLDLOCK)' : ''}
    LEFT JOIN dbo.Products h ON h.id=p.productHeaderId ${where} ORDER BY p.id DESC;
    ${children.map(([, table, fields]) => `SELECT productId,${fields} FROM dbo.${table} ${id ? 'WHERE productId=@id' : ''} ORDER BY productId,position;`).join('\n')}
    SELECT l.productId,l.suppliesId,s.code,s.name,s.description,l.quantity,l.unit
    FROM dbo.ProductSupplies l JOIN dbo.Supplies s ON s.id=l.suppliesId ${id ? 'WHERE l.productId=@id' : ''} ORDER BY l.productId,l.position;`);
  const records = new Map(result.recordsets[0].map(row => [row.id, { ...row, processes: [], offices: [], customerApprovals: [], inventorySchedules: [], linkedSupplies: [] }]));
  children.forEach(([key], index) => {
    for (const { productId, ...row } of result.recordsets[index + 1]) records.get(productId)?.[key].push(row);
  });
  for (const { productId, ...row } of result.recordsets[children.length + 1]) records.get(productId)?.linkedSupplies.push(row);
  return [...records.values()];
}

export function listProducts() { return loadProducts(); }

export async function getProduct(id, scope, lock = false) {
  const rows = await loadProducts(scope, id, lock);
  if (!rows.length) throw new ApiError(404, 'The product could not be found.');
  return rows[0];
}

async function validateConfiguredFields(product, current, scope) {
  for (const field of ['unit', 'secondaryUnit']) {
    if (!product[field] || product[field] === current?.[field]) continue;
    const result = await request(scope).input('name', sql.NVarChar(30), product[field])
      .query('SELECT id FROM dbo.ConfigUnits WHERE shortName=@name AND isActive=1 AND forProduct=1');
    if (!result.recordset.length) throw new ApiError(400, 'Product UOP and UOP2 must use active Configuration units marked For Product.');
  }
  if (product.currency && product.currency !== current?.currency) {
    const result = await request(scope).input('code', sql.NVarChar(30), product.currency)
      .query('SELECT id FROM dbo.ConfigCurrencies WHERE shortName=@code AND isActive=1');
    if (!result.recordset.length) throw new ApiError(400, 'Select an active configured Currency.');
  }
  if (product.category && product.category !== current?.category) {
    const result = await request(scope).input('name', sql.NVarChar(100), product.category)
      .query('SELECT id FROM dbo.ConfigProductCategories WHERE name=@name AND isActive=1');
    if (!result.recordset.length) throw new ApiError(400, 'Select an active configured Product Category.');
  }
  if (current && product.unit !== current.unit) {
    const result = await request(scope).input('id', sql.Int, current.id)
      .query('SELECT TOP(1) id FROM dbo.SalesOrderItems WHERE productId=@id');
    if (Number(current.stock) > 0 || result.recordset.length) throw new ApiError(409, 'UOP cannot change after finished-product stock or sales history exists.');
  }
}

export async function productOptions() {
  const result = await request().query(`
    SELECT id,shortName AS name,description,[decimal],isActive FROM dbo.ConfigUnits WHERE isActive=1 AND forProduct=1 ORDER BY shortName;
    SELECT id,shortName AS code,name AS description,isDefault,isActive FROM dbo.ConfigCurrencies WHERE isActive=1 ORDER BY shortName;
    SELECT id,name,isActive FROM dbo.ConfigProductCategories WHERE isActive=1 ORDER BY name;
    SELECT id,sku,name,description FROM dbo.Products WHERE isActive=1 ORDER BY sku;
    SELECT id,code,name,description,unit,isActive FROM dbo.Supplies WHERE isActive=1 ORDER BY name;
    SELECT id,code,name FROM dbo.Customers WHERE isActive=1 ORDER BY name;
    SELECT DISTINCT name FROM dbo.ProductProcesses ORDER BY name;
    SELECT DISTINCT name FROM dbo.ProductOffices ORDER BY name;`);
  return {
    units: result.recordsets[0], currencies: result.recordsets[1], categories: result.recordsets[2],
    headers: result.recordsets[3], supplies: result.recordsets[4], customers: result.recordsets[5],
    processes: result.recordsets[6].map(row => row.name),
    offices: [...new Set([process.env.COMPANY_NAME || 'TLP COMPANY', ...result.recordsets[7].map(row => row.name)])],
  };
}

async function validateHeader(product, id, current, scope) {
  let headerId = product.productHeaderId;
  if (!headerId) return;
  const visited = new Set(id ? [id] : []);
  let first = true;
  while (headerId) {
    if (visited.has(headerId)) throw new ApiError(400, 'Product Header cannot refer to this product or form a circular group.');
    if (visited.size >= 100) throw new ApiError(400, 'Product Header grouping exceeds the supported depth.');
    visited.add(headerId);
    const result = await request(scope).input('id', sql.Int, headerId).query('SELECT productHeaderId,isActive FROM dbo.Products WHERE id=@id');
    if (!result.recordset.length) throw new ApiError(400, 'Select an existing Product Header.');
    if (first && !result.recordset[0].isActive && product.productHeaderId !== current?.productHeaderId) throw new ApiError(400, 'Select an active Product Header.');
    first = false;
    headerId = result.recordset[0].productHeaderId;
  }
}

async function validateLinks(product, current, scope) {
  for (const row of product.customerApprovals) {
    const result = await request(scope).input('id', sql.Int, row.customerId).query('SELECT id FROM dbo.Customers WHERE id=@id');
    if (!result.recordset.length) throw new ApiError(400, 'A Product Customer row references a customer that does not exist.');
  }
  const previous = new Set(current?.linkedSupplies.map(row => row.suppliesId) || []);
  for (const row of product.linkedSupplies) {
    const result = await request(scope).input('id', sql.Int, row.suppliesId).query('SELECT unit,isActive FROM dbo.Supplies WHERE id=@id');
    const supplies = result.recordset[0];
    if (!supplies || (!supplies.isActive && !previous.has(row.suppliesId))) throw new ApiError(400, 'Select an active Supplies record for each linked material.');
    if (row.unit && row.unit !== supplies.unit) throw new ApiError(400, 'Linked Supplies UOM must match its Supplies master record.');
    row.unit = supplies.unit;
  }
}

function productRequest(scope, product) {
  const req = request(scope);
  for (const [field, maximum] of Object.entries(PRODUCT_TEXT_LENGTHS)) req.input(field, sql.NVarChar(maximum), product[field]);
  for (const field of PRODUCT_QUANTITIES) req.input(field, sql.Decimal(18, 6), product[field]);
  req.input('price', sql.VarChar(60), String(product.price)).input('stock', sql.Decimal(18, 3), product.stock)
    .input('isActive', sql.Bit, product.isActive).input('vatMode', sql.NVarChar(20), product.vatMode)
    .input('productHeaderId', sql.Int, product.productHeaderId).input('inventorySetup', sql.NVarChar(20), product.inventorySetup);
  return req;
}

async function replaceChildren(scope, id, product, input, creating) {
  for (const [key, table] of children) {
    if (!creating && !has(input, key)) continue;
    await request(scope).input('id', sql.Int, id).query(`DELETE FROM dbo.${table} WHERE productId=@id`);
    for (const [position, row] of product[key].entries()) {
      const req = request(scope).input('id', sql.Int, id).input('position', sql.Int, position);
      if (key === 'processes' || key === 'offices') {
        await req.input('name', sql.NVarChar(150), row.name).query(`INSERT INTO dbo.${table}(productId,position,name) VALUES(@id,@position,@name)`);
      } else if (key === 'customerApprovals') {
        await req.input('customerId', sql.Int, row.customerId).input('approvalDate', sql.VarChar(10), row.approvalDate)
          .input('eolDate', sql.VarChar(10), row.eolDate).input('approvalRemarks', sql.NVarChar(2000), row.approvalRemarks)
          .input('eolRemarks', sql.NVarChar(2000), row.eolRemarks)
          .query(`INSERT INTO dbo.ProductCustomerApprovals(productId,position,customerId,approvalDate,eolDate,approvalRemarks,eolRemarks)
            VALUES(@id,@position,@customerId,@approvalDate,@eolDate,@approvalRemarks,@eolRemarks)`);
      } else {
        await req.input('scheduleDate', sql.VarChar(10), row.scheduleDate).input('month', sql.NVarChar(40), row.month)
          .query('INSERT INTO dbo.ProductInventorySchedules(productId,position,scheduleDate,month) VALUES(@id,@position,@scheduleDate,@month)');
      }
    }
  }
  if (creating || has(input, 'linkedSupplies')) {
    await request(scope).input('id', sql.Int, id).query('DELETE FROM dbo.ProductSupplies WHERE productId=@id');
    for (const [position, row] of product.linkedSupplies.entries()) {
      await request(scope).input('id', sql.Int, id).input('position', sql.Int, position).input('suppliesId', sql.Int, row.suppliesId)
        .input('quantity', sql.Decimal(18, 6), row.quantity).input('unit', sql.NVarChar(30), row.unit)
        .query('INSERT INTO dbo.ProductSupplies(productId,position,suppliesId,quantity,unit) VALUES(@id,@position,@suppliesId,@quantity,@unit)');
    }
  }
}

export async function saveProduct(input, id, user) {
  const savedId = await transaction(async scope => {
    const current = id ? await getProduct(id, scope, true) : undefined;
    const product = validateProduct(input, current);
    if (user && Number(product.stock) !== Number(current?.stock || 0)) {
      throw new ApiError(400, 'Finished-product stock cannot be adjusted from the Product master.');
    }
    await validateConfiguredFields(product, current, scope);
    await validateHeader(product, id, current, scope);
    await validateLinks(product, current, scope);
    const req = productRequest(scope, product);
    let saved = id;
    if (id) {
      await req.input('id', sql.Int, id).query(`UPDATE dbo.Products SET ${scalarFields.map(field => `[${field}]=@${field}`).join(',')},updatedAt=SYSUTCDATETIME() WHERE id=@id`);
    } else {
      const result = await req.query(`INSERT INTO dbo.Products(${scalarFields.map(field => `[${field}]`).join(',')}) OUTPUT INSERTED.id VALUES(${scalarFields.map(field => `@${field}`).join(',')})`);
      saved = result.recordset[0].id;
    }
    await replaceChildren(scope, saved, product, input, !current);
    if (user) await recordAudit(scope, user, 'products', id ? 'update' : 'create', saved);
    return saved;
  });
  return getProduct(savedId);
}
