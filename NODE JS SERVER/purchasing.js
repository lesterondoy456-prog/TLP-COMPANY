import { request, sql, transaction } from './database.js';
import { ApiError } from './components/errors.js';
import { validatePurchaseRequest, validatePurchaseOrder } from './components/purchasing-validation.js';
import { calculatePurchaseTotals, decimalUnits } from './components/purchasing-workflow.js';
import { getSupplier, getSupplies } from './purchasing-masters.js';
import { recordAudit } from './audit.js';

export const MONEY_FIELDS = ['grossAmount', 'discountAmount', 'netAmount', 'vatAmount', 'amount'];
export const moneyColumns = alias => MONEY_FIELDS.map(field => `CONVERT(varchar(60),${alias}.[${field}]) AS [${field}]`).join(',');
export function bindMoney(req, values) {
  for (const field of MONEY_FIELDS) req.input(field, sql.VarChar(60), values[field]);
  return req;
}

async function loadRequests(scope, id, lock = false) {
  const req = request(scope);
  if (id) req.input('id', sql.Int, id);
  const result = await req.query(`SELECT r.id,r.number,r.branch,CONVERT(varchar(10),r.prDate,23) AS prDate,CONVERT(varchar(10),r.neededDate,23) AS neededDate,
    r.requestedBy,r.requestedDept,r.checkedBy,r.approvedBy,r.approvedBy2,r.remarks,r.preparedById,r.preparedBy,r.status,r.postedAt
    FROM dbo.PurchaseRequests r ${lock ? 'WITH (UPDLOCK,HOLDLOCK)' : ''} ${id ? 'WHERE r.id=@id' : ''} ORDER BY r.id DESC;
    SELECT d.id,d.requestId,d.position,d.suppliesId,d.suppliesCode,d.suppliesName,d.description,CONVERT(varchar(60),d.quantity) AS quantity,d.unit,
    CONVERT(varchar(10),d.neededDate,23) AS neededDate,d.remarks,CONVERT(varchar(60),COALESCE(a.orderedQuantity,0)) AS orderedQuantity,
    CONVERT(varchar(60),d.quantity-CAST(COALESCE(a.orderedQuantity,0) AS decimal(28,6))) AS balanceQuantity,a.purchaseOrderNumbers
    FROM dbo.PurchaseRequestItems d OUTER APPLY (
      SELECT SUM(i.quantity) AS orderedQuantity,STRING_AGG(CONVERT(nvarchar(max),o.number),N', ') AS purchaseOrderNumbers
      FROM dbo.PurchaseOrderItems i JOIN dbo.PurchaseOrders o ON o.id=i.orderId
      WHERE i.requestItemId=d.id AND o.status IN ('posted','closed')
    ) a ${id ? 'WHERE d.requestId=@id' : ''} ORDER BY d.requestId,d.position;`);
  const records = new Map(result.recordsets[0].map(row => [row.id, { ...row, items: [] }]));
  for (const { requestId, ...item } of result.recordsets[1]) records.get(requestId)?.items.push(item);
  return [...records.values()];
}

export function listPurchaseRequests() { return loadRequests(); }
export async function getPurchaseRequest(id, scope, lock = false) {
  const rows = await loadRequests(scope, id, lock);
  if (!rows.length) throw new ApiError(404, 'Purchase Request could not be found.');
  return rows[0];
}

async function requestNumber(scope) {
  await request(scope).query('SELECT COUNT_BIG(*) AS total FROM dbo.PurchaseRequests WITH (TABLOCKX,HOLDLOCK)');
  const next = await request(scope).query(`SELECT COALESCE(CONVERT(bigint,last_value)+CONVERT(bigint,increment_value),CONVERT(bigint,seed_value)) AS nextId
    FROM sys.identity_columns WHERE object_id=OBJECT_ID(N'dbo.PurchaseRequests') AND name=N'id'`);
  const base = `PR-${String(next.recordset[0].nextId).padStart(8, '0')}`;
  let value = base;
  let suffix = 0;
  while ((await request(scope).input('number', sql.NVarChar(40), value).query('SELECT id FROM dbo.PurchaseRequests WHERE number=@number')).recordset.length) value = `${base}-${++suffix}`;
  return value;
}

export async function savePurchaseRequest(input, id, user) {
  const savedId = await transaction(async scope => {
    const current = id ? await getPurchaseRequest(id, scope, true) : undefined;
    if (current && current.status !== 'draft') throw new ApiError(409, 'Only an unposted Purchase Request can be edited.');
    const value = validatePurchaseRequest(input, current);
    const snapshots = [];
    for (const item of value.items) {
      const supplies = await getSupplies(item.suppliesId, scope);
      if (!supplies.isActive) throw new ApiError(400, 'Select active Supplies for every PR line.');
      if (item.unit && item.unit !== supplies.unit) throw new ApiError(400, 'PR UOM must match the Supplies master.');
      snapshots.push({ ...item, suppliesCode: supplies.code, suppliesName: supplies.name, description: supplies.description, unit: supplies.unit });
    }
    const number = value.number || current?.number || await requestNumber(scope);
    const fields = ['number', 'prDate', 'neededDate', 'requestedBy', 'requestedDept', 'checkedBy', 'approvedBy', 'approvedBy2', 'remarks'];
    const req = request(scope).input('number', sql.NVarChar(40), number).input('prDate', sql.VarChar(10), value.prDate).input('neededDate', sql.VarChar(10), value.neededDate);
    for (const field of ['requestedBy', 'requestedDept', 'checkedBy', 'approvedBy', 'approvedBy2']) req.input(field, sql.NVarChar(150), value[field]);
    req.input('remarks', sql.NVarChar(2000), value.remarks);
    let saved = id;
    if (id) {
      await req.input('id', sql.Int, id).query(`UPDATE dbo.PurchaseRequests SET ${fields.map(field => `[${field}]=@${field}`).join(',')},updatedAt=SYSUTCDATETIME() WHERE id=@id`);
      await request(scope).input('id', sql.Int, id).query('DELETE FROM dbo.PurchaseRequestItems WHERE requestId=@id');
    } else {
      const result = await req.input('branch', sql.NVarChar(150), process.env.COMPANY_NAME || 'TLP COMPANY').input('preparedById', sql.Int, user.id).input('preparedBy', sql.NVarChar(150), user.name)
        .query(`INSERT INTO dbo.PurchaseRequests(${fields.join(',')},branch,preparedById,preparedBy) OUTPUT INSERTED.id
          VALUES(${fields.map(field => `@${field}`).join(',')},@branch,@preparedById,@preparedBy)`);
      saved = result.recordset[0].id;
    }
    for (const [position, item] of snapshots.entries()) {
      await request(scope).input('id', sql.Int, saved).input('position', sql.Int, position).input('suppliesId', sql.Int, item.suppliesId)
        .input('suppliesCode', sql.NVarChar(40), item.suppliesCode).input('suppliesName', sql.NVarChar(180), item.suppliesName).input('description', sql.NVarChar(1000), item.description)
        .input('quantity', sql.VarChar(60), item.quantity).input('unit', sql.NVarChar(30), item.unit).input('neededDate', sql.VarChar(10), item.neededDate).input('remarks', sql.NVarChar(2000), item.remarks)
        .query(`INSERT INTO dbo.PurchaseRequestItems(requestId,position,suppliesId,suppliesCode,suppliesName,description,quantity,unit,neededDate,remarks)
          VALUES(@id,@position,@suppliesId,@suppliesCode,@suppliesName,@description,@quantity,@unit,@neededDate,@remarks)`);
    }
    await recordAudit(scope, user, 'purchase-requests', id ? 'update-draft' : 'create-draft', saved);
    return saved;
  });
  return getPurchaseRequest(savedId);
}

export async function refreshPurchaseRequestStatus(scope, id) {
  await request(scope).input('id', sql.Int, id).query(`UPDATE r SET status=CASE WHEN EXISTS (
    SELECT 1 FROM dbo.PurchaseRequestItems d WHERE d.requestId=r.id AND d.quantity>COALESCE((SELECT SUM(i.quantity) FROM dbo.PurchaseOrderItems i
    JOIN dbo.PurchaseOrders o ON o.id=i.orderId WHERE i.requestItemId=d.id AND o.status IN ('posted','closed')),0)) THEN 'posted' ELSE 'closed' END,
    updatedAt=SYSUTCDATETIME() FROM dbo.PurchaseRequests r WHERE r.id=@id AND r.status IN ('posted','closed')`);
}

export async function postPurchaseRequest(id, user) {
  return transaction(async scope => {
    const value = await getPurchaseRequest(id, scope, true);
    if (['posted', 'closed'].includes(value.status)) return value;
    if (value.status !== 'draft' || !value.items.length) throw new ApiError(409, 'Only a nonempty unposted Purchase Request can be posted.');
    await request(scope).input('id', sql.Int, id).input('user', sql.Int, user.id)
      .query("UPDATE dbo.PurchaseRequests SET status='posted',postedById=@user,postedAt=SYSUTCDATETIME(),updatedAt=SYSUTCDATETIME() WHERE id=@id");
    await recordAudit(scope, user, 'purchase-requests', 'post', id);
    return getPurchaseRequest(id, scope);
  });
}

async function loadOrders(scope, id, lock = false) {
  const req = request(scope);
  if (id) req.input('id', sql.Int, id);
  const result = await req.query(`SELECT o.id,o.number,o.branch,o.supplierId,o.supplierName,o.supplierAddress,o.supplierContactPerson,
    CONVERT(varchar(10),o.poDate,23) AS poDate,CONVERT(varchar(10),o.deliveryDate,23) AS deliveryDate,o.currency,CONVERT(varchar(60),o.rate) AS rate,
    o.paymentTerm,o.shipment,o.suppliesCategory,o.vatCode,CONVERT(varchar(60),o.vatRate) AS vatRate,o.vatInclusive,o.decimalInPrice,o.decimalInTotalPrice,
    o.deliveryAddress,o.remarks,${moneyColumns('o')},o.preparedById,o.preparedBy,o.status,o.postedAt
    FROM dbo.PurchaseOrders o ${lock ? 'WITH (UPDLOCK,HOLDLOCK)' : ''} ${id ? 'WHERE o.id=@id' : ''} ORDER BY o.id DESC;
    SELECT d.id,d.orderId,d.position,d.requestItemId,r.requestId,pr.number AS requestNumber,d.suppliesId,d.suppliesCode,d.suppliesName,d.description,d.unit,
    CONVERT(varchar(60),d.quantity) AS quantity,CONVERT(varchar(60),d.unitPrice) AS unitPrice,d.currency,CONVERT(varchar(60),d.discountRate) AS discountRate,
    CONVERT(varchar(60),d.vatRate) AS vatRate,${moneyColumns('d')},d.remarks,
    CONVERT(varchar(60),COALESCE(a.receivedQuantity,0)) AS receivedQuantity,CONVERT(varchar(60),d.quantity-CAST(COALESCE(a.receivedQuantity,0) AS decimal(28,6))) AS balanceQuantity
    FROM dbo.PurchaseOrderItems d JOIN dbo.PurchaseRequestItems r ON r.id=d.requestItemId JOIN dbo.PurchaseRequests pr ON pr.id=r.requestId
    OUTER APPLY(SELECT SUM(i.quantity) AS receivedQuantity FROM dbo.SuppliesReceiptItems i JOIN dbo.SuppliesReceipts h ON h.id=i.receiptId WHERE i.orderItemId=d.id AND h.status='posted') a
    ${id ? 'WHERE d.orderId=@id' : ''} ORDER BY d.orderId,d.position;`);
  const records = new Map(result.recordsets[0].map(row => [row.id, { ...row, items: [] }]));
  for (const { orderId, ...item } of result.recordsets[1]) records.get(orderId)?.items.push(item);
  return [...records.values()];
}

export function listPurchaseOrders() { return loadOrders(); }
export async function getPurchaseOrder(id, scope, lock = false) {
  const records = await loadOrders(scope, id, lock);
  if (!records.length) throw new ApiError(404, 'Purchase Order could not be found.');
  return records[0];
}

async function sourceRequestItem(scope, id) {
  const result = await request(scope).input('id', sql.Int, id).query(`SELECT d.*,r.status AS requestStatus,r.number AS requestNumber,
    CONVERT(varchar(60),d.quantity) AS requestedQuantity,CONVERT(varchar(60),COALESCE((SELECT SUM(i.quantity) FROM dbo.PurchaseOrderItems i
    JOIN dbo.PurchaseOrders o ON o.id=i.orderId WHERE i.requestItemId=d.id AND o.status IN ('posted','closed')),0)) AS orderedQuantity
    FROM dbo.PurchaseRequestItems d JOIN dbo.PurchaseRequests r ON r.id=d.requestId WHERE d.id=@id`);
  if (!result.recordset.length) throw new ApiError(400, 'Select a valid posted PR line.');
  return result.recordset[0];
}

function checkRequestBalance(source, quantity) {
  if (!['posted', 'closed'].includes(source.requestStatus)) throw new ApiError(409, 'Purchase Orders can only use posted PR lines.');
  const remaining = decimalUnits(source.requestedQuantity, 6) - decimalUnits(source.orderedQuantity, 6);
  if (decimalUnits(quantity, 6) > remaining) throw new ApiError(409, 'PO quantity exceeds the remaining Purchase Request balance.');
}

export async function savePurchaseOrder(input, id, user) {
  const savedId = await transaction(async scope => {
    const current = id ? await getPurchaseOrder(id, scope, true) : undefined;
    if (current && current.status !== 'draft') throw new ApiError(409, 'Only an unposted Purchase Order can be edited.');
    const value = validatePurchaseOrder(input, current);
    const supplier = await getSupplier(value.supplierId, scope);
    if (!supplier.isActive) throw new ApiError(400, 'Select an active Supplier.');
    const vat = await request(scope).input('code', sql.NVarChar(80), value.vatCode).query('SELECT rate FROM dbo.ConfigVatCodes WHERE code=@code AND isActive=1');
    if (!vat.recordset.length) throw new ApiError(400, 'Select an active VAT Code.');
    const currency = await request(scope).input('code', sql.NVarChar(30), value.currency).query('SELECT id FROM dbo.ConfigCurrencies WHERE shortName=@code AND isActive=1');
    if (!currency.recordset.length) throw new ApiError(400, 'Select an active Currency.');
    const term = await request(scope).input('term', sql.NVarChar(100), value.paymentTerm).query('SELECT id FROM dbo.ConfigPaymentTerms WHERE description=@term AND isActive=1 AND forSupplier=1');
    if (!term.recordset.length) throw new ApiError(400, 'Select an active Supplier Payment Term.');
    if (value.suppliesCategory) {
      const category = await request(scope).input('name', sql.NVarChar(100), value.suppliesCategory).query('SELECT id FROM dbo.ConfigSuppliesCategories WHERE name=@name AND isActive=1');
      if (!category.recordset.length) throw new ApiError(400, 'Select an active Supplies Category.');
    }
    const snapshots = [];
    for (const item of value.items) {
      const source = await sourceRequestItem(scope, item.requestItemId);
      checkRequestBalance(source, item.quantity);
      if (item.unit && item.unit !== source.unit) throw new ApiError(400, 'PO UOM must match the source PR line.');
      snapshots.push({ ...item, suppliesId: source.suppliesId, suppliesCode: source.suppliesCode, suppliesName: source.suppliesName, description: source.description, unit: source.unit });
    }
    const settings = { vatRate: vat.recordset[0].rate, vatInclusive: supplier.vatInclusive, decimalInPrice: supplier.decimalInPrice, decimalInTotalPrice: supplier.decimalInTotalPrice };
    const totals = calculatePurchaseTotals(snapshots, settings);
    const fields = ['supplierId', 'supplierName', 'supplierAddress', 'supplierContactPerson', 'poDate', 'deliveryDate', 'currency', 'rate', 'paymentTerm', 'shipment', 'suppliesCategory', 'vatCode', 'vatRate', 'vatInclusive', 'decimalInPrice', 'decimalInTotalPrice', 'deliveryAddress', 'remarks', ...MONEY_FIELDS];
    const req = bindMoney(request(scope), totals).input('supplierId', sql.Int, supplier.id).input('supplierName', sql.NVarChar(180), supplier.name)
      .input('supplierAddress', sql.NVarChar(500), supplier.address).input('supplierContactPerson', sql.NVarChar(150), supplier.contactPerson)
      .input('poDate', sql.VarChar(10), value.poDate).input('deliveryDate', sql.VarChar(10), value.deliveryDate).input('currency', sql.NVarChar(30), value.currency)
      .input('rate', sql.VarChar(60), value.rate).input('paymentTerm', sql.NVarChar(100), value.paymentTerm).input('shipment', sql.NVarChar(20), value.shipment)
      .input('suppliesCategory', sql.NVarChar(100), value.suppliesCategory).input('vatCode', sql.NVarChar(80), value.vatCode).input('vatRate', sql.VarChar(60), String(settings.vatRate))
      .input('vatInclusive', sql.Bit, settings.vatInclusive).input('decimalInPrice', sql.Int, supplier.decimalInPrice).input('decimalInTotalPrice', sql.Int, supplier.decimalInTotalPrice)
      .input('deliveryAddress', sql.NVarChar(500), value.deliveryAddress).input('remarks', sql.NVarChar(2000), value.remarks);
    let saved = id;
    if (id) {
      await req.input('id', sql.Int, id).query(`UPDATE dbo.PurchaseOrders SET ${fields.map(field => `[${field}]=@${field}`).join(',')},updatedAt=SYSUTCDATETIME() WHERE id=@id`);
      await request(scope).input('id', sql.Int, id).query('DELETE FROM dbo.PurchaseOrderItems WHERE orderId=@id');
    } else {
      const result = await req.input('branch', sql.NVarChar(150), process.env.COMPANY_NAME || 'TLP COMPANY').input('preparedById', sql.Int, user.id).input('preparedBy', sql.NVarChar(150), user.name)
        .query(`INSERT INTO dbo.PurchaseOrders(${fields.join(',')},branch,preparedById,preparedBy) OUTPUT INSERTED.id VALUES(${fields.map(field => `@${field}`).join(',')},@branch,@preparedById,@preparedBy)`);
      saved = result.recordset[0].id;
    }
    for (const [position, item] of totals.items.entries()) {
      await bindMoney(request(scope), item).input('id', sql.Int, saved).input('position', sql.Int, position).input('requestItemId', sql.Int, item.requestItemId)
        .input('suppliesId', sql.Int, item.suppliesId).input('suppliesCode', sql.NVarChar(40), item.suppliesCode).input('suppliesName', sql.NVarChar(180), item.suppliesName)
        .input('description', sql.NVarChar(1000), item.description).input('unit', sql.NVarChar(30), item.unit).input('quantity', sql.VarChar(60), item.quantity)
        .input('unitPrice', sql.VarChar(60), item.unitPrice).input('currency', sql.NVarChar(30), item.currency).input('discountRate', sql.VarChar(60), item.discountRate)
        .input('vatRate', sql.VarChar(60), item.vatRate).input('remarks', sql.NVarChar(2000), item.remarks)
        .query(`INSERT INTO dbo.PurchaseOrderItems(orderId,position,requestItemId,suppliesId,suppliesCode,suppliesName,description,unit,quantity,unitPrice,currency,discountRate,vatRate,${MONEY_FIELDS.join(',')},remarks)
          VALUES(@id,@position,@requestItemId,@suppliesId,@suppliesCode,@suppliesName,@description,@unit,@quantity,@unitPrice,@currency,@discountRate,@vatRate,${MONEY_FIELDS.map(field => `@${field}`).join(',')},@remarks)`);
    }
    await recordAudit(scope, user, 'purchase-orders', id ? 'update-draft' : 'create-draft', saved);
    return saved;
  });
  return getPurchaseOrder(savedId);
}

export async function refreshPurchaseOrderStatus(scope, id) {
  await request(scope).input('id', sql.Int, id).query(`UPDATE o SET status=CASE WHEN EXISTS(SELECT 1 FROM dbo.PurchaseOrderItems d WHERE d.orderId=o.id
    AND d.quantity>COALESCE((SELECT SUM(i.quantity) FROM dbo.SuppliesReceiptItems i JOIN dbo.SuppliesReceipts h ON h.id=i.receiptId WHERE i.orderItemId=d.id AND h.status='posted'),0))
    THEN 'posted' ELSE 'closed' END,updatedAt=SYSUTCDATETIME() FROM dbo.PurchaseOrders o WHERE o.id=@id AND o.status IN ('posted','closed')`);
}

export async function postPurchaseOrder(id, user) {
  return transaction(async scope => {
    const value = await getPurchaseOrder(id, scope, true);
    if (['posted', 'closed'].includes(value.status)) return value;
    if (value.status !== 'draft' || !value.items.length) throw new ApiError(409, 'Only a nonempty unposted Purchase Order can be posted.');
    const requestIds = [...new Set(value.items.map(item => item.requestId))].sort((left, right) => left - right);
    for (const requestId of requestIds) await getPurchaseRequest(requestId, scope, true);
    for (const item of value.items) checkRequestBalance(await sourceRequestItem(scope, item.requestItemId), item.quantity);
    await request(scope).input('id', sql.Int, id).input('user', sql.Int, user.id)
      .query("UPDATE dbo.PurchaseOrders SET status='posted',postedById=@user,postedAt=SYSUTCDATETIME(),updatedAt=SYSUTCDATETIME() WHERE id=@id");
    for (const requestId of requestIds) await refreshPurchaseRequestStatus(scope, requestId);
    await recordAudit(scope, user, 'purchase-orders', 'post', id);
    return getPurchaseOrder(id, scope);
  });
}

export async function cancelPurchaseDocument(kind, id, user) {
  return transaction(async scope => {
    const isRequest = kind === 'purchase-requests';
    const value = isRequest ? await getPurchaseRequest(id, scope, true) : await getPurchaseOrder(id, scope, true);
    if (value.status === 'cancelled') return value;
    const linked = isRequest
      ? await request(scope).input('id', sql.Int, id).query("SELECT TOP(1) i.id FROM dbo.PurchaseOrderItems i JOIN dbo.PurchaseRequestItems d ON d.id=i.requestItemId JOIN dbo.PurchaseOrders o ON o.id=i.orderId WHERE d.requestId=@id AND o.status<>'cancelled'")
      : await request(scope).input('id', sql.Int, id).query("SELECT TOP(1) id FROM dbo.SuppliesReceipts WHERE purchaseOrderId=@id AND status<>'cancelled'");
    if (linked.recordset.length) throw new ApiError(409, 'Cancel downstream documents before cancelling this source document.');
    const table = isRequest ? 'PurchaseRequests' : 'PurchaseOrders';
    await request(scope).input('id', sql.Int, id).query(`UPDATE dbo.${table} SET status='cancelled',updatedAt=SYSUTCDATETIME() WHERE id=@id`);
    if (!isRequest) for (const requestId of new Set(value.items.map(item => item.requestId))) await refreshPurchaseRequestStatus(scope, requestId);
    await recordAudit(scope, user, kind, 'cancel', id);
    return isRequest ? getPurchaseRequest(id, scope) : getPurchaseOrder(id, scope);
  });
}
