import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';
import { invokeRoute, loadRouterWithDatabase, loadServer } from './helpers/load-api.mjs';

const actor = (role = 'admin', system = 'sales', id = 1) => ({ id, system, role, isActive: true, name: 'Mock Actor', username: 'mock_actor', cpnumber: '', email: '', photo: '' });
const body = role => ({ name: 'Mock Target', username: 'mock_target', cpnumber: '', email: 'mock@example.test', photo: '', role, isActive: true, password: 'Mock-Password-12345' });
const requestFor = (user, input = {}, id = 9) => ({ params: { system: user.system, id: String(id) }, testUser: user, body: input, is: type => type === 'application/json' });
const tableFor = system => system[0].toUpperCase() + system.slice(1) + 'UserLogin';

// Actual shared router callbacks run against predetermined responses. Any query
// beyond the planned authorization/transaction boundary fails immediately.
function stagedDatabase(steps = []) {
  const pending = [...steps], calls = [];
  const counters = { transactions: 0, commits: 0, rollbacks: 0 };
  const scope = {};
  const database = {
    sql: new Proxy({}, { get: (_target, key) => key === 'MAX' ? -1 : (...args) => ({ key, args }) }),
    request(transaction) {
      const inputs = {};
      return {
        input(name, _type, value) { inputs[name] = value; return this; },
        async query(sql) {
          const statement = sql.replace(/\s+/g, ' ').trim();
          calls.push({ statement, inputs, inTransaction: transaction === scope });
          const step = pending.shift();
          assert.ok(step, 'Unexpected SQL operation: ' + statement);
          assert.match(statement, step.match);
          step.inspect?.({ statement, inputs, inTransaction: transaction === scope });
          return { recordset: structuredClone(step.rows || []) };
        },
      };
    },
    async transaction(work) {
      counters.transactions++;
      try { const result = await work(scope); counters.commits++; return result; }
      catch (error) { counters.rollbacks++; throw error; }
    },
  };
  return { database, calls, counters, done() { assert.equal(pending.length, 0, 'Every planned database result must be consumed.'); } };
}

function createPlan(user, role) {
  const table = tableFor(user.system), record = { ...actor(role, user.system, 99), name: 'Mock Target', username: 'mock_target' };
  return [
    { match: new RegExp(`FROM dbo\\.${table} WITH \\(UPDLOCK,HOLDLOCK\\) WHERE id=@id`), rows: [user], inspect: call => { assert.equal(call.inputs.id, user.id); assert.equal(call.inTransaction, true); } },
    { match: new RegExp(`INSERT INTO dbo\\.${table}\\(`), rows: [{ id: 99 }], inspect: ({ inputs, statement }) => { assert.match(statement, /createdAt,updatedAt/); assert.match(statement, /SYSUTCDATETIME\(\)/); assert.equal(inputs.cpnumber, null); assert.equal(inputs.photo, null); assert.equal(inputs.role, role); assert.equal(inputs.isActive, true); assert.match(inputs.passwordHash, /^scrypt\$[a-f0-9]{32}\$[a-f0-9]{128}$/); } },
    { match: /INSERT INTO dbo\.AuditTrail/, inspect: ({ inputs, inTransaction }) => { assert.equal(inputs.system, user.system); assert.equal(inputs.userId, user.id); assert.equal(inTransaction, true); } },
    { match: new RegExp(`FROM dbo\\.${table} WHERE id=@id`), rows: [record], inspect: ({ inputs }) => assert.equal(inputs.id, 99) },
  ];
}

test('shared Sales Head account reads filter the Sales role and reject admin or head targets', async () => {
  const head = actor('saleshead');
  const list = stagedDatabase([{ match: /FROM dbo\.SalesUserLogin WHERE role='sales' ORDER BY id$/, rows: [actor('sales', 'sales', 9)] }]);
  const listed = await invokeRoute(loadRouterWithDatabase('login', list.database), 'GET', '/:system/users', requestFor(head));
  assert.equal(listed.body.records[0].role, 'sales');
  assert.equal(listed.body.records[0].system, 'sales');
  list.done();
  for (const role of ['sales', 'admin', 'saleshead']) {
    const stage = stagedDatabase([{ match: /FROM dbo\.SalesUserLogin WHERE id=@id$/, rows: [actor(role, 'sales', 9)] }]);
    const action = () => invokeRoute(loadRouterWithDatabase('login', stage.database), 'GET', '/:system/users/:id', requestFor(head));
    if (role === 'sales') assert.equal((await action()).body.record.role, 'sales');
    else await assert.rejects(action(), error => error.status === 403);
    assert.equal(stage.counters.transactions, 0);
    stage.done();
  }
});

test('shared Sales Head creation allows Sales only and refuses every account edit before SQL', async () => {
  const head = actor('saleshead');
  for (const role of ['admin', 'saleshead', 'warehouse', 'owner']) {
    const stage = stagedDatabase();
    await assert.rejects(invokeRoute(loadRouterWithDatabase('login', stage.database), 'POST', '/:system/users', requestFor(head, body(role))), error => error.status === 403);
    assert.equal(stage.calls.length, 0);
    assert.equal(stage.counters.transactions, 0);
  }
  const edit = stagedDatabase();
  await assert.rejects(invokeRoute(loadRouterWithDatabase('login', edit.database), 'PUT', '/:system/users/:id', requestFor(head, body('sales'))), error => error.status === 403);
  assert.equal(edit.calls.length, 0);
  const allowed = stagedDatabase(createPlan(head, 'sales'));
  const result = await invokeRoute(loadRouterWithDatabase('login', allowed.database), 'POST', '/:system/users', requestFor(head, { ...body('sales'), isActive: false }));
  assert.equal(result.statusCode, 201);
  assert.equal(result.body.record.role, 'sales');
  assert.equal(allowed.counters.commits, 1);
  allowed.done();
});

test('own-system administrators create permitted accounts while workers cannot manage accounts', async () => {
  for (const system of ['sales', 'purchasing', 'warehouse', 'configuration']) {
    const admin = actor('admin', system);
    const stage = stagedDatabase(createPlan(admin, system));
    const result = await invokeRoute(loadRouterWithDatabase('login', stage.database), 'POST', '/:system/users', requestFor(admin, { ...body(system), isActive: false }));
    assert.equal(result.body.record.system, system);
    assert.equal(result.body.record.role, system);
    stage.done();
    const target = actor(system, system, 99);
    const edit = stagedDatabase([
      { match: /WITH \(UPDLOCK,HOLDLOCK\) WHERE id=@id$/, rows: [admin] },
      { match: /WITH \(UPDLOCK,HOLDLOCK\) WHERE id=@id$/, rows: [target] },
      { match: new RegExp(`UPDATE dbo\\.${tableFor(system)} SET`), inspect: ({ inputs }) => { assert.equal(inputs.id, target.id); assert.equal(inputs.isActive, false); } },
      { match: /INSERT INTO dbo\.AuditTrail/ },
      { match: /WHERE id=@id$/, rows: [{ ...target, isActive: false }] },
    ]);
    const updated = await invokeRoute(loadRouterWithDatabase('login', edit.database), 'PUT', '/:system/users/:id', requestFor(admin, { ...body(system), username: target.username, password: '', isActive: false }, target.id));
    assert.equal(updated.body.record.isActive, false);
    assert.equal(edit.counters.commits, 1);
    edit.done();
    const worker = actor(system, system);
    for (const [method, path] of [['GET', '/:system/users'], ['POST', '/:system/users'], ['PUT', '/:system/users/:id']]) {
      const denied = stagedDatabase();
      await assert.rejects(invokeRoute(loadRouterWithDatabase('login', denied.database), method, path, requestFor(worker, body('admin'))), error => error.status === 403);
      assert.equal(denied.calls.length, 0);
    }
  }
});

test('account writes recheck the stored actor role and active state under lock', async () => {
  for (const stored of [actor('sales'), { ...actor('saleshead'), isActive: false }]) {
    const stage = stagedDatabase([{ match: /WITH \(UPDLOCK,HOLDLOCK\) WHERE id=@id$/, rows: [stored] }]);
    await assert.rejects(invokeRoute(loadRouterWithDatabase('login', stage.database), 'POST', '/:system/users', requestFor(actor('saleshead'), body('sales'))), error => error.status === (stored.isActive ? 403 : 401));
    assert.equal(stage.calls.length, 1);
    assert.equal(stage.counters.rollbacks, 1);
    stage.done();
  }
});

test('administrators cannot deactivate or demote themselves and last-admin checks precede updates', async () => {
  const admin = actor();
  for (const input of [{ ...body('sales') }, { ...body('admin'), isActive: false }]) {
    const self = stagedDatabase([
      { match: /WITH \(UPDLOCK,HOLDLOCK\) WHERE id=@id$/, rows: [admin] },
      { match: /WITH \(UPDLOCK,HOLDLOCK\) WHERE id=@id$/, rows: [admin] },
    ]);
    await assert.rejects(invokeRoute(loadRouterWithDatabase('login', self.database), 'PUT', '/:system/users/:id', requestFor(admin, { ...input, username: admin.username, password: '' }, admin.id)), error => error.status === 400);
    assert.equal(self.calls.some(call => /^UPDATE|^INSERT/.test(call.statement)), false);
    assert.equal(self.counters.rollbacks, 1);
    self.done();
  }
  const last = stagedDatabase([
    { match: /WITH \(UPDLOCK,HOLDLOCK\) WHERE id=@id$/, rows: [admin] },
    { match: /WITH \(UPDLOCK,HOLDLOCK\) WHERE id=@id$/, rows: [actor('admin', 'sales', 9)] },
    { match: /COUNT\(\*\).*WITH \(UPDLOCK,HOLDLOCK\).*role='admin' AND isActive=1$/, rows: [{ total: 1 }] },
  ]);
  await assert.rejects(invokeRoute(loadRouterWithDatabase('login', last.database), 'PUT', '/:system/users/:id', requestFor(admin, { ...body('sales'), username: admin.username, password: '' })), error => error.status === 409);
  assert.equal(last.calls.some(call => /^UPDATE|^INSERT/.test(call.statement)), false);
  last.done();
});

test('own profile ignores forged privileges and uses the fresh stored role for every system', async () => {
  for (const system of ['sales', 'purchasing', 'warehouse', 'configuration']) {
    const stale = actor('admin', system), stored = actor(system, system);
    const stage = stagedDatabase([
      { match: /WITH \(UPDLOCK,HOLDLOCK\) WHERE id=@id$/, rows: [stored] },
      { match: new RegExp(`UPDATE dbo\\.${tableFor(system)} SET`), inspect: ({ inputs, statement }) => { assert.equal(inputs.id, stored.id); assert.equal(inputs.role, system); assert.equal(inputs.isActive, true); assert.equal(Object.hasOwn(inputs, 'passwordHash'), false); assert.doesNotMatch(statement, /passwordHash/); } },
      { match: /INSERT INTO dbo\.AuditTrail/, inspect: ({ inputs }) => assert.equal(inputs.system, system) },
      { match: /WHERE id=@id$/, rows: [{ ...stored, name: 'Edited Profile' }] },
    ]);
    const result = await invokeRoute(loadRouterWithDatabase('login', stage.database), 'PUT', '/:system/auth/profile', requestFor(stale, { ...body('admin'), username: stored.username, id: 999, isActive: false }));
    assert.equal(result.body.user.role, system);
    assert.equal(result.body.user.isActive, true);
    assert.equal(result.body.user.id, stored.id);
    assert.equal(stage.counters.commits, 1);
    stage.done();
  }
});

test('profile updates cannot rename any role in any system, including a case-only username change', async () => {
  for (const system of ['sales', 'purchasing', 'warehouse', 'configuration']) {
    const roles = system === 'sales' ? ['admin', 'saleshead', 'sales'] : ['admin', system];
    for (const role of roles) for (const username of ['renamed_user', 'IMMUTABLE_USER', '', null, 123]) {
      const stored = { ...actor(role, system), username: 'immutable_user' };
      const stage = stagedDatabase([{ match: /WITH \(UPDLOCK,HOLDLOCK\) WHERE id=@id$/, rows: [stored] }]);
      await assert.rejects(invokeRoute(loadRouterWithDatabase('login', stage.database), 'PUT', '/:system/auth/profile', requestFor(stored, { name: 'Edited profile', username })), error => error.status === 400 && /Username cannot be changed/.test(error.message));
      assert.equal(stage.calls.some(call => /^UPDATE|^INSERT|^DELETE/.test(call.statement)), false);
      assert.equal(stage.counters.commits, 0);
      assert.equal(stage.counters.rollbacks, 1);
      stage.done();
    }
  }
});

test('administrators cannot rename another account or their own account in any system', async () => {
  for (const system of ['sales', 'purchasing', 'warehouse', 'configuration']) for (const own of [false, true]) {
    const admin = actor('admin', system);
    const target = own ? admin : { ...actor(system, system, 9), username: 'permanent_target' };
    for (const username of ['different_name', target.username.toUpperCase(), null]) {
      const stage = stagedDatabase([
        { match: /WITH \(UPDLOCK,HOLDLOCK\) WHERE id=@id$/, rows: [admin] },
        { match: /WITH \(UPDLOCK,HOLDLOCK\) WHERE id=@id$/, rows: [target] },
      ]);
      await assert.rejects(invokeRoute(loadRouterWithDatabase('login', stage.database), 'PUT', '/:system/users/:id', requestFor(admin, { ...body(target.role), username, password: '' }, target.id)), error => error.status === 400 && /Username cannot be changed/.test(error.message));
      assert.equal(stage.calls.some(call => /^UPDATE|^INSERT|^DELETE/.test(call.statement)), false);
      assert.equal(stage.counters.commits, 0);
      assert.equal(stage.counters.rollbacks, 1);
      stage.done();
    }
  }
});

test('omitted and identical usernames preserve the stored literal while other profile fields update', async () => {
  for (const system of ['sales', 'purchasing', 'warehouse', 'configuration']) for (const supplied of [undefined, 'Permanent_User', ' Permanent_User ']) {
    const stored = { ...actor(system, system), username: 'Permanent_User' };
    const profile = { name: 'Edited profile', cpnumber: '09123456789', email: 'edited@example.test', photo: null, role: 'admin', isActive: false, ...(supplied === undefined ? {} : { username: supplied }) };
    const resultRecord = { ...stored, name: profile.name, cpnumber: profile.cpnumber, email: profile.email, photo: null };
    const stage = stagedDatabase([
      { match: /WITH \(UPDLOCK,HOLDLOCK\) WHERE id=@id$/, rows: [stored] },
      { match: new RegExp(`UPDATE dbo\\.${tableFor(system)} SET`), inspect: ({ inputs, statement, inTransaction }) => {
        assert.equal(inTransaction, true);
        assert.equal(inputs.name, profile.name);
        assert.equal(inputs.cpnumber, profile.cpnumber);
        assert.equal(inputs.email, profile.email);
        assert.equal(inputs.photo, null);
        assert.equal(inputs.role, stored.role);
        assert.equal(inputs.isActive, true);
        assert.equal(Object.hasOwn(inputs, 'username'), false);
        assert.doesNotMatch(statement, /\busername\s*=/i);
      } },
      { match: /INSERT INTO dbo\.AuditTrail/, inspect: ({ inputs }) => { assert.equal(inputs.userId, stored.id); assert.equal(inputs.userName, stored.name); assert.equal(inputs.recordId, String(stored.id)); } },
      { match: /WHERE id=@id$/, rows: [resultRecord] },
    ]);
    const result = await invokeRoute(loadRouterWithDatabase('login', stage.database), 'PUT', '/:system/auth/profile', requestFor(stored, profile));
    assert.equal(result.body.user.username, 'Permanent_User');
    assert.equal(result.body.user.name, profile.name);
    assert.equal(stage.counters.commits, 1);
    stage.done();
  }
});

test('account edits preserve usernames when omitted or unchanged and retain password, role, status and audit updates', async () => {
  for (const system of ['sales', 'purchasing', 'warehouse', 'configuration']) for (const supplied of [undefined, 'Permanent_Target']) {
    const admin = actor('admin', system);
    const target = { ...actor(system, system, 9), username: 'Permanent_Target' };
    const input = { ...body(system), name: 'Edited account', password: supplied === undefined ? 'New-Pass123' : '', isActive: false };
    delete input.username;
    if (supplied !== undefined) input.username = supplied;
    const stage = stagedDatabase([
      { match: /WITH \(UPDLOCK,HOLDLOCK\) WHERE id=@id$/, rows: [admin] },
      { match: /WITH \(UPDLOCK,HOLDLOCK\) WHERE id=@id$/, rows: [target] },
      { match: new RegExp(`UPDATE dbo\\.${tableFor(system)} SET`), inspect: ({ inputs, statement, inTransaction }) => {
        assert.equal(inTransaction, true);
        assert.equal(inputs.id, target.id);
        assert.equal(inputs.name, input.name);
        assert.equal(inputs.role, input.role);
        assert.equal(inputs.isActive, false);
        assert.equal(inputs.cpnumber, null);
        assert.equal(inputs.email, input.email);
        assert.equal(Object.hasOwn(inputs, 'username'), false);
        assert.doesNotMatch(statement, /\busername\s*=/i);
        if (input.password) { assert.match(inputs.passwordHash, /^scrypt\$[a-f0-9]{32}\$[a-f0-9]{128}$/); assert.match(statement, /passwordHash=@passwordHash/); }
        else { assert.equal(Object.hasOwn(inputs, 'passwordHash'), false); assert.doesNotMatch(statement, /passwordHash/); }
      } },
      { match: /INSERT INTO dbo\.AuditTrail/, inspect: ({ inputs }) => { assert.equal(inputs.userId, admin.id); assert.equal(inputs.recordId, String(target.id)); assert.equal(inputs.system, system); } },
      { match: /WHERE id=@id$/, rows: [{ ...target, name: input.name, isActive: false }] },
    ]);
    const result = await invokeRoute(loadRouterWithDatabase('login', stage.database), 'PUT', '/:system/users/:id', requestFor(admin, input));
    assert.equal(result.body.record.username, target.username);
    assert.equal(result.body.record.name, input.name);
    assert.equal(result.body.record.isActive, false);
    assert.equal(stage.counters.commits, 1);
    stage.done();
  }
});

test('password security type and size guards reject account requests before SQL', async () => {
  for (const password of [{ malicious: true }, 'x'.repeat(129), '']) {
    const stage = stagedDatabase();
    await assert.rejects(invokeRoute(loadRouterWithDatabase('login', stage.database), 'POST', '/:system/users', requestFor(actor(), { ...body('sales'), password })), error => error.status === 400);
    assert.equal(stage.calls.length, 0);
    assert.equal(stage.counters.transactions, 0);
  }
});

test('unknown and case-variant namespaces are rejected before real business routers', async t => {
  const server = loadServer().createApp({ SESSION_SECRET: 'mock-only-test-secret-long-enough-1234567890' }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const origin = `http://127.0.0.1:${server.address().port}`;
  for (const path of ['/api/unknown/auth/session', '/api/Warehouse/inventory', '/api/SALES/auth/session']) {
    const response = await fetch(origin + path);
    assert.equal(response.status, 404, path);
    assert.ok((await response.json()).message);
  }
});
