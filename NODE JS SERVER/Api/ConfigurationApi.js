import { validateCredentials, issueSession, requireUser, requireAdmin, requireAccountManager, sessionCookie, expiredCookie } from '../components/auth.js';
import * as accounts from '../accounts.js';
import { idValue } from '../components/validation.js';
import { request as databaseRequest, sql, transaction } from '../database.js';
import { createConfigurationService, configurationMetadata } from '../configuration.js';
import { recordAudit } from '../audit.js';
import { json, readJson, methodNotAllowed } from './common.js';
const configuration = createConfigurationService({ request: databaseRequest, sql, transaction, recordAudit });

export async function handleConfigurationApi(request, context) {
  const { env } = context;
  const url = new URL(request.url);
  const prefix = '/api/configuration';
  if (url.pathname !== prefix && !url.pathname.startsWith(prefix + '/')) return null;
  const pathname = '/api' + url.pathname.slice(prefix.length).replace(/\/$/, '');
  const system = 'configuration';

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
  if (pathname === '/api/masters') {
    if (request.method !== 'GET') return methodNotAllowed(['GET']);
    return json({ modules: configurationMetadata() });
  }
  const configurationRoute = pathname.match(/^\/api\/masters\/([a-z-]+)(?:\/(\d+))?$/);
  if (configurationRoute) {
    const [, kind, rawId] = configurationRoute;
    const id = rawId ? idValue(rawId) : undefined;
    if (request.method === 'GET') return json(id ? { record: await configuration.getConfiguration(kind, id) } : { records: await configuration.listConfiguration(kind) });
    if (request.method === 'POST' && !id) return json({ record: await configuration.saveConfiguration(kind, await readJson(request), user) }, 201);
    if (request.method === 'PUT' && id) return json({ record: await configuration.saveConfiguration(kind, await readJson(request), user, id) });
    if (request.method === 'DELETE' && id) return json({ record: await configuration.deactivateConfiguration(kind, id, user), success: true });
    return methodNotAllowed(id ? ['GET', 'PUT', 'DELETE'] : ['GET', 'POST']);
  }
  return null;
}
