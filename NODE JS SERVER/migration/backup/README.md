# Move TTICompany to another PC

The transfer contains all five project folders, including `.env`, `node_modules`, builds and local project files. Its verified `TTICompany.bak` is inside `NODE JS SERVER/migration/backup/` and is ignored by Git. Only `.git` is excluded from the archive. GitHub stores encrypted transfer parts; plaintext credentials and database contents stay inside the encrypted archive. Keep the separate key file from Downloads; it is required to decrypt the transfer and is not in GitHub.

Install Git, Node.js 24, Docker Desktop and **SQL Server 2025 (17.x) or newer** on the destination Windows PC. The source SQL Server version is `17.0.1000.7`. A SQL Server 2025 backup cannot restore to SQL Server 2022 or older. [Microsoft backup compatibility](https://learn.microsoft.com/en-us/sql/relational-databases/backup-restore/create-a-full-database-backup-sql-server?view=sql-server-ver17).

1. Clone the repository and decrypt using the key copied separately from the old PC:

   ```powershell
   git clone https://github.com/lesterondoy456-prog/TTICompany.git "C:\Projects\TTICompany"
   cd "C:\Projects\TTICompany\NODE JS SERVER\migration\backup"
   node decrypt.mjs "C:\Transfer\TTICompany-transfer.key" "C:\Transfer\decrypted"
   ```

2. Extract the five project folders over that clone. Keep the decrypted archive outside the clone. The archive contains no `.git` directory, so this retains Git history and the GitHub remote for continuing development:

   ```powershell
   tar -xzf "C:\Transfer\decrypted\TTICompany-transfer.tar.gz" -C "C:\Projects\TTICompany"
   ```

3. Enable SQL Server mixed authentication and TCP/IP on port 1433, restart SQL Server, and allow Docker Desktop to reach it. Run the restore as a Windows account that is SQL Server administrator. Set `-Server` to the destination instance name:

   ```powershell
   cd "C:\Projects\TTICompany\NODE JS SERVER"
   powershell -NoProfile -ExecutionPolicy Bypass -File ".\migration\backup\restore-database.ps1" -Server ".\MSSQLSERVER01"
   ```

   The SQL Server service account must be able to read `TTICompany.bak`. If needed, move the file to the SQL Server backup directory and supply `-BackupFile "C:\SQLBackup\TTICompany.bak"`. The script verifies the backup, discovers its logical data/log files, and restores into the destination SQL Server's default directories. It refuses an existing `TTICompany` database and never uses `WITH REPLACE`.

   The script reads the extracted backend `.env`, creates its SQL login only when absent, and maps the restored database user to that login. It preserves database permissions and existing login passwords. If the database restores but login setup fails, fix the reported login issue manually; rerunning cannot overwrite the restored database.

4. Review the local backend `.env`: keep `DB_NAME=TTICompany` and its restored credentials; set `DB_SERVER` to the new SQL instance when running Node directly. Docker Compose overrides that host to `host.docker.internal`. Build and start the five systems:

   ```powershell
   docker compose build
   docker compose up -d nodejs-server sales-system warehouse-system purchasing-system configuration-system
   docker compose ps
   ```

   Sales: `http://localhost:5189`; Warehouse: `http://localhost:5190`; Purchasing: `http://localhost:5191`; Configuration: `http://localhost:5192`; backend: `http://localhost:5188`. Use the new PC's LAN IP for another device.

Copied `node_modules` are included for completeness but contain Windows binaries. Docker installs its own Linux dependencies during its build. For running a project directly, run `npm ci` inside that project first.

Cloudflare tunnel credentials live outside the project in the old PC's `.cloudflared` directory and are not part of this project archive. Copy/configure those separately before starting the two tunnel services on the new PC. Stop the old connector if you intend to move the public hostnames entirely to the new PC.

The `.bak` restores the existing company data as of this backup. It does not create sample transactions. Keep the decrypted archive, `.env`, `.bak` and transfer key local; do not add those plaintext files to this public repository.
