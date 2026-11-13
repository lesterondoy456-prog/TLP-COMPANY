import { createHmac, randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { db, request, sql } from '../database.js';
import { canManageSalesUsers, canEditSalesUser } from './roles.js';
import { ApiError } from './errors.js';

export { ApiError };

const scrypt = promisify(scryptCallback);
export const COOKIE_NAME = 'tlp_sales_session';
const attempts = new Map();
const sessionAudience = 'tlp-company-sales';

export const USER_COLUMNS = 'id, name, username, cpnumber, email, photo, role, isActive';

export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = await scrypt(password, salt, 64);
  return `scrypt$${salt}$${hash.toString('hex')}`;
}

async function verifyPassword(password, stored) {
  const [kind, salt, encoded] = (stored || '').split('$');
  if (kind !== 'scrypt' || !/^[a-f0-9]{32}$/.test(salt || '') || !/^[a-f0-9]{128}$/.test(encoded || '')) {
    await scrypt(password, 'tlp-missing-user-constant-salt', 64);
    return false;
  }
  const expected = Buffer.from(encoded, 'hex');
  const actual = await scrypt(password, salt, 64);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function seedAdministrator() {
  const existing = await db().request().query('SELECT TOP (1) id FROM dbo.SalesUserLogin');
  if (existing.recordset.length) return;
  const username = (process.env.ADMIN_USERNAME || 'admin').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!password || password.length < 7 || password.length > 128) throw new Error('Set ADMIN_PASSWORD in .env to 7–128 characters before first startup.');
  if (!/^[a-z0-9._-]{3,80}$/.test(username)) throw new Error('ADMIN_USERNAME must contain 3–80 letters, numbers, dots, underscores or hyphens.');
  await db().request()
    .input('name', sql.NVarChar(150), (process.env.ADMIN_NAME || 'Administrator').slice(0, 150))
    .input('username', sql.NVarChar(80), username)
    .input('email', sql.NVarChar(254), process.env.ADMIN_EMAIL || '')
    .input('passwordHash', sql.VarChar(300), await hashPassword(password))
    .query("INSERT INTO dbo.SalesUserLogin(name, username, email, role, passwordHash) VALUES (@name, @username, @email, 'admin', @passwordHash)");
}

function sessionSecret(env) {
  if (!env?.SESSION_SECRET || env.SESSION_SECRET.length < 32) throw new ApiError(503, 'The server session secret is not configured.');
  return env.SESSION_SECRET;
}

export async function validateCredentials(input, requestObject) {
  if (typeof input.username !== 'string' || typeof input.password !== 'string'
      || input.username.length > 80 || input.password.length > 128
      || (input.remember !== undefined && typeof input.remember !== 'boolean')) {
    throw new ApiError(400, 'Enter a valid username and password.');
  }
  const username = input.username.trim().toLowerCase();
  if (!username || !input.password) throw new ApiError(400, 'Enter your username and password.');
  const now = Date.now();
  const ip = requestObject.headers.get('x-tlp-client-address') || 'local';
  const key = `${ip}:${username}`;
  for (const [storedKey, entry] of attempts) if (entry.expires <= now) attempts.delete(storedKey);
  const entry = attempts.get(key) || { count: 0, expires: now + 15 * 60 * 1000 };
  if (entry.count >= 8) throw new ApiError(429, 'Too many unsuccessful sign-in attempts. Please try again in 15 minutes.');
  const result = await db().request().input('username', sql.NVarChar(80), username)
    .query(`SELECT ${USER_COLUMNS}, passwordHash FROM dbo.SalesUserLogin WHERE username = @username`);
  const row = result.recordset[0];
  const correct = await verifyPassword(input.password, row?.passwordHash);
  if (!row?.isActive || !correct) {
    entry.count++;
    if (attempts.size < 10000) attempts.set(key, entry);
    throw new ApiError(401, 'Username or password is incorrect.');
  }
  attempts.delete(key);
  const { passwordHash, ...user } = row;
  return user;
}

export function issueSession(env, user, remember = false) {
  const issued = Math.floor(Date.now() / 1000);
  const lifetime = remember ? 7 * 86400 : 8 * 3600;
  const body = Buffer.from(JSON.stringify({ sub: user.id, aud: sessionAudience, iat: issued, exp: issued + lifetime, jti: randomUUID() })).toString('base64url');
  const signature = createHmac('sha256', sessionSecret(env)).update(body).digest('base64url');
  return { token: `${body}.${signature}`, lifetime };
}

export async function requireUser(requestObject, env) {
  const secret = sessionSecret(env);
  const token = (requestObject.headers.get('cookie') || '').split(';').map(part => part.trim())
    .find(part => part.startsWith(`${COOKIE_NAME}=`))?.slice(COOKIE_NAME.length + 1);
  let payload;
  try {
    if (!token || token.length > 2048) throw new Error();
    const [body, signature, extra] = token.split('.');
    if (!body || !signature || extra) throw new Error();
    const actual = Buffer.from(signature, 'base64url');
    const expected = createHmac('sha256', secret).update(body).digest();
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error();
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    const now = Math.floor(Date.now() / 1000);
    if (!Number.isInteger(payload.sub) || payload.sub <= 0 || payload.aud !== sessionAudience
        || !Number.isInteger(payload.exp) || !Number.isInteger(payload.iat)
        || payload.exp <= now || payload.iat > now + 60 || payload.exp <= payload.iat) throw new Error();
  } catch { throw new ApiError(401, 'Please sign in to continue.'); }
  const result = await request().input('id', sql.Int, payload.sub)
    .query(`SELECT ${USER_COLUMNS} FROM dbo.SalesUserLogin WHERE id = @id AND isActive = 1`);
  if (!result.recordset.length) throw new ApiError(401, 'Your account is inactive or your session has ended.');
  return result.recordset[0];
}

export function requireAdmin(user) {
  if (!canEditSalesUser(user)) throw new ApiError(403, 'Only administrators can manage sales users.');
}

export function requireAccountManager(user) {
  if (!canManageSalesUsers(user)) throw new ApiError(403, 'Only administrators and sales heads can manage sales accounts.');
}

export function sessionCookie(requestObject, token, lifetime, remember) {
  const secure = new URL(requestObject.url).protocol === 'https:' ? '; Secure' : '';
  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax${secure}${remember ? `; Max-Age=${lifetime}` : ''}`;
}

export function expiredCookie(requestObject) {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${new URL(requestObject.url).protocol === 'https:' ? '; Secure' : ''}`;
}
