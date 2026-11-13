import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { request, sql } from '../database.js';
import { ApiError } from './errors.js';
import { AUTH_SYSTEMS, systemDefinition, createScopedSession, verifyScopedSession, scopedCookieToken, canManageSystemAccounts, canEditSystemAccount } from './auth-scope.js';

export { ApiError };
export const USER_COLUMNS = 'id, name, username, cpnumber, email, photo, role, isActive';
const scrypt = promisify(scryptCallback);
const attempts = new Map();

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

export async function seedAdministrator(system) {
  const { table } = systemDefinition(system);
  const username = (process.env.ADMIN_USERNAME || 'admin').trim().toLowerCase();
  const existing = await request().query(`SELECT TOP(1) id FROM dbo.${table} WHERE role='admin' AND isActive=1`);
  if (existing.recordset.length) return;
  const password = process.env.ADMIN_PASSWORD;
  if (!password || password.length < 7 || password.length > 128) throw new Error('Set ADMIN_PASSWORD in .env to 7–128 characters before first startup.');
  if (!/^[a-z0-9._-]{3,80}$/.test(username)) throw new Error('ADMIN_USERNAME must contain 3–80 letters, numbers, dots, underscores or hyphens.');
  await request()
    .input('name', sql.NVarChar(150), (process.env.ADMIN_NAME || 'Administrator').slice(0, 150))
    .input('username', sql.NVarChar(80), username).input('email', sql.NVarChar(254), process.env.ADMIN_EMAIL || '')
    .input('passwordHash', sql.VarChar(300), await hashPassword(password))
    .query(`INSERT INTO dbo.${table}(name,username,email,role,passwordHash) VALUES(@name,@username,@email,'admin',@passwordHash)`);
}

export async function seedAdministrators() {
  for (const system of Object.keys(AUTH_SYSTEMS)) await seedAdministrator(system);
}

export async function validateCredentials(input, requestObject, system) {
  const definition = systemDefinition(system);
  if (typeof input.username !== 'string' || typeof input.password !== 'string'
      || input.username.length > 80 || input.password.length > 128
      || (input.remember !== undefined && typeof input.remember !== 'boolean')) throw new ApiError(400, 'Enter a valid username and password.');
  const username = input.username.trim().toLowerCase();
  if (!username || !input.password) throw new ApiError(400, 'Enter your username and password.');
  const now = Date.now();
  const key = `${system}:${requestObject.headers.get('x-tlp-client-address') || 'local'}:${username}`;
  for (const [storedKey, entry] of attempts) if (entry.expires <= now) attempts.delete(storedKey);
  const entry = attempts.get(key) || { count: 0, expires: now + 15 * 60 * 1000 };
  if (entry.count >= 8) throw new ApiError(429, 'Too many unsuccessful sign-in attempts. Please try again in 15 minutes.');
  const result = await request().input('username', sql.NVarChar(80), username)
    .query(`SELECT ${USER_COLUMNS},passwordHash FROM dbo.${definition.table} WHERE username=@username`);
  const row = result.recordset[0];
  const correct = await verifyPassword(input.password, row?.passwordHash);
  if (!row?.isActive || !correct || !definition.roles.includes(row.role)) {
    entry.count++;
    if (attempts.size < 10000) attempts.set(key, entry);
    throw new ApiError(401, 'Username or password is incorrect.');
  }
  attempts.delete(key);
  const { passwordHash, ...user } = row;
  return { ...user, system };
}

export function issueSession(env, user, remember = false) {
  return createScopedSession({ secret: env.SESSION_SECRET, system: user.system, userId: user.id, remember });
}

export async function requireUser(requestObject, env, system) {
  const definition = systemDefinition(system);
  const payload = verifyScopedSession(scopedCookieToken(requestObject.headers.get('cookie'), system), { secret: env.SESSION_SECRET, system });
  const result = await request().input('id', sql.Int, payload.sub)
    .query(`SELECT ${USER_COLUMNS} FROM dbo.${definition.table} WHERE id=@id AND isActive=1`);
  const user = result.recordset[0];
  if (!user || !definition.roles.includes(user.role)) throw new ApiError(401, 'Your account is inactive or your session has ended.');
  return { ...user, system };
}

export function requireAdmin(user) {
  if (!canEditSystemAccount(user)) throw new ApiError(403, 'Only administrators can manage accounts.');
}

export function requireAccountManager(user) {
  if (!canManageSystemAccounts(user)) throw new ApiError(403, 'This account cannot manage users in this system.');
}

export function sessionCookie(requestObject, token, lifetime, remember, system) {
  const { cookie, path } = systemDefinition(system);
  const secure = new URL(requestObject.url).protocol === 'https:' ? '; Secure' : '';
  return `${cookie}=${token}; Path=${path}; HttpOnly; SameSite=Lax${secure}${remember ? `; Max-Age=${lifetime}` : ''}`;
}

export function expiredCookie(requestObject, system) {
  const { cookie, path } = systemDefinition(system);
  return `${cookie}=; Path=${path}; HttpOnly; SameSite=Lax; Max-Age=0${new URL(requestObject.url).protocol === 'https:' ? '; Secure' : ''}`;
}
