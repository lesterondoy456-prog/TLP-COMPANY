SET XACT_ABORT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET ARITHABORT ON;
SET NUMERIC_ROUNDABORT OFF;

-- Form lengths belong to the React applications. Index key lengths and all
-- numeric definitions stay unchanged. TIN remains text, including its hyphens.
DECLARE @columns TABLE (
  rowId INT IDENTITY PRIMARY KEY, objectId INT, columnId INT,
  tableName SYSNAME, columnName SYSNAME, sourceType SYSNAME, targetType SYSNAME,
  collationName SYSNAME, isNullable BIT, isComputed BIT,
  computedDefinition NVARCHAR(MAX), isPersisted BIT
);
INSERT INTO @columns(objectId,columnId,tableName,columnName,sourceType,targetType,collationName,isNullable,isComputed,computedDefinition,isPersisted)
SELECT t.object_id,c.column_id,t.name,c.name,ty.name,
  CASE WHEN c.name=N'tin' THEN N'varchar' ELSE ty.name END,
  c.collation_name,c.is_nullable,c.is_computed,cc.definition,cc.is_persisted
FROM sys.tables t
JOIN sys.schemas s ON s.schema_id=t.schema_id
JOIN sys.columns c ON c.object_id=t.object_id
JOIN sys.types ty ON ty.user_type_id=c.user_type_id
LEFT JOIN sys.computed_columns cc ON cc.object_id=c.object_id AND cc.column_id=c.column_id
WHERE s.name=N'dbo' AND t.is_ms_shipped=0 AND ty.name IN(N'varchar',N'nvarchar')
  AND (c.max_length<>-1 OR (c.name=N'tin' AND ty.name<>N'varchar'))
  AND NOT EXISTS (
    SELECT 1 FROM sys.index_columns ic JOIN sys.indexes i ON i.object_id=ic.object_id AND i.index_id=ic.index_id
    WHERE ic.object_id=c.object_id AND ic.column_id=c.column_id AND ic.key_ordinal>0 AND i.is_hypothetical=0
  );

IF EXISTS(SELECT 1 FROM @columns)
BEGIN
  -- Do not silently remove externally added indexes, statistics or relations.
  IF EXISTS(SELECT 1 FROM @columns c JOIN sys.stats_columns sc ON sc.object_id=c.objectId AND sc.column_id=c.columnId JOIN sys.stats st ON st.object_id=sc.object_id AND st.stats_id=sc.stats_id WHERE st.user_created=1)
    THROW 51000, 'Text MAX migration requires review of user-created statistics on affected columns.', 1;
  IF EXISTS(SELECT 1 FROM @columns c JOIN sys.index_columns ic ON ic.object_id=c.objectId AND ic.column_id=c.columnId)
    THROW 51000, 'Text MAX migration requires review of an included or computed column index.', 1;
  IF EXISTS(SELECT 1 FROM @columns c JOIN sys.foreign_key_columns fk ON (fk.parent_object_id=c.objectId AND fk.parent_column_id=c.columnId) OR (fk.referenced_object_id=c.objectId AND fk.referenced_column_id=c.columnId))
    THROW 51000, 'Text MAX migration requires review of an affected foreign key.', 1;

  DECLARE @checks TABLE(rowId INT IDENTITY PRIMARY KEY,tableName SYSNAME,constraintName SYSNAME,definition NVARCHAR(MAX),isDisabled BIT,isNotTrusted BIT,isNotForReplication BIT);
  INSERT INTO @checks(tableName,constraintName,definition,isDisabled,isNotTrusted,isNotForReplication)
  SELECT OBJECT_NAME(ch.parent_object_id),ch.name,ch.definition,ch.is_disabled,ch.is_not_trusted,ch.is_not_for_replication
  FROM sys.check_constraints ch
  WHERE ch.parent_object_id IN(SELECT objectId FROM @columns);

  DECLARE @defaults TABLE(rowId INT IDENTITY PRIMARY KEY,tableName SYSNAME,columnName SYSNAME,constraintName SYSNAME,definition NVARCHAR(MAX));
  INSERT INTO @defaults(tableName,columnName,constraintName,definition)
  SELECT c.tableName,c.columnName,d.name,d.definition
  FROM @columns c JOIN sys.default_constraints d ON d.parent_object_id=c.objectId AND d.parent_column_id=c.columnId;

  DECLARE @row INT,@last INT,@table SYSNAME,@column SYSNAME,@sourceType SYSNAME,@type SYSNAME,@collation SYSNAME,
    @nullable BIT,@computed BIT,@persisted BIT,@constraint SYSNAME,@definition NVARCHAR(MAX),
    @disabled BIT,@untrusted BIT,@replication BIT,@statement NVARCHAR(MAX);
  BEGIN TRY
    BEGIN TRANSACTION;

    SET @row=1; SELECT @last=MAX(rowId) FROM @columns;
    WHILE @row<=@last
    BEGIN
      SELECT @table=tableName,@column=columnName,@sourceType=sourceType,@type=targetType,@collation=collationName
      FROM @columns WHERE rowId=@row;
      IF @sourceType=N'nvarchar' AND @type=N'varchar'
      BEGIN
        -- Refuse a lossy conversion of existing Unicode identifiers.
        SET @statement=N'IF EXISTS(SELECT 1 FROM dbo.'+QUOTENAME(@table)
          +N' WHERE CONVERT(varbinary(MAX),'+QUOTENAME(@column)+N') <> '
          +N'CONVERT(varbinary(MAX),CONVERT(nvarchar(MAX),CONVERT(varchar(MAX),'
          +QUOTENAME(@column)+N' COLLATE '+@collation+N') COLLATE '+@collation+N'))) '
          +N'THROW 51000, ''TIN contains characters that cannot be preserved in VARCHAR.'', 1;';
        EXEC sys.sp_executesql @statement;
      END;
      SET @row+=1;
    END;

    SET @row=1; SELECT @last=MAX(rowId) FROM @checks;
    WHILE @row<=ISNULL(@last,0)
    BEGIN
      SELECT @table=tableName,@constraint=constraintName FROM @checks WHERE rowId=@row;
      SET @statement=N'ALTER TABLE dbo.'+QUOTENAME(@table)+N' DROP CONSTRAINT '+QUOTENAME(@constraint)+N';';
      EXEC sys.sp_executesql @statement;
      SET @row+=1;
    END;

    SET @row=1; SELECT @last=MAX(rowId) FROM @defaults;
    WHILE @row<=ISNULL(@last,0)
    BEGIN
      SELECT @table=tableName,@constraint=constraintName FROM @defaults WHERE rowId=@row;
      SET @statement=N'ALTER TABLE dbo.'+QUOTENAME(@table)+N' DROP CONSTRAINT '+QUOTENAME(@constraint)+N';';
      EXEC sys.sp_executesql @statement;
      SET @row+=1;
    END;

    SET @row=1; SELECT @last=MAX(rowId) FROM @columns;
    WHILE @row<=@last
    BEGIN
      SELECT @table=tableName,@column=columnName,@type=targetType,@collation=collationName,
        @nullable=isNullable,@computed=isComputed,@definition=computedDefinition,@persisted=isPersisted
      FROM @columns WHERE rowId=@row;
      IF @computed=1
      BEGIN
        -- Generated document numbers keep the same expression, value and format.
        -- Only their resulting text type changes; user-entered rows are not edited.
        SET @statement=N'ALTER TABLE dbo.'+QUOTENAME(@table)+N' DROP COLUMN '+QUOTENAME(@column)+N';';
        EXEC sys.sp_executesql @statement;
        SET @statement=N'ALTER TABLE dbo.'+QUOTENAME(@table)+N' ADD '+QUOTENAME(@column)
          +N' AS (CONVERT('+@type+N'(MAX),'+@definition+N') COLLATE '+@collation+N')'
          +CASE WHEN @persisted=1 THEN N' PERSISTED' ELSE N'' END+N';';
      END
      ELSE
        SET @statement=N'ALTER TABLE dbo.'+QUOTENAME(@table)+N' ALTER COLUMN '+QUOTENAME(@column)
          +N' '+@type+N'(MAX) COLLATE '+@collation
          +CASE WHEN @nullable=1 THEN N' NULL' ELSE N' NOT NULL' END+N';';
      EXEC sys.sp_executesql @statement;
      SET @row+=1;
    END;

    SET @row=1; SELECT @last=MAX(rowId) FROM @defaults;
    WHILE @row<=ISNULL(@last,0)
    BEGIN
      SELECT @table=tableName,@column=columnName,@constraint=constraintName,@definition=definition FROM @defaults WHERE rowId=@row;
      SET @statement=N'ALTER TABLE dbo.'+QUOTENAME(@table)+N' ADD CONSTRAINT '+QUOTENAME(@constraint)+N' DEFAULT '+@definition+N' FOR '+QUOTENAME(@column)+N';';
      EXEC sys.sp_executesql @statement;
      SET @row+=1;
    END;

    SET @row=1; SELECT @last=MAX(rowId) FROM @checks;
    WHILE @row<=ISNULL(@last,0)
    BEGIN
      SELECT @table=tableName,@constraint=constraintName,@definition=definition,@disabled=isDisabled,
        @untrusted=isNotTrusted,@replication=isNotForReplication FROM @checks WHERE rowId=@row;
      SET @statement=N'ALTER TABLE dbo.'+QUOTENAME(@table)
        +CASE WHEN @disabled=1 OR @untrusted=1 THEN N' WITH NOCHECK' ELSE N' WITH CHECK' END
        +N' ADD CONSTRAINT '+QUOTENAME(@constraint)+N' CHECK '
        +CASE WHEN @replication=1 THEN N'NOT FOR REPLICATION ' ELSE N'' END+@definition+N';';
      EXEC sys.sp_executesql @statement;
      SET @statement=N'ALTER TABLE dbo.'+QUOTENAME(@table)
        +CASE WHEN @disabled=1 THEN N' NOCHECK' ELSE N' CHECK' END+N' CONSTRAINT '+QUOTENAME(@constraint)+N';';
      EXEC sys.sp_executesql @statement;
      SET @row+=1;
    END;

    COMMIT TRANSACTION;
  END TRY
  BEGIN CATCH
    IF XACT_STATE()<>0 ROLLBACK TRANSACTION;
    THROW;
  END CATCH;
END;
