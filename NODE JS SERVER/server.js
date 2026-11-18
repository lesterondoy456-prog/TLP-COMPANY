const express = require('express');
const { createServer } = require('node:http');
const { createHash, randomBytes } = require('node:crypto');
const { Server } = require('socket.io');
const { db, initializeDatabase, closeDatabase } = require('./db');

const MAX_BODY = 1024 * 1024;
const SYSTEMS = ['sales', 'purchasing', 'warehouse', 'configuration', 'itticket'];

function sessionFingerprint(req, system) {
  const cookie = `tti_${system}_session=`;
  const token = String(req.get('cookie') || '').split(';').map(part => part.trim()).find(part => part.startsWith(cookie))?.slice(cookie.length);
  return token ? createHash('sha256').update(token).digest('hex') : null;
}

function revokeRealtime(state, predicate) {
  for (const [ticket, entry] of state.tickets) if (predicate(entry)) state.tickets.delete(ticket);
  if (state.io) for (const socket of state.io.sockets.sockets.values()) if (predicate(socket.data)) socket.disconnect(true);
}

function publishChanges(state, req, res, alreadyPosted) {
  if (!state.io || res.statusCode < 200 || res.statusCode >= 300 || alreadyPosted) return;
  const parts = new URL(req.originalUrl, 'http://local').pathname.split('/').filter(Boolean);
  const [, system, resource, id, action] = parts;
  if (parts[0] !== 'api' || !SYSTEMS.includes(system)) return;
  if (resource === 'auth' && id === 'logout' && req.method === 'POST') {
    const session = sessionFingerprint(req, system);
    if (session) revokeRealtime(state, entry => entry.system === system && entry.session === session);
    return;
  }
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return;
  const emit = (target, resources) => state.io.to(`system:${target}`).emit('data:changed', { system: target, resources: [...new Set(resources)], changedAt: new Date(state.now()).toISOString() });
  if (resource === 'helpdesk' && id === 'tickets' || system === 'itticket' && resource === 'tickets') {
    emit('itticket', ['tickets']);
    const owner = system === 'itticket' ? res.locals.ticketOwner : { system, id: res.locals.user?.id };
    if (owner && SYSTEMS.includes(owner.system) && owner.system !== 'itticket' && Number.isInteger(owner.id)) state.io.to(`user:${owner.system}:${owner.id}`).emit('data:changed', { system: owner.system, resources: ['helpdesk-tickets'], changedAt: new Date(state.now()).toISOString() });
    emit('configuration', ['audit-trail']);
    return;
  }
  if (system === 'sales' && resource === 'products' && action === 'stock-movements') {
    emit('sales', ['products', 'stock-movements']);
    emit('configuration', ['audit-trail']);
    return;
  }
  if (resource === 'users' || resource === 'auth' && id === 'profile') {
    // Account IDs belong to separate system tables. Never revoke an equal ID
    // from another system, or other sessions when only this session signs out.
    const userId = resource === 'users' ? Number(id) : res.locals.user?.id;
    if (req.method === 'PUT' && Number.isInteger(userId) && userId > 0) revokeRealtime(state, entry => entry.system === system && entry.userId === userId);
    emit(system, ['users']);
    emit('configuration', ['audit-trail']);
    return;
  }
  const sales = ['customers', 'products', 'sales-orders', 'sales-invoices', 'delivery-receipts', 'shipping-invoices'];
  const purchasing = ['suppliers', 'supplies', 'purchase-requests', 'purchase-orders', 'receivings'];
  if (system === 'sales' && sales.includes(resource)) {
    const invoiceCreated = resource === 'sales-invoices' && req.method === 'POST' && !id;
    emit('sales', [resource, 'options', ...(resource === 'sales-invoices' ? ['sales-orders', 'customers'] : []), ...(invoiceCreated ? ['products', 'stock-movements'] : []), ...(resource === 'delivery-receipts' ? ['sales-orders', 'sales-invoices', 'stock-movements'] : [])]);
    if (resource === 'customers' || resource === 'products') emit('purchasing', ['options']);
    emit('configuration', ['audit-trail']);
  } else if (system === 'purchasing' && purchasing.includes(resource)) {
    emit('purchasing', [resource, 'options', ...(resource === 'purchase-orders' ? ['purchase-requests'] : []), ...(resource === 'receivings' ? ['purchase-orders'] : [])]);
    if (resource === 'supplies') emit('sales', ['options']);
    if (resource === 'receivings' && action === 'post') emit('warehouse', ['inventory', 'movements']);
    emit('configuration', ['audit-trail']);
  } else if (system === 'configuration' && resource === 'masters') {
    emit('configuration', ['masters', id, 'audit-trail']);
    emit('sales', ['options']);
    emit('purchasing', ['options']);
    emit('warehouse', ['inventory', 'movements']);
  }
}

function attachRealtime(server, app) {
  const state = app.locals.realtime;
  if (state.io) throw new Error('Realtime is already attached to this application.');
  const io = new Server(server, { serveClient: false, maxHttpBufferSize: 4096 });
  state.io = io;
  io.use((socket, next) => {
    const ticket = socket.handshake.auth?.ticket;
    const entry = typeof ticket === 'string' && /^[A-Za-z0-9_-]{43}$/.test(ticket) ? state.tickets.get(ticket) : undefined;
    if (entry) state.tickets.delete(ticket); // Every attempted redemption consumes it.
    if (!entry || entry.expiresAt <= state.now() || entry.sessionExpiresAt <= state.now()) return next(new Error('Please sign in again to connect live updates.'));
    const count = [...io.sockets.sockets.values()].filter(active => active.data.system === entry.system && active.data.userId === entry.userId).length;
    if (count >= 50) return next(new Error('Too many live connections for this account.'));
    socket.data = entry;
    next();
  });
  io.on('connection', socket => {
    socket.join(`system:${socket.data.system}`);
    socket.join(`user:${socket.data.system}:${socket.data.userId}`);
    const timer = setTimeout(() => socket.disconnect(true), Math.max(1, socket.data.sessionExpiresAt - state.now()));
    timer.unref();
    socket.once('disconnect', () => clearTimeout(timer));
  });
  server.once('close', () => { state.tickets.clear(); state.io = null; });
  return io;
}

function checkOrigin(request) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return;
  const origin = request.get('Origin');
  let validOrigin = !origin;
  if (origin) {
    try {
      const parsed = new URL(origin);
      validOrigin = ['http:', 'https:'].includes(parsed.protocol) && parsed.origin === origin;
    } catch { validOrigin = false; }
  }
  if (request.get('Sec-Fetch-Site') === 'cross-site' || !validOrigin) {
    {
      const error = new Error('Open this request from your TTI Laguna Philippines Inc. workspace.');
      error.status = 403;
      throw error;
    }
  }
  // JSON is not a CORS-safelisted form type. With no CORS enabled, browsers
  // cannot send cross-origin JSON writes, including bodyless actions/logout.
  if (request.get('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    {
      const error = new Error('Send this request as JSON.');
      error.status = 415;
      throw error;
    }
  }
}

function createApp(env = process.env, options = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.locals.env = env;
  const state = { tickets: new Map(), io: null, now: options.now || Date.now, ticketTtlMs: Math.min(30000, Math.max(1, options.ticketTtlMs || 30000)), maxTickets: Math.min(10000, Math.max(1, options.maxTickets || 10000)) };
  app.locals.realtime = state;
  app.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    next();
  });
  app.use('/api', (req, _res, next) => {
    checkOrigin(req);
    next();
  });
  app.use((req, res, next) => {
    let alreadyPosted = false;
    const json = res.json;
    res.json = function (body) { alreadyPosted = body?.alreadyPosted === true || body?.replayed === true; return json.call(this, body); };
    res.once('finish', () => publishChanges(state, req, res, alreadyPosted));
    next();
  });
  app.all(['/api/:system/auth/profile', '/api/:system/users', '/api/:system/users/:id'], express.json({ limit: Infinity }));
  const standardJson = express.json({ limit: MAX_BODY });
  app.use((req, res, next) => {
    // Parse large support uploads only after their scoped session is verified.
    if (req.method === 'POST' && /^\/api\/(?:sales|purchasing|warehouse|configuration)\/helpdesk\/tickets\/?$/.test(req.path)) return next();
    standardJson(req, res, next);
  });
  app.get('/', (req, res) => res.json({ name: 'TTI Laguna Philippines Inc. API', systems: SYSTEMS }));
  app.get('/api/health', async (req, res) => {
    try {
      const result = await db().request().query('SELECT DB_NAME() AS name');
      res.json({ ok: true, service: 'TTI Laguna Philippines Inc. API', database: { status: 'connected', name: result.recordset[0].name } });
    } catch {
      res.status(503).json({ ok: false, service: 'TTI Laguna Philippines Inc. API', database: { status: 'disconnected', name: env.DB_NAME || 'TTICompany' } });
    }
  });
  app.use('/api', require('./Api/LoginApiSystem'));
  app.post('/api/:system/helpdesk/tickets', express.json({ limit: '72mb' }));
  app.get('/api/:system/realtime-ticket', (req, res) => {
    const { system } = req.params;
    const user = res.locals.user;
    const session = sessionFingerprint(req, system);
    if (!SYSTEMS.includes(system) || user?.system !== system || !session || !Number.isFinite(res.locals.sessionExpiresAt)) return res.status(401).json({ message: 'Please sign in to this system to continue.' });
    if (!state.io) return res.status(503).json({ message: 'Live updates are temporarily unavailable.' });
    const now = state.now();
    for (const [ticket, entry] of state.tickets) if (entry.expiresAt <= now || entry.sessionExpiresAt <= now) state.tickets.delete(ticket);
    const pending = [...state.tickets].filter(([, entry]) => entry.system === system && entry.session === session);
    for (const [ticket] of pending.slice(0, Math.max(0, pending.length - 4))) state.tickets.delete(ticket);
    if (state.tickets.size >= state.maxTickets) return res.status(429).json({ message: 'Live updates are busy. Please try again shortly.' });
    const ticket = randomBytes(32).toString('base64url');
    const expiresAt = Math.min(now + state.ticketTtlMs, res.locals.sessionExpiresAt);
    if (expiresAt <= now) return res.status(401).json({ message: 'Please sign in to this system to continue.' });
    state.tickets.set(ticket, { system, userId: user.id, session, sessionExpiresAt: res.locals.sessionExpiresAt, expiresAt });
    res.json({ ticket, expiresAt });
  });
  app.use('/api/itticket', require('./Api/ITTicketApi'));
  app.use(['/api/sales/helpdesk', '/api/purchasing/helpdesk', '/api/warehouse/helpdesk', '/api/configuration/helpdesk'], require('./Api/ITTicketApi'));
  app.use('/api/sales', require('./Api/SalesApi'));
  app.use('/api/purchasing', require('./Api/PurchasingApi'));
  app.use('/api/warehouse', require('./Api/WarehouseApi'));
  app.use('/api/configuration', require('./Api/ConfigurationApi'));
  app.use((req, res) => res.status(404).json({ message: 'This endpoint was not found.' }));
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    if (error.type === 'entity.too.large') return res.status(413).json({ message: 'This request is too large.' });
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
  const port = Number(process.env.PORT || 5188);
  const host = process.env.HOST || '0.0.0.0';
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be a valid TCP port.');
  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) throw new Error('Set SESSION_SECRET to at least 32 random characters in NODE JS SERVER/.env.');
  await initializeDatabase();
  console.log(`SQL Server connected: ${process.env.DB_NAME || 'TTICompany'}`);
  const app = createApp();
  const server = createServer(app);
  const io = attachRealtime(server, app);
  server.listen(port, host, () => console.log(`TTI Laguna Philippines Inc. API: http://${host}:${port}`));
  server.requestTimeout = 30000;
  server.headersTimeout = 15000;
  server.on('error', async error => { console.error('Server failed:', error.code || error.message); await closeDatabase(); process.exit(1); });
  let stopping = false;
  const stop = () => {
    if (stopping) return;
    stopping = true;
    io.close(async () => { await closeDatabase(); process.exit(0); });
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

module.exports = { createApp, checkOrigin, MAX_BODY, attachRealtime };
