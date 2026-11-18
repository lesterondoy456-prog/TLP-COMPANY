[CmdletBinding()]
param(
  [string]$Server = '.\MSSQLSERVER01',
  [string]$BackupFile,
  [string]$EnvFile
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2.0

if ([string]::IsNullOrWhiteSpace($BackupFile)) { $BackupFile = Join-Path $PSScriptRoot 'TTICompany.bak' }
if ([string]::IsNullOrWhiteSpace($EnvFile)) { $EnvFile = Join-Path $PSScriptRoot '..\..\.env' }

if (!(Test-Path -LiteralPath $BackupFile -PathType Leaf)) { throw 'Backup file not found. Supply -BackupFile with the extracted TTICompany.bak path.' }
if (!(Test-Path -LiteralPath $EnvFile -PathType Leaf)) { throw 'Backend .env not found. Extract the complete transfer before restoring.' }
$backupPath = (Resolve-Path -LiteralPath $BackupFile).ProviderPath
$settings = @{}
foreach ($line in [IO.File]::ReadAllLines((Resolve-Path -LiteralPath $EnvFile).ProviderPath)) {
  if ($line -notmatch '^\s*(?:export\s+)?(?<key>DB_USER|DB_PASSWORD|DB_NAME)\s*=\s*(?<value>.*)$') { continue }
  $key = $Matches.key
  $value = $Matches.value.Trim()
  if ($value.StartsWith('"')) {
    if ($value -notmatch '^"(?<text>[^"]*)"\s*(?:#.*)?$') { throw 'The database .env settings need simple single-line quoted values.' }
    $value = $Matches.text
  } elseif ($value.StartsWith("'")) {
    if ($value -notmatch "^'(?<text>[^']*)'\s*(?:#.*)?$") { throw 'The database .env settings need simple single-line quoted values.' }
    $value = $Matches.text
  } else {
    $value = ($value -split '#', 2)[0].Trim()
  }
  $settings[$key] = $value
}
if ($settings.ContainsKey('DB_NAME') -and $settings.DB_NAME -ne 'TTICompany') { throw 'DB_NAME must be TTICompany for this restore.' }
if (!$settings.ContainsKey('DB_USER') -or !$settings.ContainsKey('DB_PASSWORD') -or !$settings.DB_USER -or !$settings.DB_PASSWORD) { throw 'The extracted backend .env must contain DB_USER and DB_PASSWORD.' }
if ($settings.DB_USER.Length -gt 128 -or $settings.DB_PASSWORD.Length -gt 128) { throw 'SQL login names and passwords must fit SQL Server limits.' }
if ($settings.DB_USER -in @('dbo', 'sa', 'guest', 'sys', 'INFORMATION_SCHEMA')) { throw 'Use the existing application SQL login in .env, not a system account.' }

$builder = [System.Data.SqlClient.SqlConnectionStringBuilder]::new()
$builder['Data Source'] = $Server
$builder['Initial Catalog'] = 'master'
$builder['Integrated Security'] = $true
$builder['Encrypt'] = $true
$builder['TrustServerCertificate'] = $true
$builder['Connect Timeout'] = 30
$connection = [System.Data.SqlClient.SqlConnection]::new($builder.ConnectionString)
$restored = $false
try {
  $connection.Open()
  $command = $connection.CreateCommand()
  $command.CommandText = @'
IF DB_ID(N'TTICompany') IS NOT NULL
  THROW 51000, 'TTICompany already exists. This script never overwrites an existing database.', 1;
SELECT CAST(SERVERPROPERTY('ProductMajorVersion') AS INT) AS MajorVersion,
       CAST(SERVERPROPERTY('IsIntegratedSecurityOnly') AS INT) AS WindowsAuthenticationOnly,
       CAST(SERVERPROPERTY('InstanceDefaultDataPath') AS NVARCHAR(4000)) AS DataPath,
       CAST(SERVERPROPERTY('InstanceDefaultLogPath') AS NVARCHAR(4000)) AS LogPath;
'@
  $serverInfo = [System.Data.DataTable]::new()
  $adapter = [System.Data.SqlClient.SqlDataAdapter]::new($command)
  [void]$adapter.Fill($serverInfo)
  $adapter.Dispose()
  $command.Dispose()
  if ([int]$serverInfo.Rows[0].MajorVersion -lt 17) { throw 'Install SQL Server 2025 (17.x) or newer. This backup cannot restore to SQL Server 2022 or older.' }
  if ([int]$serverInfo.Rows[0].WindowsAuthenticationOnly -eq 1) { throw 'Enable SQL Server and Windows Authentication (Mixed Mode), then restart SQL Server before restoring.' }
  if ([string]::IsNullOrWhiteSpace([string]$serverInfo.Rows[0].DataPath) -or [string]::IsNullOrWhiteSpace([string]$serverInfo.Rows[0].LogPath)) { throw 'SQL Server must have default data and log directories configured.' }

  $command = $connection.CreateCommand()
  $command.CommandText = 'RESTORE HEADERONLY FROM DISK=@backup;'
  [void]$command.Parameters.Add('@backup', [System.Data.SqlDbType]::NVarChar, 4000)
  $command.Parameters['@backup'].Value = $backupPath
  $header = [System.Data.DataTable]::new()
  $adapter = [System.Data.SqlClient.SqlDataAdapter]::new($command)
  [void]$adapter.Fill($header)
  $adapter.Dispose()
  $command.Dispose()
  if ($header.Rows.Count -ne 1 -or [string]$header.Rows[0].DatabaseName -ne 'TTICompany' -or [int]$header.Rows[0].BackupType -ne 1) { throw 'Expected one full TTICompany database backup in this file.' }
  if ([int]$header.Rows[0].SoftwareVersionMajor -gt [int]$serverInfo.Rows[0].MajorVersion) { throw 'The backup was created by a newer SQL Server version. Upgrade the destination SQL Server first.' }
  if (![bool]$header.Rows[0].HasBackupChecksums) { throw 'Expected the supplied backup with backup checksums.' }

  $command = $connection.CreateCommand()
  $command.CommandTimeout = 0
  $command.CommandText = 'RESTORE VERIFYONLY FROM DISK=@backup WITH FILE=1,CHECKSUM;'
  [void]$command.Parameters.Add('@backup', [System.Data.SqlDbType]::NVarChar, 4000)
  $command.Parameters['@backup'].Value = $backupPath
  [void]$command.ExecuteNonQuery()
  $command.Dispose()

  $command = $connection.CreateCommand()
  $command.CommandText = 'RESTORE FILELISTONLY FROM DISK=@backup WITH FILE=1,CHECKSUM;'
  [void]$command.Parameters.Add('@backup', [System.Data.SqlDbType]::NVarChar, 4000)
  $command.Parameters['@backup'].Value = $backupPath
  $files = [System.Data.DataTable]::new()
  $adapter = [System.Data.SqlClient.SqlDataAdapter]::new($command)
  [void]$adapter.Fill($files)
  $adapter.Dispose()
  $command.Dispose()
  if (!$files.Rows.Count -or @($files.Rows | Where-Object { $_.Type -notin @('D', 'L') }).Count) { throw 'This restore supports ordinary SQL data and log files only.' }
  if (!@($files.Rows | Where-Object Type -eq 'D').Count -or !@($files.Rows | Where-Object Type -eq 'L').Count) { throw 'The backup must contain both data and log files.' }

  $command = $connection.CreateCommand()
  $command.CommandTimeout = 0
  [void]$command.Parameters.Add('@backup', [System.Data.SqlDbType]::NVarChar, 4000)
  $command.Parameters['@backup'].Value = $backupPath
  $moves = @()
  $suffix = [Guid]::NewGuid().ToString('N')
  $dataCount = 0
  $index = 0
  foreach ($file in $files.Rows | Sort-Object FileId) {
    if ($file.Type -eq 'L') {
      $directory = [string]$serverInfo.Rows[0].LogPath
      $extension = '.ldf'
    } else {
      $directory = [string]$serverInfo.Rows[0].DataPath
      $extension = if ($dataCount -eq 0) { '.mdf' } else { '.ndf' }
      $dataCount++
    }
    $target = [IO.Path]::Combine($directory, ('TTICompany_' + $suffix + '_' + $file.FileId + $extension))
    $logicalParameter = '@logical' + $index
    $pathParameter = '@path' + $index
    [void]$command.Parameters.Add($logicalParameter, [System.Data.SqlDbType]::NVarChar, 128)
    $command.Parameters[$logicalParameter].Value = [string]$file.LogicalName
    [void]$command.Parameters.Add($pathParameter, [System.Data.SqlDbType]::NVarChar, 4000)
    $command.Parameters[$pathParameter].Value = $target
    $moves += 'MOVE ' + $logicalParameter + ' TO ' + $pathParameter
    $index++
  }
  # Check again immediately before restoring; never use WITH REPLACE.
  $command.CommandText = @'
IF DB_ID(N'TTICompany') IS NOT NULL
  THROW 51000, 'TTICompany already exists. Restore cancelled without overwriting it.', 1;
RESTORE DATABASE [TTICompany] FROM DISK=@backup WITH FILE=1,CHECKSUM,RECOVERY,
'@ + ($moves -join ',') + ';'
  [void]$command.ExecuteNonQuery()
  $command.Dispose()
  $restored = $true

  $connection.ChangeDatabase('TTICompany')
  $command = $connection.CreateCommand()
  $command.CommandText = 'SELECT COUNT(*) FROM sys.database_principals WHERE name=@login AND type=''S'' AND principal_id>4;'
  [void]$command.Parameters.Add('@login', [System.Data.SqlDbType]::NVarChar, 128)
  $command.Parameters['@login'].Value = $settings.DB_USER
  $userExists = [int]$command.ExecuteScalar()
  $command.Dispose()
  if ($userExists -ne 1) { throw 'The restored database has no matching application SQL user. Review its permissions manually; no additional permissions were granted.' }

  $connection.ChangeDatabase('master')
  $command = $connection.CreateCommand()
  $command.CommandText = @'
IF EXISTS (SELECT 1 FROM sys.server_principals WHERE name=@login AND type<>'S')
  THROW 51000, 'The application login name belongs to another type of server principal.', 1;
IF NOT EXISTS (SELECT 1 FROM sys.server_principals WHERE name=@login)
BEGIN
  DECLARE @statement NVARCHAR(MAX) = N'CREATE LOGIN ' + QUOTENAME(@login)
    + N' WITH PASSWORD=' + QUOTENAME(@password, '''')
    + N', DEFAULT_DATABASE=[TTICompany], CHECK_POLICY=ON, CHECK_EXPIRATION=OFF;';
  EXEC sys.sp_executesql @statement;
END;
'@
  [void]$command.Parameters.Add('@login', [System.Data.SqlDbType]::NVarChar, 128)
  $command.Parameters['@login'].Value = $settings.DB_USER
  [void]$command.Parameters.Add('@password', [System.Data.SqlDbType]::NVarChar, 128)
  $command.Parameters['@password'].Value = $settings.DB_PASSWORD
  try { [void]$command.ExecuteNonQuery() } catch { throw 'TTICompany was restored, but SQL login setup failed. Review the saved application login and SQL Server password policy; no existing password was changed.' }
  finally { $command.Dispose() }

  $connection.ChangeDatabase('TTICompany')
  $command = $connection.CreateCommand()
  $command.CommandText = @'
DECLARE @statement NVARCHAR(MAX) = N'ALTER USER ' + QUOTENAME(@login)
  + N' WITH LOGIN=' + QUOTENAME(@login) + N';';
EXEC sys.sp_executesql @statement;
'@
  [void]$command.Parameters.Add('@login', [System.Data.SqlDbType]::NVarChar, 128)
  $command.Parameters['@login'].Value = $settings.DB_USER
  [void]$command.ExecuteNonQuery()
  $command.Dispose()
  # ALTER USER preserves permissions and role memberships from the backup.
  # Existing server login passwords are never changed.
  $appBuilder = [System.Data.SqlClient.SqlConnectionStringBuilder]::new($builder.ConnectionString)
  $appBuilder['Integrated Security'] = $false
  $appBuilder['Initial Catalog'] = 'TTICompany'
  $password = ConvertTo-SecureString $settings.DB_PASSWORD -AsPlainText -Force
  $password.MakeReadOnly()
  $credential = [System.Data.SqlClient.SqlCredential]::new($settings.DB_USER, $password)
  $application = [System.Data.SqlClient.SqlConnection]::new($appBuilder.ConnectionString, $credential)
  try {
    $application.Open()
    $command = $application.CreateCommand()
    $command.CommandText = 'SELECT 1;'
    [void]$command.ExecuteScalar()
    $command.Dispose()
  } catch { throw 'TTICompany was restored, but the saved application credentials could not sign in. Existing login passwords were not changed. Check DB_USER, DB_PASSWORD and SQL authentication manually; do not rerun restore over the existing database.' }
  finally { $application.Dispose(); $password.Dispose() }
  Write-Output 'TTICompany restored. Application login verified; original database permissions retained.'
} catch {
  if ($restored) { Write-Warning 'The database has already been restored. Fix the reported login issue manually; this script will refuse to overwrite it.' }
  throw
} finally {
  $connection.Dispose()
  $settings.Clear()
}
