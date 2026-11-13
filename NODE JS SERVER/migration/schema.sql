SET XACT_ABORT ON;

IF OBJECT_ID(N'dbo.SalesUserLogin', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.SalesUserLogin (
    id INT IDENTITY PRIMARY KEY,
    name NVARCHAR(150) NOT NULL,
    username NVARCHAR(80) NOT NULL,
    cpnumber NVARCHAR(30) NULL,
    email NVARCHAR(254) NULL,
    photo NVARCHAR(MAX) NULL,
    role NVARCHAR(20) NOT NULL,
    passwordHash VARCHAR(300) NOT NULL,
    isActive BIT NOT NULL,
    createdAt DATETIME2 NOT NULL,
    updatedAt DATETIME2 NOT NULL,
    CONSTRAINT UQ_SalesUserLogin_Username UNIQUE (username)
  );
END;

IF OBJECT_ID(N'dbo.Customers', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.Customers (
    id INT IDENTITY PRIMARY KEY,
    code NVARCHAR(40) NOT NULL UNIQUE,
    name NVARCHAR(180) NOT NULL,
    contactPerson NVARCHAR(150) NULL,
    cpnumber NVARCHAR(30) NULL,
    email NVARCHAR(254) NULL,
    address NVARCHAR(500) NOT NULL,
    isActive BIT NOT NULL,
    createdAt DATETIME2 NOT NULL,
    updatedAt DATETIME2 NOT NULL
  );
END;

-- Customer fields are additive so existing saved customer data is preserved.
IF COL_LENGTH(N'dbo.Customers', N'shortName') IS NULL
BEGIN
  ALTER TABLE dbo.Customers ADD shortName NVARCHAR(80) NULL;
  EXEC(N'UPDATE dbo.Customers SET shortName=N'''' WHERE shortName IS NULL;');
  ALTER TABLE dbo.Customers ALTER COLUMN shortName NVARCHAR(80) NOT NULL;
END;
IF COL_LENGTH(N'dbo.Customers', N'businessStyle') IS NULL
BEGIN
  ALTER TABLE dbo.Customers ADD businessStyle NVARCHAR(180) NULL;
  EXEC(N'UPDATE dbo.Customers SET businessStyle=N'''' WHERE businessStyle IS NULL;');
  ALTER TABLE dbo.Customers ALTER COLUMN businessStyle NVARCHAR(180) NOT NULL;
END;
IF COL_LENGTH(N'dbo.Customers', N'salesInCharge') IS NULL
  ALTER TABLE dbo.Customers ADD salesInCharge NVARCHAR(150) NULL;
IF COL_LENGTH(N'dbo.Customers', N'salesInChargeId') IS NULL
  ALTER TABLE dbo.Customers ADD salesInChargeId INT NULL;
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE parent_object_id=OBJECT_ID(N'dbo.Customers') AND name=N'FK_Customers_SalesInCharge')
  EXEC(N'ALTER TABLE dbo.Customers WITH CHECK ADD CONSTRAINT FK_Customers_SalesInCharge FOREIGN KEY (salesInChargeId) REFERENCES dbo.SalesUserLogin(id)');
IF COL_LENGTH(N'dbo.Customers', N'tin') IS NULL
  ALTER TABLE dbo.Customers ADD tin NVARCHAR(50) NULL;
IF COL_LENGTH(N'dbo.Customers', N'faxNo') IS NULL
  ALTER TABLE dbo.Customers ADD faxNo NVARCHAR(30) NULL;
IF COL_LENGTH(N'dbo.Customers', N'countryOfOrigin') IS NULL
  ALTER TABLE dbo.Customers ADD countryOfOrigin NVARCHAR(100) NULL;
IF COL_LENGTH(N'dbo.Customers', N'country') IS NULL
  ALTER TABLE dbo.Customers ADD country NVARCHAR(100) NULL;
IF COL_LENGTH(N'dbo.Customers', N'category') IS NULL
  ALTER TABLE dbo.Customers ADD category NVARCHAR(100) NULL;
IF COL_LENGTH(N'dbo.Customers', N'remarks') IS NULL
  ALTER TABLE dbo.Customers ADD remarks NVARCHAR(2000) NULL;
IF COL_LENGTH(N'dbo.Customers', N'salesName') IS NULL
BEGIN
  ALTER TABLE dbo.Customers ADD salesName NVARCHAR(180) NULL;
  EXEC(N'UPDATE dbo.Customers SET salesName=N'''' WHERE salesName IS NULL;');
  ALTER TABLE dbo.Customers ALTER COLUMN salesName NVARCHAR(180) NOT NULL;
END;
IF COL_LENGTH(N'dbo.Customers', N'drName') IS NULL
BEGIN
  ALTER TABLE dbo.Customers ADD drName NVARCHAR(180) NULL;
  EXEC(N'UPDATE dbo.Customers SET drName=N'''' WHERE drName IS NULL;');
  ALTER TABLE dbo.Customers ALTER COLUMN drName NVARCHAR(180) NOT NULL;
END;
IF COL_LENGTH(N'dbo.Customers', N'decimalInPrice') IS NULL
BEGIN
  ALTER TABLE dbo.Customers ADD decimalInPrice INT NULL;
  EXEC(N'UPDATE dbo.Customers SET decimalInPrice=2 WHERE decimalInPrice IS NULL;');
  ALTER TABLE dbo.Customers ALTER COLUMN decimalInPrice INT NOT NULL;
END;
IF COL_LENGTH(N'dbo.Customers', N'decimalInTotalPrice') IS NULL
BEGIN
  ALTER TABLE dbo.Customers ADD decimalInTotalPrice INT NULL;
  EXEC(N'UPDATE dbo.Customers SET decimalInTotalPrice=2 WHERE decimalInTotalPrice IS NULL;');
  ALTER TABLE dbo.Customers ALTER COLUMN decimalInTotalPrice INT NOT NULL;
END;
IF COL_LENGTH(N'dbo.Customers', N'paymentTerm') IS NULL
  ALTER TABLE dbo.Customers ADD paymentTerm NVARCHAR(100) NULL;
IF COL_LENGTH(N'dbo.Customers', N'salesAddressType') IS NULL
  ALTER TABLE dbo.Customers ADD salesAddressType NVARCHAR(10) NULL;
IF COL_LENGTH(N'dbo.Customers', N'drAddressType') IS NULL
  ALTER TABLE dbo.Customers ADD drAddressType NVARCHAR(10) NULL;
IF COL_LENGTH(N'dbo.Customers', N'discount') IS NULL
  ALTER TABLE dbo.Customers ADD discount DECIMAL(18,6) NULL;
IF COL_LENGTH(N'dbo.Customers', N'discountType') IS NULL
  ALTER TABLE dbo.Customers ADD discountType NVARCHAR(10) NULL;
IF COL_LENGTH(N'dbo.Customers', N'includePoInInvoice') IS NULL
  ALTER TABLE dbo.Customers ADD includePoInInvoice BIT NULL;
IF COL_LENGTH(N'dbo.Customers', N'vatCode') IS NULL
BEGIN
  ALTER TABLE dbo.Customers ADD vatCode NVARCHAR(80) NULL;
  EXEC(N'UPDATE dbo.Customers SET vatCode=N'''' WHERE vatCode IS NULL;');
  ALTER TABLE dbo.Customers ALTER COLUMN vatCode NVARCHAR(80) NOT NULL;
END;
IF COL_LENGTH(N'dbo.Customers', N'vatInclusive') IS NULL
  ALTER TABLE dbo.Customers ADD vatInclusive BIT NULL;
IF COL_LENGTH(N'dbo.Customers', N'taxCode') IS NULL
  ALTER TABLE dbo.Customers ADD taxCode NVARCHAR(80) NULL;

IF OBJECT_ID(N'dbo.CustomerDeliveryAddresses', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.CustomerDeliveryAddresses (
    customerId INT NOT NULL REFERENCES dbo.Customers(id) ON DELETE CASCADE,
    position INT NOT NULL,
    address NVARCHAR(500) NOT NULL,
    CONSTRAINT PK_CustomerDeliveryAddresses PRIMARY KEY (customerId, position)
  );
END;

IF OBJECT_ID(N'dbo.Products', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.Products (
    id INT IDENTITY PRIMARY KEY,
    sku NVARCHAR(40) NOT NULL UNIQUE,
    name NVARCHAR(180) NOT NULL,
    description NVARCHAR(1000) NULL,
    unit NVARCHAR(30) NOT NULL,
    price DECIMAL(18,2) NULL,
    stock DECIMAL(18,3) NOT NULL,
    isActive BIT NOT NULL,
    createdAt DATETIME2 NOT NULL,
    updatedAt DATETIME2 NOT NULL
  );
END;

IF OBJECT_ID(N'dbo.SalesOrders', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.SalesOrders (
    id INT IDENTITY PRIMARY KEY,
    number VARCHAR(MAX) NULL,
    customerId INT NOT NULL REFERENCES dbo.Customers(id),
    customerName NVARCHAR(180) NOT NULL,
    customerAddress NVARCHAR(500) NOT NULL,
    orderDate DATE NOT NULL,
    notes NVARCHAR(2000) NULL,
    status NVARCHAR(20) NOT NULL,
    total DECIMAL(18,2) NOT NULL,
    createdBy INT NOT NULL REFERENCES dbo.SalesUserLogin(id),
    createdAt DATETIME2 NOT NULL,
    updatedAt DATETIME2 NOT NULL
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
    CONSTRAINT UQ_SalesOrderItems_Product UNIQUE (orderId, productId)
  );
END;

IF OBJECT_ID(N'dbo.SalesInvoices', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.SalesInvoices (
    id INT IDENTITY PRIMARY KEY,
    number VARCHAR(MAX) NULL,
    orderId INT NOT NULL UNIQUE REFERENCES dbo.SalesOrders(id),
    invoiceDate DATE NOT NULL,
    dueDate DATE NOT NULL,
    notes NVARCHAR(2000) NULL,
    total DECIMAL(18,2) NOT NULL,
    paidAmount DECIMAL(18,2) NOT NULL,
    createdBy INT NOT NULL REFERENCES dbo.SalesUserLogin(id),
    createdAt DATETIME2 NOT NULL,
    updatedAt DATETIME2 NOT NULL
  );
END;

IF OBJECT_ID(N'dbo.DeliveryReceipts', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.DeliveryReceipts (
    id INT IDENTITY PRIMARY KEY,
    number VARCHAR(MAX) NULL,
    orderId INT NOT NULL UNIQUE REFERENCES dbo.SalesOrders(id),
    deliveryDate DATE NOT NULL,
    receivedBy NVARCHAR(150) NOT NULL,
    address NVARCHAR(500) NOT NULL,
    notes NVARCHAR(2000) NULL,
    createdBy INT NOT NULL REFERENCES dbo.SalesUserLogin(id),
    createdAt DATETIME2 NOT NULL
  );
END;

IF OBJECT_ID(N'dbo.ShippingInvoices', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.ShippingInvoices (
    id INT IDENTITY PRIMARY KEY,
    number VARCHAR(MAX) NULL,
    invoiceId INT NOT NULL UNIQUE REFERENCES dbo.SalesInvoices(id),
    shippingDate DATE NOT NULL,
    carrier NVARCHAR(150) NULL,
    trackingNumber NVARCHAR(100) NULL,
    notes NVARCHAR(2000) NULL,
    createdBy INT NOT NULL REFERENCES dbo.SalesUserLogin(id),
    createdAt DATETIME2 NOT NULL
  );
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_SalesOrders_Date' AND object_id = OBJECT_ID('dbo.SalesOrders'))
  CREATE INDEX IX_SalesOrders_Date ON dbo.SalesOrders(orderDate DESC, id DESC);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_SalesOrderItems_Product' AND object_id = OBJECT_ID('dbo.SalesOrderItems'))
  CREATE INDEX IX_SalesOrderItems_Product ON dbo.SalesOrderItems(productId);
