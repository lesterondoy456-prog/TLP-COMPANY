const express = require('express');
const router = express.Router();
const { request, sql } = require('../db');

router.get('/inventory', async (req, res) => {
  const suppliesId = req.query.suppliesId;

  const query = request();
  if (suppliesId) query.input('suppliesId', sql.Int, Number(suppliesId));
  const result = await query.query(`SELECT i.id,i.suppliesId,s.code,s.name,s.description,s.category,s.unit,CONVERT(varchar(60),s.minimumStock) AS minimumStock,
    CONVERT(varchar(60),i.quantity) AS quantity,i.warehouseId,w.code AS warehouseCode,w.description AS warehouseDescription,
    i.locationId,l.code AS locationCode,l.description AS locationDescription,i.imLot,i.qcStatus,
    CONVERT(varchar(10),i.expiryDate,23) AS expiryDate,CONVERT(varchar(10),i.mfgDate,23) AS mfgDate,i.updatedAt
    FROM dbo.SupplyInventory i JOIN dbo.Supplies s ON s.id=i.suppliesId JOIN dbo.ConfigWarehouses w ON w.id=i.warehouseId JOIN dbo.ConfigLocations l ON l.id=i.locationId
    ${suppliesId ? 'WHERE i.suppliesId=@suppliesId' : ''} ORDER BY s.name,w.code,l.code,i.imLot,i.id`);
  res.json({ records: result.recordset });

});

router.get('/inventory/movements', async (req, res) => {
  const suppliesId = req.query.suppliesId;

  const query = request();
  if (suppliesId) query.input('suppliesId', sql.Int, Number(suppliesId));
  const result = await query.query(`SELECT TOP(1000) m.id,m.receiptId,r.number AS receiptNumber,m.receiptItemId,m.allocationId,m.inventoryId,
    i.suppliesId,s.code,s.name,s.unit,w.code AS warehouseCode,l.code AS locationCode,i.imLot,CONVERT(varchar(60),m.quantity) AS quantity,
    u.name AS createdBy,m.createdAt,CONVERT(varchar(10),r.srrDate,23) AS receivedDate,o.branch
    FROM dbo.SupplyStockMovements m JOIN dbo.SupplyInventory i ON i.id=m.inventoryId JOIN dbo.Supplies s ON s.id=i.suppliesId
    JOIN dbo.SuppliesReceipts r ON r.id=m.receiptId JOIN dbo.PurchaseOrders o ON o.id=r.purchaseOrderId
    JOIN dbo.ConfigWarehouses w ON w.id=i.warehouseId JOIN dbo.ConfigLocations l ON l.id=i.locationId JOIN dbo.PurchasingUserLogin u ON u.id=m.createdById
    ${suppliesId ? 'WHERE i.suppliesId=@suppliesId' : ''} ORDER BY m.id DESC`);
  res.json({ records: result.recordset });

});

router.all('/inventory', (req, res) => res.set('Allow', 'GET').status(405).json({ message: 'This HTTP method is not supported.' }));
router.all('/inventory/movements', (req, res) => res.set('Allow', 'GET').status(405).json({ message: 'This HTTP method is not supported.' }));

module.exports = router;
