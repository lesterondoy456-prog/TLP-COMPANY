import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { once } from 'node:events';
import test from 'node:test';
import { loadServerWithDatabase } from './helpers/load-api.mjs';

const systems = ['sales', 'purchasing', 'warehouse', 'configuration'];
const secret = 'fake-only-photo-http-session-secret-no-environment-access-123456';
const photo = 'data:image/png;base64,' + Buffer.alloc(12 * 1024 * 1024).toString('base64');

function session(system, id = 1) {
  const iat = Math.floor(Date.now() / 1000);
  const value = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url') + '.' + Buffer.from(JSON.stringify({ sub: id, system, aud: 'tti-company-' + system, iat, exp: iat + 3600, jti: 'mock-photo-test-session' })).toString('base64url');
  const key = createHmac('sha256', secret).update('tti-session:' + system).digest();
  return `tti_${system}_session=${value}.${createHmac('sha256', key).update(value).digest('base64url')}`;
}

// Only an isolated, in-memory SQL adapter is reachable by the actual HTTP app.
// db.js, environment files, credentials and real accounts are never loaded.
async function fixture(t) {
  let accounts = Object.fromEntries(systems.map(system => [system, [1, 2].map(id => ({ id, name: 'Mock ' + id, username: 'mock_' + id, cpnumber: null, email: null, photo: null, role: id === 1 ? 'admin' : system, isActive: true }))]));
  const state = { reads: 0, commits: 0, rollbacks: 0, photoWrites: [], audits: [] };
  const database = {
    sql: new Proxy({}, { get: (_object, type) => type === 'MAX' ? -1 : (...args) => ({ type, args }) }),
    db() { throw new Error('Live database access is forbidden in photo tests.'); },
    initializeDatabase() { throw new Error('Photo tests cannot initialize a database.'); },
    closeDatabase() {},
    async transaction(work) {
      const scope = { accounts: Object.fromEntries(systems.map(system => [system, accounts[system].map(account => ({ ...account }))])), photoWrites: [], audits: [] };
      try {
        const result = await work(scope);
        accounts = scope.accounts;
        state.photoWrites.push(...scope.photoWrites);
        state.audits.push(...scope.audits);
        state.commits++;
        return result;
      } catch (error) { state.rollbacks++; throw error; }
    },
    request(scope) {
      const params = {}, types = {};
      return {
        input(name, type, value) { params[name] = value; types[name] = type; return this; },
        async query(statement) {
          const sql = statement.replace(/\s+/g, ' ').trim();
          const table = sql.match(/(?:FROM|INTO|UPDATE) dbo\.(Sales|Purchasing|Warehouse|Configuration)UserLogin\b/);
          const system = table?.[1].toLowerCase();
          const current = scope?.accounts || accounts;
          if (system && sql.startsWith('SELECT ')) {
            state.reads++;
            assert.ok(sql.includes('WHERE id=@id'), 'Account reads must retain their row identity.');
            const rows = current[system].filter(account => account.id === params.id && (!sql.includes('AND isActive=1') || account.isActive));
            return { recordset: rows.map(({ passwordHash, ...account }) => ({ ...account })) };
          }
          if (system && /^(?:INSERT INTO|UPDATE) /.test(sql)) {
            assert.ok(scope, 'Every photo write must belong to the fake transaction.');
            assert.equal(types.photo.type, 'NVarChar');
            assert.deepEqual(types.photo.args, [-1], 'The complete photo must bind as NVARCHAR(MAX).');
            assert.ok(params.photo === photo, 'The SQL parameter must contain the complete photo without truncation.');
            let account;
            if (sql.startsWith('INSERT INTO')) {
              assert.match(sql, /\bphoto\b/);
              const id = Math.max(...current[system].map(row => row.id)) + 1;
              account = { ...params, id };
              current[system].push(account);
            } else {
              assert.match(sql, /photo=@photo/);
              assert.doesNotMatch(sql, /username\s*=/i, 'Photo edits must not rewrite immutable usernames.');
              account = current[system].find(row => row.id === params.id);
              assert.ok(account, 'Only an existing account can be updated.');
              for (const [key, value] of Object.entries(params)) if (key !== 'id') account[key] = value;
            }
            scope.photoWrites.push({ system, operation: sql.startsWith('INSERT') ? 'create' : 'update', id: account.id, photoLength: params.photo.length });
            return { recordset: [{ id: account.id }] };
          }
          if (sql.startsWith('INSERT INTO dbo.AuditTrail')) {
            assert.ok(scope);
            scope.audits.push({ ...params });
            return { recordset: [] };
          }
          throw new Error('Unexpected fake photo SQL: ' + sql.slice(0, 100));
        },
      };
    },
  };
  const { createApp, MAX_BODY } = loadServerWithDatabase(database);
  const server = createApp({ SESSION_SECRET: secret }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const origin = 'http://127.0.0.1:' + server.address().port;
  return {
    state, origin, MAX_BODY,
    request(system, path, method, body, { cookie = session(system), headers = {} } = {}) {
      return fetch(origin + '/api/' + system + path, { method, headers: { 'Content-Type': 'application/json', Origin: origin, ...(cookie ? { Cookie: cookie } : {}), ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) });
    },
  };
}

test('photos above 10MB survive profile PUT, account POST and account PUT over real HTTP in all four systems', { timeout: 60000 }, async t => {
  const api = await fixture(t);
  assert.ok(Buffer.byteLength(photo) > 10 * 1024 * 1024);
  assert.ok(Buffer.byteLength(photo.slice(photo.indexOf(',') + 1), 'base64') > 10 * 1024 * 1024, 'The decoded image payload itself must exceed 10MiB.');
  for (const system of systems) {
    const profile = await api.request(system, '/auth/profile', 'PUT', { name: 'Photo profile', cpnumber: null, email: null, photo });
    assert.equal(profile.status, 200, system + ' profile photo');
    const profileRecord = (await profile.json()).user;
    assert.equal(profileRecord.system, system);
    assert.equal(profileRecord.username, 'mock_1');
    assert.ok(profileRecord.photo === photo, system + ' profile response must preserve the full photo.');

    const created = await api.request(system, '/users', 'POST', { name: 'Photo account', username: 'photo_created', role: system, password: 'Photo123', photo });
    assert.equal(created.status, 201, system + ' account creation photo');
    const createdRecord = (await created.json()).record;
    assert.equal(createdRecord.system, system);
    assert.equal(createdRecord.username, 'photo_created');
    assert.equal(Object.hasOwn(createdRecord, 'passwordHash'), false);
    assert.ok(createdRecord.photo === photo, system + ' create response must preserve the full photo.');

    const edited = await api.request(system, '/users/2', 'PUT', { name: 'Edited photo account', role: system, isActive: true, password: '', photo });
    assert.equal(edited.status, 200, system + ' account update photo');
    const editedRecord = (await edited.json()).record;
    assert.equal(editedRecord.system, system);
    assert.equal(editedRecord.username, 'mock_2');
    assert.ok(editedRecord.photo === photo, system + ' update response must preserve the full photo.');
  }
  assert.equal(api.state.photoWrites.length, 12);
  assert.equal(api.state.commits, 12);
  assert.equal(api.state.rollbacks, 0);
  assert.equal(api.state.audits.length, 12);
  for (const write of api.state.photoWrites) assert.equal(write.photoLength, photo.length);
});

test('photo routes keep scoped authentication and JSON/cross-site protections before fake SQL mutations', async t => {
  const api = await fixture(t);
  for (const system of systems) {
    const foreign = system === 'sales' ? 'warehouse' : 'sales';
    const before = api.state.reads;
    const noSession = await api.request(system, '/auth/profile', 'PUT', {}, { cookie: '' });
    assert.equal(noSession.status, 401);
    const foreignSession = await api.request(system, '/auth/profile', 'PUT', {}, { cookie: session(foreign) });
    assert.equal(foreignSession.status, 401);
    const relabeledForeign = session(foreign).replace('tti_' + foreign + '_session=', 'tti_' + system + '_session=');
    assert.equal((await api.request(system, '/auth/profile', 'PUT', {}, { cookie: relabeledForeign })).status, 401);
    assert.equal(api.state.reads, before, 'Foreign or absent sessions must not reach SQL.');

    const crossSite = await api.request(system, '/auth/profile', 'PUT', {}, { headers: { Origin: 'https://hostile.example', 'Sec-Fetch-Site': 'cross-site' } });
    assert.equal(crossSite.status, 403);
    assert.equal(crossSite.headers.get('access-control-allow-origin'), null);
    const form = await api.request(system, '/users', 'POST', '{}', { headers: { 'Content-Type': 'text/plain' } });
    assert.equal(form.status, 415);
    assert.equal(api.state.reads, before, 'Rejected origins or form content types must not reach SQL.');

    const workerCreate = await api.request(system, '/users', 'POST', {}, { cookie: session(system, 2) });
    assert.equal(workerCreate.status, 403, 'An upload must not grant account-management privileges.');
  }
  assert.equal(api.state.commits, 0);
  assert.equal(api.state.photoWrites.length, 0);
  assert.equal(api.state.audits.length, 0);
});

test('malformed photo JSON remains 400 and ordinary or descendant routes retain the 1MB HTTP limit', async t => {
  const api = await fixture(t);
  for (const system of systems) {
    for (const [path, method] of [['/auth/profile', 'PUT'], ['/users', 'POST'], ['/users/2', 'PUT']]) {
      const response = await api.request(system, path, method, '{"photo":');
      assert.equal(response.status, 400, system + ' ' + path);
      assert.ok((await response.json()).message);
    }
  }
  const hugeOrdinary = JSON.stringify({ notes: 'x'.repeat(api.MAX_BODY) });
  for (const path of ['/sales-orders', '/auth/profile/not-a-photo-route', '/users/2/not-a-photo-route']) {
    const response = await api.request('sales', path, 'POST', hugeOrdinary);
    assert.equal(response.status, 413, path + ' must retain the ordinary body limit.');
    const message = (await response.json()).message;
    assert.ok(message);
    assert.doesNotMatch(message, /550\s*KB|250\s*KB|10\s*MB/i, 'The generic size error must not invent a photo cap.');
  }
  assert.equal(api.state.reads, 0);
  assert.equal(api.state.commits, 0);
  assert.equal(api.state.photoWrites.length, 0);
});
