import { existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import sql from 'mssql';
import { createApp } from './Api/ClientApi.js';

const envFile = fileURLToPath(new URL('./.env', import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);

const env = { SESSION_SECRET: process.env.SESSION_SECRET || randomBytes(48).toString('base64url') };
const port = Number(process.env.PORT || 5189);
const production = process.argv.includes('--production');

const databaseConfigured = Boolean(process.env.DB_SERVER && process.env.DB_NAME && process.env.DB_USER && process.env.DB_PASSWORD);
let databaseStatus = 'not_configured';
let databasePool;

async function checkDatabase() {
  if (!databaseConfigured) return 'not_configured';
  try {
    if (!databasePool) {
      databasePool = new sql.ConnectionPool({
        server: process.env.DB_SERVER,
        database: process.env.DB_NAME,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        ...(process.env.DB_PORT ? { port: Number(process.env.DB_PORT) } : {}),
        connectionTimeout: 5000,
        requestTimeout: 5000,
        pool: { max: 5, min: 0, idleTimeoutMillis: 30000 },
        options: {
          encrypt: process.env.DB_ENCRYPT !== 'false',
          trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE === 'true',
        },
      });
      databasePool.on('error', () => { databaseStatus = 'disconnected'; });
    }
    await databasePool.connect();
    await databasePool.request().query('SELECT DB_NAME() AS databaseName');
    if (databaseStatus !== 'connected') console.log(`SQL Server connected: ${process.env.DB_NAME}`);
    databaseStatus = 'connected';
  } catch (error) {
    if (databaseStatus !== 'disconnected') console.error(`SQL Server connection failed (${error.code || 'connection error'}). Check backend/.env and database access.`);
    databaseStatus = 'disconnected';
  }
  return databaseStatus;
}

env.checkDatabase = checkDatabase;
await checkDatabase();
if (!databaseConfigured) console.log('SQL Server not configured. Set DB_SERVER, DB_NAME, DB_USER and DB_PASSWORD in backend/.env.');

createApp(env, production).listen(port, '127.0.0.1', () => {
  console.log(`SalesPort ${production ? 'app' : 'API'}: http://127.0.0.1:${port}`);
});
