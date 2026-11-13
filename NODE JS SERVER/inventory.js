import { request, sql } from './database.js';
import { idValue } from './components/validation.js';

export async function listInventory(suppliesId) {
  const req = request();
  if (suppliesId) req.input('suppliesId', sql.Int, idValue(suppliesId, 'supplies'));
  return (await req.query(`SELECT i.id,i.suppliesId,s.code,s.name,s.description,s.category,s.unit,CONVERT(varchar(60),s.minimumStock) AS minimumStock,
    CONVERT(varchar(60),i.quantity) AS quantity,i.warehouseId,w.code AS warehouseCode,w.description AS warehouseDescription,
    i.locationId,l.code AS locationCode,l.description AS locationDescription,i.imLot,i.qcStatus,
    CONVERT(varchar(10),i.expiryDate,23) AS expiryDate,CONVERT(varchar(10),i.mfgDate,23) AS mfgDate,i.updatedAt
    FROM dbo.SupplyInventory i JOIN dbo.Supplies s ON s.id=i.suppliesId JOIN dbo.ConfigWarehouses w ON w.id=i.warehouseId JOIN dbo.ConfigLocations l ON l.id=i.locationId
    ${suppliesId ? 'WHERE i.suppliesId=@suppliesId' : ''} ORDER BY s.name,w.code,l.code,i.imLot,i.id`)).recordset;
}

export async function listStockMovements(suppliesId) {
  const req = request();
  if (suppliesId) req.input('suppliesId', sql.Int, idValue(suppliesId, 'supplies'));
  return (await req.query(`SELECT TOP(1000) m.id,m.receiptId,r.number AS receiptNumber,m.receiptItemId,m.allocationId,m.inventoryId,
    i.suppliesId,s.code,s.name,s.unit,w.code AS warehouseCode,l.code AS locationCode,i.imLot,CONVERT(varchar(60),m.quantity) AS quantity,
    u.name AS createdBy,m.createdAt,CONVERT(varchar(10),r.srrDate,23) AS receivedDate,o.branch
    FROM dbo.SupplyStockMovements m JOIN dbo.SupplyInventory i ON i.id=m.inventoryId JOIN dbo.Supplies s ON s.id=i.suppliesId
    JOIN dbo.SuppliesReceipts r ON r.id=m.receiptId JOIN dbo.PurchaseOrders o ON o.id=r.purchaseOrderId
    JOIN dbo.ConfigWarehouses w ON w.id=i.warehouseId JOIN dbo.ConfigLocations l ON l.id=i.locationId JOIN dbo.SalesUserLogin u ON u.id=m.createdById
    ${suppliesId ? 'WHERE i.suppliesId=@suppliesId' : ''} ORDER BY m.id DESC`)).recordset;
}
