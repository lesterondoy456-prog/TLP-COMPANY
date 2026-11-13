SET XACT_ABORT ON;

IF COL_LENGTH(N'dbo.SalesOrders',N'currency') IS NULL
  ALTER TABLE dbo.SalesOrders ADD currency NVARCHAR(30) NOT NULL CONSTRAINT DF_SalesOrders_Currency DEFAULT N'PHP';

-- Preserve six-decimal prices for existing installations as well as new tables.
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID(N'dbo.SupplySuppliers') AND name=N'price' AND scale<6)
BEGIN
  BEGIN TRY
    BEGIN TRANSACTION;
    IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID(N'dbo.SupplySuppliers') AND name=N'CK_SupplySuppliers_Amounts')
      ALTER TABLE dbo.SupplySuppliers DROP CONSTRAINT CK_SupplySuppliers_Amounts;
    DECLARE @priceDefault_SupplySuppliers sysname;
    SELECT @priceDefault_SupplySuppliers=d.name FROM sys.default_constraints d JOIN sys.columns c
      ON c.object_id=d.parent_object_id AND c.column_id=d.parent_column_id
      WHERE d.parent_object_id=OBJECT_ID(N'dbo.SupplySuppliers') AND c.name=N'price';
    IF @priceDefault_SupplySuppliers IS NOT NULL
    BEGIN
      DECLARE @dropPriceDefault_SupplySuppliers NVARCHAR(500)=N'ALTER TABLE dbo.SupplySuppliers DROP CONSTRAINT '+QUOTENAME(@priceDefault_SupplySuppliers);
      EXEC(@dropPriceDefault_SupplySuppliers);
    END;
    ALTER TABLE dbo.SupplySuppliers ALTER COLUMN price DECIMAL(19,6) NOT NULL;
    ALTER TABLE dbo.SupplySuppliers ADD CONSTRAINT CK_SupplySuppliers_Amounts CHECK(moq>=0 AND price>=0);
    ALTER TABLE dbo.SupplySuppliers ADD CONSTRAINT DF_SupplySuppliers_Price DEFAULT 0 FOR price;
    COMMIT TRANSACTION;
  END TRY
  BEGIN CATCH
    IF XACT_STATE()<>0 ROLLBACK TRANSACTION;
    THROW;
  END CATCH;
END;

IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID(N'dbo.PurchaseOrderItems') AND name=N'unitPrice' AND scale<6)
BEGIN
  BEGIN TRY
    BEGIN TRANSACTION;
    IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID(N'dbo.PurchaseOrderItems') AND name=N'CK_PurchaseOrderItems_Quantity')
      ALTER TABLE dbo.PurchaseOrderItems DROP CONSTRAINT CK_PurchaseOrderItems_Quantity;
    ALTER TABLE dbo.PurchaseOrderItems ALTER COLUMN unitPrice DECIMAL(19,6) NOT NULL;
    ALTER TABLE dbo.PurchaseOrderItems ADD CONSTRAINT CK_PurchaseOrderItems_Quantity CHECK(quantity>0 AND unitPrice>=0 AND discountRate BETWEEN 0 AND 100);
    COMMIT TRANSACTION;
  END TRY
  BEGIN CATCH
    IF XACT_STATE()<>0 ROLLBACK TRANSACTION;
    THROW;
  END CATCH;
END;

IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID(N'dbo.Products') AND name=N'price' AND scale<6)
BEGIN
  BEGIN TRY
    BEGIN TRANSACTION;
    IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID(N'dbo.Products') AND name=N'CK_Products_Price')
      ALTER TABLE dbo.Products DROP CONSTRAINT CK_Products_Price;
    ALTER TABLE dbo.Products ALTER COLUMN price DECIMAL(18,6) NOT NULL;
    ALTER TABLE dbo.Products ADD CONSTRAINT CK_Products_Price CHECK(price>=0);
    COMMIT TRANSACTION;
  END TRY
  BEGIN CATCH
    IF XACT_STATE()<>0 ROLLBACK TRANSACTION;
    THROW;
  END CATCH;
END;

IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID(N'dbo.SalesOrderItems') AND name=N'unitPrice' AND scale<6)
BEGIN
  BEGIN TRY
    BEGIN TRANSACTION;
    IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID(N'dbo.SalesOrderItems') AND name=N'CK_SalesOrderItems_Price')
      ALTER TABLE dbo.SalesOrderItems DROP CONSTRAINT CK_SalesOrderItems_Price;
    ALTER TABLE dbo.SalesOrderItems ALTER COLUMN unitPrice DECIMAL(18,6) NOT NULL;
    ALTER TABLE dbo.SalesOrderItems ADD CONSTRAINT CK_SalesOrderItems_Price CHECK(unitPrice>=0);
    COMMIT TRANSACTION;
  END TRY
  BEGIN CATCH
    IF XACT_STATE()<>0 ROLLBACK TRANSACTION;
    THROW;
  END CATCH;
END;


IF OBJECT_ID(N'dbo.Suppliers', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.Suppliers (
    id INT IDENTITY PRIMARY KEY,
    code AS ('SUP-' + RIGHT('00000000' + CONVERT(VARCHAR(20),id),8)) PERSISTED,
    name NVARCHAR(180) NOT NULL,shortName NVARCHAR(80) NOT NULL,businessStyle NVARCHAR(180) NOT NULL,address NVARCHAR(500) NOT NULL,
    remarks NVARCHAR(2000) NOT NULL DEFAULT N'',tin NVARCHAR(50) NOT NULL DEFAULT N'',contactPerson NVARCHAR(150) NOT NULL DEFAULT N'',
    email NVARCHAR(254) NOT NULL DEFAULT N'',countryOfOrigin NVARCHAR(100) NOT NULL DEFAULT N'',country NVARCHAR(100) NOT NULL DEFAULT N'',
    cpnumber NVARCHAR(30) NOT NULL DEFAULT N'',faxNo NVARCHAR(30) NOT NULL DEFAULT N'',
    decimalInPrice INT NOT NULL DEFAULT 2,decimalInTotalPrice INT NOT NULL DEFAULT 2,paymentTerm NVARCHAR(100) NOT NULL DEFAULT N'',
    vatCode NVARCHAR(80) NOT NULL,vatInclusive BIT NOT NULL DEFAULT 0,taxCode NVARCHAR(80) NOT NULL DEFAULT N'',
    isActive BIT NOT NULL DEFAULT 1,createdAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),updatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT CK_Suppliers_Decimals CHECK(decimalInPrice BETWEEN 0 AND 6 AND decimalInTotalPrice BETWEEN 0 AND 6)
  );
END;

IF OBJECT_ID(N'dbo.Supplies', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.Supplies (
    id INT IDENTITY PRIMARY KEY,
    code AS ('S-' + RIGHT('00000000' + CONVERT(VARCHAR(20),id),8)) PERSISTED,
    productId INT NULL REFERENCES dbo.Products(id),maker NVARCHAR(150) NOT NULL DEFAULT N'',name NVARCHAR(180) NOT NULL,
    description NVARCHAR(1000) NOT NULL DEFAULT N'',remarks NVARCHAR(2000) NOT NULL DEFAULT N'',minimumStock DECIMAL(18,6) NOT NULL DEFAULT 0,
    color NVARCHAR(80) NOT NULL DEFAULT N'',thickness DECIMAL(18,6) NOT NULL DEFAULT 0,unit NVARCHAR(30) NOT NULL,
    netWeight DECIMAL(18,6) NOT NULL DEFAULT 0,weightUnit NVARCHAR(30) NOT NULL DEFAULT N'',category NVARCHAR(100) NOT NULL DEFAULT N'',
    inventorySetup NVARCHAR(20) NOT NULL DEFAULT N'',isActive BIT NOT NULL DEFAULT 1,
    createdAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),updatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT CK_Supplies_Amounts CHECK(minimumStock>=0 AND thickness>=0 AND netWeight>=0),
    CONSTRAINT CK_Supplies_InventorySetup CHECK(inventorySetup IN ('','monthly','quarterly'))
  );
END;

IF OBJECT_ID(N'dbo.SupplyOffices', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.SupplyOffices (
    suppliesId INT NOT NULL REFERENCES dbo.Supplies(id) ON DELETE CASCADE,position INT NOT NULL,name NVARCHAR(150) NOT NULL,
    CONSTRAINT PK_SupplyOffices PRIMARY KEY(suppliesId,position)
  );
END;

IF OBJECT_ID(N'dbo.SupplyInventorySchedules', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.SupplyInventorySchedules (
    suppliesId INT NOT NULL REFERENCES dbo.Supplies(id) ON DELETE CASCADE,position INT NOT NULL,scheduleDate DATE NULL,month NVARCHAR(40) NOT NULL DEFAULT N'',
    CONSTRAINT PK_SupplyInventorySchedules PRIMARY KEY(suppliesId,position)
  );
END;

IF OBJECT_ID(N'dbo.SupplySuppliers', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.SupplySuppliers (
    suppliesId INT NOT NULL REFERENCES dbo.Supplies(id) ON DELETE CASCADE,position INT NOT NULL,supplierId INT NOT NULL REFERENCES dbo.Suppliers(id),
    moq DECIMAL(18,6) NOT NULL DEFAULT 0,price DECIMAL(19,6) NOT NULL DEFAULT 0,currency NVARCHAR(30) NOT NULL DEFAULT N'',remarks NVARCHAR(2000) NOT NULL DEFAULT N'',
    CONSTRAINT PK_SupplySuppliers PRIMARY KEY(suppliesId,position),CONSTRAINT UQ_SupplySuppliers UNIQUE(suppliesId,supplierId),
    CONSTRAINT CK_SupplySuppliers_Amounts CHECK(moq>=0 AND price>=0)
  );
END;

IF OBJECT_ID(N'dbo.ProductSupplies', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.ProductSupplies (
    productId INT NOT NULL REFERENCES dbo.Products(id) ON DELETE CASCADE,position INT NOT NULL,suppliesId INT NOT NULL REFERENCES dbo.Supplies(id),
    quantity DECIMAL(18,6) NOT NULL,unit NVARCHAR(30) NOT NULL,
    CONSTRAINT PK_ProductSupplies PRIMARY KEY(productId,position),CONSTRAINT UQ_ProductSupplies UNIQUE(productId,suppliesId),
    CONSTRAINT CK_ProductSupplies_Quantity CHECK(quantity>0)
  );
END;

IF OBJECT_ID(N'dbo.PurchaseRequests', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.PurchaseRequests (
    id INT IDENTITY PRIMARY KEY,number NVARCHAR(40) NOT NULL UNIQUE,branch NVARCHAR(150) NOT NULL,
    prDate DATE NOT NULL,neededDate DATE NOT NULL,requestedBy NVARCHAR(150) NOT NULL DEFAULT N'',requestedDept NVARCHAR(150) NOT NULL DEFAULT N'',
    checkedBy NVARCHAR(150) NOT NULL DEFAULT N'',approvedBy NVARCHAR(150) NOT NULL DEFAULT N'',approvedBy2 NVARCHAR(150) NOT NULL DEFAULT N'',
    remarks NVARCHAR(2000) NOT NULL DEFAULT N'',preparedById INT NOT NULL REFERENCES dbo.SalesUserLogin(id),preparedBy NVARCHAR(150) NOT NULL,
    status NVARCHAR(20) NOT NULL DEFAULT 'draft',postedById INT NULL REFERENCES dbo.SalesUserLogin(id),postedAt DATETIME2 NULL,
    createdAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),updatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT CK_PurchaseRequests_Status CHECK(status IN ('draft','posted','closed','cancelled'))
  );
END;

IF OBJECT_ID(N'dbo.PurchaseRequestItems', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.PurchaseRequestItems (
    id INT IDENTITY PRIMARY KEY,requestId INT NOT NULL REFERENCES dbo.PurchaseRequests(id),position INT NOT NULL,
    suppliesId INT NOT NULL REFERENCES dbo.Supplies(id),suppliesCode NVARCHAR(40) NOT NULL,suppliesName NVARCHAR(180) NOT NULL,description NVARCHAR(1000) NOT NULL,
    quantity DECIMAL(18,6) NOT NULL,unit NVARCHAR(30) NOT NULL,neededDate DATE NOT NULL,remarks NVARCHAR(2000) NOT NULL DEFAULT N'',
    CONSTRAINT UQ_PurchaseRequestItems_Position UNIQUE(requestId,position),CONSTRAINT CK_PurchaseRequestItems_Quantity CHECK(quantity>0)
  );
END;

IF OBJECT_ID(N'dbo.PurchaseOrders', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.PurchaseOrders (
    id INT IDENTITY PRIMARY KEY,number AS ('PO-'+RIGHT('00000000'+CONVERT(VARCHAR(20),id),8)) PERSISTED,
    branch NVARCHAR(150) NOT NULL,supplierId INT NOT NULL REFERENCES dbo.Suppliers(id),supplierName NVARCHAR(180) NOT NULL,
    supplierAddress NVARCHAR(500) NOT NULL,supplierContactPerson NVARCHAR(150) NOT NULL,poDate DATE NOT NULL,deliveryDate DATE NOT NULL,
    currency NVARCHAR(30) NOT NULL,rate DECIMAL(18,5) NOT NULL,paymentTerm NVARCHAR(100) NOT NULL,shipment NVARCHAR(20) NOT NULL,
    suppliesCategory NVARCHAR(100) NOT NULL DEFAULT N'',vatCode NVARCHAR(80) NOT NULL,vatRate DECIMAL(9,6) NOT NULL,vatInclusive BIT NOT NULL,
    decimalInPrice INT NOT NULL,decimalInTotalPrice INT NOT NULL,deliveryAddress NVARCHAR(500) NOT NULL DEFAULT N'',remarks NVARCHAR(2000) NOT NULL DEFAULT N'',
    grossAmount DECIMAL(20,6) NOT NULL,discountAmount DECIMAL(20,6) NOT NULL,netAmount DECIMAL(20,6) NOT NULL,vatAmount DECIMAL(20,6) NOT NULL,amount DECIMAL(20,6) NOT NULL,
    preparedById INT NOT NULL REFERENCES dbo.SalesUserLogin(id),preparedBy NVARCHAR(150) NOT NULL,status NVARCHAR(20) NOT NULL DEFAULT 'draft',
    postedById INT NULL REFERENCES dbo.SalesUserLogin(id),postedAt DATETIME2 NULL,createdAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),updatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT CK_PurchaseOrders_Status CHECK(status IN ('draft','posted','closed','cancelled')),CONSTRAINT CK_PurchaseOrders_Rate CHECK(rate>0)
  );
END;

IF OBJECT_ID(N'dbo.PurchaseOrderItems', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.PurchaseOrderItems (
    id INT IDENTITY PRIMARY KEY,orderId INT NOT NULL REFERENCES dbo.PurchaseOrders(id),position INT NOT NULL,
    requestItemId INT NOT NULL REFERENCES dbo.PurchaseRequestItems(id),suppliesId INT NOT NULL REFERENCES dbo.Supplies(id),
    suppliesCode NVARCHAR(40) NOT NULL,suppliesName NVARCHAR(180) NOT NULL,description NVARCHAR(1000) NOT NULL,unit NVARCHAR(30) NOT NULL,
    quantity DECIMAL(18,6) NOT NULL,unitPrice DECIMAL(19,6) NOT NULL,currency NVARCHAR(30) NOT NULL,discountRate DECIMAL(9,6) NOT NULL,vatRate DECIMAL(9,6) NOT NULL,
    grossAmount DECIMAL(20,6) NOT NULL,discountAmount DECIMAL(20,6) NOT NULL,netAmount DECIMAL(20,6) NOT NULL,vatAmount DECIMAL(20,6) NOT NULL,amount DECIMAL(20,6) NOT NULL,
    remarks NVARCHAR(2000) NOT NULL DEFAULT N'',CONSTRAINT UQ_PurchaseOrderItems_Source UNIQUE(orderId,requestItemId),
    CONSTRAINT CK_PurchaseOrderItems_Quantity CHECK(quantity>0 AND unitPrice>=0 AND discountRate BETWEEN 0 AND 100)
  );
END;

IF OBJECT_ID(N'dbo.SuppliesReceipts', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.SuppliesReceipts (
    id INT IDENTITY PRIMARY KEY,number AS ('SRR-'+RIGHT('00000000'+CONVERT(VARCHAR(20),id),8)) PERSISTED,
    purchaseOrderId INT NOT NULL REFERENCES dbo.PurchaseOrders(id),srrDate DATE NOT NULL,drNumber NVARCHAR(80) NOT NULL DEFAULT N'',pezaReference NVARCHAR(80) NOT NULL DEFAULT N'',
    invoiceNumber NVARCHAR(80) NOT NULL,invoiceDate DATE NULL,rate DECIMAL(18,5) NOT NULL,remarks NVARCHAR(2000) NOT NULL DEFAULT N'',
    grossAmount DECIMAL(20,6) NOT NULL,discountAmount DECIMAL(20,6) NOT NULL,netAmount DECIMAL(20,6) NOT NULL,vatAmount DECIMAL(20,6) NOT NULL,amount DECIMAL(20,6) NOT NULL,
    receivedById INT NOT NULL REFERENCES dbo.SalesUserLogin(id),receivedBy NVARCHAR(150) NOT NULL,status NVARCHAR(20) NOT NULL DEFAULT 'draft',
    postedById INT NULL REFERENCES dbo.SalesUserLogin(id),postedAt DATETIME2 NULL,createdAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),updatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT CK_SuppliesReceipts_Status CHECK(status IN ('draft','posted','cancelled')),CONSTRAINT CK_SuppliesReceipts_Rate CHECK(rate>0)
  );
END;

IF OBJECT_ID(N'dbo.SuppliesReceiptItems', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.SuppliesReceiptItems (
    id INT IDENTITY PRIMARY KEY,receiptId INT NOT NULL REFERENCES dbo.SuppliesReceipts(id),position INT NOT NULL,
    orderItemId INT NOT NULL REFERENCES dbo.PurchaseOrderItems(id),quantity DECIMAL(18,6) NOT NULL,remarks NVARCHAR(2000) NOT NULL DEFAULT N'',
    grossAmount DECIMAL(20,6) NOT NULL,discountAmount DECIMAL(20,6) NOT NULL,netAmount DECIMAL(20,6) NOT NULL,vatAmount DECIMAL(20,6) NOT NULL,amount DECIMAL(20,6) NOT NULL,
    CONSTRAINT UQ_SuppliesReceiptItems_Source UNIQUE(receiptId,orderItemId),CONSTRAINT CK_SuppliesReceiptItems_Quantity CHECK(quantity>0)
  );
END;

IF OBJECT_ID(N'dbo.SuppliesReceiptAllocations', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.SuppliesReceiptAllocations (
    id INT IDENTITY PRIMARY KEY,receiptItemId INT NOT NULL REFERENCES dbo.SuppliesReceiptItems(id),position INT NOT NULL,
    quantity DECIMAL(18,6) NOT NULL,expiryDate DATE NULL,mfgDate DATE NULL,imLot NVARCHAR(100) NOT NULL DEFAULT N'',qcStatus NVARCHAR(50) NOT NULL DEFAULT N'',
    warehouseId INT NULL REFERENCES dbo.ConfigWarehouses(id),locationId INT NULL REFERENCES dbo.ConfigLocations(id),
    CONSTRAINT UQ_SuppliesReceiptAllocations_Position UNIQUE(receiptItemId,position),CONSTRAINT CK_SuppliesReceiptAllocations_Quantity CHECK(quantity>0),
    CONSTRAINT CK_SuppliesReceiptAllocations_Dates CHECK(expiryDate IS NULL OR mfgDate IS NULL OR expiryDate>=mfgDate)
  );
END;

IF OBJECT_ID(N'dbo.SupplyInventory', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.SupplyInventory (
    id INT IDENTITY PRIMARY KEY,suppliesId INT NOT NULL REFERENCES dbo.Supplies(id),warehouseId INT NOT NULL REFERENCES dbo.ConfigWarehouses(id),
    locationId INT NOT NULL REFERENCES dbo.ConfigLocations(id),imLot NVARCHAR(100) NOT NULL DEFAULT N'',qcStatus NVARCHAR(50) NOT NULL DEFAULT N'',expiryDate DATE NULL,mfgDate DATE NULL,
    quantity DECIMAL(18,6) NOT NULL,updatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT UQ_SupplyInventory_Lot UNIQUE(suppliesId,warehouseId,locationId,imLot,qcStatus,expiryDate,mfgDate),CONSTRAINT CK_SupplyInventory_Quantity CHECK(quantity>=0)
  );
END;

IF OBJECT_ID(N'dbo.SupplyStockMovements', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.SupplyStockMovements (
    id INT IDENTITY PRIMARY KEY,receiptId INT NOT NULL REFERENCES dbo.SuppliesReceipts(id),receiptItemId INT NOT NULL REFERENCES dbo.SuppliesReceiptItems(id),
    allocationId INT NOT NULL UNIQUE REFERENCES dbo.SuppliesReceiptAllocations(id),inventoryId INT NOT NULL REFERENCES dbo.SupplyInventory(id),quantity DECIMAL(18,6) NOT NULL,
    createdById INT NOT NULL REFERENCES dbo.SalesUserLogin(id),createdAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),CONSTRAINT CK_SupplyStockMovements_Quantity CHECK(quantity>0)
  );
END;


-- Product additions retain the existing finished-product stock and sales fields.
IF COL_LENGTH(N'dbo.Products', N'revision') IS NULL
  ALTER TABLE dbo.Products ADD revision NVARCHAR(30) NOT NULL CONSTRAINT DF_Products_Revision DEFAULT N'0';
IF COL_LENGTH(N'dbo.Products', N'secondaryUnit') IS NULL
  ALTER TABLE dbo.Products ADD secondaryUnit NVARCHAR(30) NOT NULL CONSTRAINT DF_Products_SecondaryUnit DEFAULT N'';
IF COL_LENGTH(N'dbo.Products', N'quantityPerSecondaryUnit') IS NULL
  ALTER TABLE dbo.Products ADD quantityPerSecondaryUnit DECIMAL(18,6) NOT NULL CONSTRAINT DF_Products_SecondaryQuantity DEFAULT 0;
IF COL_LENGTH(N'dbo.Products', N'moq') IS NULL
  ALTER TABLE dbo.Products ADD moq DECIMAL(18,6) NOT NULL CONSTRAINT DF_Products_Moq DEFAULT 0;
IF COL_LENGTH(N'dbo.Products', N'spq') IS NULL
  ALTER TABLE dbo.Products ADD spq DECIMAL(18,6) NOT NULL CONSTRAINT DF_Products_Spq DEFAULT 0;
IF COL_LENGTH(N'dbo.Products', N'vatMode') IS NULL
  ALTER TABLE dbo.Products ADD vatMode NVARCHAR(20) NOT NULL CONSTRAINT DF_Products_VatMode DEFAULT N'customer';
IF COL_LENGTH(N'dbo.Products', N'unitCost') IS NULL
  ALTER TABLE dbo.Products ADD unitCost DECIMAL(18,6) NOT NULL CONSTRAINT DF_Products_UnitCost DEFAULT 0;
IF COL_LENGTH(N'dbo.Products', N'currency') IS NULL
  ALTER TABLE dbo.Products ADD currency NVARCHAR(30) NOT NULL CONSTRAINT DF_Products_Currency DEFAULT N'';
IF COL_LENGTH(N'dbo.Products', N'currency')<60
  ALTER TABLE dbo.Products ALTER COLUMN currency NVARCHAR(30) NOT NULL;
IF COL_LENGTH(N'dbo.Products', N'model') IS NULL
  ALTER TABLE dbo.Products ADD model NVARCHAR(150) NOT NULL CONSTRAINT DF_Products_Model DEFAULT N'';
IF COL_LENGTH(N'dbo.Products', N'category') IS NULL
  ALTER TABLE dbo.Products ADD category NVARCHAR(100) NOT NULL CONSTRAINT DF_Products_Category DEFAULT N'';
IF COL_LENGTH(N'dbo.Products', N'planType') IS NULL
  ALTER TABLE dbo.Products ADD planType NVARCHAR(100) NOT NULL CONSTRAINT DF_Products_PlanType DEFAULT N'';
IF COL_LENGTH(N'dbo.Products', N'color') IS NULL
  ALTER TABLE dbo.Products ADD color NVARCHAR(80) NOT NULL CONSTRAINT DF_Products_Color DEFAULT N'';
IF COL_LENGTH(N'dbo.Products', N'divisor') IS NULL
  ALTER TABLE dbo.Products ADD divisor DECIMAL(18,6) NOT NULL CONSTRAINT DF_Products_Divisor DEFAULT 0;
IF COL_LENGTH(N'dbo.Products', N'remarks') IS NULL
  ALTER TABLE dbo.Products ADD remarks NVARCHAR(2000) NOT NULL CONSTRAINT DF_Products_Remarks DEFAULT N'';
IF COL_LENGTH(N'dbo.Products', N'thickness') IS NULL
  ALTER TABLE dbo.Products ADD thickness DECIMAL(18,6) NOT NULL CONSTRAINT DF_Products_Thickness DEFAULT 0;
IF COL_LENGTH(N'dbo.Products', N'weight') IS NULL
  ALTER TABLE dbo.Products ADD weight DECIMAL(18,6) NOT NULL CONSTRAINT DF_Products_Weight DEFAULT 0;
IF COL_LENGTH(N'dbo.Products', N'productHeaderId') IS NULL
  ALTER TABLE dbo.Products ADD productHeaderId INT NULL;
IF COL_LENGTH(N'dbo.Products', N'tagColor') IS NULL
  ALTER TABLE dbo.Products ADD tagColor NVARCHAR(30) NOT NULL CONSTRAINT DF_Products_TagColor DEFAULT N'';
IF COL_LENGTH(N'dbo.Products', N'inventorySetup') IS NULL
  ALTER TABLE dbo.Products ADD inventorySetup NVARCHAR(20) NOT NULL CONSTRAINT DF_Products_InventorySetup DEFAULT N'';
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name=N'FK_Products_Header' AND parent_object_id=OBJECT_ID(N'dbo.Products'))
  EXEC(N'ALTER TABLE dbo.Products ADD CONSTRAINT FK_Products_Header FOREIGN KEY(productHeaderId) REFERENCES dbo.Products(id)');
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name=N'CK_Products_ExpandedAmounts' AND parent_object_id=OBJECT_ID(N'dbo.Products'))
  EXEC(N'ALTER TABLE dbo.Products ADD CONSTRAINT CK_Products_ExpandedAmounts CHECK (quantityPerSecondaryUnit>=0 AND moq>=0 AND spq>=0 AND unitCost>=0 AND divisor>=0 AND thickness>=0 AND weight>=0 AND vatMode IN (''customer'',''inclusive'',''exclusive''))');

IF OBJECT_ID(N'dbo.ProductProcesses', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.ProductProcesses (
    productId INT NOT NULL REFERENCES dbo.Products(id) ON DELETE CASCADE,
    position INT NOT NULL,
    name NVARCHAR(150) NOT NULL,
    CONSTRAINT PK_ProductProcesses PRIMARY KEY(productId,position)
  );
END;
IF OBJECT_ID(N'dbo.ProductOffices', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.ProductOffices (
    productId INT NOT NULL REFERENCES dbo.Products(id) ON DELETE CASCADE,
    position INT NOT NULL,
    name NVARCHAR(150) NOT NULL,
    CONSTRAINT PK_ProductOffices PRIMARY KEY(productId,position)
  );
END;
IF OBJECT_ID(N'dbo.ProductCustomerApprovals', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.ProductCustomerApprovals (
    productId INT NOT NULL REFERENCES dbo.Products(id) ON DELETE CASCADE,
    position INT NOT NULL,
    customerId INT NOT NULL REFERENCES dbo.Customers(id),
    approvalDate DATE NULL,
    eolDate DATE NULL,
    approvalRemarks NVARCHAR(2000) NOT NULL DEFAULT N'',
    eolRemarks NVARCHAR(2000) NOT NULL DEFAULT N'',
    CONSTRAINT PK_ProductCustomerApprovals PRIMARY KEY(productId,position),
    CONSTRAINT UQ_ProductCustomerApprovals_Customer UNIQUE(productId,customerId),
    CONSTRAINT CK_ProductCustomerApprovals_Dates CHECK (approvalDate IS NULL OR eolDate IS NULL OR eolDate>=approvalDate)
  );
END;

IF OBJECT_ID(N'dbo.ProductInventorySchedules', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.ProductInventorySchedules (
    productId INT NOT NULL REFERENCES dbo.Products(id) ON DELETE CASCADE,
    position INT NOT NULL,
    scheduleDate DATE NULL,
    month NVARCHAR(40) NOT NULL DEFAULT N'',
    CONSTRAINT PK_ProductInventorySchedules PRIMARY KEY(productId,position)
  );
END;
