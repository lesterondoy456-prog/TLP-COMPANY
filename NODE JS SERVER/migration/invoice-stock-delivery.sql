-- Link new invoice stock-outs and delivery documents without changing historical stock.
IF COL_LENGTH(N'dbo.SalesInvoices',N'buyerBusinessStyle') IS NULL
  ALTER TABLE dbo.SalesInvoices ADD buyerBusinessStyle NVARCHAR(MAX) NULL;
IF COL_LENGTH(N'dbo.ProductStockMovements',N'invoiceId') IS NULL
  ALTER TABLE dbo.ProductStockMovements ADD invoiceId INT NULL;
IF COL_LENGTH(N'dbo.ProductStockMovements',N'invoiceItemId') IS NULL
  ALTER TABLE dbo.ProductStockMovements ADD invoiceItemId INT NULL;
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE parent_object_id=OBJECT_ID(N'dbo.ProductStockMovements') AND name=N'FK_ProductStockMovements_Invoice')
  EXEC(N'ALTER TABLE dbo.ProductStockMovements ADD CONSTRAINT FK_ProductStockMovements_Invoice FOREIGN KEY(invoiceId) REFERENCES dbo.SalesInvoices(id);');
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE parent_object_id=OBJECT_ID(N'dbo.ProductStockMovements') AND name=N'FK_ProductStockMovements_InvoiceItem')
  EXEC(N'ALTER TABLE dbo.ProductStockMovements ADD CONSTRAINT FK_ProductStockMovements_InvoiceItem FOREIGN KEY(invoiceItemId) REFERENCES dbo.SalesInvoiceItems(id);');
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.ProductStockMovements') AND name=N'UQ_ProductStockMovements_InvoiceItem')
  EXEC(N'CREATE UNIQUE INDEX UQ_ProductStockMovements_InvoiceItem ON dbo.ProductStockMovements(invoiceItemId) WHERE invoiceItemId IS NOT NULL;');

DECLARE @DeliveryLinkNeeded BIT = CASE WHEN COL_LENGTH(N'dbo.DeliveryReceipts',N'invoiceId') IS NULL THEN 1 ELSE 0 END;
DECLARE @LegacyStockFlagNeeded BIT = CASE WHEN COL_LENGTH(N'dbo.DeliveryReceipts',N'stockDeducted') IS NULL THEN 1 ELSE 0 END;
IF COL_LENGTH(N'dbo.DeliveryReceipts',N'invoiceId') IS NULL
  ALTER TABLE dbo.DeliveryReceipts ADD invoiceId INT NULL;
IF COL_LENGTH(N'dbo.DeliveryReceipts',N'stockDeducted') IS NULL
  ALTER TABLE dbo.DeliveryReceipts ADD stockDeducted BIT NULL;
IF COL_LENGTH(N'dbo.DeliveryReceipts',N'preparedByName') IS NULL
  ALTER TABLE dbo.DeliveryReceipts ADD preparedByName NVARCHAR(MAX) NULL;
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID(N'dbo.DeliveryReceipts') AND name=N'receivedBy' AND is_nullable=0)
  ALTER TABLE dbo.DeliveryReceipts ALTER COLUMN receivedBy NVARCHAR(MAX) NULL;

-- Only documents that already existed at this migration reduced stock on delivery.
IF @LegacyStockFlagNeeded=1
  EXEC(N'UPDATE dbo.DeliveryReceipts SET stockDeducted=1;');
IF @DeliveryLinkNeeded=1
  EXEC(N'UPDATE d SET invoiceId=i.id FROM dbo.DeliveryReceipts d JOIN dbo.SalesInvoices i ON i.orderId=d.orderId WHERE d.invoiceId IS NULL;');
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE parent_object_id=OBJECT_ID(N'dbo.DeliveryReceipts') AND name=N'FK_DeliveryReceipts_Invoice')
  EXEC(N'ALTER TABLE dbo.DeliveryReceipts ADD CONSTRAINT FK_DeliveryReceipts_Invoice FOREIGN KEY(invoiceId) REFERENCES dbo.SalesInvoices(id);');
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.DeliveryReceipts') AND name=N'UQ_DeliveryReceipts_Invoice')
  EXEC(N'CREATE UNIQUE INDEX UQ_DeliveryReceipts_Invoice ON dbo.DeliveryReceipts(invoiceId) WHERE invoiceId IS NOT NULL;');
