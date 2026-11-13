import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { runMigrations } from './migration/run.js';

// Database modules are evaluated before server.js. Load configuration before
// selecting a driver so Linux containers never load the Windows native addon.
const envFile = fileURLToPath(new URL('./.env', import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);
const sqlAuthentication = process.env.DB_AUTH?.toLowerCase() === 'sql';
const sql = (await import(sqlAuthentication ? 'mssql' : 'mssql/msnodesqlv8.js')).default;

let pool;
export { sql };

function connectionString(database) {
  const configured = process.env.DB_CONNECTION_STRING;
  if (configured) {
    if (/\bDatabase\s*=/i.test(configured)) return configured.replace(/\bDatabase\s*=\s*[^;]*/i, `Database=${database}`);
    return `${configured.replace(/;?$/, ';')}Database=${database};`;
  }
  const server = process.env.DB_SERVER || '.\\MSSQLSERVER01';
  return `Driver={ODBC Driver 18 for SQL Server};Server=${server};Database=${database};Trusted_Connection=yes;Encrypt=yes;TrustServerCertificate=yes;`;
}

function makePool(database) {
  if (sqlAuthentication) {
    const port = Number(process.env.DB_PORT || 1433);
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('DB_PORT must be a valid TCP port.');
    if (!process.env.DB_USER || !process.env.DB_PASSWORD) throw new Error('Set DB_USER and DB_PASSWORD when DB_AUTH=sql.');
    return new sql.ConnectionPool({
      server: process.env.DB_SERVER || 'localhost',
      port,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database,
      connectionTimeout: 15000,
      requestTimeout: 15000,
      pool: { max: 10, min: 0, idleTimeoutMillis: 30000 },
      options: {
        encrypt: process.env.DB_ENCRYPT !== 'false',
        trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE === 'true',
      },
    });
  }
  return new sql.ConnectionPool({
    connectionString: connectionString(database),
    connectionTimeout: 15000,
    requestTimeout: 15000,
    pool: { max: 10, min: 0, idleTimeoutMillis: 30000 },
  });
}

export async function initializeDatabase() {
  pool = await runMigrations({
    database: process.env.DB_NAME || 'TLP Company',
    createPool: makePool,
    sql,
    onPoolError: error => console.error('Database pool error:', error.code || error.message),
  });
  return pool;
}

export function db() {
  if (!pool?.connected) throw new Error('Database is unavailable.');
  return pool;
}

export async function closeDatabase() { if (pool) await pool.close(); }

export async function transaction(work) {
  const tx = new sql.Transaction(db());
  await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
  try {
    const result = await work(tx);
    await tx.commit();
    return result;
  } catch (error) {
    try { await tx.rollback(); } catch { /* SQL may already have rolled back. */ }
    throw error;
  }
}

export function request(scope = db()) { return new sql.Request(scope); }
