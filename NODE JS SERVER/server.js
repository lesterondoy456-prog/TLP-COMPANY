import { initializeDatabase, closeDatabase } from './database.js';
import { seedAdministrator } from './components/auth.js';
import { createApp } from './Api/ClientApi.js';

const port = Number(process.env.PORT || 5189);
const host = process.env.HOST || '127.0.0.1';
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be a valid TCP port.');
if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) throw new Error('Set SESSION_SECRET to at least 32 random characters in NODE JS SERVER/.env.');

try {
  await initializeDatabase();
  await seedAdministrator();
} catch (error) {
  console.error(`SQL Server startup failed (${error.code || 'configuration'}): ${error.message}`);
  await closeDatabase();
  process.exit(1);
}

const app = createApp({ SESSION_SECRET: process.env.SESSION_SECRET }, process.argv.includes('--production'));
app.requestTimeout = 30000;
app.headersTimeout = 15000;
app.listen(port, host, () => {
  console.log(`TLP Company sales ${process.argv.includes('--production') ? 'app' : 'API'}: http://${host}:${port}`);
  console.log(`SQL Server database: ${process.env.DB_NAME || 'TLP Company'} (connected)`);
});
app.on('error', async error => {
  console.error(`Server failed (${error.code || 'error'}): ${error.message}`);
  await closeDatabase();
  process.exit(1);
});

let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  app.close(async () => { await closeDatabase(); process.exit(0); });
  app.closeIdleConnections();
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
