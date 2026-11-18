SET XACT_ABORT ON;

-- Stable machine identities are available for future planning/process links.
-- Existing product approvals and business transactions are not rewritten.
IF OBJECT_ID(N'dbo.ConfigMachines', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.ConfigMachines (
    id INT IDENTITY PRIMARY KEY,
    code NVARCHAR(40) NOT NULL,
    name NVARCHAR(MAX) NOT NULL,
    description NVARCHAR(MAX) NULL,
    isActive BIT NOT NULL,
    deletedDate DATETIME2 NULL,
    createdAt DATETIME2 NOT NULL,
    updatedAt DATETIME2 NOT NULL,
    CONSTRAINT UQ_ConfigMachines_Code UNIQUE(code)
  );
END;
