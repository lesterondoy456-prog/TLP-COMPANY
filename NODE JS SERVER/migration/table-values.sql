SET XACT_ABORT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET ARITHABORT ON;
SET NUMERIC_ROUNDABORT OFF;

-- Customer links use Customers.id; a separate generated customer code is unused.
IF COL_LENGTH(N'dbo.Customers',N'code') IS NOT NULL
BEGIN
  DECLARE @customerCodeConstraint SYSNAME,@dropCustomerCodeConstraint NVARCHAR(500);
  SELECT @customerCodeConstraint=k.name
  FROM sys.key_constraints k
  JOIN sys.index_columns i ON i.object_id=k.parent_object_id AND i.index_id=k.unique_index_id
  JOIN sys.columns c ON c.object_id=i.object_id AND c.column_id=i.column_id
  WHERE k.parent_object_id=OBJECT_ID(N'dbo.Customers') AND k.type=N'UQ' AND c.name=N'code';
  IF @customerCodeConstraint IS NOT NULL
  BEGIN
    SET @dropCustomerCodeConstraint=N'ALTER TABLE dbo.Customers DROP CONSTRAINT '+QUOTENAME(@customerCodeConstraint)+N';';
    EXEC sys.sp_executesql @dropCustomerCodeConstraint;
  END;
  ALTER TABLE dbo.Customers DROP COLUMN code;
END;

-- A single company uses the systems; no Product/Supplies office links are saved.
IF OBJECT_ID(N'dbo.ProductOffices',N'U') IS NOT NULL
BEGIN
  IF EXISTS(SELECT 1 FROM dbo.ProductOffices)
    THROW 51000, 'Product office links must be archived before removing their table.', 1;
  DROP TABLE dbo.ProductOffices;
END;
IF OBJECT_ID(N'dbo.SupplyOffices',N'U') IS NOT NULL
BEGIN
  IF EXISTS(SELECT 1 FROM dbo.SupplyOffices)
    THROW 51000, 'Supply office links must be archived before removing their table.', 1;
  DROP TABLE dbo.SupplyOffices;
END;

-- Values and business rules are supplied by the API requests.
-- Identity keys, indexes, unique keys and foreign keys remain in the database.
DECLARE @rules TABLE (tableName SYSNAME, constraintName SYSNAME);
INSERT INTO @rules(tableName,constraintName)
SELECT t.name,d.name
FROM sys.default_constraints d JOIN sys.tables t ON t.object_id=d.parent_object_id
WHERE t.schema_id=SCHEMA_ID(N'dbo') AND t.is_ms_shipped=0
UNION ALL
SELECT t.name,c.name
FROM sys.check_constraints c JOIN sys.tables t ON t.object_id=c.parent_object_id
WHERE t.schema_id=SCHEMA_ID(N'dbo') AND t.is_ms_shipped=0;

DECLARE @table SYSNAME,@column SYSNAME,@constraint SYSNAME,@statement NVARCHAR(MAX);
WHILE EXISTS(SELECT 1 FROM @rules)
BEGIN
  SELECT TOP(1) @table=tableName,@constraint=constraintName FROM @rules ORDER BY tableName,constraintName;
  SET @statement=N'ALTER TABLE dbo.'+QUOTENAME(@table)+N' DROP CONSTRAINT '+QUOTENAME(@constraint)+N';';
  EXEC sys.sp_executesql @statement;
  DELETE FROM @rules WHERE tableName=@table AND constraintName=@constraint;
END;

-- Copy existing generated codes/numbers before replacing their expressions.
DECLARE @computed TABLE (objectId INT,columnId INT,tableName SYSNAME,columnName SYSNAME,typeName SYSNAME,maxLength SMALLINT,collationName SYSNAME);
INSERT INTO @computed(objectId,columnId,tableName,columnName,typeName,maxLength,collationName)
SELECT t.object_id,c.column_id,t.name,c.name,ty.name,c.max_length,c.collation_name
FROM sys.computed_columns c
JOIN sys.tables t ON t.object_id=c.object_id
JOIN sys.types ty ON ty.user_type_id=c.user_type_id
WHERE t.schema_id=SCHEMA_ID(N'dbo') AND t.is_ms_shipped=0;

IF EXISTS(SELECT 1 FROM @computed WHERE typeName NOT IN(N'varchar',N'nvarchar'))
  THROW 51000, 'A computed column has an unexpected type; no values were changed.', 1;
IF EXISTS(SELECT 1 FROM @computed c JOIN sys.index_columns i ON i.object_id=c.objectId AND i.column_id=c.columnId)
  THROW 51000, 'A computed column is indexed; preserve its index in a dedicated migration first.', 1;
IF EXISTS(SELECT 1 FROM @computed c JOIN sys.sql_expression_dependencies d ON d.referenced_id=c.objectId AND d.referenced_minor_id=c.columnId)
  THROW 51000, 'A computed column has another SQL dependency; review it before conversion.', 1;

DECLARE @temporary SYSNAME,@type SYSNAME,@length SMALLINT,@collation SYSNAME,@qualified NVARCHAR(776);
WHILE EXISTS(SELECT 1 FROM @computed)
BEGIN
  SELECT TOP(1) @table=tableName,@column=columnName,@type=typeName,@length=maxLength,@collation=collationName
  FROM @computed ORDER BY tableName,columnName;
  SET @temporary=N'__stored_'+@column;
  IF COL_LENGTH(N'dbo.'+QUOTENAME(@table),@temporary) IS NOT NULL
    THROW 51000, 'The temporary stored-value column already exists; no values were changed.', 1;
  SET @statement=N'ALTER TABLE dbo.'+QUOTENAME(@table)+N' ADD '+QUOTENAME(@temporary)+N' '+@type
    +N'('+CASE WHEN @length=-1 THEN N'MAX' ELSE CONVERT(nvarchar(10),@length/CASE WHEN @type=N'nvarchar' THEN 2 ELSE 1 END) END+N')'
    +N' COLLATE '+@collation+N' NULL;';
  EXEC sys.sp_executesql @statement;
  SET @statement=N'UPDATE dbo.'+QUOTENAME(@table)+N' SET '+QUOTENAME(@temporary)+N'='+QUOTENAME(@column)+N';';
  EXEC sys.sp_executesql @statement;
  SET @statement=N'ALTER TABLE dbo.'+QUOTENAME(@table)+N' DROP COLUMN '+QUOTENAME(@column)+N';';
  EXEC sys.sp_executesql @statement;
  SET @qualified=N'dbo.'+QUOTENAME(@table)+N'.'+QUOTENAME(@temporary);
  EXEC sys.sp_rename @objname=@qualified,@newname=@column,@objtype=N'COLUMN';
  DELETE FROM @computed WHERE tableName=@table AND columnName=@column;
END;

-- Optional form inputs accept NULL. Existing entered values are not rewritten.
DECLARE @optionalColumns TABLE (tableName SYSNAME,columnName SYSNAME);
INSERT INTO @optionalColumns(tableName,columnName) VALUES
  (N'SalesUserLogin',N'cpnumber'),
  (N'SalesUserLogin',N'email'),
  (N'SalesUserLogin',N'photo'),
  (N'PurchasingUserLogin',N'cpnumber'),
  (N'PurchasingUserLogin',N'email'),
  (N'PurchasingUserLogin',N'photo'),
  (N'WarehouseUserLogin',N'cpnumber'),
  (N'WarehouseUserLogin',N'email'),
  (N'WarehouseUserLogin',N'photo'),
  (N'ConfigurationUserLogin',N'cpnumber'),
  (N'ConfigurationUserLogin',N'email'),
  (N'ConfigurationUserLogin',N'photo'),
  (N'Customers',N'contactPerson'),
  (N'Customers',N'cpnumber'),
  (N'Customers',N'email'),
  (N'Customers',N'salesInCharge'),
  (N'Customers',N'salesInChargeId'),
  (N'Customers',N'tin'),
  (N'Customers',N'faxNo'),
  (N'Customers',N'countryOfOrigin'),
  (N'Customers',N'country'),
  (N'Customers',N'category'),
  (N'Customers',N'remarks'),
  (N'Customers',N'paymentTerm'),
  (N'Customers',N'salesAddressType'),
  (N'Customers',N'drAddressType'),
  (N'Customers',N'discount'),
  (N'Customers',N'discountType'),
  (N'Customers',N'includePoInInvoice'),
  (N'Customers',N'vatInclusive'),
  (N'Customers',N'taxCode'),
  (N'Products',N'description'),
  (N'Products',N'price'),
  (N'Products',N'revision'),
  (N'Products',N'secondaryUnit'),
  (N'Products',N'quantityPerSecondaryUnit'),
  (N'Products',N'moq'),
  (N'Products',N'spq'),
  (N'Products',N'vatMode'),
  (N'Products',N'unitCost'),
  (N'Products',N'model'),
  (N'Products',N'category'),
  (N'Products',N'planType'),
  (N'Products',N'color'),
  (N'Products',N'divisor'),
  (N'Products',N'remarks'),
  (N'Products',N'thickness'),
  (N'Products',N'weight'),
  (N'Products',N'productHeaderId'),
  (N'Products',N'tagColor'),
  (N'Products',N'inventorySetup'),
  (N'SalesOrders',N'number'),
  (N'SalesOrders',N'notes'),
  (N'SalesInvoices',N'number'),
  (N'SalesInvoices',N'notes'),
  (N'DeliveryReceipts',N'number'),
  (N'DeliveryReceipts',N'notes'),
  (N'ShippingInvoices',N'number'),
  (N'ShippingInvoices',N'carrier'),
  (N'ShippingInvoices',N'trackingNumber'),
  (N'ShippingInvoices',N'notes'),
  (N'ConfigAtc',N'rate'),
  (N'ConfigAtc',N'accountCode'),
  (N'ConfigAtc',N'deletedDate'),
  (N'ConfigCountries',N'deletedDate'),
  (N'ConfigCustomerCategories',N'deletedDate'),
  (N'ConfigProductCategories',N'deletedDate'),
  (N'ConfigSuppliesCategories',N'deletedDate'),
  (N'ConfigWarehouses',N'deletedDate'),
  (N'ConfigLocations',N'deletedDate'),
  (N'ConfigPaymentTerms',N'days'),
  (N'ConfigPaymentTerms',N'month'),
  (N'ConfigPaymentTerms',N'dateOfMonth'),
  (N'ConfigPaymentTerms',N'dayOfMonth'),
  (N'ConfigPaymentTerms',N'deletedDate'),
  (N'ConfigUnits',N'decimal'),
  (N'ConfigUnits',N'deletedDate'),
  (N'ConfigCurrencies',N'checkName'),
  (N'ConfigCurrencies',N'symbol'),
  (N'ConfigCurrencies',N'deletedDate'),
  (N'ConfigBanks',N'accountNo'),
  (N'ConfigBanks',N'accountName'),
  (N'ConfigBanks',N'swiftCode'),
  (N'ConfigBanks',N'branchName'),
  (N'ConfigBanks',N'address'),
  (N'ConfigBanks',N'accountType'),
  (N'ConfigBanks',N'currency'),
  (N'ConfigBanks',N'account'),
  (N'ConfigBanks',N'deletedDate'),
  (N'ConfigVatCodes',N'rate'),
  (N'ConfigVatCodes',N'accountCode'),
  (N'ConfigVatCodes',N'deletedDate'),
  (N'Suppliers',N'code'),
  (N'Suppliers',N'remarks'),
  (N'Suppliers',N'tin'),
  (N'Suppliers',N'contactPerson'),
  (N'Suppliers',N'email'),
  (N'Suppliers',N'countryOfOrigin'),
  (N'Suppliers',N'country'),
  (N'Suppliers',N'cpnumber'),
  (N'Suppliers',N'faxNo'),
  (N'Suppliers',N'paymentTerm'),
  (N'Suppliers',N'taxCode'),
  (N'Supplies',N'code'),
  (N'Supplies',N'productId'),
  (N'Supplies',N'maker'),
  (N'Supplies',N'description'),
  (N'Supplies',N'remarks'),
  (N'Supplies',N'minimumStock'),
  (N'Supplies',N'color'),
  (N'Supplies',N'thickness'),
  (N'Supplies',N'netWeight'),
  (N'Supplies',N'weightUnit'),
  (N'Supplies',N'category'),
  (N'Supplies',N'inventorySetup'),
  (N'SupplyInventorySchedules',N'scheduleDate'),
  (N'SupplyInventorySchedules',N'month'),
  (N'SupplySuppliers',N'moq'),
  (N'SupplySuppliers',N'price'),
  (N'SupplySuppliers',N'currency'),
  (N'SupplySuppliers',N'remarks'),
  (N'PurchaseRequests',N'requestedBy'),
  (N'PurchaseRequests',N'requestedDept'),
  (N'PurchaseRequests',N'checkedBy'),
  (N'PurchaseRequests',N'approvedBy'),
  (N'PurchaseRequests',N'approvedBy2'),
  (N'PurchaseRequests',N'remarks'),
  (N'PurchaseRequests',N'postedById'),
  (N'PurchaseRequests',N'postedAt'),
  (N'PurchaseRequestItems',N'description'),
  (N'PurchaseRequestItems',N'neededDate'),
  (N'PurchaseRequestItems',N'remarks'),
  (N'PurchaseOrders',N'number'),
  (N'PurchaseOrders',N'supplierContactPerson'),
  (N'PurchaseOrders',N'suppliesCategory'),
  (N'PurchaseOrders',N'deliveryAddress'),
  (N'PurchaseOrders',N'remarks'),
  (N'PurchaseOrders',N'postedById'),
  (N'PurchaseOrders',N'postedAt'),
  (N'PurchaseOrderItems',N'description'),
  (N'PurchaseOrderItems',N'discountRate'),
  (N'PurchaseOrderItems',N'remarks'),
  (N'SuppliesReceipts',N'number'),
  (N'SuppliesReceipts',N'drNumber'),
  (N'SuppliesReceipts',N'pezaReference'),
  (N'SuppliesReceipts',N'invoiceDate'),
  (N'SuppliesReceipts',N'remarks'),
  (N'SuppliesReceipts',N'postedById'),
  (N'SuppliesReceipts',N'postedAt'),
  (N'SuppliesReceiptItems',N'remarks'),
  (N'SuppliesReceiptAllocations',N'expiryDate'),
  (N'SuppliesReceiptAllocations',N'mfgDate'),
  (N'SuppliesReceiptAllocations',N'imLot'),
  (N'SuppliesReceiptAllocations',N'qcStatus'),
  (N'SuppliesReceiptAllocations',N'warehouseId'),
  (N'SuppliesReceiptAllocations',N'locationId'),
  (N'SupplyInventory',N'imLot'),
  (N'SupplyInventory',N'qcStatus'),
  (N'SupplyInventory',N'expiryDate'),
  (N'SupplyInventory',N'mfgDate'),
  (N'ProductCustomerApprovals',N'approvalDate'),
  (N'ProductCustomerApprovals',N'eolDate'),
  (N'ProductCustomerApprovals',N'approvalRemarks'),
  (N'ProductCustomerApprovals',N'eolRemarks'),
  (N'ProductInventorySchedules',N'scheduleDate'),
  (N'ProductInventorySchedules',N'month');
DECLARE @precision TINYINT,@scale TINYINT;
WHILE EXISTS(SELECT 1 FROM @optionalColumns)
BEGIN
  SELECT TOP(1) @table=tableName,@column=columnName FROM @optionalColumns ORDER BY tableName,columnName;
  SELECT @type=ty.name,@length=c.max_length,@precision=c.precision,@scale=c.scale,@collation=c.collation_name
  FROM sys.tables t JOIN sys.columns c ON c.object_id=t.object_id JOIN sys.types ty ON ty.user_type_id=c.user_type_id
  WHERE t.schema_id=SCHEMA_ID(N'dbo') AND t.name=@table AND c.name=@column AND c.is_nullable=0 AND c.is_computed=0;
  IF @@ROWCOUNT=1
  BEGIN
    SET @statement=N'ALTER TABLE dbo.'+QUOTENAME(@table)+N' ALTER COLUMN '+QUOTENAME(@column)+N' '+QUOTENAME(@type)
      +CASE WHEN @type IN(N'varchar',N'nvarchar',N'char',N'nchar',N'varbinary',N'binary')
        THEN N'('+CASE WHEN @length=-1 THEN N'MAX' ELSE CONVERT(nvarchar(10),@length/CASE WHEN @type IN(N'nvarchar',N'nchar') THEN 2 ELSE 1 END) END+N')'
        WHEN @type IN(N'decimal',N'numeric') THEN N'('+CONVERT(nvarchar(10),@precision)+N','+CONVERT(nvarchar(10),@scale)+N')'
        WHEN @type IN(N'datetime2',N'datetimeoffset',N'time') THEN N'('+CONVERT(nvarchar(10),@scale)+N')'
        ELSE N'' END
      +CASE WHEN @collation IS NOT NULL THEN N' COLLATE '+@collation ELSE N'' END+N' NULL;';
    EXEC sys.sp_executesql @statement;
  END;
  DELETE FROM @optionalColumns WHERE tableName=@table AND columnName=@column;
END;
