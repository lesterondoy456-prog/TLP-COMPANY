IF OBJECT_ID(N'dbo.ProductStockMovements', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.ProductStockMovements (
    id INT IDENTITY PRIMARY KEY,
    requestKey VARCHAR(32) NOT NULL,
    productId INT NOT NULL REFERENCES dbo.Products(id),
    direction NVARCHAR(MAX) NOT NULL,
    quantity DECIMAL(18,3) NOT NULL,
    unit NVARCHAR(MAX) NOT NULL,
    stockBefore DECIMAL(18,3) NOT NULL,
    stockAfter DECIMAL(18,3) NOT NULL,
    movementDate DATE NOT NULL,
    sourceDestination NVARCHAR(MAX) NOT NULL,
    reference NVARCHAR(MAX) NULL,
    reason NVARCHAR(MAX) NOT NULL,
    createdById INT NOT NULL REFERENCES dbo.SalesUserLogin(id),
    createdAt DATETIME2 NOT NULL,
    CONSTRAINT UQ_ProductStockMovements_RequestKey UNIQUE (requestKey)
  );
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.ProductStockMovements') AND name=N'IX_ProductStockMovements_ProductCreated')
  CREATE INDEX IX_ProductStockMovements_ProductCreated ON dbo.ProductStockMovements(productId,createdAt DESC,id DESC);
