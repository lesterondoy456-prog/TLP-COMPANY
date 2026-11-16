import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { once } from 'node:events';
import test from 'node:test';
import { io as connect } from 'socket.io-client';
import { loadServerWithDatabase } from './helpers/load-api.mjs';
import { memoryReceivingRepository } from './helpers/receiving-memory-repository.mjs';

const secret = 'isolated-realtime-test-secret-no-environment-access-12345';
const systems = ['sales', 'purchasing', 'warehouse', 'configuration'];
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

function cookie(system, id = 1, expires = Math.floor(Date.now() / 1000) + 3600) {
  const issued = Math.floor(Date.now() / 1000) - 1;
  const value = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url') + '.' + Buffer.from(JSON.stringify({ sub: id, system, aud: `tti-company-${system}`, iat: issued, exp: expires, jti: randomUUID() })).toString('base64url');
  const key = createHmac('sha256', secret).update(`tti-session:${system}`).digest();
  return `tti_${system}_session=${value}.${createHmac('sha256', key).update(value).digest('base64url')}`;
}

// These adapters are the only database reachable by the real HTTP/router code.
// They store fixture state in memory and fail on every unrecognized query.
function databaseFixture({ business, failAudit = false } = {}) {
  let state = {
    accounts: Object.fromEntries(systems.map(system => [system, [1, 2].map(id => ({ id, name: `Mock ${system} ${id}`, username: `mock_${id}`, cpnumber: '', email: '', photo: '', role: id === 1 ? 'admin' : system, isActive: true }))])),
    customers: [100], countries: [], audits: [], invoices: [], invoiceItems: [],
    products: [{ id: 7, sku: 'P7', name: 'Realtime product', description: null, unit: 'PCS', stock: '5.000', isActive: true }], movements: [],
  };
  const events = [];
  const sql = new Proxy({}, { get: (_object, type) => type === 'MAX' ? -1 : (...args) => ({ type, args }) });
  const database = {
    sql,
    db() { throw new Error('No live database is available in realtime tests.'); },
    initializeDatabase() { throw new Error('Tests must never initialize a database.'); },
    closeDatabase() {},
    async transaction(work) {
      if (business) return business.transaction(work);
      const scope = { state: structuredClone(state) };
      events.push('begin');
      try { const result = await work(scope); state = scope.state; events.push('commit'); return result; }
      catch (error) { events.push('rollback'); throw error; }
    },
    request(scope) {
      const params = {}, inputs = [];
      return {
        input(name, type, value) { params[name] = value; inputs.push([name, type, value]); return this; },
        async query(statement) {
          const text = statement.trim();
          const current = scope?.state?.accounts ? scope.state : state;
          const system = text.match(/FROM dbo\.(Sales|Purchasing|Warehouse|Configuration)UserLogin\b/)?.[1].toLowerCase();
          if (system && text.startsWith('SELECT ')) {
            let records = current.accounts[system].filter(row => !/WHERE id=@(?:id|createdById)/.test(text) || row.id === (params.id ?? params.createdById));
            if (text.includes('AND isActive=1')) records = records.filter(row => row.isActive);
            if (text.includes('COUNT(*)')) return { recordset: [{ total: records.filter(row => row.role === 'admin' && row.isActive).length }] };
            return { recordset: structuredClone(records) };
          }
          if (business) {
            const query = business.request(scope);
            for (const input of inputs) query.input(...input);
            return query.query(statement);
          }
          if (text.includes('FROM dbo.Products')) return { recordset: current.products.filter(row => row.id === params.productId).map(row => ({ ...row })) };
          if (text.includes('FROM dbo.ProductStockMovements WITH')) return { recordset: current.movements.filter(row => row.requestKey === params.requestKey).map(row => ({ ...row })) };
          if (text.includes('FROM dbo.ProductStockMovements m JOIN')) return { recordset: current.movements.filter(row => row.id === params.movementId).map(row => ({ ...row, movementId: row.id, id: 'manual:' + row.id, type: 'manual-' + row.direction, createdByUsername: 'mock_1', createdByName: 'Mock sales 1' })) };
          if (text.startsWith('SELECT i.id') && text.includes('FROM dbo.SalesInvoices')) return { recordset: current.invoices.filter(row => row.id === params.id).map(row => ({ ...row, customerId: 100, customerName: 'Mock Customer', currency: 'USD', status: 'unpaid' })) };
          if (text.startsWith('SELECT productId,productName') && text.includes('FROM dbo.SalesOrderItems')) return { recordset: [{ productId: 1, productName: 'Mock Product', sku: 'P1', unit: 'PCS', quantity: 1, unitPrice: 10, lineTotal: 10 }] };
          if (text.startsWith('SELECT productId,productName') && text.includes('FROM dbo.SalesInvoiceItems')) return { recordset: current.invoiceItems.filter(row => row.invoiceId === params.invoiceId) };
          assert.ok(scope, 'Every mutation must belong to the fake transaction.');
          if (text.startsWith('UPDATE dbo.Products SET stock=CAST')) {
            current.products.find(row => row.id === params.productId).stock = params.stockAfter;
            return { recordset: [] };
          }
          if (text.startsWith('INSERT INTO dbo.ProductStockMovements')) {
            const row = { ...params, id: current.movements.length + 1 };
            current.movements.push(row);
            return { recordset: [{ id: row.id }] };
          }
          if (text.startsWith('SELECT o.id') && text.includes('FROM dbo.SalesOrders')) return { recordset: [{ id: 7, number: 'SO-MOCK', customerId: 100, customerName: 'Mock Customer', orderDate: '2026-11-13', status: 'confirmed', total: 10, currency: 'USD', invoiced: current.invoices.some(row => row.orderId === 7) }] };
          if (text.startsWith('INSERT INTO dbo.SalesInvoices')) {
            const id = current.invoices.length + 1;
            current.invoices.push({ ...params, id, paidAmount: 0 });
            return { recordset: [{ id }] };
          }
          if (text.startsWith('INSERT INTO dbo.SalesInvoiceItems')) {
            current.invoiceItems.push({ invoiceId: params.invoiceId, orderId: params.orderId, id: 1, orderItemId: 1, productId: 1, productName: 'Mock Product', sku: 'P1', unit: 'PCS', quantity: '1.000', unitPrice: '10.000000', lineTotal: '10.000000' });
            return { recordset: [] };
          }
          if (text.startsWith('UPDATE dbo.SalesInvoices SET number=@number')) {
            current.invoices.find(row => row.id === params.id).number = params.number;
            return { recordset: [] };
          }
          if (text.startsWith('DELETE FROM dbo.Customers')) {
            const present = current.customers.includes(params.id);
            current.customers = current.customers.filter(id => id !== params.id);
            return { recordset: present ? [{ id: params.id }] : [] };
          }
          if (text.startsWith('INSERT INTO dbo.ConfigCountries')) {
            const row = { id: current.countries.length + 1, name: params.name, isActive: params.isActive };
            current.countries.push(row);
            return { recordset: [{ id: row.id }] };
          }
          if (text.startsWith('SELECT [id]') && text.includes('FROM dbo.ConfigCountries')) return { recordset: current.countries.filter(row => row.id === params.id) };
          const updateSystem = text.match(/^UPDATE dbo\.(Sales|Purchasing|Warehouse|Configuration)UserLogin /)?.[1].toLowerCase();
          if (updateSystem) {
            const account = current.accounts[updateSystem].find(row => row.id === params.id);
            for (const [key, value] of Object.entries(params)) if (!['passwordHash', 'id'].includes(key)) account[key] = value;
            return { recordset: [] };
          }
          if (text.startsWith('INSERT INTO dbo.AuditTrail')) {
            if (failAudit) { const error = new Error('Injected rollback'); error.status = 409; throw error; }
            current.audits.push(structuredClone(params)); return { recordset: [] };
          }
          throw new Error('Unexpected fake SQL: ' + text.slice(0, 120));
        },
      };
    },
  };
  return { database, events, snapshot: () => structuredClone(state) };
}

async function fixture(t, { options, ...databaseOptions } = {}) {
  const memory = databaseFixture(databaseOptions);
  const { createApp, attachRealtime } = loadServerWithDatabase(memory.database);
  const app = createApp({ SESSION_SECRET: secret }, options);
  const server = createServer(app);
  const io = attachRealtime(server, app);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const origin = `http://127.0.0.1:${server.address().port}`;
  const sockets = new Set();
  t.after(async () => { for (const socket of sockets) socket.close(); await new Promise(resolve => io.close(resolve)); });
  return {
    ...memory, app, io, origin,
    async request(path, session, method = 'GET', body) {
      return fetch(origin + path, { method, headers: { ...(session ? { Cookie: session } : {}), ...(method !== 'GET' ? { 'Content-Type': 'application/json' } : {}) }, body: method !== 'GET' ? JSON.stringify(body ?? {}) : undefined });
    },
    async ticket(system, session = cookie(system)) {
      const response = await this.request(`/api/${system}/realtime-ticket`, session);
      assert.equal(response.status, 200, await response.clone().text());
      return response.json();
    },
    socket(ticket, extra = {}, options = {}) {
      const socket = connect(origin, { autoConnect: false, forceNew: true, reconnection: false, transports: ['websocket'], auth: { ticket, ...extra }, ...options });
      sockets.add(socket); return socket;
    },
    async joined(system, session = cookie(system)) {
      const { ticket } = await this.ticket(system, session);
      const socket = this.socket(ticket);
      const ready = once(socket, 'connect'); socket.connect(); await ready;
      const events = []; socket.on('data:changed', event => events.push(event));
      return { socket, events };
    },
  };
}

async function denied(socket) {
  const error = once(socket, 'connect_error'); socket.connect();
  const [failure] = await error;
  assert.match(failure.message, /sign in|connections/i);
  assert.equal(socket.connected, false); socket.close();
}

test('tickets require a fresh scoped login; sockets reject cookie-only, forged, replayed and expired tickets', async t => {
  let now = Date.now();
  const api = await fixture(t, { options: { now: () => now } });
  assert.equal((await api.request('/api/sales/realtime-ticket')).status, 401);
  assert.equal((await api.request('/api/warehouse/realtime-ticket', cookie('sales'))).status, 401);
  assert.equal((await api.request('/api/unknown/realtime-ticket', cookie('sales'))).status, 404);
  await denied(api.socket(undefined, {}, { extraHeaders: { Cookie: cookie('sales') } }));
  await denied(api.socket('x'.repeat(43)));
  const own = cookie('sales');
  const issued = await api.ticket('sales', own);
  assert.deepEqual(Object.keys(issued).sort(), ['expiresAt', 'ticket']);
  assert.match(issued.ticket, /^[A-Za-z0-9_-]{43}$/);
  assert.ok(issued.expiresAt <= now + 30000);
  const socket = api.socket(issued.ticket, { system: 'warehouse', rooms: ['system:warehouse'] }, { transports: ['polling', 'websocket'] });
  const connected = once(socket, 'connect'); socket.connect(); await connected;
  assert.deepEqual([...api.io.sockets.sockets.get(socket.id).rooms].filter(room => room.startsWith('system:')), ['system:sales']);
  await denied(api.socket(issued.ticket));
  const expired = await api.ticket('sales', own);
  now += 30001;
  await denied(api.socket(expired.ticket));
  assert.equal(api.app.locals.realtime.tickets.size, 0);
});

test('ticket capacity is bounded, expired tickets are pruned, and session expiry disconnects live sockets', async t => {
  let now = Date.now();
  const api = await fixture(t, { options: { now: () => now, maxTickets: 2 } });
  await api.ticket('sales'); await api.ticket('warehouse');
  assert.equal((await api.request('/api/purchasing/realtime-ticket', cookie('purchasing'))).status, 429);
  assert.equal(api.app.locals.realtime.tickets.size, 2);
  now += 30001;
  await api.ticket('configuration');
  assert.equal(api.app.locals.realtime.tickets.size, 1);
  const real = await fixture(t);
  const session = cookie('sales', 1, Math.floor(Date.now() / 1000) + 2);
  const { socket } = await real.joined('sales', session);
  const [reason] = await once(socket, 'disconnect');
  assert.equal(reason, 'io server disconnect');
  assert.equal((await real.request('/api/sales/realtime-ticket', session)).status, 401);
});

test('only committed business writes emit scoped metadata; failed transactions, reads and auth do not', async t => {
  const api = await fixture(t);
  const sales = await api.joined('sales'), warehouse = await api.joined('warehouse'), config = await api.joined('configuration');
  assert.equal((await api.request('/api/sales/auth/session', cookie('sales'))).status, 200);
  assert.equal((await api.request('/api/sales/customers/999', cookie('sales'), 'DELETE')).status, 404);
  await delay(40); assert.deepEqual(sales.events, []); assert.deepEqual(config.events, []);
  const received = once(sales.socket, 'data:changed');
  assert.equal((await api.request('/api/sales/customers/100', cookie('sales'), 'DELETE')).status, 200);
  const [event] = await received;
  assert.equal(api.events.at(-1), 'commit', 'Notification must follow the actual transaction commit.');
  assert.deepEqual(Object.keys(event).sort(), ['changedAt', 'resources', 'system']);
  assert.equal(event.system, 'sales'); assert.ok(event.resources.includes('customers'));
  assert.ok(Number.isFinite(Date.parse(event.changedAt)));
  await delay(40);
  assert.deepEqual(warehouse.events, []);
  assert.deepEqual(config.events.map(event => event.resources), [['audit-trail']]);
  const failing = await fixture(t, { failAudit: true });
  const watcher = await failing.joined('sales');
  assert.equal((await failing.request('/api/sales/customers/100', cookie('sales'), 'DELETE')).status, 409);
  await delay(40); assert.deepEqual(watcher.events, []);
  assert.deepEqual(failing.snapshot().customers, [100]);
  assert.equal(failing.events.at(-1), 'rollback');
});

test('committed receiving notifies Warehouse once, while rollback and replay never publish stock changes', async t => {
  const memory = memoryReceivingRepository();
  const api = await fixture(t, { business: memory.database });
  const purchasing = await api.joined('purchasing'), warehouse = await api.joined('warehouse'), sales = await api.joined('sales');
  const stockChanged = once(warehouse.socket, 'data:changed');
  const result = await api.request('/api/purchasing/receivings/1/post', cookie('purchasing'), 'POST');
  assert.equal(result.status, 200); assert.equal((await result.json()).alreadyPosted, false);
  const [event] = await stockChanged;
  assert.deepEqual(event.resources, ['inventory', 'movements']); assert.equal(event.system, 'warehouse');
  assert.equal(memory.events.at(-1), 'commit'); assert.equal(memory.snapshot().productStock, 7);
  assert.equal((await (await api.request('/api/purchasing/receivings/1/post', cookie('purchasing'), 'POST')).json()).alreadyPosted, true);
  await delay(40);
  assert.equal(warehouse.events.length, 1); assert.equal(purchasing.events.length, 1); assert.deepEqual(sales.events, []);
  const failedMemory = memoryReceivingRepository(undefined, { failAudit: true });
  const failed = await fixture(t, { business: failedMemory.database });
  const watched = await failed.joined('warehouse');
  assert.equal((await failed.request('/api/purchasing/receivings/1/post', cookie('purchasing'), 'POST')).status, 500);
  await delay(40); assert.deepEqual(watched.events, []); assert.equal(failedMemory.events.at(-1), 'rollback');
});

test('committed invoice creation refreshes Customer Last Sales Date while duplicate and rolled-back invoices emit nothing', async t => {
  const api = await fixture(t);
  const sales = await api.joined('sales'), warehouse = await api.joined('warehouse');
  const received = once(sales.socket, 'data:changed');
  const body = { orderId: 7, invoiceDate: '2026-11-14', dueDate: '2026-12-14' };
  const response = await api.request('/api/sales/sales-invoices', cookie('sales'), 'POST', body);
  assert.equal(response.status, 201, await response.clone().text());
  const [event] = await received;
  assert.equal(api.events.at(-1), 'commit');
  assert.ok(event.resources.includes('customers'));
  assert.ok(event.resources.includes('sales-invoices'));
  assert.ok(event.resources.includes('sales-orders'));
  assert.equal(api.snapshot().invoices[0].invoiceDate, '2026-11-14');
  assert.deepEqual(Object.keys(event).sort(), ['changedAt', 'resources', 'system'], 'Realtime events carry metadata, not invoice dates or records.');
  assert.equal((await api.request('/api/sales/sales-invoices', cookie('sales'), 'POST', body)).status, 409);
  await delay(40);
  assert.equal(sales.events.length, 1);
  assert.deepEqual(warehouse.events, []);

  const failed = await fixture(t, { failAudit: true });
  const watcher = await failed.joined('sales');
  assert.equal((await failed.request('/api/sales/sales-invoices', cookie('sales'), 'POST', body)).status, 409);
  await delay(40);
  assert.deepEqual(failed.snapshot().invoices, []);
  assert.deepEqual(watcher.events, []);
  assert.equal(failed.events.at(-1), 'rollback');
});

test('configuration saves refresh dependent systems without exposing master values', async t => {
  const api = await fixture(t);
  const watchers = await Promise.all(systems.map(system => api.joined(system)));
  const notifications = watchers.map(({ socket }) => once(socket, 'data:changed'));
  assert.equal((await api.request('/api/configuration/masters/countries', cookie('configuration'), 'POST', { name: 'Private Mock Country' })).status, 201);
  const events = (await Promise.all(notifications)).map(([event]) => event);
  assert.deepEqual(events.map(event => event.system), systems);
  assert.deepEqual(events[0].resources, ['options']);
  assert.deepEqual(events[1].resources, ['options']);
  assert.ok(events[3].resources.includes('countries'));
  assert.ok(!JSON.stringify(events).includes('Private Mock Country'));
});

test('stock movements notify Sales and audit watchers only after commit, with no events for retries or failures', async t => {
  const api = await fixture(t);
  const sales = await api.joined('sales'), configuration = await api.joined('configuration'), warehouse = await api.joined('warehouse');
  const body = { requestKey: 'a'.repeat(32), direction: 'out', quantity: '1.234', movementDate: '2026-11-16', sourceDestination: 'Customer pickup', reason: 'Recorded release', reference: null };
  const salesChange = once(sales.socket, 'data:changed'), auditChange = once(configuration.socket, 'data:changed');
  const response = await api.request('/api/sales/products/7/stock-movements', cookie('sales'), 'POST', body);
  assert.equal(response.status, 201, await response.clone().text());
  const [event] = await salesChange;
  assert.deepEqual(event.resources, ['products', 'stock-movements']);
  assert.deepEqual((await auditChange)[0].resources, ['audit-trail']);
  assert.equal(api.events.at(-1), 'commit');
  assert.equal(api.snapshot().products[0].stock, '3.766');
  assert.equal(api.snapshot().movements.length, 1);
  assert.deepEqual(Object.keys(event).sort(), ['changedAt', 'resources', 'system']);
  assert.equal(JSON.stringify(event).includes(body.reason), false);
  const retry = await api.request('/api/sales/products/7/stock-movements', cookie('sales'), 'POST', body);
  assert.equal(retry.status, 200); assert.equal((await retry.json()).replayed, true);
  const rejected = await api.request('/api/sales/products/7/stock-movements', cookie('sales'), 'POST', { ...body, requestKey: 'b'.repeat(32), quantity: '99.000' });
  assert.equal(rejected.status, 409);
  await delay(50);
  assert.equal(sales.events.length, 1); assert.equal(configuration.events.length, 1); assert.equal(warehouse.events.length, 0);
  assert.equal(api.snapshot().products[0].stock, '3.766'); assert.equal(api.snapshot().movements.length, 1);
  const failed = await fixture(t, { failAudit: true });
  const listener = await failed.joined('sales');
  const rolledBack = await failed.request('/api/sales/products/7/stock-movements', cookie('sales'), 'POST', body);
  assert.equal(rolledBack.status, 409);
  await delay(50);
  assert.equal(failed.events.at(-1), 'rollback'); assert.equal(listener.events.length, 0);
  assert.equal(failed.snapshot().products[0].stock, '5.000'); assert.equal(failed.snapshot().movements.length, 0);
});

test('logout revokes only its session; account edits revoke the affected system user and pending tickets', async t => {
  const api = await fixture(t);
  const firstSession = cookie('sales'), secondSession = cookie('sales');
  const first = await api.joined('sales', firstSession), second = await api.joined('sales', secondSession), foreign = await api.joined('warehouse');
  const pending = await api.ticket('sales', firstSession);
  const signedOut = once(first.socket, 'disconnect');
  assert.equal((await api.request('/api/sales/auth/logout', firstSession, 'POST')).status, 200);
  assert.equal((await signedOut)[0], 'io server disconnect');
  await denied(api.socket(pending.ticket));
  assert.equal(second.socket.connected, true); assert.equal(foreign.socket.connected, true);
  const workerSession = cookie('sales', 2), target = await api.joined('sales', workerSession);
  const targetTicket = await api.ticket('sales', workerSession);
  const disconnected = once(target.socket, 'disconnect');
  assert.equal((await api.request('/api/sales/users/2', secondSession, 'PUT', { name: 'Inactive Mock', username: 'mock_2', role: 'sales', isActive: false })).status, 200);
  await disconnected; await denied(api.socket(targetTicket.ticket));
  assert.equal(second.socket.connected, true); assert.equal(foreign.socket.connected, true);
  assert.equal((await api.request('/api/sales/realtime-ticket', workerSession)).status, 401);
});
