SET XACT_ABORT ON;

-- Preserve six-decimal prices on existing installations.
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID(N'dbo.SupplySuppliers') AND name=N'price' AND scale<6)
  ALTER TABLE dbo.SupplySuppliers ALTER COLUMN price DECIMAL(19,6) NULL;
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID(N'dbo.PurchaseOrderItems') AND name=N'unitPrice' AND scale<6)
  ALTER TABLE dbo.PurchaseOrderItems ALTER COLUMN unitPrice DECIMAL(19,6) NOT NULL;
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID(N'dbo.Products') AND name=N'price' AND scale<6)
  ALTER TABLE dbo.Products ALTER COLUMN price DECIMAL(18,6) NULL;
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID(N'dbo.SalesOrderItems') AND name=N'unitPrice' AND scale<6)
  ALTER TABLE dbo.SalesOrderItems ALTER COLUMN unitPrice DECIMAL(18,6) NOT NULL;

IF OBJECT_ID(N'dbo.Suppliers', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.Suppliers (
    id INT IDENTITY PRIMARY KEY,
    code VARCHAR(MAX) NULL,
    name NVARCHAR(180) NOT NULL,shortName NVARCHAR(80) NOT NULL,businessStyle NVARCHAR(180) NOT NULL,address NVARCHAR(500) NOT NULL,
    remarks NVARCHAR(2000) NULL,tin NVARCHAR(50) NULL,contactPerson NVARCHAR(150) NULL,
    email NVARCHAR(254) NULL,countryOfOrigin NVARCHAR(100) NULL,country NVARCHAR(100) NULL,
    cpnumber NVARCHAR(30) NULL,faxNo NVARCHAR(30) NULL,
    decimalInPrice INT NOT NULL,decimalInTotalPrice INT NOT NULL,paymentTerm NVARCHAR(100) NULL,
    vatCode NVARCHAR(80) NOT NULL,vatInclusive BIT NOT NULL,taxCode NVARCHAR(80) NULL,
    isActive BIT NOT NULL,createdAt DATETIME2 NOT NULL,updatedAt DATETIME2 NOT NULL
  );
END;

IF OBJECT_ID(N'dbo.Supplies', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.Supplies (
    id INT IDENTITY PRIMARY KEY,
    code VARCHAR(MAX) NULL,
    productId INT NULL REFERENCES dbo.Products(id),maker NVARCHAR(150) NULL,name NVARCHAR(180) NOT NULL,
    description NVARCHAR(1000) NULL,remarks NVARCHAR(2000) NULL,minimumStock DECIMAL(18,6) NULL,
    color NVARCHAR(80) NULL,thickness DECIMAL(18,6) NULL,unit NVARCHAR(30) NOT NULL,
    netWeight DECIMAL(18,6) NULL,weightUnit NVARCHAR(30) NULL,category NVARCHAR(100) NULL,
    inventorySetup NVARCHAR(20) NULL,isActive BIT NOT NULL,
    createdAt DATETIME2 NOT NULL,updatedAt DATETIME2 NOT NULL
  );
END;

IF OBJECT_ID(N'dbo.SupplyInventorySchedules', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.SupplyInventorySchedules (
    suppliesId INT NOT NULL REFERENCES dbo.Supplies(id) ON DELETE CASCADE,position INT NOT NULL,scheduleDate DATE NULL,month NVARCHAR(40) NULL,
    CONSTRAINT PK_SupplyInventorySchedules PRIMARY KEY(suppliesId,position)
  );
END;

IF OBJECT_ID(N'dbo.SupplySuppliers', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.SupplySuppliers (
    suppliesId INT NOT NULL REFERENCES dbo.Supplies(id) ON DELETE CASCADE,position INT NOT NULL,supplierId INT NOT NULL REFERENCES dbo.Suppliers(id),
    moq DECIMAL(18,6) NULL,price DECIMAL(19,6) NULL,currency NVARCHAR(30) NULL,remarks NVARCHAR(2000) NULL,
    CONSTRAINT PK_SupplySuppliers PRIMARY KEY(suppliesId,position),CONSTRAINT UQ_SupplySuppliers UNIQUE(suppliesId,supplierId)
  );
END;

IF OBJECT_ID(N'dbo.ProductSupplies', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.ProductSupplies (
    productId INT NOT NULL REFERENCES dbo.Products(id) ON DELETE CASCADE,position INT NOT NULL,suppliesId INT NOT NULL REFERENCES dbo.Supplies(id),
    quantity DECIMAL(18,6) NOT NULL,unit NVARCHAR(30) NOT NULL,
    CONSTRAINT PK_ProductSupplies PRIMARY KEY(productId,position),CONSTRAINT UQ_ProductSupplies UNIQUE(productId,suppliesId)
  );
END;

IF OBJECT_ID(N'dbo.PurchaseRequests', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.PurchaseRequests (
    id INT IDENTITY PRIMARY KEY,number NVARCHAR(40) NOT NULL UNIQUE,branch NVARCHAR(150) NOT NULL,
    prDate DATE NOT NULL,neededDate DATE NOT NULL,requestedBy NVARCHAR(150) NULL,requestedDept NVARCHAR(150) NULL,
    checkedBy NVARCHAR(150) NULL,approvedBy NVARCHAR(150) NULL,approvedBy2 NVARCHAR(150) NULL,
    remarks NVARCHAR(2000) NULL,preparedById INT NOT NULL REFERENCES dbo.PurchasingUserLogin(id),preparedBy NVARCHAR(150) NOT NULL,
    status NVARCHAR(20) NOT NULL,postedById INT NULL REFERENCES dbo.PurchasingUserLogin(id),postedAt DATETIME2 NULL,
    createdAt DATETIME2 NOT NULL,updatedAt DATETIME2 NOT NULL
  );
END;

IF OBJECT_ID(N'dbo.PurchaseRequestItems', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.PurchaseRequestItems (
    id INT IDENTITY PRIMARY KEY,requestId INT NOT NULL REFERENCES dbo.PurchaseRequests(id),position INT NOT NULL,
    suppliesId INT NOT NULL REFERENCES dbo.Supplies(id),suppliesCode NVARCHAR(40) NOT NULL,suppliesName NVARCHAR(180) NOT NULL,description NVARCHAR(1000) NULL,
    quantity DECIMAL(18,6) NOT NULL,unit NVARCHAR(30) NOT NULL,neededDate DATE NULL,remarks NVARCHAR(2000) NULL,
    CONSTRAINT UQ_PurchaseRequestItems_Position UNIQUE(requestId,position)
  );
END;

IF OBJECT_ID(N'dbo.PurchaseOrders', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.PurchaseOrders (
    id INT IDENTITY PRIMARY KEY,number VARCHAR(MAX) NULL,
    branch NVARCHAR(150) NOT NULL,supplierId INT NOT NULL REFERENCES dbo.Suppliers(id),supplierName NVARCHAR(180) NOT NULL,
    supplierAddress NVARCHAR(500) NOT NULL,supplierContactPerson NVARCHAR(150) NULL,poDate DATE NOT NULL,deliveryDate DATE NOT NULL,
    currency NVARCHAR(30) NOT NULL,rate DECIMAL(18,5) NOT NULL,paymentTerm NVARCHAR(100) NOT NULL,shipment NVARCHAR(20) NOT NULL,
    suppliesCategory NVARCHAR(100) NULL,vatCode NVARCHAR(80) NOT NULL,vatRate DECIMAL(9,6) NOT NULL,vatInclusive BIT NOT NULL,
    decimalInPrice INT NOT NULL,decimalInTotalPrice INT NOT NULL,deliveryAddress NVARCHAR(500) NULL,remarks NVARCHAR(2000) NULL,
    grossAmount DECIMAL(20,6) NOT NULL,discountAmount DECIMAL(20,6) NOT NULL,netAmount DECIMAL(20,6) NOT NULL,vatAmount DECIMAL(20,6) NOT NULL,amount DECIMAL(20,6) NOT NULL,
    preparedById INT NOT NULL REFERENCES dbo.PurchasingUserLogin(id),preparedBy NVARCHAR(150) NOT NULL,status NVARCHAR(20) NOT NULL,
    postedById INT NULL REFERENCES dbo.PurchasingUserLogin(id),postedAt DATETIME2 NULL,createdAt DATETIME2 NOT NULL,updatedAt DATETIME2 NOT NULL
  );
END;

IF OBJECT_ID(N'dbo.PurchaseOrderItems', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.PurchaseOrderItems (
    id INT IDENTITY PRIMARY KEY,orderId INT NOT NULL REFERENCES dbo.PurchaseOrders(id),position INT NOT NULL,
    requestItemId INT NOT NULL REFERENCES dbo.PurchaseRequestItems(id),suppliesId INT NOT NULL REFERENCES dbo.Supplies(id),
    suppliesCode NVARCHAR(40) NOT NULL,suppliesName NVARCHAR(180) NOT NULL,description NVARCHAR(1000) NULL,unit NVARCHAR(30) NOT NULL,
    quantity DECIMAL(18,6) NOT NULL,unitPrice DECIMAL(19,6) NOT NULL,currency NVARCHAR(30) NOT NULL,discountRate DECIMAL(9,6) NULL,vatRate DECIMAL(9,6) NOT NULL,
    grossAmount DECIMAL(20,6) NOT NULL,discountAmount DECIMAL(20,6) NOT NULL,netAmount DECIMAL(20,6) NOT NULL,vatAmount DECIMAL(20,6) NOT NULL,amount DECIMAL(20,6) NOT NULL,
    remarks NVARCHAR(2000) NULL,CONSTRAINT UQ_PurchaseOrderItems_Source UNIQUE(orderId,requestItemId)
  );
END;

IF OBJECT_ID(N'dbo.SuppliesReceipts', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.SuppliesReceipts (
    id INT IDENTITY PRIMARY KEY,number VARCHAR(MAX) NULL,
    purchaseOrderId INT NOT NULL REFERENCES dbo.PurchaseOrders(id),srrDate DATE NOT NULL,drNumber NVARCHAR(80) NULL,pezaReference NVARCHAR(80) NULL,
    invoiceNumber NVARCHAR(80) NOT NULL,invoiceDate DATE NULL,rate DECIMAL(18,5) NOT NULL,remarks NVARCHAR(2000) NULL,
    grossAmount DECIMAL(20,6) NOT NULL,discountAmount DECIMAL(20,6) NOT NULL,netAmount DECIMAL(20,6) NOT NULL,vatAmount DECIMAL(20,6) NOT NULL,amount DECIMAL(20,6) NOT NULL,
    receivedById INT NOT NULL REFERENCES dbo.PurchasingUserLogin(id),receivedBy NVARCHAR(150) NOT NULL,status NVARCHAR(20) NOT NULL,
    postedById INT NULL REFERENCES dbo.PurchasingUserLogin(id),postedAt DATETIME2 NULL,createdAt DATETIME2 NOT NULL,updatedAt DATETIME2 NOT NULL
  );
END;

IF OBJECT_ID(N'dbo.SuppliesReceiptItems', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.SuppliesReceiptItems (
    id INT IDENTITY PRIMARY KEY,receiptId INT NOT NULL REFERENCES dbo.SuppliesReceipts(id),position INT NOT NULL,
    orderItemId INT NOT NULL REFERENCES dbo.PurchaseOrderItems(id),quantity DECIMAL(18,6) NOT NULL,remarks NVARCHAR(2000) NULL,
    grossAmount DECIMAL(20,6) NOT NULL,discountAmount DECIMAL(20,6) NOT NULL,netAmount DECIMAL(20,6) NOT NULL,vatAmount DECIMAL(20,6) NOT NULL,amount DECIMAL(20,6) NOT NULL,
    CONSTRAINT UQ_SuppliesReceiptItems_Source UNIQUE(receiptId,orderItemId)
  );
END;

IF OBJECT_ID(N'dbo.SuppliesReceiptAllocations', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.SuppliesReceiptAllocations (
    id INT IDENTITY PRIMARY KEY,receiptItemId INT NOT NULL REFERENCES dbo.SuppliesReceiptItems(id),position INT NOT NULL,
    quantity DECIMAL(18,6) NOT NULL,expiryDate DATE NULL,mfgDate DATE NULL,imLot NVARCHAR(100) NULL,qcStatus NVARCHAR(50) NULL,
    warehouseId INT NULL REFERENCES dbo.ConfigWarehouses(id),locationId INT NULL REFERENCES dbo.ConfigLocations(id),
    CONSTRAINT UQ_SuppliesReceiptAllocations_Position UNIQUE(receiptItemId,position)
  );
END;

IF OBJECT_ID(N'dbo.SupplyInventory', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.SupplyInventory (
    id INT IDENTITY PRIMARY KEY,suppliesId INT NOT NULL REFERENCES dbo.Supplies(id),warehouseId INT NOT NULL REFERENCES dbo.ConfigWarehouses(id),
    locationId INT NOT NULL REFERENCES dbo.ConfigLocations(id),imLot NVARCHAR(100) NULL,qcStatus NVARCHAR(50) NULL,expiryDate DATE NULL,mfgDate DATE NULL,
    quantity DECIMAL(18,6) NOT NULL,updatedAt DATETIME2 NOT NULL,
    CONSTRAINT UQ_SupplyInventory_Lot UNIQUE(suppliesId,warehouseId,locationId,imLot,qcStatus,expiryDate,mfgDate)
  );
END;

IF OBJECT_ID(N'dbo.SupplyStockMovements', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.SupplyStockMovements (
    id INT IDENTITY PRIMARY KEY,receiptId INT NOT NULL REFERENCES dbo.SuppliesReceipts(id),receiptItemId INT NOT NULL REFERENCES dbo.SuppliesReceiptItems(id),
    allocationId INT NOT NULL UNIQUE REFERENCES dbo.SuppliesReceiptAllocations(id),inventoryId INT NOT NULL REFERENCES dbo.SupplyInventory(id),quantity DECIMAL(18,6) NOT NULL,
    createdById INT NOT NULL REFERENCES dbo.PurchasingUserLogin(id),createdAt DATETIME2 NOT NULL
  );
END;

-- Product additions retain the existing finished-product stock and sales fields.
IF COL_LENGTH(N'dbo.Products', N'revision') IS NULL
  ALTER TABLE dbo.Products ADD revision NVARCHAR(30) NULL;
IF COL_LENGTH(N'dbo.Products', N'secondaryUnit') IS NULL
  ALTER TABLE dbo.Products ADD secondaryUnit NVARCHAR(30) NULL;
IF COL_LENGTH(N'dbo.Products', N'quantityPerSecondaryUnit') IS NULL
  ALTER TABLE dbo.Products ADD quantityPerSecondaryUnit DECIMAL(18,6) NULL;
IF COL_LENGTH(N'dbo.Products', N'moq') IS NULL
  ALTER TABLE dbo.Products ADD moq DECIMAL(18,6) NULL;
IF COL_LENGTH(N'dbo.Products', N'spq') IS NULL
  ALTER TABLE dbo.Products ADD spq DECIMAL(18,6) NULL;
IF COL_LENGTH(N'dbo.Products', N'vatMode') IS NULL
  ALTER TABLE dbo.Products ADD vatMode NVARCHAR(20) NULL;
IF COL_LENGTH(N'dbo.Products', N'unitCost') IS NULL
  ALTER TABLE dbo.Products ADD unitCost DECIMAL(18,6) NULL;
IF COL_LENGTH(N'dbo.Products', N'currency') IS NULL
BEGIN
  ALTER TABLE dbo.Products ADD currency NVARCHAR(30) NULL;
  EXEC(N'UPDATE dbo.Products SET currency=N'''' WHERE currency IS NULL;');
  ALTER TABLE dbo.Products ALTER COLUMN currency NVARCHAR(30) NOT NULL;
END;
IF COL_LENGTH(N'dbo.Products', N'currency') BETWEEN 0 AND 59
  ALTER TABLE dbo.Products ALTER COLUMN currency NVARCHAR(30) NOT NULL;
IF COL_LENGTH(N'dbo.Products', N'model') IS NULL
  ALTER TABLE dbo.Products ADD model NVARCHAR(150) NULL;
IF COL_LENGTH(N'dbo.Products', N'category') IS NULL
  ALTER TABLE dbo.Products ADD category NVARCHAR(100) NULL;
IF COL_LENGTH(N'dbo.Products', N'divisor') IS NULL
  ALTER TABLE dbo.Products ADD divisor DECIMAL(18,6) NULL;
IF COL_LENGTH(N'dbo.Products', N'remarks') IS NULL
  ALTER TABLE dbo.Products ADD remarks NVARCHAR(2000) NULL;
IF COL_LENGTH(N'dbo.Products', N'weight') IS NULL
  ALTER TABLE dbo.Products ADD weight DECIMAL(18,6) NULL;
IF COL_LENGTH(N'dbo.Products', N'productHeaderId') IS NULL
  ALTER TABLE dbo.Products ADD productHeaderId INT NULL;
IF COL_LENGTH(N'dbo.Products', N'tagColor') IS NULL
  ALTER TABLE dbo.Products ADD tagColor NVARCHAR(30) NULL;
IF COL_LENGTH(N'dbo.Products', N'inventorySetup') IS NULL
  ALTER TABLE dbo.Products ADD inventorySetup NVARCHAR(20) NULL;
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name=N'FK_Products_Header' AND parent_object_id=OBJECT_ID(N'dbo.Products'))
  EXEC(N'ALTER TABLE dbo.Products ADD CONSTRAINT FK_Products_Header FOREIGN KEY(productHeaderId) REFERENCES dbo.Products(id)');

IF OBJECT_ID(N'dbo.ProductProcesses', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.ProductProcesses (
    productId INT NOT NULL REFERENCES dbo.Products(id) ON DELETE CASCADE,
    position INT NOT NULL,
    name NVARCHAR(150) NOT NULL,
    CONSTRAINT PK_ProductProcesses PRIMARY KEY(productId,position)
  );
END;
IF OBJECT_ID(N'dbo.ProductCustomerApprovals', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.ProductCustomerApprovals (
    productId INT NOT NULL REFERENCES dbo.Products(id) ON DELETE CASCADE,
    position INT NOT NULL,
    customerId INT NOT NULL REFERENCES dbo.Customers(id),
    approvalDate DATE NULL,
    approvalRemarks NVARCHAR(2000) NULL,
    CONSTRAINT PK_ProductCustomerApprovals PRIMARY KEY(productId,position),
    CONSTRAINT UQ_ProductCustomerApprovals_Customer UNIQUE(productId,customerId)
  );
END;

IF OBJECT_ID(N'dbo.ProductInventorySchedules', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.ProductInventorySchedules (
    productId INT NOT NULL REFERENCES dbo.Products(id) ON DELETE CASCADE,
    position INT NOT NULL,
    scheduleDate DATE NULL,
    month NVARCHAR(40) NULL,
    CONSTRAINT PK_ProductInventorySchedules PRIMARY KEY(productId,position)
  );
END;

-- Existing Purchasing records must reference Purchasing accounts, never Sales.
BEGIN TRY
  BEGIN TRANSACTION;
    DECLARE @wrongUserFk_PurchaseRequests_preparedById sysname;
    SELECT TOP(1) @wrongUserFk_PurchaseRequests_preparedById=f.name FROM sys.foreign_keys f
    JOIN sys.foreign_key_columns c ON c.constraint_object_id=f.object_id
    JOIN sys.columns p ON p.object_id=c.parent_object_id AND p.column_id=c.parent_column_id
    WHERE f.parent_object_id=OBJECT_ID(N'dbo.PurchaseRequests') AND p.name=N'preparedById' AND f.referenced_object_id<>OBJECT_ID(N'dbo.PurchasingUserLogin');
    WHILE @wrongUserFk_PurchaseRequests_preparedById IS NOT NULL
    BEGIN
      DECLARE @dropUserFk_PurchaseRequests_preparedById NVARCHAR(500)=N'ALTER TABLE dbo.PurchaseRequests DROP CONSTRAINT '+QUOTENAME(@wrongUserFk_PurchaseRequests_preparedById);
      EXEC(@dropUserFk_PurchaseRequests_preparedById);
      SET @wrongUserFk_PurchaseRequests_preparedById=NULL;
      SELECT TOP(1) @wrongUserFk_PurchaseRequests_preparedById=f.name FROM sys.foreign_keys f
      JOIN sys.foreign_key_columns c ON c.constraint_object_id=f.object_id
      JOIN sys.columns p ON p.object_id=c.parent_object_id AND p.column_id=c.parent_column_id
      WHERE f.parent_object_id=OBJECT_ID(N'dbo.PurchaseRequests') AND p.name=N'preparedById' AND f.referenced_object_id<>OBJECT_ID(N'dbo.PurchasingUserLogin');
    END;
    IF NOT EXISTS(SELECT 1 FROM sys.foreign_keys f JOIN sys.foreign_key_columns c ON c.constraint_object_id=f.object_id
      JOIN sys.columns p ON p.object_id=c.parent_object_id AND p.column_id=c.parent_column_id
      WHERE f.parent_object_id=OBJECT_ID(N'dbo.PurchaseRequests') AND p.name=N'preparedById' AND f.referenced_object_id=OBJECT_ID(N'dbo.PurchasingUserLogin'))
      ALTER TABLE dbo.PurchaseRequests WITH CHECK ADD CONSTRAINT FK_PurchaseRequests_preparedById_PurchasingUser FOREIGN KEY(preparedById) REFERENCES dbo.PurchasingUserLogin(id);

    DECLARE @wrongUserFk_PurchaseRequests_postedById sysname;
    SELECT TOP(1) @wrongUserFk_PurchaseRequests_postedById=f.name FROM sys.foreign_keys f
    JOIN sys.foreign_key_columns c ON c.constraint_object_id=f.object_id
    JOIN sys.columns p ON p.object_id=c.parent_object_id AND p.column_id=c.parent_column_id
    WHERE f.parent_object_id=OBJECT_ID(N'dbo.PurchaseRequests') AND p.name=N'postedById' AND f.referenced_object_id<>OBJECT_ID(N'dbo.PurchasingUserLogin');
    WHILE @wrongUserFk_PurchaseRequests_postedById IS NOT NULL
    BEGIN
      DECLARE @dropUserFk_PurchaseRequests_postedById NVARCHAR(500)=N'ALTER TABLE dbo.PurchaseRequests DROP CONSTRAINT '+QUOTENAME(@wrongUserFk_PurchaseRequests_postedById);
      EXEC(@dropUserFk_PurchaseRequests_postedById);
      SET @wrongUserFk_PurchaseRequests_postedById=NULL;
      SELECT TOP(1) @wrongUserFk_PurchaseRequests_postedById=f.name FROM sys.foreign_keys f
      JOIN sys.foreign_key_columns c ON c.constraint_object_id=f.object_id
      JOIN sys.columns p ON p.object_id=c.parent_object_id AND p.column_id=c.parent_column_id
      WHERE f.parent_object_id=OBJECT_ID(N'dbo.PurchaseRequests') AND p.name=N'postedById' AND f.referenced_object_id<>OBJECT_ID(N'dbo.PurchasingUserLogin');
    END;
    IF NOT EXISTS(SELECT 1 FROM sys.foreign_keys f JOIN sys.foreign_key_columns c ON c.constraint_object_id=f.object_id
      JOIN sys.columns p ON p.object_id=c.parent_object_id AND p.column_id=c.parent_column_id
      WHERE f.parent_object_id=OBJECT_ID(N'dbo.PurchaseRequests') AND p.name=N'postedById' AND f.referenced_object_id=OBJECT_ID(N'dbo.PurchasingUserLogin'))
      ALTER TABLE dbo.PurchaseRequests WITH CHECK ADD CONSTRAINT FK_PurchaseRequests_postedById_PurchasingUser FOREIGN KEY(postedById) REFERENCES dbo.PurchasingUserLogin(id);

    DECLARE @wrongUserFk_PurchaseOrders_preparedById sysname;
    SELECT TOP(1) @wrongUserFk_PurchaseOrders_preparedById=f.name FROM sys.foreign_keys f
    JOIN sys.foreign_key_columns c ON c.constraint_object_id=f.object_id
    JOIN sys.columns p ON p.object_id=c.parent_object_id AND p.column_id=c.parent_column_id
    WHERE f.parent_object_id=OBJECT_ID(N'dbo.PurchaseOrders') AND p.name=N'preparedById' AND f.referenced_object_id<>OBJECT_ID(N'dbo.PurchasingUserLogin');
    WHILE @wrongUserFk_PurchaseOrders_preparedById IS NOT NULL
    BEGIN
      DECLARE @dropUserFk_PurchaseOrders_preparedById NVARCHAR(500)=N'ALTER TABLE dbo.PurchaseOrders DROP CONSTRAINT '+QUOTENAME(@wrongUserFk_PurchaseOrders_preparedById);
      EXEC(@dropUserFk_PurchaseOrders_preparedById);
      SET @wrongUserFk_PurchaseOrders_preparedById=NULL;
      SELECT TOP(1) @wrongUserFk_PurchaseOrders_preparedById=f.name FROM sys.foreign_keys f
      JOIN sys.foreign_key_columns c ON c.constraint_object_id=f.object_id
      JOIN sys.columns p ON p.object_id=c.parent_object_id AND p.column_id=c.parent_column_id
      WHERE f.parent_object_id=OBJECT_ID(N'dbo.PurchaseOrders') AND p.name=N'preparedById' AND f.referenced_object_id<>OBJECT_ID(N'dbo.PurchasingUserLogin');
    END;
    IF NOT EXISTS(SELECT 1 FROM sys.foreign_keys f JOIN sys.foreign_key_columns c ON c.constraint_object_id=f.object_id
      JOIN sys.columns p ON p.object_id=c.parent_object_id AND p.column_id=c.parent_column_id
      WHERE f.parent_object_id=OBJECT_ID(N'dbo.PurchaseOrders') AND p.name=N'preparedById' AND f.referenced_object_id=OBJECT_ID(N'dbo.PurchasingUserLogin'))
      ALTER TABLE dbo.PurchaseOrders WITH CHECK ADD CONSTRAINT FK_PurchaseOrders_preparedById_PurchasingUser FOREIGN KEY(preparedById) REFERENCES dbo.PurchasingUserLogin(id);

    DECLARE @wrongUserFk_PurchaseOrders_postedById sysname;
    SELECT TOP(1) @wrongUserFk_PurchaseOrders_postedById=f.name FROM sys.foreign_keys f
    JOIN sys.foreign_key_columns c ON c.constraint_object_id=f.object_id
    JOIN sys.columns p ON p.object_id=c.parent_object_id AND p.column_id=c.parent_column_id
    WHERE f.parent_object_id=OBJECT_ID(N'dbo.PurchaseOrders') AND p.name=N'postedById' AND f.referenced_object_id<>OBJECT_ID(N'dbo.PurchasingUserLogin');
    WHILE @wrongUserFk_PurchaseOrders_postedById IS NOT NULL
    BEGIN
      DECLARE @dropUserFk_PurchaseOrders_postedById NVARCHAR(500)=N'ALTER TABLE dbo.PurchaseOrders DROP CONSTRAINT '+QUOTENAME(@wrongUserFk_PurchaseOrders_postedById);
      EXEC(@dropUserFk_PurchaseOrders_postedById);
      SET @wrongUserFk_PurchaseOrders_postedById=NULL;
      SELECT TOP(1) @wrongUserFk_PurchaseOrders_postedById=f.name FROM sys.foreign_keys f
      JOIN sys.foreign_key_columns c ON c.constraint_object_id=f.object_id
      JOIN sys.columns p ON p.object_id=c.parent_object_id AND p.column_id=c.parent_column_id
      WHERE f.parent_object_id=OBJECT_ID(N'dbo.PurchaseOrders') AND p.name=N'postedById' AND f.referenced_object_id<>OBJECT_ID(N'dbo.PurchasingUserLogin');
    END;
    IF NOT EXISTS(SELECT 1 FROM sys.foreign_keys f JOIN sys.foreign_key_columns c ON c.constraint_object_id=f.object_id
      JOIN sys.columns p ON p.object_id=c.parent_object_id AND p.column_id=c.parent_column_id
      WHERE f.parent_object_id=OBJECT_ID(N'dbo.PurchaseOrders') AND p.name=N'postedById' AND f.referenced_object_id=OBJECT_ID(N'dbo.PurchasingUserLogin'))
      ALTER TABLE dbo.PurchaseOrders WITH CHECK ADD CONSTRAINT FK_PurchaseOrders_postedById_PurchasingUser FOREIGN KEY(postedById) REFERENCES dbo.PurchasingUserLogin(id);

    DECLARE @wrongUserFk_SuppliesReceipts_receivedById sysname;
    SELECT TOP(1) @wrongUserFk_SuppliesReceipts_receivedById=f.name FROM sys.foreign_keys f
    JOIN sys.foreign_key_columns c ON c.constraint_object_id=f.object_id
    JOIN sys.columns p ON p.object_id=c.parent_object_id AND p.column_id=c.parent_column_id
    WHERE f.parent_object_id=OBJECT_ID(N'dbo.SuppliesReceipts') AND p.name=N'receivedById' AND f.referenced_object_id<>OBJECT_ID(N'dbo.PurchasingUserLogin');
    WHILE @wrongUserFk_SuppliesReceipts_receivedById IS NOT NULL
    BEGIN
      DECLARE @dropUserFk_SuppliesReceipts_receivedById NVARCHAR(500)=N'ALTER TABLE dbo.SuppliesReceipts DROP CONSTRAINT '+QUOTENAME(@wrongUserFk_SuppliesReceipts_receivedById);
      EXEC(@dropUserFk_SuppliesReceipts_receivedById);
      SET @wrongUserFk_SuppliesReceipts_receivedById=NULL;
      SELECT TOP(1) @wrongUserFk_SuppliesReceipts_receivedById=f.name FROM sys.foreign_keys f
      JOIN sys.foreign_key_columns c ON c.constraint_object_id=f.object_id
      JOIN sys.columns p ON p.object_id=c.parent_object_id AND p.column_id=c.parent_column_id
      WHERE f.parent_object_id=OBJECT_ID(N'dbo.SuppliesReceipts') AND p.name=N'receivedById' AND f.referenced_object_id<>OBJECT_ID(N'dbo.PurchasingUserLogin');
    END;
    IF NOT EXISTS(SELECT 1 FROM sys.foreign_keys f JOIN sys.foreign_key_columns c ON c.constraint_object_id=f.object_id
      JOIN sys.columns p ON p.object_id=c.parent_object_id AND p.column_id=c.parent_column_id
      WHERE f.parent_object_id=OBJECT_ID(N'dbo.SuppliesReceipts') AND p.name=N'receivedById' AND f.referenced_object_id=OBJECT_ID(N'dbo.PurchasingUserLogin'))
      ALTER TABLE dbo.SuppliesReceipts WITH CHECK ADD CONSTRAINT FK_SuppliesReceipts_receivedById_PurchasingUser FOREIGN KEY(receivedById) REFERENCES dbo.PurchasingUserLogin(id);

    DECLARE @wrongUserFk_SuppliesReceipts_postedById sysname;
    SELECT TOP(1) @wrongUserFk_SuppliesReceipts_postedById=f.name FROM sys.foreign_keys f
    JOIN sys.foreign_key_columns c ON c.constraint_object_id=f.object_id
    JOIN sys.columns p ON p.object_id=c.parent_object_id AND p.column_id=c.parent_column_id
    WHERE f.parent_object_id=OBJECT_ID(N'dbo.SuppliesReceipts') AND p.name=N'postedById' AND f.referenced_object_id<>OBJECT_ID(N'dbo.PurchasingUserLogin');
    WHILE @wrongUserFk_SuppliesReceipts_postedById IS NOT NULL
    BEGIN
      DECLARE @dropUserFk_SuppliesReceipts_postedById NVARCHAR(500)=N'ALTER TABLE dbo.SuppliesReceipts DROP CONSTRAINT '+QUOTENAME(@wrongUserFk_SuppliesReceipts_postedById);
      EXEC(@dropUserFk_SuppliesReceipts_postedById);
      SET @wrongUserFk_SuppliesReceipts_postedById=NULL;
      SELECT TOP(1) @wrongUserFk_SuppliesReceipts_postedById=f.name FROM sys.foreign_keys f
      JOIN sys.foreign_key_columns c ON c.constraint_object_id=f.object_id
      JOIN sys.columns p ON p.object_id=c.parent_object_id AND p.column_id=c.parent_column_id
      WHERE f.parent_object_id=OBJECT_ID(N'dbo.SuppliesReceipts') AND p.name=N'postedById' AND f.referenced_object_id<>OBJECT_ID(N'dbo.PurchasingUserLogin');
    END;
    IF NOT EXISTS(SELECT 1 FROM sys.foreign_keys f JOIN sys.foreign_key_columns c ON c.constraint_object_id=f.object_id
      JOIN sys.columns p ON p.object_id=c.parent_object_id AND p.column_id=c.parent_column_id
      WHERE f.parent_object_id=OBJECT_ID(N'dbo.SuppliesReceipts') AND p.name=N'postedById' AND f.referenced_object_id=OBJECT_ID(N'dbo.PurchasingUserLogin'))
      ALTER TABLE dbo.SuppliesReceipts WITH CHECK ADD CONSTRAINT FK_SuppliesReceipts_postedById_PurchasingUser FOREIGN KEY(postedById) REFERENCES dbo.PurchasingUserLogin(id);

    DECLARE @wrongUserFk_SupplyStockMovements_createdById sysname;
    SELECT TOP(1) @wrongUserFk_SupplyStockMovements_createdById=f.name FROM sys.foreign_keys f
    JOIN sys.foreign_key_columns c ON c.constraint_object_id=f.object_id
    JOIN sys.columns p ON p.object_id=c.parent_object_id AND p.column_id=c.parent_column_id
    WHERE f.parent_object_id=OBJECT_ID(N'dbo.SupplyStockMovements') AND p.name=N'createdById' AND f.referenced_object_id<>OBJECT_ID(N'dbo.PurchasingUserLogin');
    WHILE @wrongUserFk_SupplyStockMovements_createdById IS NOT NULL
    BEGIN
      DECLARE @dropUserFk_SupplyStockMovements_createdById NVARCHAR(500)=N'ALTER TABLE dbo.SupplyStockMovements DROP CONSTRAINT '+QUOTENAME(@wrongUserFk_SupplyStockMovements_createdById);
      EXEC(@dropUserFk_SupplyStockMovements_createdById);
      SET @wrongUserFk_SupplyStockMovements_createdById=NULL;
      SELECT TOP(1) @wrongUserFk_SupplyStockMovements_createdById=f.name FROM sys.foreign_keys f
      JOIN sys.foreign_key_columns c ON c.constraint_object_id=f.object_id
      JOIN sys.columns p ON p.object_id=c.parent_object_id AND p.column_id=c.parent_column_id
      WHERE f.parent_object_id=OBJECT_ID(N'dbo.SupplyStockMovements') AND p.name=N'createdById' AND f.referenced_object_id<>OBJECT_ID(N'dbo.PurchasingUserLogin');
    END;
    IF NOT EXISTS(SELECT 1 FROM sys.foreign_keys f JOIN sys.foreign_key_columns c ON c.constraint_object_id=f.object_id
      JOIN sys.columns p ON p.object_id=c.parent_object_id AND p.column_id=c.parent_column_id
      WHERE f.parent_object_id=OBJECT_ID(N'dbo.SupplyStockMovements') AND p.name=N'createdById' AND f.referenced_object_id=OBJECT_ID(N'dbo.PurchasingUserLogin'))
      ALTER TABLE dbo.SupplyStockMovements WITH CHECK ADD CONSTRAINT FK_SupplyStockMovements_createdById_PurchasingUser FOREIGN KEY(createdById) REFERENCES dbo.PurchasingUserLogin(id);
  COMMIT TRANSACTION;
END TRY
BEGIN CATCH
  IF XACT_STATE()<>0 ROLLBACK TRANSACTION;
  THROW;
END CATCH;

IF COL_LENGTH(N'dbo.SalesOrders', N'currency') IS NULL
BEGIN
  ALTER TABLE dbo.SalesOrders ADD currency NVARCHAR(30) NULL;
  EXEC(N'UPDATE dbo.SalesOrders SET currency=N''PHP'' WHERE currency IS NULL;');
  ALTER TABLE dbo.SalesOrders ALTER COLUMN currency NVARCHAR(30) NOT NULL;
END;
