import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import {
  AUTH_SYSTEMS, canCreateSystemAccount, canEditSystemAccount, canManageSystemAccounts,
  canReadSystemAccount, createScopedSession, scopedCookieToken, systemDefinition,
  verifyScopedSession,
} from '../components/auth-scope.js';

// Production policy and JWT code only; no environment, application, or SQL imports.
const secret = 'mock-only-session-secret-for-isolation-tests-123456';
const now = Date.UTC(2026, 10, 13, 1);
const systems = ['sales', 'purchasing', 'warehouse', 'configuration'];
const unauthorized = error => error.status === 401;

test('each system owns its account table, worker roles, cookie name and cookie path', () => {
  assert.deepEqual(Object.keys(AUTH_SYSTEMS).sort(), systems.toSorted());
  for (const system of systems) {
    const definition = systemDefinition(system);
    const title = system[0].toUpperCase() + system.slice(1);
    assert.equal(definition.table, title + 'UserLogin');
    assert.equal(definition.cookie, `tlp_${system}_session`);
    assert.equal(definition.path, `/api/${system}`);
    assert.deepEqual([...definition.roles], system === 'sales' ? ['admin', 'saleshead', 'sales'] : ['admin', system]);
    assert.equal(scopedCookieToken(`tlp_session=old-unscoped; tlp_${system}_session=own-token`, system), 'own-token');
    const otherCookies = systems.filter(other => other !== system).map(other => `tlp_${other}_session=other-token`).join('; ');
    assert.equal(scopedCookieToken(otherCookies + '; tlp_session=old-unscoped', system), undefined);
  }
  for (const invalid of ['other', '__proto__', 'constructor', '', undefined]) assert.throws(() => systemDefinition(invalid), error => error.status === 400);
});

test('JWTs are accepted only by their issuing system even with the same account ID and server secret', () => {
  for (const source of systems) {
    const { token, lifetime } = createScopedSession({ secret, system: source, userId: 1, now });
    assert.equal(lifetime, 8 * 3600);
    assert.equal(token.split('.').length, 3);
    const payload = verifyScopedSession(token, { secret, system: source, now });
    assert.equal(payload.sub, 1);
    assert.equal(payload.system, source);
    assert.equal(payload.aud, systemDefinition(source).audience);
    assert.equal(payload.exp - payload.iat, lifetime);
    assert.ok(payload.jti);
    for (const destination of systems.filter(system => system !== source)) assert.throws(() => verifyScopedSession(token, { secret, system: destination, now }), unauthorized);
    assert.throws(() => verifyScopedSession(token, { secret: secret + '-wrong', system: source, now }), unauthorized);
    assert.throws(() => verifyScopedSession(token, { secret, system: source, now: now + lifetime * 1000 }), unauthorized);
    const remembered = createScopedSession({ secret, system: source, userId: 1, remember: true, now });
    assert.equal(remembered.lifetime, 7 * 86400);
    assert.equal(verifyScopedSession(remembered.token, { secret, system: source, now: now + 86400 * 1000 }).system, source);
  }
});

test('signed JWTs still require the correct system, audience, account ID, time and algorithm', () => {
  const system = 'purchasing';
  const { token } = createScopedSession({ secret, system, userId: 25, now });
  const [header, body] = token.split('.');
  const original = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  const sign = (payload, customHeader = header) => {
    const value = customHeader + '.' + Buffer.from(JSON.stringify(payload)).toString('base64url');
    const key = createHmac('sha256', secret).update(`tlp-session:${system}`).digest();
    return value + '.' + createHmac('sha256', key).update(value).digest('base64url');
  };
  for (const changes of [
    { system: 'sales' }, { system: undefined }, { aud: systemDefinition('sales').audience }, { aud: undefined }, { sub: 0 }, { sub: 1.5 },
    { sub: 2147483648 }, { exp: original.iat }, { iat: original.iat + 61 },
  ]) assert.throws(() => verifyScopedSession(sign({ ...original, ...changes }), { secret, system, now }), unauthorized);
  const noneHeader = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  assert.throws(() => verifyScopedSession(sign(original, noneHeader), { secret, system, now }), unauthorized);
  for (const malformed of [undefined, '', 'not-a-jwt', token + '.extra', token.slice(0, -8), 'x'.repeat(2049)]) assert.throws(() => verifyScopedSession(malformed, { secret, system, now }), unauthorized);
  for (const userId of [0, -1, 1.5, '1', 2147483648]) assert.throws(() => createScopedSession({ secret, system, userId, now }), error => error.status === 400);
});

test('account management never crosses systems and workers cannot elevate local privileges', () => {
  for (const system of systems) {
    const admin = { id: 1, system, role: 'admin' };
    const worker = { id: 2, system, role: system };
    assert.equal(canManageSystemAccounts(admin), true);
    assert.equal(canReadSystemAccount(admin, worker), true);
    assert.equal(canEditSystemAccount(admin, worker), true);
    for (const role of systemDefinition(system).roles) assert.equal(canCreateSystemAccount(admin, role), true);
    for (const other of systems.filter(value => value !== system)) {
      const target = { id: 1, system: other, role: 'admin' };
      assert.equal(canReadSystemAccount(admin, target), false);
      assert.equal(canEditSystemAccount(admin, target), false);
      assert.equal(canCreateSystemAccount(admin, other), false);
    }
    assert.equal(canManageSystemAccounts(worker), false);
    assert.equal(canReadSystemAccount(worker, admin), false);
    assert.equal(canEditSystemAccount(worker, admin), false);
    for (const role of ['admin', 'saleshead', ...systems]) assert.equal(canCreateSystemAccount(worker, role), false);
  }
  const head = { system: 'sales', role: 'saleshead' };
  assert.equal(canManageSystemAccounts(head), true);
  assert.equal(canCreateSystemAccount(head, 'sales'), true);
  assert.equal(canReadSystemAccount(head, { system: 'sales', role: 'sales' }), true);
  assert.equal(canCreateSystemAccount(head, 'admin'), false);
  assert.equal(canEditSystemAccount(head, { system: 'sales', role: 'sales' }), false);
  assert.equal(canReadSystemAccount(head, { system: 'purchasing', role: 'sales' }), false);
  for (const actor of [null, undefined, {}, { system: 'other', role: 'admin' }, { system: 'warehouse', role: 'saleshead' }]) assert.equal(canManageSystemAccounts(actor), false);
});
