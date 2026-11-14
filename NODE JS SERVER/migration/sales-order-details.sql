SET XACT_ABORT ON;

-- Header settings and item snapshots are supplied by SalesApi.
-- Existing orders keep their values; newly introduced optional fields stay NULL.
IF COL_LENGTH(N'dbo.SalesOrders',N'billToCustomerId') IS NULL ALTER TABLE dbo.SalesOrders ADD billToCustomerId INT NULL;
IF COL_LENGTH(N'dbo.SalesOrders',N'billToName') IS NULL ALTER TABLE dbo.SalesOrders ADD billToName NVARCHAR(MAX) NULL;
IF COL_LENGTH(N'dbo.SalesOrders',N'billToAddress') IS NULL ALTER TABLE dbo.SalesOrders ADD billToAddress NVARCHAR(MAX) NULL;
IF COL_LENGTH(N'dbo.SalesOrders',N'preparedByName') IS NULL ALTER TABLE dbo.SalesOrders ADD preparedByName NVARCHAR(MAX) NULL;
IF COL_LENGTH(N'dbo.SalesOrders',N'expectedDeliveryDate') IS NULL ALTER TABLE dbo.SalesOrders ADD expectedDeliveryDate DATE NULL;
IF COL_LENGTH(N'dbo.SalesOrders',N'sourceCurrency') IS NULL ALTER TABLE dbo.SalesOrders ADD sourceCurrency NVARCHAR(MAX) NULL;
IF COL_LENGTH(N'dbo.SalesOrders',N'rate') IS NULL ALTER TABLE dbo.SalesOrders ADD rate DECIMAL(18,6) NULL;
IF COL_LENGTH(N'dbo.SalesOrders',N'paymentTerm') IS NULL ALTER TABLE dbo.SalesOrders ADD paymentTerm NVARCHAR(MAX) NULL;
IF COL_LENGTH(N'dbo.SalesOrders',N'shipment') IS NULL ALTER TABLE dbo.SalesOrders ADD shipment NVARCHAR(MAX) NULL;
IF COL_LENGTH(N'dbo.SalesOrders',N'countryOfOrigin') IS NULL ALTER TABLE dbo.SalesOrders ADD countryOfOrigin NVARCHAR(MAX) NULL;
IF COL_LENGTH(N'dbo.SalesOrders',N'vatCode') IS NULL ALTER TABLE dbo.SalesOrders ADD vatCode NVARCHAR(MAX) NULL;
IF COL_LENGTH(N'dbo.SalesOrders',N'vatRate') IS NULL ALTER TABLE dbo.SalesOrders ADD vatRate DECIMAL(18,6) NULL;
IF COL_LENGTH(N'dbo.SalesOrders',N'vatInclusive') IS NULL ALTER TABLE dbo.SalesOrders ADD vatInclusive BIT NULL;
IF COL_LENGTH(N'dbo.SalesOrders',N'discountType') IS NULL ALTER TABLE dbo.SalesOrders ADD discountType NVARCHAR(MAX) NULL;
IF COL_LENGTH(N'dbo.SalesOrders',N'discount') IS NULL ALTER TABLE dbo.SalesOrders ADD discount DECIMAL(20,6) NULL;
IF COL_LENGTH(N'dbo.SalesOrders',N'decimalInPrice') IS NULL ALTER TABLE dbo.SalesOrders ADD decimalInPrice INT NULL;
IF COL_LENGTH(N'dbo.SalesOrders',N'decimalInTotalPrice') IS NULL ALTER TABLE dbo.SalesOrders ADD decimalInTotalPrice INT NULL;
IF COL_LENGTH(N'dbo.SalesOrders',N'grossAmount') IS NULL ALTER TABLE dbo.SalesOrders ADD grossAmount DECIMAL(20,6) NULL;
IF COL_LENGTH(N'dbo.SalesOrders',N'lineDiscountAmount') IS NULL ALTER TABLE dbo.SalesOrders ADD lineDiscountAmount DECIMAL(20,6) NULL;
IF COL_LENGTH(N'dbo.SalesOrders',N'headerDiscountAmount') IS NULL ALTER TABLE dbo.SalesOrders ADD headerDiscountAmount DECIMAL(20,6) NULL;
IF COL_LENGTH(N'dbo.SalesOrders',N'discountAmount') IS NULL ALTER TABLE dbo.SalesOrders ADD discountAmount DECIMAL(20,6) NULL;
IF COL_LENGTH(N'dbo.SalesOrders',N'netAmount') IS NULL ALTER TABLE dbo.SalesOrders ADD netAmount DECIMAL(20,6) NULL;
IF COL_LENGTH(N'dbo.SalesOrders',N'vatAmount') IS NULL ALTER TABLE dbo.SalesOrders ADD vatAmount DECIMAL(20,6) NULL;
IF COL_LENGTH(N'dbo.SalesOrders',N'amount') IS NULL ALTER TABLE dbo.SalesOrders ADD amount DECIMAL(20,6) NULL;

IF NOT EXISTS(SELECT 1 FROM sys.foreign_keys WHERE parent_object_id=OBJECT_ID(N'dbo.SalesOrders') AND name=N'FK_SalesOrders_BillTo')
  EXEC(N'ALTER TABLE dbo.SalesOrders ADD CONSTRAINT FK_SalesOrders_BillTo FOREIGN KEY(billToCustomerId) REFERENCES dbo.Customers(id);');

IF COL_LENGTH(N'dbo.SalesOrderItems',N'refNumber') IS NULL ALTER TABLE dbo.SalesOrderItems ADD refNumber NVARCHAR(MAX) NULL;
IF COL_LENGTH(N'dbo.SalesOrderItems',N'quotationNumber') IS NULL ALTER TABLE dbo.SalesOrderItems ADD quotationNumber NVARCHAR(MAX) NULL;
IF COL_LENGTH(N'dbo.SalesOrderItems',N'description') IS NULL ALTER TABLE dbo.SalesOrderItems ADD description NVARCHAR(MAX) NULL;
IF COL_LENGTH(N'dbo.SalesOrderItems',N'currency') IS NULL ALTER TABLE dbo.SalesOrderItems ADD currency NVARCHAR(MAX) NULL;
IF COL_LENGTH(N'dbo.SalesOrderItems',N'convertedUnitPrice') IS NULL ALTER TABLE dbo.SalesOrderItems ADD convertedUnitPrice DECIMAL(20,6) NULL;
IF COL_LENGTH(N'dbo.SalesOrderItems',N'discountRate') IS NULL ALTER TABLE dbo.SalesOrderItems ADD discountRate DECIMAL(18,6) NULL;
IF COL_LENGTH(N'dbo.SalesOrderItems',N'deliveryDate') IS NULL ALTER TABLE dbo.SalesOrderItems ADD deliveryDate DATE NULL;
IF COL_LENGTH(N'dbo.SalesOrderItems',N'grossAmount') IS NULL ALTER TABLE dbo.SalesOrderItems ADD grossAmount DECIMAL(20,6) NULL;
IF COL_LENGTH(N'dbo.SalesOrderItems',N'lineDiscountAmount') IS NULL ALTER TABLE dbo.SalesOrderItems ADD lineDiscountAmount DECIMAL(20,6) NULL;
IF COL_LENGTH(N'dbo.SalesOrderItems',N'headerDiscountAmount') IS NULL ALTER TABLE dbo.SalesOrderItems ADD headerDiscountAmount DECIMAL(20,6) NULL;
IF COL_LENGTH(N'dbo.SalesOrderItems',N'discountAmount') IS NULL ALTER TABLE dbo.SalesOrderItems ADD discountAmount DECIMAL(20,6) NULL;
IF COL_LENGTH(N'dbo.SalesOrderItems',N'netAmount') IS NULL ALTER TABLE dbo.SalesOrderItems ADD netAmount DECIMAL(20,6) NULL;
IF COL_LENGTH(N'dbo.SalesOrderItems',N'vatAmount') IS NULL ALTER TABLE dbo.SalesOrderItems ADD vatAmount DECIMAL(20,6) NULL;
IF COL_LENGTH(N'dbo.SalesOrderItems',N'amount') IS NULL ALTER TABLE dbo.SalesOrderItems ADD amount DECIMAL(20,6) NULL;

-- Preserve up to six decimals through invoice totals and payment balances.
IF EXISTS(SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID(N'dbo.SalesOrders') AND name=N'total' AND (precision<20 OR scale<6))
  ALTER TABLE dbo.SalesOrders ALTER COLUMN total DECIMAL(20,6) NOT NULL;
IF EXISTS(SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID(N'dbo.SalesOrderItems') AND name=N'lineTotal' AND (precision<20 OR scale<6))
  ALTER TABLE dbo.SalesOrderItems ALTER COLUMN lineTotal DECIMAL(20,6) NOT NULL;
IF EXISTS(SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID(N'dbo.SalesInvoices') AND name=N'total' AND (precision<20 OR scale<6))
  ALTER TABLE dbo.SalesInvoices ALTER COLUMN total DECIMAL(20,6) NOT NULL;
IF EXISTS(SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID(N'dbo.SalesInvoices') AND name=N'paidAmount' AND (precision<20 OR scale<6))
  ALTER TABLE dbo.SalesInvoices ALTER COLUMN paidAmount DECIMAL(20,6) NOT NULL;
