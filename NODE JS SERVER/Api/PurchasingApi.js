import { validateCredentials, issueSession, requireUser, requireAdmin, requireAccountManager, sessionCookie, expiredCookie } from '../components/auth.js';
import * as accounts from '../accounts.js';
import { idValue } from '../components/validation.js';
import * as purchasingMasters from '../purchasing-masters.js';
import * as purchasing from '../purchasing.js';
import * as receiving from '../receiving.js';
import { json, readJson, methodNotAllowed } from './common.js';

export async function handlePurchasingApi(request, context) {
  const { env } = context;
  const url = new URL(request.url);
  const prefix = '/api/purchasing';
  if (url.pathname !== prefix && !url.pathname.startsWith(prefix + '/')) return null;
  const pathname = '/api' + url.pathname.slice(prefix.length).replace(/\/$/, '');
  const system = 'purchasing';

  if (pathname === '/api/auth/login') {
    if (request.method !== 'POST') return methodNotAllowed(['POST']);
    const input = await readJson(request);
    const user = await validateCredentials(input, request, system);
    const { token, lifetime } = issueSession(env, user, input.remember === true);
    return json({ user }, 200, { 'Set-Cookie': sessionCookie(request, token, lifetime, input.remember === true, system) });
  }
  if (pathname === '/api/auth/logout') {
    if (request.method !== 'POST') return methodNotAllowed(['POST']);
    return json({ success: true }, 200, { 'Set-Cookie': expiredCookie(request, system) });
  }
  const user = await requireUser(request, env, system);
  if (pathname === '/api/auth/session') {
    if (request.method !== 'GET') return methodNotAllowed(['GET']);
    return json({ user });
  }
  if (pathname === '/api/auth/profile') {
    if (request.method !== 'PUT') return methodNotAllowed(['PUT']);
    return json({ user: await accounts.saveUser(await readJson(request), user, user.id, true) });
  }
  const users = pathname.match(/^\/api\/users(?:\/(\d+))?$/);
  if (users) {
    requireAccountManager(user);
    const id = users[1] ? idValue(users[1]) : undefined;
    if (request.method === 'GET') return json(id ? { record: await accounts.getUser(id, user) } : { records: await accounts.listUsers(user) });
    if (request.method === 'POST' && !id) return json({ record: await accounts.saveUser(await readJson(request), user) }, 201);
    if (request.method === 'PUT' && id) {
      requireAdmin(user);
      return json({ record: await accounts.saveUser(await readJson(request), user, id) });
    }
    return methodNotAllowed(id ? ['GET', 'PUT'] : ['GET', 'POST']);
  }
  if (pathname === '/api/purchasing-options' || pathname === '/api/options') {
    if (request.method !== 'GET') return methodNotAllowed(['GET']);
    return json(await purchasingMasters.purchasingOptions());
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
  return null;
}
