-- Capture print-only invoice details at issuance; existing invoices remain unknown.
IF COL_LENGTH(N'dbo.SalesInvoices',N'buyerTin') IS NULL
  ALTER TABLE dbo.SalesInvoices ADD buyerTin NVARCHAR(MAX) NULL;
IF COL_LENGTH(N'dbo.SalesInvoices',N'shipToName') IS NULL
  ALTER TABLE dbo.SalesInvoices ADD shipToName NVARCHAR(MAX) NULL;
IF COL_LENGTH(N'dbo.SalesInvoices',N'vatClass') IS NULL
  ALTER TABLE dbo.SalesInvoices ADD vatClass NVARCHAR(MAX) NULL;
IF COL_LENGTH(N'dbo.SalesInvoices',N'preparedByName') IS NULL
  ALTER TABLE dbo.SalesInvoices ADD preparedByName NVARCHAR(MAX) NULL;
