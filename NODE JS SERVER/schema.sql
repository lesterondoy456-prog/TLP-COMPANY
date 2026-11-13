SET XACT_ABORT ON;

IF OBJECT_ID(N'dbo.SalesUserLogin', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.SalesUserLogin (
    id INT IDENTITY PRIMARY KEY,
    name NVARCHAR(150) NOT NULL,
    username NVARCHAR(80) NOT NULL,
    cpnumber NVARCHAR(30) NOT NULL DEFAULT '',
    email NVARCHAR(254) NOT NULL DEFAULT '',
    photo NVARCHAR(MAX) NOT NULL DEFAULT '',
    role NVARCHAR(20) NOT NULL,
    passwordHash VARCHAR(300) NOT NULL,
    isActive BIT NOT NULL DEFAULT 1,
    createdAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    updatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT UQ_SalesUserLogin_Username UNIQUE (username),
    CONSTRAINT CK_SalesUserLogin_Role CHECK (role IN ('admin', 'saleshead', 'sales'))
  );
END;

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID(N'dbo.SalesUserLogin') AND name=N'CK_SalesUserLogin_Role' AND definition LIKE N'%saleshead%')
BEGIN
  BEGIN TRY
    BEGIN TRANSACTION;
    IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID(N'dbo.SalesUserLogin') AND name=N'CK_SalesUserLogin_Role')
      ALTER TABLE dbo.SalesUserLogin DROP CONSTRAINT CK_SalesUserLogin_Role;
    ALTER TABLE dbo.SalesUserLogin WITH CHECK ADD CONSTRAINT CK_SalesUserLogin_Role CHECK (role IN ('admin', 'saleshead', 'sales'));
    COMMIT TRANSACTION;
  END TRY
  BEGIN CATCH
    IF XACT_STATE()<>0 ROLLBACK TRANSACTION;
    THROW;
  END CATCH;
END;

IF OBJECT_ID(N'dbo.Customers', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.Customers (
    id INT IDENTITY PRIMARY KEY,
    code NVARCHAR(40) NOT NULL UNIQUE,
    name NVARCHAR(180) NOT NULL,
    contactPerson NVARCHAR(150) NOT NULL DEFAULT '',
    cpnumber NVARCHAR(30) NOT NULL DEFAULT '',
    email NVARCHAR(254) NOT NULL DEFAULT '',
    address NVARCHAR(500) NOT NULL DEFAULT '',
    isActive BIT NOT NULL DEFAULT 1,
    createdAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    updatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
  );
END;

-- Customer fields are additive so existing saved customer data is preserved.
IF COL_LENGTH(N'dbo.Customers', N'shortName') IS NULL
  ALTER TABLE dbo.Customers ADD shortName NVARCHAR(80) NOT NULL CONSTRAINT DF_Customers_ShortName DEFAULT N'';
IF COL_LENGTH(N'dbo.Customers', N'businessStyle') IS NULL
  ALTER TABLE dbo.Customers ADD businessStyle NVARCHAR(180) NOT NULL CONSTRAINT DF_Customers_BusinessStyle DEFAULT N'';
IF COL_LENGTH(N'dbo.Customers', N'salesInCharge') IS NULL
  ALTER TABLE dbo.Customers ADD salesInCharge NVARCHAR(150) NOT NULL CONSTRAINT DF_Customers_SalesInCharge DEFAULT N'';
IF COL_LENGTH(N'dbo.Customers', N'salesInChargeId') IS NULL
  ALTER TABLE dbo.Customers ADD salesInChargeId INT NULL;
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE parent_object_id=OBJECT_ID(N'dbo.Customers') AND name=N'FK_Customers_SalesInCharge')
  EXEC(N'ALTER TABLE dbo.Customers WITH CHECK ADD CONSTRAINT FK_Customers_SalesInCharge FOREIGN KEY (salesInChargeId) REFERENCES dbo.SalesUserLogin(id)');
IF COL_LENGTH(N'dbo.Customers', N'tin') IS NULL
  ALTER TABLE dbo.Customers ADD tin NVARCHAR(50) NOT NULL CONSTRAINT DF_Customers_Tin DEFAULT N'';
IF COL_LENGTH(N'dbo.Customers', N'faxNo') IS NULL
  ALTER TABLE dbo.Customers ADD faxNo NVARCHAR(30) NOT NULL CONSTRAINT DF_Customers_FaxNo DEFAULT N'';
IF COL_LENGTH(N'dbo.Customers', N'countryOfOrigin') IS NULL
  ALTER TABLE dbo.Customers ADD countryOfOrigin NVARCHAR(100) NOT NULL CONSTRAINT DF_Customers_CountryOfOrigin DEFAULT N'';
IF COL_LENGTH(N'dbo.Customers', N'country') IS NULL
  ALTER TABLE dbo.Customers ADD country NVARCHAR(100) NOT NULL CONSTRAINT DF_Customers_Country DEFAULT N'';
IF COL_LENGTH(N'dbo.Customers', N'category') IS NULL
  ALTER TABLE dbo.Customers ADD category NVARCHAR(100) NOT NULL CONSTRAINT DF_Customers_Category DEFAULT N'';
IF COL_LENGTH(N'dbo.Customers', N'remarks') IS NULL
  ALTER TABLE dbo.Customers ADD remarks NVARCHAR(2000) NOT NULL CONSTRAINT DF_Customers_Remarks DEFAULT N'';
IF COL_LENGTH(N'dbo.Customers', N'salesName') IS NULL
  ALTER TABLE dbo.Customers ADD salesName NVARCHAR(180) NOT NULL CONSTRAINT DF_Customers_SalesName DEFAULT N'';
IF COL_LENGTH(N'dbo.Customers', N'drName') IS NULL
  ALTER TABLE dbo.Customers ADD drName NVARCHAR(180) NOT NULL CONSTRAINT DF_Customers_DrName DEFAULT N'';
IF COL_LENGTH(N'dbo.Customers', N'decimalInPrice') IS NULL
  ALTER TABLE dbo.Customers ADD decimalInPrice INT NOT NULL CONSTRAINT DF_Customers_DecimalInPrice DEFAULT 2;
IF COL_LENGTH(N'dbo.Customers', N'decimalInTotalPrice') IS NULL
  ALTER TABLE dbo.Customers ADD decimalInTotalPrice INT NOT NULL CONSTRAINT DF_Customers_DecimalInTotalPrice DEFAULT 2;
IF COL_LENGTH(N'dbo.Customers', N'paymentTerm') IS NULL
  ALTER TABLE dbo.Customers ADD paymentTerm NVARCHAR(100) NOT NULL CONSTRAINT DF_Customers_PaymentTerm DEFAULT N'';
IF COL_LENGTH(N'dbo.Customers', N'salesAddressType') IS NULL
  ALTER TABLE dbo.Customers ADD salesAddressType NVARCHAR(10) NOT NULL CONSTRAINT DF_Customers_SalesAddressType DEFAULT N'office';
IF COL_LENGTH(N'dbo.Customers', N'drAddressType') IS NULL
  ALTER TABLE dbo.Customers ADD drAddressType NVARCHAR(10) NOT NULL CONSTRAINT DF_Customers_DrAddressType DEFAULT N'office';
IF COL_LENGTH(N'dbo.Customers', N'discount') IS NULL
  ALTER TABLE dbo.Customers ADD discount DECIMAL(18,6) NOT NULL CONSTRAINT DF_Customers_Discount DEFAULT 0;
IF COL_LENGTH(N'dbo.Customers', N'discountType') IS NULL
  ALTER TABLE dbo.Customers ADD discountType NVARCHAR(10) NOT NULL CONSTRAINT DF_Customers_DiscountType DEFAULT N'percent';
IF COL_LENGTH(N'dbo.Customers', N'includePoInInvoice') IS NULL
  ALTER TABLE dbo.Customers ADD includePoInInvoice BIT NOT NULL CONSTRAINT DF_Customers_IncludePoInInvoice DEFAULT 0;
IF COL_LENGTH(N'dbo.Customers', N'vatCode') IS NULL
  ALTER TABLE dbo.Customers ADD vatCode NVARCHAR(80) NOT NULL CONSTRAINT DF_Customers_VatCode DEFAULT N'';
IF COL_LENGTH(N'dbo.Customers', N'vatInclusive') IS NULL
  ALTER TABLE dbo.Customers ADD vatInclusive BIT NOT NULL CONSTRAINT DF_Customers_VatInclusive DEFAULT 0;
IF COL_LENGTH(N'dbo.Customers', N'taxCode') IS NULL
  ALTER TABLE dbo.Customers ADD taxCode NVARCHAR(80) NOT NULL CONSTRAINT DF_Customers_TaxCode DEFAULT N'';

IF OBJECT_ID(N'dbo.CustomerDeliveryAddresses', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.CustomerDeliveryAddresses (
    customerId INT NOT NULL REFERENCES dbo.Customers(id) ON DELETE CASCADE,
    position INT NOT NULL,
    address NVARCHAR(500) NOT NULL,
    CONSTRAINT PK_CustomerDeliveryAddresses PRIMARY KEY (customerId, position),
    CONSTRAINT CK_CustomerDeliveryAddresses_Position CHECK (position >= 0 AND position < 50)
  );
END;

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name=N'CK_Customers_Decimals')
  EXEC(N'ALTER TABLE dbo.Customers ADD CONSTRAINT CK_Customers_Decimals CHECK (decimalInPrice BETWEEN 0 AND 6 AND decimalInTotalPrice BETWEEN 0 AND 6)');
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name=N'CK_Customers_AddressTypes')
  EXEC(N'ALTER TABLE dbo.Customers ADD CONSTRAINT CK_Customers_AddressTypes CHECK (salesAddressType IN (''office'',''delivery'') AND drAddressType IN (''office'',''delivery''))');
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name=N'CK_Customers_Discount')
  EXEC(N'ALTER TABLE dbo.Customers ADD CONSTRAINT CK_Customers_Discount CHECK (discount BETWEEN 0 AND 1000000000 AND discountType IN (''percent'',''amount'') AND (discountType<>''percent'' OR discount<=100))');

IF OBJECT_ID(N'dbo.Products', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.Products (
    id INT IDENTITY PRIMARY KEY,
    sku NVARCHAR(40) NOT NULL UNIQUE,
    name NVARCHAR(180) NOT NULL,
    description NVARCHAR(1000) NOT NULL DEFAULT '',
    unit NVARCHAR(30) NOT NULL DEFAULT 'pcs',
    price DECIMAL(18,2) NOT NULL,
    stock DECIMAL(18,3) NOT NULL DEFAULT 0,
    isActive BIT NOT NULL DEFAULT 1,
    createdAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    updatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT CK_Products_Price CHECK (price >= 0),
    CONSTRAINT CK_Products_Stock CHECK (stock >= 0)
  );
END;

IF OBJECT_ID(N'dbo.SalesOrders', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.SalesOrders (
    id INT IDENTITY PRIMARY KEY,
    number AS ('SO-' + RIGHT('00000000' + CONVERT(VARCHAR(20), id), 8)) PERSISTED,
    customerId INT NOT NULL REFERENCES dbo.Customers(id),
    customerName NVARCHAR(180) NOT NULL,
    customerAddress NVARCHAR(500) NOT NULL DEFAULT '',
    orderDate DATE NOT NULL,
    notes NVARCHAR(2000) NOT NULL DEFAULT '',
    status NVARCHAR(20) NOT NULL,
    total DECIMAL(18,2) NOT NULL,
    createdBy INT NOT NULL REFERENCES dbo.SalesUserLogin(id),
    createdAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    updatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT CK_SalesOrders_Status CHECK (status IN ('draft', 'confirmed')),
    CONSTRAINT CK_SalesOrders_Total CHECK (total >= 0)
  );
END;

IF OBJECT_ID(N'dbo.SalesOrderItems', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.SalesOrderItems (
    id INT IDENTITY PRIMARY KEY,
    orderId INT NOT NULL REFERENCES dbo.SalesOrders(id),
    productId INT NOT NULL REFERENCES dbo.Products(id),
    productName NVARCHAR(180) NOT NULL,
    sku NVARCHAR(40) NOT NULL,
    unit NVARCHAR(30) NOT NULL,
    quantity DECIMAL(18,3) NOT NULL,
    unitPrice DECIMAL(18,2) NOT NULL,
    lineTotal DECIMAL(18,2) NOT NULL,
    CONSTRAINT UQ_SalesOrderItems_Product UNIQUE (orderId, productId),
    CONSTRAINT CK_SalesOrderItems_Quantity CHECK (quantity > 0),
    CONSTRAINT CK_SalesOrderItems_Price CHECK (unitPrice >= 0)
  );
END;

IF OBJECT_ID(N'dbo.SalesInvoices', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.SalesInvoices (
    id INT IDENTITY PRIMARY KEY,
    number AS ('SI-' + RIGHT('00000000' + CONVERT(VARCHAR(20), id), 8)) PERSISTED,
    orderId INT NOT NULL UNIQUE REFERENCES dbo.SalesOrders(id),
    invoiceDate DATE NOT NULL,
    dueDate DATE NOT NULL,
    notes NVARCHAR(2000) NOT NULL DEFAULT '',
    total DECIMAL(18,2) NOT NULL,
    paidAmount DECIMAL(18,2) NOT NULL DEFAULT 0,
    createdBy INT NOT NULL REFERENCES dbo.SalesUserLogin(id),
    createdAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    updatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT CK_SalesInvoices_Payment CHECK (paidAmount >= 0 AND paidAmount <= total),
    CONSTRAINT CK_SalesInvoices_Dates CHECK (dueDate >= invoiceDate)
  );
END;

IF OBJECT_ID(N'dbo.DeliveryReceipts', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.DeliveryReceipts (
    id INT IDENTITY PRIMARY KEY,
    number AS ('DR-' + RIGHT('00000000' + CONVERT(VARCHAR(20), id), 8)) PERSISTED,
    orderId INT NOT NULL UNIQUE REFERENCES dbo.SalesOrders(id),
    deliveryDate DATE NOT NULL,
    receivedBy NVARCHAR(150) NOT NULL DEFAULT '',
    address NVARCHAR(500) NOT NULL DEFAULT '',
    notes NVARCHAR(2000) NOT NULL DEFAULT '',
    createdBy INT NOT NULL REFERENCES dbo.SalesUserLogin(id),
    createdAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
  );
END;

IF OBJECT_ID(N'dbo.ShippingInvoices', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.ShippingInvoices (
    id INT IDENTITY PRIMARY KEY,
    number AS ('SHI-' + RIGHT('00000000' + CONVERT(VARCHAR(20), id), 8)) PERSISTED,
    invoiceId INT NOT NULL UNIQUE REFERENCES dbo.SalesInvoices(id),
    shippingDate DATE NOT NULL,
    carrier NVARCHAR(150) NOT NULL DEFAULT '',
    trackingNumber NVARCHAR(100) NOT NULL DEFAULT '',
    notes NVARCHAR(2000) NOT NULL DEFAULT '',
    createdBy INT NOT NULL REFERENCES dbo.SalesUserLogin(id),
    createdAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
  );
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_SalesOrders_Date' AND object_id = OBJECT_ID('dbo.SalesOrders'))
  CREATE INDEX IX_SalesOrders_Date ON dbo.SalesOrders(orderDate DESC, id DESC);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_SalesOrderItems_Product' AND object_id = OBJECT_ID('dbo.SalesOrderItems'))
  CREATE INDEX IX_SalesOrderItems_Product ON dbo.SalesOrderItems(productId);
