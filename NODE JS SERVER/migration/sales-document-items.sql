DECLARE @InvoiceLinesNeeded BIT = CASE WHEN OBJECT_ID(N'dbo.SalesInvoiceItems',N'U') IS NULL THEN 1 ELSE 0 END;
DECLARE @InvoiceHeaderNeeded BIT = CASE WHEN COL_LENGTH(N'dbo.SalesInvoices',N'grossAmount') IS NULL THEN 1 ELSE 0 END;

IF OBJECT_ID(N'dbo.SalesInvoiceItems', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.SalesInvoiceItems (
    id INT IDENTITY PRIMARY KEY,
    invoiceId INT NOT NULL REFERENCES dbo.SalesInvoices(id),
    orderItemId INT NOT NULL REFERENCES dbo.SalesOrderItems(id),
    productId INT NOT NULL REFERENCES dbo.Products(id),
    [productName] NVARCHAR(MAX) NOT NULL,
    [description] NVARCHAR(MAX) NULL,
    [sku] NVARCHAR(MAX) NOT NULL,
    [unit] NVARCHAR(MAX) NOT NULL,
    [refNumber] NVARCHAR(MAX) NULL,
    [quotationNumber] NVARCHAR(MAX) NULL,
    [currency] NVARCHAR(MAX) NULL,
    [quantity] DECIMAL(18,3) NOT NULL,
    [unitPrice] DECIMAL(18,6) NOT NULL,
    [convertedUnitPrice] DECIMAL(20,6) NULL,
    [discountRate] DECIMAL(18,6) NULL,
    [deliveryDate] DATE NULL,
    [grossAmount] DECIMAL(20,6) NULL,
    [lineDiscountAmount] DECIMAL(20,6) NULL,
    [headerDiscountAmount] DECIMAL(20,6) NULL,
    [discountAmount] DECIMAL(20,6) NULL,
    [netAmount] DECIMAL(20,6) NULL,
    [vatAmount] DECIMAL(20,6) NULL,
    [amount] DECIMAL(20,6) NULL,
    [lineTotal] DECIMAL(20,6) NOT NULL,
    CONSTRAINT UQ_SalesInvoiceItems_Source UNIQUE (invoiceId,orderItemId)
  );
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.SalesInvoiceItems') AND name=N'IX_SalesInvoiceItems_OrderItem')
  CREATE INDEX IX_SalesInvoiceItems_OrderItem ON dbo.SalesInvoiceItems(orderItemId,invoiceId);

IF COL_LENGTH(N'dbo.SalesInvoices',N'grossAmount') IS NULL
  ALTER TABLE dbo.SalesInvoices ADD [grossAmount] DECIMAL(20,6) NULL;
IF COL_LENGTH(N'dbo.SalesInvoices',N'lineDiscountAmount') IS NULL
  ALTER TABLE dbo.SalesInvoices ADD [lineDiscountAmount] DECIMAL(20,6) NULL;
IF COL_LENGTH(N'dbo.SalesInvoices',N'headerDiscountAmount') IS NULL
  ALTER TABLE dbo.SalesInvoices ADD [headerDiscountAmount] DECIMAL(20,6) NULL;
IF COL_LENGTH(N'dbo.SalesInvoices',N'discountAmount') IS NULL
  ALTER TABLE dbo.SalesInvoices ADD [discountAmount] DECIMAL(20,6) NULL;
IF COL_LENGTH(N'dbo.SalesInvoices',N'netAmount') IS NULL
  ALTER TABLE dbo.SalesInvoices ADD [netAmount] DECIMAL(20,6) NULL;
IF COL_LENGTH(N'dbo.SalesInvoices',N'vatAmount') IS NULL
  ALTER TABLE dbo.SalesInvoices ADD [vatAmount] DECIMAL(20,6) NULL;
IF COL_LENGTH(N'dbo.SalesInvoices',N'amount') IS NULL
  ALTER TABLE dbo.SalesInvoices ADD [amount] DECIMAL(20,6) NULL;

-- Copy only actual existing documents once, while their source orders are still immutable.
IF @InvoiceHeaderNeeded = 1
  EXEC(N'UPDATE d SET [grossAmount]=o.[grossAmount],[lineDiscountAmount]=o.[lineDiscountAmount],[headerDiscountAmount]=o.[headerDiscountAmount],[discountAmount]=o.[discountAmount],[netAmount]=o.[netAmount],[vatAmount]=o.[vatAmount],[amount]=d.[total]
    FROM dbo.SalesInvoices d JOIN dbo.SalesOrders o ON o.id=d.orderId;');

IF @InvoiceLinesNeeded = 1
  EXEC(N'INSERT INTO dbo.SalesInvoiceItems (invoiceId,orderItemId,productId,[productName],[description],[sku],[unit],[refNumber],[quotationNumber],[currency],[quantity],[unitPrice],[convertedUnitPrice],[discountRate],[deliveryDate],[grossAmount],[lineDiscountAmount],[headerDiscountAmount],[discountAmount],[netAmount],[vatAmount],[amount],[lineTotal])
    SELECT d.id,s.id,s.productId,s.[productName],s.[description],s.[sku],s.[unit],s.[refNumber],s.[quotationNumber],s.[currency],s.[quantity],s.[unitPrice],s.[convertedUnitPrice],s.[discountRate],s.[deliveryDate],s.[grossAmount],s.[lineDiscountAmount],s.[headerDiscountAmount],s.[discountAmount],s.[netAmount],s.[vatAmount],s.[amount],s.[lineTotal]
    FROM dbo.SalesInvoices d JOIN dbo.SalesOrderItems s ON s.orderId=d.orderId;');

DECLARE @DeliveryLinesNeeded BIT = CASE WHEN OBJECT_ID(N'dbo.DeliveryReceiptItems',N'U') IS NULL THEN 1 ELSE 0 END;
DECLARE @DeliveryHeaderNeeded BIT = CASE WHEN COL_LENGTH(N'dbo.DeliveryReceipts',N'grossAmount') IS NULL THEN 1 ELSE 0 END;

IF OBJECT_ID(N'dbo.DeliveryReceiptItems', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.DeliveryReceiptItems (
    id INT IDENTITY PRIMARY KEY,
    deliveryReceiptId INT NOT NULL REFERENCES dbo.DeliveryReceipts(id),
    orderItemId INT NOT NULL REFERENCES dbo.SalesOrderItems(id),
    productId INT NOT NULL REFERENCES dbo.Products(id),
    [productName] NVARCHAR(MAX) NOT NULL,
    [description] NVARCHAR(MAX) NULL,
    [sku] NVARCHAR(MAX) NOT NULL,
    [unit] NVARCHAR(MAX) NOT NULL,
    [refNumber] NVARCHAR(MAX) NULL,
    [quotationNumber] NVARCHAR(MAX) NULL,
    [currency] NVARCHAR(MAX) NULL,
    [quantity] DECIMAL(18,3) NOT NULL,
    [unitPrice] DECIMAL(18,6) NOT NULL,
    [convertedUnitPrice] DECIMAL(20,6) NULL,
    [discountRate] DECIMAL(18,6) NULL,
    [deliveryDate] DATE NULL,
    [grossAmount] DECIMAL(20,6) NULL,
    [lineDiscountAmount] DECIMAL(20,6) NULL,
    [headerDiscountAmount] DECIMAL(20,6) NULL,
    [discountAmount] DECIMAL(20,6) NULL,
    [netAmount] DECIMAL(20,6) NULL,
    [vatAmount] DECIMAL(20,6) NULL,
    [amount] DECIMAL(20,6) NULL,
    [lineTotal] DECIMAL(20,6) NOT NULL,
    CONSTRAINT UQ_DeliveryReceiptItems_Source UNIQUE (deliveryReceiptId,orderItemId)
  );
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.DeliveryReceiptItems') AND name=N'IX_DeliveryReceiptItems_OrderItem')
  CREATE INDEX IX_DeliveryReceiptItems_OrderItem ON dbo.DeliveryReceiptItems(orderItemId,deliveryReceiptId);

IF COL_LENGTH(N'dbo.DeliveryReceipts',N'grossAmount') IS NULL
  ALTER TABLE dbo.DeliveryReceipts ADD [grossAmount] DECIMAL(20,6) NULL;
IF COL_LENGTH(N'dbo.DeliveryReceipts',N'lineDiscountAmount') IS NULL
  ALTER TABLE dbo.DeliveryReceipts ADD [lineDiscountAmount] DECIMAL(20,6) NULL;
IF COL_LENGTH(N'dbo.DeliveryReceipts',N'headerDiscountAmount') IS NULL
  ALTER TABLE dbo.DeliveryReceipts ADD [headerDiscountAmount] DECIMAL(20,6) NULL;
IF COL_LENGTH(N'dbo.DeliveryReceipts',N'discountAmount') IS NULL
  ALTER TABLE dbo.DeliveryReceipts ADD [discountAmount] DECIMAL(20,6) NULL;
IF COL_LENGTH(N'dbo.DeliveryReceipts',N'netAmount') IS NULL
  ALTER TABLE dbo.DeliveryReceipts ADD [netAmount] DECIMAL(20,6) NULL;
IF COL_LENGTH(N'dbo.DeliveryReceipts',N'vatAmount') IS NULL
  ALTER TABLE dbo.DeliveryReceipts ADD [vatAmount] DECIMAL(20,6) NULL;
IF COL_LENGTH(N'dbo.DeliveryReceipts',N'amount') IS NULL
  ALTER TABLE dbo.DeliveryReceipts ADD [amount] DECIMAL(20,6) NULL;

-- Copy only actual existing documents once, while their source orders are still immutable.
IF @DeliveryHeaderNeeded = 1
  EXEC(N'UPDATE d SET [grossAmount]=o.[grossAmount],[lineDiscountAmount]=o.[lineDiscountAmount],[headerDiscountAmount]=o.[headerDiscountAmount],[discountAmount]=o.[discountAmount],[netAmount]=o.[netAmount],[vatAmount]=o.[vatAmount],[amount]=COALESCE(o.[amount],o.[total])
    FROM dbo.DeliveryReceipts d JOIN dbo.SalesOrders o ON o.id=d.orderId;');

IF @DeliveryLinesNeeded = 1
  EXEC(N'INSERT INTO dbo.DeliveryReceiptItems (deliveryReceiptId,orderItemId,productId,[productName],[description],[sku],[unit],[refNumber],[quotationNumber],[currency],[quantity],[unitPrice],[convertedUnitPrice],[discountRate],[deliveryDate],[grossAmount],[lineDiscountAmount],[headerDiscountAmount],[discountAmount],[netAmount],[vatAmount],[amount],[lineTotal])
    SELECT d.id,s.id,s.productId,s.[productName],s.[description],s.[sku],s.[unit],s.[refNumber],s.[quotationNumber],s.[currency],s.[quantity],s.[unitPrice],s.[convertedUnitPrice],s.[discountRate],s.[deliveryDate],s.[grossAmount],s.[lineDiscountAmount],s.[headerDiscountAmount],s.[discountAmount],s.[netAmount],s.[vatAmount],s.[amount],s.[lineTotal]
    FROM dbo.DeliveryReceipts d JOIN dbo.SalesOrderItems s ON s.orderId=d.orderId;');
