import { createServer } from 'node:http';
import { db, initializeDatabase, closeDatabase } from './database.js';
import { seedAdministrators } from './components/auth.js';
import { handleSalesApi } from './Api/SalesApi.js';
import { handlePurchasingApi } from './Api/PurchasingApi.js';
import { handleWarehouseApi } from './Api/WarehouseApi.js';
import { handleConfigurationApi } from './Api/ConfigurationApi.js';
import { MAX_BODY, json, methodNotAllowed, checkOrigin, errorResponse } from './Api/common.js';

const port = Number(process.env.PORT || 5189);
const host = process.env.HOST || '127.0.0.1';
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be a valid TCP port.');
if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) throw new Error('Set SESSION_SECRET to at least 32 random characters in NODE JS SERVER/.env.');

try {
  await initializeDatabase();
  await seedAdministrators();
} catch (error) {
  console.error(`SQL Server startup failed (${error.code || 'configuration'}): ${error.message}`);
  await closeDatabase();
  process.exit(1);
}

const environment = { SESSION_SECRET: process.env.SESSION_SECRET };
const handlers = [handleSalesApi, handlePurchasingApi, handleWarehouseApi, handleConfigurationApi];

async function send(outgoing, response, head = false) {
  outgoing.statusCode = response.status;
  response.headers.forEach((value, key) => outgoing.setHeader(key, value));
  outgoing.end(head ? undefined : Buffer.from(await response.arrayBuffer()));
}

const app = createServer(async (incoming, outgoing) => {
  try {
    const url = new URL(incoming.url, `http://${incoming.headers.host || 'localhost'}`);
    if (!url.pathname.startsWith('/api/')) {
      const response = url.pathname === '/' && ['GET', 'HEAD'].includes(incoming.method)
        ? json({ name: 'TLP Company API', systems: ['sales', 'purchasing', 'warehouse', 'configuration'] })
        : json({ message: 'This endpoint was not found.' }, 404);
      await send(outgoing, response, incoming.method === 'HEAD');
      return;
    }
    if (Number(incoming.headers['content-length']) > MAX_BODY) {
      incoming.resume();
      await send(outgoing, json({ message: 'This request is too large. Keep photos below 550 KB.' }, 413));
      return;
    }
    const chunks = [];
    let size = 0;
    for await (const chunk of incoming) {
      size += chunk.length;
      if (size <= MAX_BODY) chunks.push(chunk);
    }
    if (size > MAX_BODY) {
      await send(outgoing, json({ message: 'This request is too large. Keep photos below 550 KB.' }, 413));
      return;
    }
    const headers = new Headers(incoming.headers);
    headers.set('x-tlp-client-address', incoming.socket.remoteAddress || 'local');
    const request = new Request(url, {
      method: incoming.method,
      headers,
      ...(!['GET', 'HEAD'].includes(incoming.method) && chunks.length ? { body: Buffer.concat(chunks) } : {}),
    });
    checkOrigin(request);
    if (url.pathname === '/api/health') {
      if (request.method !== 'GET') { await send(outgoing, methodNotAllowed(['GET'])); return; }
      try {
        const result = await db().request().query('SELECT DB_NAME() AS name');
        await send(outgoing, json({ ok: true, service: 'TLP Company API', database: { status: 'connected', name: result.recordset[0].name } }));
      } catch {
        await send(outgoing, json({ ok: false, service: 'TLP Company API', database: { status: 'disconnected', name: process.env.DB_NAME || 'TLP Company' } }, 503));
      }
      return;
    }
    for (const handle of handlers) {
      const response = await handle(request, { env: environment });
      if (response) { await send(outgoing, response); return; }
    }
    await send(outgoing, json({ message: 'This endpoint was not found.' }, 404));
  } catch (error) {
    if (!outgoing.headersSent) await send(outgoing, errorResponse(error));
    else outgoing.end();
  }
});

app.requestTimeout = 30000;
app.headersTimeout = 15000;
app.listen(port, host, () => {
  console.log(`TLP Company API: http://${host}:${port}`);
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
