import { request, sql, transaction } from './database.js';
import { ApiError } from './components/errors.js';
import { validateReceiving } from './components/purchasing-validation.js';
import { createReceivingWorkflow, calculatePurchaseTotals, decimalUnits } from './components/purchasing-workflow.js';
import { getPurchaseOrder, MONEY_FIELDS, moneyColumns, bindMoney, refreshPurchaseOrderStatus } from './purchasing.js';
import { recordAudit } from './audit.js';

async function loadReceipts(scope, id, lock = false) {
  const req = request(scope);
  if (id) req.input('id', sql.Int, id);
  const result = await req.query(`SELECT r.id,r.number,r.purchaseOrderId,o.number AS purchaseOrderNumber,o.branch,o.supplierId,o.supplierName,o.supplierAddress,
    CONVERT(varchar(10),r.srrDate,23) AS srrDate,r.drNumber,r.pezaReference,r.invoiceNumber,CONVERT(varchar(10),r.invoiceDate,23) AS invoiceDate,
    o.currency,CONVERT(varchar(60),r.rate) AS rate,o.vatCode,CONVERT(varchar(60),o.vatRate) AS vatRate,o.vatInclusive,o.decimalInPrice,o.decimalInTotalPrice,
    r.remarks,${moneyColumns('r')},r.receivedById,r.receivedBy,r.status,r.postedAt
    FROM dbo.SuppliesReceipts r ${lock ? 'WITH (UPDLOCK,HOLDLOCK)' : ''} JOIN dbo.PurchaseOrders o ON o.id=r.purchaseOrderId ${id ? 'WHERE r.id=@id' : ''} ORDER BY r.id DESC;
    SELECT d.id,d.receiptId,d.position,d.orderItemId,o.suppliesId,o.suppliesCode,o.suppliesName,o.description,o.unit,
    CONVERT(varchar(60),d.quantity) AS quantity,CONVERT(varchar(60),o.unitPrice) AS unitPrice,o.currency,
    CONVERT(varchar(60),o.discountRate) AS discountRate,CONVERT(varchar(60),o.vatRate) AS vatRate,${moneyColumns('d')},d.remarks,
    CONVERT(varchar(60),o.quantity) AS orderQuantity,CONVERT(varchar(60),COALESCE(a.receivedQuantity,0)) AS receivedQuantity,
    CONVERT(varchar(60),o.quantity-CAST(COALESCE(a.receivedQuantity,0) AS decimal(28,6))) AS orderBalanceQuantity,
    CONVERT(varchar(60),COALESCE(l.allocatedQuantity,0)) AS allocatedQuantity,CONVERT(varchar(60),d.quantity-CAST(COALESCE(l.allocatedQuantity,0) AS decimal(28,6))) AS allocationBalanceQuantity
    FROM dbo.SuppliesReceiptItems d JOIN dbo.PurchaseOrderItems o ON o.id=d.orderItemId
    OUTER APPLY(SELECT SUM(x.quantity) AS receivedQuantity FROM dbo.SuppliesReceiptItems x JOIN dbo.SuppliesReceipts h ON h.id=x.receiptId WHERE x.orderItemId=o.id AND h.status='posted') a
    OUTER APPLY(SELECT SUM(x.quantity) AS allocatedQuantity FROM dbo.SuppliesReceiptAllocations x WHERE x.receiptItemId=d.id) l
    ${id ? 'WHERE d.receiptId=@id' : ''} ORDER BY d.receiptId,d.position;
    SELECT a.id,a.receiptItemId,a.position,CONVERT(varchar(60),a.quantity) AS quantity,CONVERT(varchar(10),a.expiryDate,23) AS expiryDate,
    CONVERT(varchar(10),a.mfgDate,23) AS mfgDate,a.imLot,a.qcStatus,a.warehouseId,a.locationId,w.code AS warehouseCode,l.code AS locationCode
    FROM dbo.SuppliesReceiptAllocations a JOIN dbo.SuppliesReceiptItems d ON d.id=a.receiptItemId
    LEFT JOIN dbo.ConfigWarehouses w ON w.id=a.warehouseId LEFT JOIN dbo.ConfigLocations l ON l.id=a.locationId
    ${id ? 'WHERE d.receiptId=@id' : ''} ORDER BY a.receiptItemId,a.position;`);
  const records = new Map(result.recordsets[0].map(row => [row.id, { ...row, items: [] }]));
  const items = new Map();
  for (const { receiptId, ...row } of result.recordsets[1]) {
    const item = { ...row, allocations: [] };
    items.set(row.id, item);
    records.get(receiptId)?.items.push(item);
  }
  for (const { receiptItemId, ...allocation } of result.recordsets[2]) items.get(receiptItemId)?.allocations.push(allocation);
  return [...records.values()];
}

export function listReceivings() { return loadReceipts(); }
export async function getReceiving(id, scope, lock = false) {
  const records = await loadReceipts(scope, id, lock);
  if (!records.length) throw new ApiError(404, 'Receiving receipt could not be found.');
  return records[0];
}

async function validateAllocationReferences(scope, allocations) {
  for (const allocation of allocations) {
    for (const [key, table] of [['warehouseId', 'ConfigWarehouses'], ['locationId', 'ConfigLocations']]) {
      if (!allocation[key]) continue;
      const result = await request(scope).input('id', sql.Int, allocation[key]).query(`SELECT id FROM dbo.${table} WHERE id=@id AND isActive=1`);
      if (!result.recordset.length) throw new ApiError(400, 'Select active configured Warehouses and Locations.');
    }
  }
}

export async function saveReceiving(input, id, user) {
  const savedId = await transaction(async scope => {
    const current = id ? await getReceiving(id, scope, true) : undefined;
    if (current && current.status !== 'draft') throw new ApiError(409, 'Only an unposted receiving receipt can be edited.');
    const value = validateReceiving(input, current);
    const order = await getPurchaseOrder(value.purchaseOrderId, scope, true);
    if (!['posted', 'closed'].includes(order.status)) throw new ApiError(409, 'Load a posted Purchase Order for receiving.');
    const orderItems = new Map(order.items.map(item => [item.id, item]));
    const snapshots = [];
    for (const item of value.items) {
      const source = orderItems.get(item.orderItemId);
      if (!source) throw new ApiError(400, 'Receiving items must belong to the selected Purchase Order.');
      if (item.unit && item.unit !== source.unit) throw new ApiError(400, 'Receiving UOM must match its Purchase Order.');
      const available = decimalUnits(source.quantity, 6) - decimalUnits(source.receivedQuantity, 6);
      if (decimalUnits(item.quantity, 6) > available) throw new ApiError(409, 'Receiving quantity exceeds the open Purchase Order balance.');
      await validateAllocationReferences(scope, item.allocations);
      snapshots.push({ ...item, unitPrice: source.unitPrice, discountRate: source.discountRate });
    }
    const totals = calculatePurchaseTotals(snapshots, order);
    const fields = ['purchaseOrderId', 'srrDate', 'drNumber', 'pezaReference', 'invoiceNumber', 'invoiceDate', 'rate', 'remarks', ...MONEY_FIELDS];
    const req = bindMoney(request(scope), totals).input('purchaseOrderId', sql.Int, order.id).input('srrDate', sql.VarChar(10), value.srrDate)
      .input('drNumber', sql.NVarChar(80), value.drNumber).input('pezaReference', sql.NVarChar(80), value.pezaReference).input('invoiceNumber', sql.NVarChar(80), value.invoiceNumber)
      .input('invoiceDate', sql.VarChar(10), value.invoiceDate).input('rate', sql.VarChar(60), value.rate || order.rate).input('remarks', sql.NVarChar(2000), value.remarks);
    let saved = id;
    if (id) {
      await req.input('id', sql.Int, id).query(`UPDATE dbo.SuppliesReceipts SET ${fields.map(field => `[${field}]=@${field}`).join(',')},updatedAt=SYSUTCDATETIME() WHERE id=@id`);
      await request(scope).input('id', sql.Int, id).query('DELETE a FROM dbo.SuppliesReceiptAllocations a JOIN dbo.SuppliesReceiptItems i ON i.id=a.receiptItemId WHERE i.receiptId=@id; DELETE FROM dbo.SuppliesReceiptItems WHERE receiptId=@id;');
    } else {
      const result = await req.input('receivedById', sql.Int, user.id).input('receivedBy', sql.NVarChar(150), user.name)
        .query(`INSERT INTO dbo.SuppliesReceipts(${fields.join(',')},receivedById,receivedBy) OUTPUT INSERTED.id VALUES(${fields.map(field => `@${field}`).join(',')},@receivedById,@receivedBy)`);
      saved = result.recordset[0].id;
    }
    for (const [position, item] of totals.items.entries()) {
      const inserted = await bindMoney(request(scope), item).input('id', sql.Int, saved).input('position', sql.Int, position).input('orderItemId', sql.Int, item.orderItemId)
        .input('quantity', sql.VarChar(60), item.quantity).input('remarks', sql.NVarChar(2000), item.remarks)
        .query(`INSERT INTO dbo.SuppliesReceiptItems(receiptId,position,orderItemId,quantity,remarks,${MONEY_FIELDS.join(',')}) OUTPUT INSERTED.id
          VALUES(@id,@position,@orderItemId,@quantity,@remarks,${MONEY_FIELDS.map(field => `@${field}`).join(',')})`);
      const itemId = inserted.recordset[0].id;
      for (const [allocationPosition, allocation] of item.allocations.entries()) {
        await request(scope).input('id', sql.Int, itemId).input('position', sql.Int, allocationPosition).input('quantity', sql.VarChar(60), allocation.quantity)
          .input('expiryDate', sql.VarChar(10), allocation.expiryDate).input('mfgDate', sql.VarChar(10), allocation.mfgDate).input('imLot', sql.NVarChar(100), allocation.imLot)
          .input('qcStatus', sql.NVarChar(50), allocation.qcStatus).input('warehouseId', sql.Int, allocation.warehouseId).input('locationId', sql.Int, allocation.locationId)
          .query(`INSERT INTO dbo.SuppliesReceiptAllocations(receiptItemId,position,quantity,expiryDate,mfgDate,imLot,qcStatus,warehouseId,locationId)
            VALUES(@id,@position,@quantity,@expiryDate,@mfgDate,@imLot,@qcStatus,@warehouseId,@locationId)`);
      }
    }
    await recordAudit(scope, user, 'receivings', id ? 'update-draft' : 'create-draft', saved);
    return saved;
  });
  return getReceiving(savedId);
}

async function validateDestination(scope, allocation) {
  const result = await request(scope).input('warehouse', sql.Int, allocation.warehouseId).input('location', sql.Int, allocation.locationId)
    .query('SELECT w.id FROM dbo.ConfigWarehouses w CROSS JOIN dbo.ConfigLocations l WHERE w.id=@warehouse AND l.id=@location AND w.isActive=1 AND l.isActive=1');
  return result.recordset.length === 1;
}

async function addStock(scope, movement) {
  const parameters = () => request(scope).input('suppliesId', sql.Int, movement.suppliesId).input('warehouseId', sql.Int, movement.warehouseId)
    .input('locationId', sql.Int, movement.locationId).input('imLot', sql.NVarChar(100), movement.imLot || '').input('qcStatus', sql.NVarChar(50), movement.qcStatus || '')
    .input('expiryDate', sql.VarChar(10), movement.expiryDate || null).input('mfgDate', sql.VarChar(10), movement.mfgDate || null).input('quantity', sql.VarChar(60), movement.quantity);
  const existing = await parameters().query(`SELECT id FROM dbo.SupplyInventory WITH (UPDLOCK,HOLDLOCK) WHERE suppliesId=@suppliesId AND warehouseId=@warehouseId AND locationId=@locationId
    AND imLot=@imLot AND qcStatus=@qcStatus AND (expiryDate=@expiryDate OR (expiryDate IS NULL AND @expiryDate IS NULL)) AND (mfgDate=@mfgDate OR (mfgDate IS NULL AND @mfgDate IS NULL))`);
  let inventoryId = existing.recordset[0]?.id;
  if (inventoryId) {
    const result = await parameters().input('id', sql.Int, inventoryId).query(`UPDATE dbo.SupplyInventory SET quantity=quantity+CONVERT(decimal(18,6),@quantity),updatedAt=SYSUTCDATETIME()
      OUTPUT INSERTED.id WHERE id=@id AND quantity<=CONVERT(decimal(18,6),'999999999999.999999')-CONVERT(decimal(18,6),@quantity)`);
    if (!result.recordset.length) throw new ApiError(409, 'This inventory balance exceeds the supported stock quantity.');
  } else {
    const result = await parameters().query(`INSERT INTO dbo.SupplyInventory(suppliesId,warehouseId,locationId,imLot,qcStatus,expiryDate,mfgDate,quantity) OUTPUT INSERTED.id
      VALUES(@suppliesId,@warehouseId,@locationId,@imLot,@qcStatus,@expiryDate,@mfgDate,@quantity)`);
    inventoryId = result.recordset[0].id;
  }
  await request(scope).input('receiptId', sql.Int, movement.receiptId).input('receiptItemId', sql.Int, movement.receiptItemId).input('allocationId', sql.Int, movement.allocationId)
    .input('inventoryId', sql.Int, inventoryId).input('quantity', sql.VarChar(60), movement.quantity).input('user', sql.Int, movement.user.id)
    .query(`INSERT INTO dbo.SupplyStockMovements(receiptId,receiptItemId,allocationId,inventoryId,quantity,createdById)
      VALUES(@receiptId,@receiptItemId,@allocationId,@inventoryId,@quantity,@user)`);
}

const receivingWorkflow = createReceivingWorkflow({
  transaction,
  getReceiptForUpdate: (scope, id) => getReceiving(id, scope, true),
  getOrderForUpdate: (scope, id) => getPurchaseOrder(id, scope, true),
  getReceipt: (scope, id) => getReceiving(id, scope),
  validateDestination,
  addStock,
  async markReceiptPosted(scope, id, user) {
    await request(scope).input('id', sql.Int, id).input('user', sql.Int, user.id)
      .query("UPDATE dbo.SuppliesReceipts SET status='posted',postedById=@user,postedAt=SYSUTCDATETIME(),updatedAt=SYSUTCDATETIME() WHERE id=@id");
  },
  refreshPurchaseOrderStatus,
  recordAudit,
});

export const postReceiving = (id, user) => receivingWorkflow.post(id, user);

export async function cancelReceiving(id, user) {
  return transaction(async scope => {
    const receipt = await getReceiving(id, scope, true);
    if (receipt.status === 'cancelled') return receipt;
    if (receipt.status !== 'draft') throw new ApiError(409, 'Posted receiving receipts cannot be cancelled from the inventory-only system.');
    await request(scope).input('id', sql.Int, id).query("UPDATE dbo.SuppliesReceipts SET status='cancelled',updatedAt=SYSUTCDATETIME() WHERE id=@id");
    await recordAudit(scope, user, 'receivings', 'cancel', id);
    return getReceiving(id, scope);
  });
}
