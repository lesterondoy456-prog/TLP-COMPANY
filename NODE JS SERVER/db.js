const { existsSync } = require('node:fs');
const { join } = require('node:path');
const { runMigrations } = require('./migration/run');

const envFile = join(__dirname, '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);
const sql = require('mssql');

let pool;

function makePool(database) {
  return new sql.ConnectionPool({
    server: process.env.DB_SERVER || 'localhost',
    database,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    options: { encrypt: true, trustServerCertificate: true },
    connectionTimeout: 15000,
    requestTimeout: 15000,
    pool: { max: 10, min: 0, idleTimeoutMillis: 30000 },
  });
}

async function initializeDatabase() {
  pool = await runMigrations({
    database: process.env.DB_NAME || 'TLPCompany',
    createPool: makePool,
    sql,
    onPoolError: error => console.error('Database pool error:', error.code || error.message),
  });
  return pool;
}

function db() {
  if (!pool?.connected) throw new Error('Database is unavailable.');
  return pool;
}

async function closeDatabase() { if (pool) await pool.close(); }

async function transaction(work) {
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

function request(scope = db()) { return new sql.Request(scope); }

module.exports = { sql, initializeDatabase, closeDatabase, db, transaction, request };
