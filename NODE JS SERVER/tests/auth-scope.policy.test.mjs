import assert from 'node:assert/strict';
import { createHmac, scryptSync } from 'node:crypto';
import test from 'node:test';
import { invokeRoute, loadRouterWithDatabase } from './helpers/load-api.mjs';

const secret = 'mock-only-session-secret-for-isolation-tests-123456';
const systems = ['sales', 'purchasing', 'warehouse', 'configuration'];
const salt = '0123456789abcdef0123456789abcdef';
const password = 'Mock-Password-12345';
const passwordHash = `scrypt$${salt}$${scryptSync(password, salt, 64).toString('hex')}`;
const unauthorized = error => error.status === 401;

// Actual route callbacks, SELECT-only fake DB: never import db.js or its .env.
function fixture(overrides = {}) {
  const calls = [];
  const database = {
    sql: new Proxy({}, { get: () => (...args) => args }),
    request() {
      const inputs = {};
      return {
        input(name, _type, value) { inputs[name] = value; return this; },
        async query(statement) {
          calls.push({ statement, inputs });
          assert.match(statement, /^SELECT /);
          const table = statement.match(/FROM dbo\.(\w+)UserLogin/)?.[1];
          assert.ok(table && systems.includes(table.toLowerCase()));
          const row = { id: 1, name: 'Mock Admin', username: 'mock_admin', cpnumber: '', email: '', photo: '', role: 'admin', isActive: true, ...overrides };
          if (statement.includes('passwordHash')) row.passwordHash = overrides.passwordHash ?? passwordHash;
          return { recordset: overrides.missing ? [] : [row] };
        },
      };
    },
    transaction() { throw new Error('Auth read tests may not start transactions.'); },
  };
  const router = loadRouterWithDatabase('login', database);
  const guard = router.stack.find(layer => !layer.route).handle;
  return {
    calls,
    login: (system, input = {}, secure = false) => invokeRoute(router, 'POST', '/:system/auth/login', {
      params: { system }, body: { username: ' Mock_Admin ', password, ...input },
      is: type => type === 'application/json', secure, app: { locals: { env: { SESSION_SECRET: secret } } },
    }),
    async session(system, cookie, envSecret = secret) {
      const res = { locals: {}, statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
      let accepted = false;
      const req = { params: { system }, get: () => cookie, app: { locals: { env: { SESSION_SECRET: envSecret } } } };
      await guard(req, res, () => { accepted = true; });
      return { accepted, res, user: res.locals.user, scopedUser: req[system + 'User'] };
    },
    logout: system => invokeRoute(router, 'POST', '/:system/auth/logout', { params: { system }, secure: true }),
  };
}

function signedToken(system, payload, header = { alg: 'HS256', typ: 'JWT' }) {
  const value = Buffer.from(JSON.stringify(header)).toString('base64url') + '.' + Buffer.from(JSON.stringify(payload)).toString('base64url');
  const key = createHmac('sha256', secret).update(`tti-session:${system}`).digest();
  return value + '.' + createHmac('sha256', key).update(value).digest('base64url');
}

test('actual login handlers issue isolated JWT cookies using each system login table', async () => {
  const api = fixture();
  for (const system of systems) {
    const result = await api.login(system);
    const cookie = result.headers['Set-Cookie'];
    const token = cookie.split(';')[0].split('=')[1];
    assert.match(cookie, new RegExp(`^tti_${system}_session=`));
    assert.ok(cookie.includes(`Path=/api/${system}; HttpOnly; SameSite=Lax`));
    assert.ok(!cookie.includes('Max-Age='));
    assert.equal(result.body.user.system, system);
    assert.equal(result.body.user.passwordHash, undefined);
    assert.equal(token.split('.').length, 3);
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url'));
    assert.equal(payload.sub, 1);
    assert.equal(payload.aud, `tti-company-${system}`);
    assert.equal(payload.system, system);
    assert.equal(payload.exp - payload.iat, 8 * 3600);
    assert.ok(payload.jti);
    const accepted = await api.session(system, cookie);
    assert.equal(accepted.accepted, true);
    assert.equal(accepted.user.system, system);
    assert.deepEqual(accepted.user, accepted.scopedUser);
    assert.equal(api.calls.at(-2).inputs.username, 'mock_admin');
    for (const other of systems.filter(value => value !== system)) {
      const before = api.calls.length;
      await assert.rejects(api.session(other, cookie), unauthorized);
      await assert.rejects(api.session(other, `tti_${other}_session=${token}`), unauthorized);
      assert.equal(api.calls.length, before, 'Foreign JWTs must be rejected before SQL.');
    }
    await assert.rejects(api.session(system, cookie, secret + '-wrong'), unauthorized);
  }
});

test('remembered login and logout use the correct system cookie, expiry and secure flag', async () => {
  const api = fixture();
  for (const system of systems) {
    const result = await api.login(system, { remember: true }, true);
    const cookie = result.headers['Set-Cookie'];
    assert.match(cookie, /; Secure; Max-Age=604800$/);
    const payload = JSON.parse(Buffer.from(cookie.split('.')[1], 'base64url'));
    assert.equal(payload.exp - payload.iat, 7 * 86400);
    const logout = await api.logout(system);
    assert.equal(logout.headers['Set-Cookie'], `tti_${system}_session=; Path=/api/${system}; HttpOnly; SameSite=Lax; Max-Age=0; Secure`);
    assert.equal(logout.body.success, true);
  }
});

test('actual authentication middleware rejects expired, tampered or incorrectly scoped JWT claims before SQL', async () => {
  const api = fixture(), system = 'purchasing';
  const login = await api.login(system);
  const token = login.headers['Set-Cookie'].split(';')[0].split('=')[1];
  const original = JSON.parse(Buffer.from(token.split('.')[1], 'base64url'));
  const before = api.calls.length;
  for (const changes of [
    { system: 'sales' }, { system: undefined }, { aud: 'tti-company-sales' }, { aud: undefined },
    { sub: 0 }, { sub: 1.5 }, { sub: '1' }, { sub: 2147483648 },
    { exp: original.iat }, { exp: original.iat - 1 }, { iat: original.iat + 120 },
  ]) await assert.rejects(api.session(system, `tti_${system}_session=${signedToken(system, { ...original, ...changes })}`), unauthorized);
  await assert.rejects(api.session(system, `tti_${system}_session=${signedToken(system, original, { alg: 'none', typ: 'JWT' })}`), unauthorized);
  for (const malformed of ['', 'not-a-jwt', token + '.extra', token.slice(0, -8), 'x'.repeat(2049)]) {
    await assert.rejects(api.session(system, `tti_${system}_session=${malformed}`), unauthorized);
  }
  assert.equal(api.calls.length, before);
});

test('invalid credentials, inactive users, missing hashes and foreign roles cannot log in', async () => {
  for (const overrides of [{ isActive: false }, { missing: true }, { passwordHash: 'broken' }, { role: 'warehouse' }]) {
    await assert.rejects(fixture(overrides).login('sales'), unauthorized);
  }
  await assert.rejects(fixture().login('sales', { password: 'wrong-password' }), unauthorized);
  assert.equal((await fixture({ role: 'sales' }).login('sales')).body.user.role, 'sales');
  const api = fixture();
  for (const system of ['other', '__proto__', 'constructor', 'Sales']) {
    await assert.rejects(api.login(system), error => error.status === 404);
    assert.equal((await api.session(system, '')).res.statusCode, 404);
    await assert.rejects(api.logout(system), error => error.status === 404);
  }
  assert.equal(api.calls.length, 0);
});

test('failed login attempts are limited before further password queries', async () => {
  const api = fixture();
  for (let index = 0; index < 8; index++) await assert.rejects(api.login('sales', { password: 'wrong-password' }), unauthorized);
  assert.equal(api.calls.length, 8);
  await assert.rejects(api.login('sales', { password: 'wrong-password' }), error => error.status === 429);
  assert.equal(api.calls.length, 8);
  assert.equal((await api.login('purchasing')).body.user.system, 'purchasing');
});
