import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

export const COOKIE_NAME = 'salesport_session';
const DEMO_EMAIL = 'demo@salesport.app';
const DEMO_PASSWORD = 'Demo2026!';
const USER = { name: 'Alex Morgan', email: DEMO_EMAIL, initials: 'AM', role: 'Workspace owner' };
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const TOKEN_HEADER = encode({ alg: 'HS256', typ: 'JWT' });

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function secretFor(env) {
  if (typeof env?.SESSION_SECRET !== 'string' || env.SESSION_SECRET.length < 32) {
    throw new ApiError(503, 'The demo service is not configured yet. Please try again later.');
  }
  return env.SESSION_SECRET;
}

export function validateCredentials(input, env) {
  secretFor(env);
  if (typeof input.email !== 'string' || typeof input.password !== 'string'
      || input.email.length > 254 || input.password.length > 128
      || (input.remember !== undefined && typeof input.remember !== 'boolean')) {
    throw new ApiError(400, 'Enter your email and password.');
  }
  const email = input.email.trim().toLowerCase();
  if (!email || !input.password) throw new ApiError(400, 'Enter your email and password.');
  if (email !== DEMO_EMAIL || input.password !== DEMO_PASSWORD) {
    throw new ApiError(401, 'Email or password is incorrect. Use the demo credentials below.');
  }
  return { ...USER };
}

export function issueSession(env, remember = false, now = Date.now()) {
  const issued = Math.floor(now / 1000);
  const lifetime = remember ? 7 * 24 * 60 * 60 : 8 * 60 * 60;
  const payload = encode({
    sub: 'demo-owner', aud: 'salesport-demo', iat: issued,
    exp: issued + lifetime, jti: randomUUID(),
  });
  const value = `${TOKEN_HEADER}.${payload}`;
  const signature = createHmac('sha256', secretFor(env)).update(value).digest('base64url');
  return { token: `${value}.${signature}`, lifetime };
}

export function requireUser(request, env) {
  const secret = secretFor(env);
  const token = (request.headers.get('Cookie') || '').split(';')
    .map(part => part.trim()).find(part => part.startsWith(`${COOKIE_NAME}=`))
    ?.slice(COOKIE_NAME.length + 1);
  try {
    if (!token || token.length > 2048) throw new Error();
    const [header, payloadText, signature, extra] = token.split('.');
    if (header !== TOKEN_HEADER || !payloadText || !signature || extra !== undefined) throw new Error();
    const expected = createHmac('sha256', secret).update(`${header}.${payloadText}`).digest();
    const actual = Buffer.from(signature, 'base64url');
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error();
    const payload = JSON.parse(Buffer.from(payloadText, 'base64url').toString('utf8'));
    const now = Math.floor(Date.now() / 1000);
    if (payload.sub !== 'demo-owner' || payload.aud !== 'salesport-demo'
        || !Number.isInteger(payload.exp) || !Number.isInteger(payload.iat)
        || payload.exp <= now || payload.iat > now + 60 || payload.exp <= payload.iat) throw new Error();
    return { ...USER };
  } catch {
    throw new ApiError(401, 'Your session has ended. Please sign in again.');
  }
}

export function sessionCookie(request, token, lifetime, remember) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax${secure}${remember ? `; Max-Age=${lifetime}` : ''}`;
}

export function expiredCookie(request) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax${secure}; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}
