const express = require('express');
const { db, initializeDatabase, closeDatabase } = require('./db');

const MAX_BODY = 1024 * 1024;

function checkOrigin(request, allowedOrigins = []) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return;
  const origin = request.get('Origin');
  let validOrigin = !origin;
  if (origin) {
    try {
      const parsed = new URL(origin);
      validOrigin = ['http:', 'https:'].includes(parsed.protocol) && parsed.origin === origin;
    } catch { validOrigin = false; }
  }
  // changeOrigin proxies rewrite Host. Only configured frontend origins may
  // differ from it; HTTP LAN browsers do not send Fetch Metadata headers.
  if (request.get('Sec-Fetch-Site') === 'cross-site' || !validOrigin
    || (origin && origin !== `${request.protocol}://${request.get('host')}` && !allowedOrigins.includes(origin))) {
    throw Object.assign(new Error('Open this request from your TLP Company workspace.'), { status: 403 });
  }
}

function createApp(env = process.env) {
  const app = express();
  app.disable('x-powered-by');
  app.locals.env = env;
  const origins = (env.FRONTEND_ORIGINS || '').split(',').map(origin => origin.trim()).filter(Boolean);
  app.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    checkOrigin(req, origins);
    next();
  });
  app.use(express.json({ limit: MAX_BODY }));
  app.get('/', (req, res) => res.json({ name: 'TLP Company API', systems: ['sales', 'purchasing', 'warehouse', 'configuration'] }));
  app.get('/api/health', async (req, res) => {
    try {
      const result = await db().request().query('SELECT DB_NAME() AS name');
      res.json({ ok: true, service: 'TLP Company API', database: { status: 'connected', name: result.recordset[0].name } });
    } catch {
      res.status(503).json({ ok: false, service: 'TLP Company API', database: { status: 'disconnected', name: env.DB_NAME || 'TLPCompany' } });
    }
  });
  app.use('/api', require('./Api/LoginApiSystem'));
  app.use('/api/sales', require('./Api/SalesApi'));
  app.use('/api/purchasing', require('./Api/PurchasingApi'));
  app.use('/api/warehouse', require('./Api/WarehouseApi'));
  app.use('/api/configuration', require('./Api/ConfigurationApi'));
  app.use((req, res) => res.status(404).json({ message: 'This endpoint was not found.' }));
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    if (error.type === 'entity.too.large') return res.status(413).json({ message: 'This request is too large. Keep photos below 550 KB.' });
    if (error.type === 'entity.parse.failed') return res.status(400).json({ message: 'Send a valid JSON object.' });
    if (Number.isInteger(error.status) && error.status >= 400 && error.status <= 599) return res.status(error.status).json({ message: error.message });
    const number = error.number || error.originalError?.number || error.originalError?.info?.number || error.precedingErrors?.find(item => item.number)?.number;
    if ([2601, 2627].includes(number)) return res.status(409).json({ message: 'This code, SKU, username or sales document already exists. Use a unique value.' });
    if (number === 547) return res.status(409).json({ message: 'This record is referenced by another record and cannot be deleted. Deactivate it instead.' });
    if (number === 1205) return res.status(409).json({ message: 'Another transaction updated this record. Please retry.' });
    console.error('API error:', error.code || '', error.message);
    if (['ECONNCLOSED', 'ENOTOPEN', 'ESOCKET', 'ETIMEOUT', 'ELOGIN'].includes(error.code) || /Database is unavailable/.test(error.message)) return res.status(503).json({ message: 'The database is unavailable. Check SQL Server and try again.' });
    res.status(500).json({ message: 'Unable to save or load this record. Please try again.' });
  });
  return app;
}

async function start() {
  const port = Number(process.env.PORT || 5189);
  const host = process.env.HOST || '0.0.0.0';
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be a valid TCP port.');
  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) throw new Error('Set SESSION_SECRET to at least 32 random characters in NODE JS SERVER/.env.');
  await initializeDatabase();
  console.log(`SQL Server connected: ${process.env.DB_NAME || 'TLPCompany'}`);
  const server = createApp().listen(port, host, () => console.log(`TLP Company API: http://${host}:${port}`));
  server.requestTimeout = 30000;
  server.headersTimeout = 15000;
  server.on('error', async error => { console.error('Server failed:', error.code || error.message); await closeDatabase(); process.exit(1); });
  let stopping = false;
  const stop = () => {
    if (stopping) return;
    stopping = true;
    server.close(async () => { await closeDatabase(); process.exit(0); });
    server.closeIdleConnections();
    setTimeout(() => process.exit(0), 5000).unref();
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

if (require.main === module) {
  start().catch(async error => {
    console.error('Startup failed:', error.code || '', error.message);
    await closeDatabase();
    process.exit(1);
  });
}

module.exports = { createApp, checkOrigin, MAX_BODY };
