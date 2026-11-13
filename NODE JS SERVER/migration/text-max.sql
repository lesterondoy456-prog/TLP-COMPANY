SET XACT_ABORT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET ARITHABORT ON;
SET NUMERIC_ROUNDABORT OFF;

-- Text length is controlled by each frontend. Indexed key lengths stay intact.
-- TIN is text so values containing hyphens remain valid.
DECLARE @columns TABLE (
  objectId INT,columnId INT,tableName SYSNAME,columnName SYSNAME,
  sourceType SYSNAME,targetType SYSNAME,collationName SYSNAME,isNullable BIT
);
INSERT INTO @columns(objectId,columnId,tableName,columnName,sourceType,targetType,collationName,isNullable)
SELECT t.object_id,c.column_id,t.name,c.name,ty.name,
  CASE WHEN c.name=N'tin' THEN N'varchar' ELSE ty.name END,c.collation_name,c.is_nullable
FROM sys.tables t
JOIN sys.schemas s ON s.schema_id=t.schema_id
JOIN sys.columns c ON c.object_id=t.object_id
JOIN sys.types ty ON ty.user_type_id=c.user_type_id
WHERE s.name=N'dbo' AND t.is_ms_shipped=0 AND c.is_computed=0 AND ty.name IN(N'varchar',N'nvarchar')
  AND (c.max_length<>-1 OR (c.name=N'tin' AND ty.name<>N'varchar'))
  AND NOT EXISTS (
    SELECT 1 FROM sys.index_columns ic JOIN sys.indexes i ON i.object_id=ic.object_id AND i.index_id=ic.index_id
    WHERE ic.object_id=c.object_id AND ic.column_id=c.column_id AND ic.key_ordinal>0 AND i.is_hypothetical=0
  );

IF EXISTS(SELECT 1 FROM @columns c JOIN sys.stats_columns sc ON sc.object_id=c.objectId AND sc.column_id=c.columnId JOIN sys.stats st ON st.object_id=sc.object_id AND st.stats_id=sc.stats_id WHERE st.user_created=1)
  THROW 51000, 'Review user-created statistics before changing text length.', 1;
IF EXISTS(SELECT 1 FROM @columns c JOIN sys.index_columns ic ON ic.object_id=c.objectId AND ic.column_id=c.columnId)
  THROW 51000, 'Review the affected index before changing text length.', 1;
IF EXISTS(SELECT 1 FROM @columns c JOIN sys.foreign_key_columns fk ON (fk.parent_object_id=c.objectId AND fk.parent_column_id=c.columnId) OR (fk.referenced_object_id=c.objectId AND fk.referenced_column_id=c.columnId))
  THROW 51000, 'Review the affected foreign key before changing text length.', 1;

DECLARE @table SYSNAME,@column SYSNAME,@sourceType SYSNAME,@type SYSNAME,@collation SYSNAME,@nullable BIT,@statement NVARCHAR(MAX);
WHILE EXISTS(SELECT 1 FROM @columns)
BEGIN
  SELECT TOP(1) @table=tableName,@column=columnName,@sourceType=sourceType,@type=targetType,@collation=collationName,@nullable=isNullable
  FROM @columns ORDER BY tableName,columnName;
  IF @sourceType=N'nvarchar' AND @type=N'varchar'
  BEGIN
    SET @statement=N'IF EXISTS(SELECT 1 FROM dbo.'+QUOTENAME(@table)
      +N' WHERE CONVERT(varbinary(MAX),'+QUOTENAME(@column)+N') <> '
      +N'CONVERT(varbinary(MAX),CONVERT(nvarchar(MAX),CONVERT(varchar(MAX),'
      +QUOTENAME(@column)+N' COLLATE '+@collation+N') COLLATE '+@collation+N'))) '
      +N'THROW 51000, ''TIN contains characters that cannot be preserved in VARCHAR.'', 1;';
    EXEC sys.sp_executesql @statement;
  END;
  SET @statement=N'ALTER TABLE dbo.'+QUOTENAME(@table)+N' ALTER COLUMN '+QUOTENAME(@column)
    +N' '+@type+N'(MAX) COLLATE '+@collation+CASE WHEN @nullable=1 THEN N' NULL' ELSE N' NOT NULL' END+N';';
  EXEC sys.sp_executesql @statement;
  DELETE FROM @columns WHERE tableName=@table AND columnName=@column;
END;
