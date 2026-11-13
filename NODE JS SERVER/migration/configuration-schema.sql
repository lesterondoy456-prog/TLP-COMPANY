SET XACT_ABORT ON;

IF OBJECT_ID(N'dbo.ConfigAtc',N'U') IS NULL
CREATE TABLE dbo.ConfigAtc (
  id INT IDENTITY PRIMARY KEY, code NVARCHAR(40) NOT NULL UNIQUE, description NVARCHAR(500) NOT NULL,
  rate DECIMAL(18,6) NULL, accountCode NVARCHAR(100) NULL,
  isActive BIT NOT NULL, deletedDate DATETIME2 NULL, createdAt DATETIME2 NOT NULL, updatedAt DATETIME2 NOT NULL
);
IF OBJECT_ID(N'dbo.ConfigCountries',N'U') IS NULL
CREATE TABLE dbo.ConfigCountries (
  id INT IDENTITY PRIMARY KEY, name NVARCHAR(100) NOT NULL UNIQUE,
  isActive BIT NOT NULL, deletedDate DATETIME2 NULL, createdAt DATETIME2 NOT NULL, updatedAt DATETIME2 NOT NULL
);
IF OBJECT_ID(N'dbo.ConfigCustomerCategories',N'U') IS NULL
CREATE TABLE dbo.ConfigCustomerCategories (
  id INT IDENTITY PRIMARY KEY, name NVARCHAR(100) NOT NULL UNIQUE,
  isActive BIT NOT NULL, deletedDate DATETIME2 NULL, createdAt DATETIME2 NOT NULL, updatedAt DATETIME2 NOT NULL
);
IF OBJECT_ID(N'dbo.ConfigProductCategories',N'U') IS NULL
CREATE TABLE dbo.ConfigProductCategories (
  id INT IDENTITY PRIMARY KEY, name NVARCHAR(100) NOT NULL UNIQUE,
  isActive BIT NOT NULL, deletedDate DATETIME2 NULL, createdAt DATETIME2 NOT NULL, updatedAt DATETIME2 NOT NULL
);
IF OBJECT_ID(N'dbo.ConfigSuppliesCategories',N'U') IS NULL
CREATE TABLE dbo.ConfigSuppliesCategories (
  id INT IDENTITY PRIMARY KEY, name NVARCHAR(100) NOT NULL UNIQUE,
  isActive BIT NOT NULL, deletedDate DATETIME2 NULL, createdAt DATETIME2 NOT NULL, updatedAt DATETIME2 NOT NULL
);
IF OBJECT_ID(N'dbo.ConfigWarehouses',N'U') IS NULL
CREATE TABLE dbo.ConfigWarehouses (
  id INT IDENTITY PRIMARY KEY, code NVARCHAR(40) NOT NULL UNIQUE, description NVARCHAR(500) NOT NULL,
  isActive BIT NOT NULL, deletedDate DATETIME2 NULL, createdAt DATETIME2 NOT NULL, updatedAt DATETIME2 NOT NULL
);
IF OBJECT_ID(N'dbo.ConfigLocations',N'U') IS NULL
CREATE TABLE dbo.ConfigLocations (
  id INT IDENTITY PRIMARY KEY, code NVARCHAR(40) NOT NULL UNIQUE, description NVARCHAR(500) NOT NULL,
  isActive BIT NOT NULL, deletedDate DATETIME2 NULL, createdAt DATETIME2 NOT NULL, updatedAt DATETIME2 NOT NULL
);
IF OBJECT_ID(N'dbo.ConfigPaymentTerms',N'U') IS NULL
CREATE TABLE dbo.ConfigPaymentTerms (
  id INT IDENTITY PRIMARY KEY, description NVARCHAR(100) NOT NULL UNIQUE,
  days INT NULL, month INT NULL,
  dateOfMonth INT NULL, dayOfMonth INT NULL,
  dueDateEom BIT NOT NULL, forCustomer BIT NOT NULL, forSupplier BIT NOT NULL,
  isActive BIT NOT NULL, deletedDate DATETIME2 NULL, createdAt DATETIME2 NOT NULL, updatedAt DATETIME2 NOT NULL
);
IF OBJECT_ID(N'dbo.ConfigUnits',N'U') IS NULL
CREATE TABLE dbo.ConfigUnits (
  id INT IDENTITY PRIMARY KEY, description NVARCHAR(150) NOT NULL, shortName NVARCHAR(30) NOT NULL UNIQUE,
  forProduct BIT NOT NULL, forSupplies BIT NOT NULL, [decimal] INT NULL,
  isActive BIT NOT NULL, deletedDate DATETIME2 NULL, createdAt DATETIME2 NOT NULL, updatedAt DATETIME2 NOT NULL
);
IF OBJECT_ID(N'dbo.ConfigCurrencies',N'U') IS NULL
CREATE TABLE dbo.ConfigCurrencies (
  id INT IDENTITY PRIMARY KEY, name NVARCHAR(150) NOT NULL, shortName NVARCHAR(30) NOT NULL UNIQUE,
  checkName NVARCHAR(150) NULL, symbol NVARCHAR(20) NULL, isDefault BIT NOT NULL,
  isActive BIT NOT NULL, deletedDate DATETIME2 NULL, createdAt DATETIME2 NOT NULL, updatedAt DATETIME2 NOT NULL
);
IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.ConfigCurrencies') AND name=N'UX_ConfigCurrencies_ActiveDefault')
CREATE UNIQUE INDEX UX_ConfigCurrencies_ActiveDefault ON dbo.ConfigCurrencies(isDefault) WHERE isDefault=1 AND isActive=1;
IF OBJECT_ID(N'dbo.ConfigBanks',N'U') IS NULL
CREATE TABLE dbo.ConfigBanks (
  id INT IDENTITY PRIMARY KEY, name NVARCHAR(200) NOT NULL, shortName NVARCHAR(80) NOT NULL UNIQUE,
  accountNo NVARCHAR(100) NULL, accountName NVARCHAR(150) NULL, swiftCode NVARCHAR(50) NULL,
  branchName NVARCHAR(150) NULL, address NVARCHAR(500) NULL, accountType NVARCHAR(80) NULL,
  currency NVARCHAR(30) NULL, account NVARCHAR(100) NULL,
  isActive BIT NOT NULL, deletedDate DATETIME2 NULL, createdAt DATETIME2 NOT NULL, updatedAt DATETIME2 NOT NULL
);
IF OBJECT_ID(N'dbo.ConfigVatCodes',N'U') IS NULL
CREATE TABLE dbo.ConfigVatCodes (
  id INT IDENTITY PRIMARY KEY, code NVARCHAR(40) NOT NULL UNIQUE, description NVARCHAR(500) NOT NULL,
  [type] NVARCHAR(80) NOT NULL,
  [class] NVARCHAR(80) NOT NULL,
  rate DECIMAL(18,6) NULL, prodVatInd BIT NOT NULL, accountCode NVARCHAR(100) NULL,
  isActive BIT NOT NULL, deletedDate DATETIME2 NULL, createdAt DATETIME2 NOT NULL, updatedAt DATETIME2 NOT NULL
);
IF OBJECT_ID(N'dbo.AuditTrail',N'U') IS NULL
CREATE TABLE dbo.AuditTrail (
  id BIGINT IDENTITY PRIMARY KEY, userId INT NOT NULL, userName NVARCHAR(150) NOT NULL,
  system NVARCHAR(20) NOT NULL,
  module NVARCHAR(100) NOT NULL, action NVARCHAR(50) NOT NULL, recordId NVARCHAR(100) NOT NULL,
  createdAt DATETIME2 NOT NULL
);
IF COL_LENGTH(N'dbo.AuditTrail', N'system') IS NULL
BEGIN
  ALTER TABLE dbo.AuditTrail ADD system NVARCHAR(20) NULL;
  EXEC(N'UPDATE dbo.AuditTrail SET system=N''sales'' WHERE system IS NULL;');
  ALTER TABLE dbo.AuditTrail ALTER COLUMN system NVARCHAR(20) NOT NULL;
END;

-- A user id belongs to the table identified by system; it cannot reference Sales
-- accounts globally when four independent account tables share this audit log.
DECLARE @auditUserForeignKey sysname;
SELECT TOP(1) @auditUserForeignKey=f.name FROM sys.foreign_keys f
JOIN sys.foreign_key_columns c ON c.constraint_object_id=f.object_id
JOIN sys.columns p ON p.object_id=c.parent_object_id AND p.column_id=c.parent_column_id
WHERE f.parent_object_id=OBJECT_ID(N'dbo.AuditTrail') AND p.name=N'userId';
WHILE @auditUserForeignKey IS NOT NULL
BEGIN
  DECLARE @dropAuditUserForeignKey NVARCHAR(500)=N'ALTER TABLE dbo.AuditTrail DROP CONSTRAINT '+QUOTENAME(@auditUserForeignKey);
  EXEC(@dropAuditUserForeignKey);
  SET @auditUserForeignKey=NULL;
  SELECT TOP(1) @auditUserForeignKey=f.name FROM sys.foreign_keys f
  JOIN sys.foreign_key_columns c ON c.constraint_object_id=f.object_id
  JOIN sys.columns p ON p.object_id=c.parent_object_id AND p.column_id=c.parent_column_id
  WHERE f.parent_object_id=OBJECT_ID(N'dbo.AuditTrail') AND p.name=N'userId';
END;
