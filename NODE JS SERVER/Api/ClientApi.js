import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ApiError, validateCredentials, issueSession, requireUser, requireAdmin, requireAccountManager, sessionCookie, expiredCookie } from '../components/auth.js';
import { idValue } from '../components/validation.js';
import { db, request as databaseRequest, sql, transaction } from '../database.js';
import * as service from '../services.js';
import { createConfigurationService, configurationMetadata } from '../configuration.js';
import { recordAudit } from '../audit.js';
import { productOptions } from '../products.js';
import * as purchasingMasters from '../purchasing-masters.js';
import * as purchasing from '../purchasing.js';
import * as receiving from '../receiving.js';
import { listInventory, listStockMovements } from '../inventory.js';

const configuration = createConfigurationService({ request: databaseRequest, sql, transaction, recordAudit });

const frontendDirectory = fileURLToPath(new URL('../../SalesSystem/dist/', import.meta.url));
const MAX_BODY = 1024 * 1024;
const mimeTypes = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon' };

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers } });
}

async function readJson(request) {
  if (!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')) throw new ApiError(415, 'Send this request as JSON.');
  const body = await request.text();
  if (Buffer.byteLength(body) > MAX_BODY) throw new ApiError(413, 'This request is too large. Keep photos below 550 KB.');
  try {
    const input = JSON.parse(body);
    if (!input || Array.isArray(input) || typeof input !== 'object') throw new Error();
    return input;
  } catch { throw new ApiError(400, 'Send a valid JSON object.'); }
}

function checkOrigin(request) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return;
  const origin = request.headers.get('Origin');
  if (request.headers.get('Sec-Fetch-Site') === 'cross-site' || (origin && origin !== new URL(request.url).origin)) {
    throw new ApiError(403, 'Open this request from your TLP Company sales workspace.');
  }
}

function methodNotAllowed(allowed) {
  return json({ message: 'This request method is not supported.' }, 405, { Allow: allowed.join(', ') });
}

function sqlErrorNumber(error) {
  return error?.number || error?.originalError?.number || error?.originalError?.info?.number
    || error?.precedingErrors?.find(item => item.number)?.number;
}

export async function handleApi(request, env) {
  try {
    const url = new URL(request.url);
    const pathname = url.pathname.replace(/\/$/, '');
    checkOrigin(request);
    if (pathname === '/api/health') {
      if (request.method !== 'GET') return methodNotAllowed(['GET']);
      try {
        const result = await db().request().query('SELECT DB_NAME() AS name');
        return json({ ok: true, service: 'TLP Company Sales API', database: { status: 'connected', name: result.recordset[0].name } });
      } catch { return json({ ok: false, service: 'TLP Company Sales API', database: { status: 'disconnected', name: process.env.DB_NAME || 'TLP Company' } }, 503); }
    }
    if (pathname === '/api/auth/login') {
      if (request.method !== 'POST') return methodNotAllowed(['POST']);
      const input = await readJson(request);
      const user = await validateCredentials(input, request);
      const { token, lifetime } = issueSession(env, user, input.remember === true);
      return json({ user }, 200, { 'Set-Cookie': sessionCookie(request, token, lifetime, input.remember === true) });
    }
    if (pathname === '/api/auth/logout') {
      if (request.method !== 'POST') return methodNotAllowed(['POST']);
      return json({ success: true }, 200, { 'Set-Cookie': expiredCookie(request) });
    }
    const user = await requireUser(request, env);
    if (pathname === '/api/auth/session') {
      if (request.method !== 'GET') return methodNotAllowed(['GET']);
      return json({ user });
    }
    if (pathname === '/api/auth/profile') {
      if (request.method !== 'PUT') return methodNotAllowed(['PUT']);
      return json({ user: await service.saveUser(await readJson(request), user, user.id, true) });
    }

    if (pathname === '/api/customer-options') {
      if (request.method !== 'GET') return methodNotAllowed(['GET']);
      return json(await service.customerOptions());
    }
    if (pathname === '/api/product-options') {
      if (request.method !== 'GET') return methodNotAllowed(['GET']);
      return json(await productOptions());
    }
    if (pathname === '/api/purchasing-options') {
      if (request.method !== 'GET') return methodNotAllowed(['GET']);
      return json(await purchasingMasters.purchasingOptions());
    }
    if (pathname === '/api/inventory' || pathname === '/api/inventory/movements') {
      if (request.method !== 'GET') return methodNotAllowed(['GET']);
      const suppliesId = url.searchParams.get('suppliesId');
      return json({ records: await (pathname.endsWith('/movements') ? listStockMovements(suppliesId) : listInventory(suppliesId)) });
    }

    const purchasingMaster = pathname.match(/^\/api\/(suppliers|supplies)(?:\/(\d+))?$/);
    if (purchasingMaster) {
      const [, kind, rawId] = purchasingMaster;
      const id = rawId ? idValue(rawId) : undefined;
      const supplier = kind === 'suppliers';
      if (request.method === 'GET') {
        return json(id ? { record: await (supplier ? purchasingMasters.getSupplier(id) : purchasingMasters.getSupplies(id)) }
          : { records: await (supplier ? purchasingMasters.listSuppliers() : purchasingMasters.listSupplies()) });
      }
      if (request.method === 'POST' && !id) return json({ record: await (supplier ? purchasingMasters.saveSupplier(await readJson(request), undefined, user) : purchasingMasters.saveSupplies(await readJson(request), undefined, user)) }, 201);
      if (request.method === 'PUT' && id) return json({ record: await (supplier ? purchasingMasters.saveSupplier(await readJson(request), id, user) : purchasingMasters.saveSupplies(await readJson(request), id, user)) });
      if (request.method === 'DELETE' && id) { await purchasingMasters.deactivatePurchasingMaster(kind, id, user); return json({ success: true }); }
      return methodNotAllowed(id ? ['GET', 'PUT', 'DELETE'] : ['GET', 'POST']);
    }

    const purchasingDocument = pathname.match(/^\/api\/(purchase-requests|purchase-orders|receivings)(?:\/(\d+))?(?:\/(post|cancel))?$/);
    if (purchasingDocument) {
      const [, kind, rawId, action] = purchasingDocument;
      const id = rawId ? idValue(rawId) : undefined;
      const handlers = {
        'purchase-requests': { list: purchasing.listPurchaseRequests, get: purchasing.getPurchaseRequest, save: purchasing.savePurchaseRequest, post: purchasing.postPurchaseRequest },
        'purchase-orders': { list: purchasing.listPurchaseOrders, get: purchasing.getPurchaseOrder, save: purchasing.savePurchaseOrder, post: purchasing.postPurchaseOrder },
        receivings: { list: receiving.listReceivings, get: receiving.getReceiving, save: receiving.saveReceiving, post: receiving.postReceiving },
      };
      const handler = handlers[kind];
      if (action) {
        if (!id) return json({ message: 'Select a saved document.' }, 404);
        if (request.method !== 'POST') return methodNotAllowed(['POST']);
        if (action === 'post') {
          const result = await handler.post(id, user);
          return json(kind === 'receivings' ? result : { record: result });
        }
        return json({ record: await (kind === 'receivings' ? receiving.cancelReceiving(id, user) : purchasing.cancelPurchaseDocument(kind, id, user)) });
      }
      if (request.method === 'GET') return json(id ? { record: await handler.get(id) } : { records: await handler.list() });
      if (request.method === 'POST' && !id) return json({ record: await handler.save(await readJson(request), undefined, user) }, 201);
      if (request.method === 'PUT' && id) return json({ record: await handler.save(await readJson(request), id, user) });
      return methodNotAllowed(id ? ['GET', 'PUT'] : ['GET', 'POST']);
    }

    if (pathname === '/api/configuration') {
      if (request.method !== 'GET') return methodNotAllowed(['GET']);
      return json({ modules: configurationMetadata() });
    }
    const configurationRoute = pathname.match(/^\/api\/configuration\/([a-z-]+)(?:\/(\d+))?$/);
    if (configurationRoute) {
      const [, kind, rawId] = configurationRoute;
      const id = rawId ? idValue(rawId) : undefined;
      if (request.method === 'GET') return json(id ? { record: await configuration.getConfiguration(kind, id) } : { records: await configuration.listConfiguration(kind) });
      if (request.method === 'POST' && !id) return json({ record: await configuration.saveConfiguration(kind, await readJson(request), user) }, 201);
      if (request.method === 'PUT' && id) return json({ record: await configuration.saveConfiguration(kind, await readJson(request), user, id) });
      if (request.method === 'DELETE' && id) return json({ record: await configuration.deactivateConfiguration(kind, id, user), success: true });
      return methodNotAllowed(id ? ['GET', 'PUT', 'DELETE'] : ['GET', 'POST']);
    }

    const master = pathname.match(/^\/api\/(customers|products)(?:\/(\d+))?$/);
    if (master) {
      const [, kind, rawId] = master;
      const id = rawId ? idValue(rawId) : undefined;
      if (request.method === 'GET') return json(id ? { record: await service.getMaster(kind, id) } : { records: await service.listMaster(kind) });
      if (request.method === 'POST' && !id) return json({ record: await service.saveMaster(kind, await readJson(request), undefined, user) }, 201);
      if (request.method === 'PUT' && id) return json({ record: await service.saveMaster(kind, await readJson(request), id, user) });
      if (request.method === 'DELETE' && id) { await service.deleteMaster(kind, id, user); return json({ success: true }); }
      return methodNotAllowed(id ? ['GET', 'PUT', 'DELETE'] : ['GET', 'POST']);
    }

    const orders = pathname.match(/^\/api\/sales-orders(?:\/(\d+))?$/);
    if (orders) {
      const id = orders[1] ? idValue(orders[1]) : undefined;
      if (request.method === 'GET') return json(id ? { record: await service.getOrder(id) } : { records: await service.listOrders() });
      if (request.method === 'POST' && !id) return json({ record: await service.saveOrder(await readJson(request), user) }, 201);
      if (request.method === 'PUT' && id) return json({ record: await service.saveOrder(await readJson(request), user, id) });
      if (request.method === 'DELETE' && id) { await service.deleteOrder(id, user); return json({ success: true }); }
      return methodNotAllowed(id ? ['GET', 'PUT', 'DELETE'] : ['GET', 'POST']);
    }

    const invoices = pathname.match(/^\/api\/sales-invoices(?:\/(\d+))?(\/payment)?$/);
    if (invoices) {
      const id = invoices[1] ? idValue(invoices[1]) : undefined;
      if (invoices[2]) {
        if (!id) return json({ message: 'Sales invoice could not be found.' }, 404);
        if (request.method !== 'PATCH') return methodNotAllowed(['PATCH']);
        return json({ record: await service.recordPayment(id, await readJson(request), user) });
      }
      if (request.method === 'GET') return json(id ? { record: await service.getInvoice(id) } : { records: await service.listInvoices() });
      if (request.method === 'POST' && !id) return json({ record: await service.createInvoice(await readJson(request), user) }, 201);
      return methodNotAllowed(id ? ['GET'] : ['GET', 'POST']);
    }

    const deliveries = pathname.match(/^\/api\/delivery-receipts(?:\/(\d+))?$/);
    if (deliveries) {
      const id = deliveries[1] ? idValue(deliveries[1]) : undefined;
      if (request.method === 'GET') return json(id ? { record: await service.getDelivery(id) } : { records: await service.listDeliveries() });
      if (request.method === 'POST' && !id) return json({ record: await service.createDelivery(await readJson(request), user) }, 201);
      return methodNotAllowed(id ? ['GET'] : ['GET', 'POST']);
    }

    const shipping = pathname.match(/^\/api\/shipping-invoices(?:\/(\d+))?$/);
    if (shipping) {
      const id = shipping[1] ? idValue(shipping[1]) : undefined;
      if (request.method === 'GET') return json(id ? { record: await service.getShippingInvoice(id) } : { records: await service.listShippingInvoices() });
      if (request.method === 'POST' && !id) return json({ record: await service.createShippingInvoice(await readJson(request), user) }, 201);
      return methodNotAllowed(id ? ['GET'] : ['GET', 'POST']);
    }

    const users = pathname.match(/^\/api\/users(?:\/(\d+))?$/);
    if (users) {
      requireAccountManager(user);
      const id = users[1] ? idValue(users[1]) : undefined;
      if (request.method === 'GET') return json(id ? { record: await service.getUser(id, user) } : { records: await service.listUsers(user) });
      if (request.method === 'POST' && !id) return json({ record: await service.saveUser(await readJson(request), user) }, 201);
      if (request.method === 'PUT' && id) { requireAdmin(user); return json({ record: await service.saveUser(await readJson(request), user, id) }); }
      return methodNotAllowed(id ? ['GET', 'PUT'] : ['GET', 'POST']);
    }
    return json({ message: 'This endpoint was not found.' }, 404);
  } catch (error) {
    if (error instanceof ApiError) return json({ message: error.message }, error.status);
    const number = sqlErrorNumber(error);
    if ([2601, 2627].includes(number)) return json({ message: 'This code, SKU, username or sales document already exists. Use a unique value.' }, 409);
    if (number === 547) return json({ message: 'This record is referenced by a sales document and cannot be deleted. Deactivate it instead.' }, 409);
    if (number === 1205) return json({ message: 'Another transaction updated this record. Please retry.' }, 409);
    console.error('API error:', error.code || '', error.message);
    if (['ECONNCLOSED', 'ENOTOPEN', 'ESOCKET', 'ETIMEOUT', 'ELOGIN'].includes(error.code) || /Database is unavailable/.test(error.message)) {
      return json({ message: 'The database is unavailable. Check SQL Server and try again.' }, 503);
    }
    return json({ message: 'Unable to save or load this record. Please try again.' }, 500);
  }
}

export function createApp(env, production = false) {
  return createServer(async (incoming, outgoing) => {
    try {
      const url = new URL(incoming.url, `http://${incoming.headers.host || 'localhost'}`);
      if (url.pathname.startsWith('/api/')) {
        if (Number(incoming.headers['content-length']) > MAX_BODY) {
          incoming.resume(); outgoing.writeHead(413, { 'Content-Type': 'application/json' });
          outgoing.end(JSON.stringify({ message: 'This request is too large. Keep photos below 550 KB.' })); return;
        }
        const chunks = [];
        let size = 0;
        for await (const chunk of incoming) {
          size += chunk.length;
          if (size <= MAX_BODY) chunks.push(chunk);
        }
        if (size > MAX_BODY) {
          outgoing.writeHead(413, { 'Content-Type': 'application/json' });
          outgoing.end(JSON.stringify({ message: 'This request is too large. Keep photos below 550 KB.' })); return;
        }
        const headers = new Headers(incoming.headers);
        headers.set('x-tlp-client-address', incoming.socket.remoteAddress || 'local');
        const request = new Request(url, { method: incoming.method, headers,
          ...(!['GET', 'HEAD'].includes(incoming.method) && chunks.length ? { body: Buffer.concat(chunks) } : {}) });
        const response = await handleApi(request, env);
        outgoing.statusCode = response.status;
        response.headers.forEach((value, key) => outgoing.setHeader(key, value));
        outgoing.end(Buffer.from(await response.arrayBuffer())); return;
      }
      if (!production) {
        outgoing.writeHead(200, { 'Content-Type': 'application/json' });
        outgoing.end(JSON.stringify({ name: 'TLP Company Sales API', frontend: 'http://127.0.0.1:5188' })); return;
      }
      if (!['GET', 'HEAD'].includes(incoming.method)) { outgoing.writeHead(405); outgoing.end(); return; }
      let decoded;
      try { decoded = decodeURIComponent(url.pathname); } catch { outgoing.writeHead(400); outgoing.end(); return; }
      let filename = path.resolve(frontendDirectory, `.${decoded}`);
      if (filename !== path.resolve(frontendDirectory) && !filename.startsWith(path.resolve(frontendDirectory) + path.sep)) {
        outgoing.writeHead(403); outgoing.end(); return;
      }
      try { if (!(await stat(filename)).isFile()) filename = path.join(frontendDirectory, 'index.html'); }
      catch { filename = path.join(frontendDirectory, 'index.html'); }
      let content;
      try { content = await readFile(filename); }
      catch {
        outgoing.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' });
        outgoing.end('Build SalesSystem first with npm run build inside NODE JS SERVER.'); return;
      }
      outgoing.writeHead(200, { 'Content-Type': mimeTypes[path.extname(filename)] || 'application/octet-stream',
        'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin',
        'Cache-Control': filename.endsWith('index.html') ? 'no-cache' : 'public, max-age=31536000, immutable' });
      outgoing.end(incoming.method === 'HEAD' ? undefined : content);
    } catch (error) {
      console.error('HTTP error:', error.message);
      if (!outgoing.headersSent) outgoing.writeHead(500, { 'Content-Type': 'application/json' });
      outgoing.end(JSON.stringify({ message: 'Unable to complete this request.' }));
    }
  });
}
