SET XACT_ABORT ON;

IF OBJECT_ID(N'dbo.PurchasingUserLogin',N'U') IS NULL
BEGIN
  CREATE TABLE dbo.PurchasingUserLogin (
    id INT IDENTITY PRIMARY KEY,name NVARCHAR(150) NOT NULL,username NVARCHAR(80) NOT NULL,
    cpnumber NVARCHAR(30) NULL,email NVARCHAR(254) NULL,photo NVARCHAR(MAX) NULL,
    role NVARCHAR(20) NOT NULL,passwordHash VARCHAR(300) NOT NULL,isActive BIT NOT NULL,
    createdAt DATETIME2 NOT NULL,updatedAt DATETIME2 NOT NULL,
    CONSTRAINT UQ_PurchasingUserLogin_Username UNIQUE(username)
  );
END;

IF OBJECT_ID(N'dbo.WarehouseUserLogin',N'U') IS NULL
BEGIN
  CREATE TABLE dbo.WarehouseUserLogin (
    id INT IDENTITY PRIMARY KEY,name NVARCHAR(150) NOT NULL,username NVARCHAR(80) NOT NULL,
    cpnumber NVARCHAR(30) NULL,email NVARCHAR(254) NULL,photo NVARCHAR(MAX) NULL,
    role NVARCHAR(20) NOT NULL,passwordHash VARCHAR(300) NOT NULL,isActive BIT NOT NULL,
    createdAt DATETIME2 NOT NULL,updatedAt DATETIME2 NOT NULL,
    CONSTRAINT UQ_WarehouseUserLogin_Username UNIQUE(username)
  );
END;

IF OBJECT_ID(N'dbo.ConfigurationUserLogin',N'U') IS NULL
BEGIN
  CREATE TABLE dbo.ConfigurationUserLogin (
    id INT IDENTITY PRIMARY KEY,name NVARCHAR(150) NOT NULL,username NVARCHAR(80) NOT NULL,
    cpnumber NVARCHAR(30) NULL,email NVARCHAR(254) NULL,photo NVARCHAR(MAX) NULL,
    role NVARCHAR(20) NOT NULL,passwordHash VARCHAR(300) NOT NULL,isActive BIT NOT NULL,
    createdAt DATETIME2 NOT NULL,updatedAt DATETIME2 NOT NULL,
    CONSTRAINT UQ_ConfigurationUserLogin_Username UNIQUE(username)
  );
END;
