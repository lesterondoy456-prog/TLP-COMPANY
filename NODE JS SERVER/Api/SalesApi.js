import { validateCredentials, issueSession, requireUser, requireAdmin, requireAccountManager, sessionCookie, expiredCookie } from '../components/auth.js';
import * as accounts from '../accounts.js';
import { idValue } from '../components/validation.js';
import * as service from '../services.js';
import { productOptions } from '../products.js';
import { json, readJson, methodNotAllowed } from './common.js';

export async function handleSalesApi(request, context) {
  const { env } = context;
  const url = new URL(request.url);
  const prefix = '/api/sales';
  if (url.pathname !== prefix && !url.pathname.startsWith(prefix + '/')) return null;
  const pathname = '/api' + url.pathname.slice(prefix.length).replace(/\/$/, '');
  const system = 'sales';

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
  if (pathname === '/api/customer-options') {
    if (request.method !== 'GET') return methodNotAllowed(['GET']);
    return json(await service.customerOptions());
  }
  if (pathname === '/api/product-options') {
    if (request.method !== 'GET') return methodNotAllowed(['GET']);
    return json(await productOptions());
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

  return null;
}
