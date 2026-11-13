import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { ApiError } from './errors.js';

export const AUTH_SYSTEMS = Object.freeze({
  sales: Object.freeze({ table: 'SalesUserLogin', roles: Object.freeze(['admin', 'saleshead', 'sales']), cookie: 'tlp_sales_session', path: '/api/sales', audience: 'tlp-company-sales' }),
  purchasing: Object.freeze({ table: 'PurchasingUserLogin', roles: Object.freeze(['admin', 'purchasing']), cookie: 'tlp_purchasing_session', path: '/api/purchasing', audience: 'tlp-company-purchasing' }),
  warehouse: Object.freeze({ table: 'WarehouseUserLogin', roles: Object.freeze(['admin', 'warehouse']), cookie: 'tlp_warehouse_session', path: '/api/warehouse', audience: 'tlp-company-warehouse' }),
  configuration: Object.freeze({ table: 'ConfigurationUserLogin', roles: Object.freeze(['admin', 'configuration']), cookie: 'tlp_configuration_session', path: '/api/configuration', audience: 'tlp-company-configuration' }),
});

const HEADER = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');

export function systemDefinition(system) {
  if (!Object.hasOwn(AUTH_SYSTEMS, system)) throw new ApiError(400, 'Choose a valid system.');
  return AUTH_SYSTEMS[system];
}

function signingKey(secret, system) {
  if (typeof secret !== 'string' || secret.length < 32) throw new ApiError(503, 'The server session secret is not configured.');
  return createHmac('sha256', secret).update(`tlp-session:${system}`).digest();
}

export function createScopedSession({ secret, system, userId, remember = false, now = Date.now() }) {
  const definition = systemDefinition(system);
  if (!Number.isInteger(userId) || userId <= 0 || userId > 2147483647) throw new ApiError(400, 'Choose a valid account.');
  const issued = Math.floor(now / 1000);
  const lifetime = remember ? 7 * 86400 : 8 * 3600;
  const body = Buffer.from(JSON.stringify({ sub: userId, system, aud: definition.audience, iat: issued, exp: issued + lifetime, jti: randomUUID() })).toString('base64url');
  const value = `${HEADER}.${body}`;
  const signature = createHmac('sha256', signingKey(secret, system)).update(value).digest('base64url');
  return { token: `${value}.${signature}`, lifetime };
}

export function verifyScopedSession(token, { secret, system, now = Date.now() }) {
  const definition = systemDefinition(system);
  const key = signingKey(secret, system);
  try {
    if (typeof token !== 'string' || token.length > 2048) throw new Error();
    const [header, body, signature, extra] = token.split('.');
    if (header !== HEADER || !body || !signature || extra !== undefined) throw new Error();
    const actual = Buffer.from(signature, 'base64url');
    const expected = createHmac('sha256', key).update(`${header}.${body}`).digest();
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error();
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    const seconds = Math.floor(now / 1000);
    if (payload.system !== system || payload.aud !== definition.audience
        || !Number.isInteger(payload.sub) || payload.sub <= 0 || payload.sub > 2147483647
        || !Number.isInteger(payload.exp) || !Number.isInteger(payload.iat)
        || payload.exp <= seconds || payload.iat > seconds + 60 || payload.exp <= payload.iat) throw new Error();
    return payload;
  } catch { throw new ApiError(401, 'Please sign in to this system to continue.'); }
}

export function scopedCookieToken(cookieHeader, system) {
  const { cookie } = systemDefinition(system);
  return String(cookieHeader || '').split(';').map(part => part.trim())
    .find(part => part.startsWith(`${cookie}=`))?.slice(cookie.length + 1);
}

export function canManageSystemAccounts(user) {
  if (!user || !Object.hasOwn(AUTH_SYSTEMS, user.system)) return false;
  const definition = AUTH_SYSTEMS[user.system];
  return definition.roles.includes(user.role) && (user.role === 'admin' || (user.system === 'sales' && user.role === 'saleshead'));
}

export function canReadSystemAccount(actor, target) {
  return actor?.system === target?.system && canManageSystemAccounts(actor)
    && (actor.role === 'admin' || target.role === 'sales');
}

export function canCreateSystemAccount(actor, role) {
  if (!actor || !Object.hasOwn(AUTH_SYSTEMS, actor.system)) return false;
  const definition = AUTH_SYSTEMS[actor.system];
  return definition.roles.includes(role) && canManageSystemAccounts(actor)
    && (actor.role === 'admin' || role === 'sales');
}

export function canEditSystemAccount(actor, target) {
  return canManageSystemAccounts(actor) && actor.role === 'admin'
    && (!target || actor.system === target.system);
}
