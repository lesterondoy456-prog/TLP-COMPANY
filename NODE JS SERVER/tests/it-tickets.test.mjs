import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import { createServer } from 'node:http';
import { once } from 'node:events';
import test from 'node:test';
import { loadServerWithDatabase } from './helpers/load-api.mjs';

const secret = 'isolated-it-helpdesk-authentication-test-secret-123456';
const systems = ['sales', 'purchasing', 'warehouse', 'configuration', 'itticket'];
const key = 'a'.repeat(32);
function cookie(system, id = 1) {
  const iat = Math.floor(Date.now() / 1000) - 1;
  const value = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url') + '.' + Buffer.from(JSON.stringify({ sub: id, system, aud: `tti-company-${system}`, iat, exp: iat + 3600 })).toString('base64url');
  const signingKey = createHmac('sha256', secret).update(`tti-session:${system}`).digest();
  return `tti_${system}_session=${value}.${createHmac('sha256', signingKey).update(value).digest('base64url')}`;
}
function memoryDatabase() {
  let state = { tickets: [], history: [], attachments: [], audits: [], nextId: 1, clock: 0 };
  const calls = [], faults = { audit: false };
  let queue = Promise.resolve();
  const timestamp = () => new Date(Date.UTC(2026, 10, 18, 0, 0, state.clock++)).toISOString();
  const database = {
    sql: new Proxy({}, { get: (_target, type) => type === 'MAX' ? -1 : (...args) => ({ type, args }) }),
    request(scope) {
      const values = {};
      return { input(name, _type, value) { values[name] = value; return this; }, async query(query) {
        const text = query.trim(); calls.push({ query: text, values: { ...values }, transactional: Boolean(scope) });
        const table = text.match(/FROM dbo\.(Sales|Purchasing|Warehouse|Configuration|ITTicket)UserLogin\b/)?.[1];
        if (table) { const system = table.toLowerCase(); return { recordset: [1, 2].filter(id => id === values.id).map(id => ({ id, name: `${system} ${id}`, username: `${system}_${id}`, role: id === 1 ? 'admin' : system === 'itticket' ? 'it' : system, isActive: true })) }; }
        const own = row => values.manager || row.ownerSystem === values.ownerSystem && row.ownerId === values.ownerId;
        if (text.startsWith('SELECT id,requestHash FROM dbo.ITTickets')) { assert.ok(scope); assert.match(text, /UPDLOCK,HOLDLOCK/); return { recordset: state.tickets.filter(row => row.ownerSystem === values.ownerSystem && row.ownerId === values.ownerId && row.requestKey === values.requestKey) }; }
        if (text.startsWith('SELECT t.id')) {
          assert.match(text, /ownerSystem=@ownerSystem AND t.ownerId=@ownerId/);
          return { recordset: state.tickets.filter(row => (values.id === undefined || row.id === values.id) && own(row) && (!values.category || row.category === values.category) && (!values.status || row.status === values.status) && (!values.filterSystem || row.ownerSystem === values.filterSystem)).toReversed().map(({ requestKey, requestHash, ...row }) => ({ ...row, attachmentCount: state.attachments.filter(file => file.ticketId === row.id).length })) };
        }
        if (text.startsWith('SELECT h.id')) return { recordset: state.history.filter(row => row.ticketId === values.id).map(row => { const correction = state.history.findLast(change => change.targetHistoryId === row.id); return { ...row, displayNote: correction ? correction.note : row.note, noteEditedAt: correction?.createdAt ?? null, noteEditedBy: correction?.actorName ?? null }; }) };
        if (text.startsWith('SELECT id,ticketId,name,type,bytes')) return { recordset: state.attachments.filter(row => row.ticketId === values.id).map(({ data, sha256, ...row }) => ({ ...row })) };
        if (text.startsWith('SELECT a.id')) { assert.match(text, /a.ticketId=@id.*ownerSystem=@ownerSystem AND t.ownerId=@ownerId/s); return { recordset: state.attachments.filter(row => row.id === values.attachmentId && row.ticketId === values.id && own(state.tickets.find(ticket => ticket.id === row.ticketId))).map(row => ({ ...row, data: Buffer.from(row.data) })) }; }
        if (text.startsWith('SELECT id,ownerSystem,ownerId')) { assert.ok(scope); assert.match(text, /UPDLOCK,HOLDLOCK/); return { recordset: state.tickets.filter(row => row.id === values.id).map(row => ({ ...row })) }; }
        if (text.startsWith('SELECT id,kind,status')) return { recordset: state.history.filter(row => row.id === values.historyId && row.ticketId === values.id).map(row => ({ ...row })) };
        assert.ok(scope, 'Every ticket mutation must run inside the fake transaction.');
        if (text.startsWith('INSERT INTO dbo.ITTickets')) { const id = state.nextId++; state.tickets.push({ ...values, id, number: null, status: 'pending', version: 1, createdAt: timestamp(), updatedAt: timestamp() }); return { recordset: [{ id }] }; }
        if (text.startsWith('UPDATE dbo.ITTickets SET number=')) { state.tickets.find(row => row.id === values.id).number = values.number; return { recordset: [] }; }
        if (text.startsWith('UPDATE dbo.ITTickets SET status=') || text.startsWith('UPDATE dbo.ITTickets SET version=')) { assert.match(text, /WHERE id=@id AND version=@version/); const row = state.tickets.find(row => row.id === values.id && row.version === values.version); if (!row) return { recordset: [] }; if (values.status !== undefined) row.status = values.status; row.version++; row.updatedAt = timestamp(); return { recordset: [{ version: row.version }] }; }
        if (text.startsWith('INSERT INTO dbo.ITTicketHistory')) { const kind = text.includes("N'created'") ? 'created' : text.includes("N'note-edit'") ? 'note-edit' : 'status'; state.history.push({ id: state.history.length + 1, ticketId: values.id, kind, status: values.status || 'pending', note: values.note, targetHistoryId: values.historyId ?? null, actorSystem: values.actorSystem, actorId: values.actorId, actorName: values.actorName, createdAt: timestamp() }); return { recordset: [] }; }
        if (text.startsWith('INSERT INTO dbo.ITTicketAttachments')) { state.attachments.push({ ...values, id: state.attachments.length + 1, ticketId: values.id }); return { recordset: [] }; }
        if (text.startsWith('INSERT INTO dbo.AuditTrail')) { if (faults.audit) throw Object.assign(new Error('Injected audit rollback'), { status: 409 }); state.audits.push({ ...values }); return { recordset: [] }; }
        throw new Error('Unexpected isolated ticket SQL: ' + text.slice(0, 100));
      } };
    },
    async transaction(work) { const previous = queue; let release; queue = new Promise(resolve => { release = resolve; }); await previous; const snapshot = structuredClone(state); try { return await work({ serializable: true }); } catch (error) { state = snapshot; throw error; } finally { release(); } },
  };
  return { database, calls, faults, snapshot: () => structuredClone(state) };
}
async function fixture(t) {
  const memory = memoryDatabase();
  const { createApp } = loadServerWithDatabase(memory.database);
  const app = createApp({ SESSION_SECRET: secret });
  const notifications = [];
  app.locals.realtime.io = { to(room) { return { emit(event, payload) { notifications.push({ room, event, payload }); } }; }, sockets: { sockets: new Map() } };
  const server = createServer(app);
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  return { ...memory, notifications, async call(system, path, { method = 'GET', body, id = 1, session } = {}) { const prefix = system === 'itticket' ? '/api/itticket' : `/api/${system}/helpdesk`; const response = await fetch(origin + prefix + path, { method, headers: { Cookie: session ?? cookie(system, id), ...(method !== 'GET' ? { 'Content-Type': 'application/json' } : {}) }, body: method !== 'GET' ? JSON.stringify(body ?? {}) : undefined }); const type = response.headers.get('content-type') || ''; return { status: response.status, headers: response.headers, body: type.includes('application/json') ? await response.json() : Buffer.from(await response.arrayBuffer()) }; }, create(system = 'sales', changes = {}, id = 1) { return this.call(system, '/tickets', { method: 'POST', body: { requestKey: key, category: 'request', note: 'Please review this request.', attachments: [], ...changes }, id }); } };
}
const pdf = (name = 'evidence.pdf') => ({ name, type: 'application/pdf', data: Buffer.from('%PDF-1.7\nEvidence').toString('base64') });

test('ticket ownership is scoped by both system and user; separate IT roles manage all tickets', async t => {
  const api = await fixture(t);
  const created = [];
  for (const system of systems.filter(system => system !== 'itticket')) { const response = await api.create(system); assert.equal(response.status, 201, JSON.stringify(response.body)); created.push(response.body.record); }
  for (const [index, system] of systems.filter(system => system !== 'itticket').entries()) {
    const own = await api.call(system, '/tickets'); assert.deepEqual(own.body.records.map(row => row.id), [created[index].id]);
    const foreign = created[(index + 1) % created.length]; assert.equal((await api.call(system, `/tickets/${foreign.id}`)).status, 404);
    assert.equal((await api.call(system, `/tickets/${created[index].id}`, { id: 2 })).status, 404);
    assert.equal((await api.call(system, `/tickets/${created[index].id}/status`, { method: 'PATCH', body: { version: 1, status: 'ongoing', note: '' } })).status, 403);
  }
  assert.equal((await api.call('itticket', '/tickets')).body.records.length, 4);
  assert.equal((await api.call('itticket', `/tickets/${created[0].id}`, { id: 2 })).status, 200);
  assert.equal((await api.create('itticket')).status, 403);
  const before = api.calls.length;
  assert.equal((await api.call('itticket', '/tickets', { session: cookie('sales') })).status, 401);
  assert.equal((await api.call('sales', '/tickets', { session: cookie('itticket') })).status, 401);
  assert.equal(api.calls.length, before, 'Foreign JWTs fail before SQL.');
});

test('creation is idempotent, request uploads are forbidden, and audit failures roll back every new row', async t => {
  const api = await fixture(t);
  assert.equal((await api.create('sales', { attachments: [pdf()] })).status, 400);
  assert.equal(api.snapshot().tickets.length, 0);
  const first = await api.create(); assert.equal(first.status, 201); assert.equal(first.body.record.status, 'pending'); assert.equal(first.body.record.history[0].actorSystem, 'sales');
  const replay = await api.create(); assert.equal(replay.status, 200); assert.equal(replay.body.replayed, true); assert.equal(replay.body.record.id, first.body.record.id);
  assert.equal((await api.create('sales', { note: 'Different request' })).status, 409);
  assert.equal(api.snapshot().tickets.length, 1); assert.equal(api.snapshot().history.length, 1);
  const before = api.snapshot(); api.faults.audit = true;
  assert.equal((await api.create('purchasing', { category: 'support', attachments: [pdf()] })).status, 409);
  assert.deepEqual(api.snapshot(), before);
});

test('support attachment validation rejects unsafe names, MIME, signatures, base64, count and decoded size before writes', async t => {
  const api = await fixture(t);
  const attempts = [
    { ...pdf(), name: '../evidence.pdf' }, { ...pdf(), name: 'x\\evidence.pdf' }, { ...pdf(), name: 'bad\n.pdf' },
    { ...pdf(), name: 'evil.svg', type: 'image/svg+xml' }, { ...pdf(), name: 'evil.js', type: 'text/javascript' },
    { ...pdf(), type: 'image/png' }, { ...pdf(), data: Buffer.from('<html>bad</html>').toString('base64') },
    { ...pdf(), data: '%%%=' }, { ...pdf(), data: 'YQ=' }, { ...pdf(), data: '' },
    { ...pdf(), data: 'A'.repeat(13981020) },
  ];
  for (const attachment of attempts) { const response = await api.create('sales', { category: 'support', attachments: [attachment] }); assert.equal(response.status, 400, JSON.stringify(response.body)); }
  assert.equal((await api.create('sales', { category: 'support', attachments: Array.from({ length: 6 }, () => pdf()) })).status, 400);
  const oversized = Buffer.alloc(10485761, 65); oversized.write('%PDF-1.7\n');
  assert.equal((await api.create('sales', { category: 'support', attachments: [{ ...pdf(), data: oversized.toString('base64') }] })).status, 400);
  assert.equal(api.snapshot().tickets.length, 0); assert.equal(api.calls.some(call => call.transactional), false);
});

test('authenticated support uploads over one MiB download byte-for-byte only for owner and IT, as attachments', async t => {
  const api = await fixture(t);
  const bytes = Buffer.alloc(1200000, 65); bytes.write('%PDF-1.7\n');
  const response = await api.create('sales', { category: 'support', attachments: [{ name: 'evidence.pdf', type: 'application/pdf', data: bytes.toString('base64') }] });
  assert.equal(response.status, 201, JSON.stringify(response.body));
  const record = response.body.record, attachment = record.attachments[0];
  assert.equal(attachment.bytes, bytes.length); assert.equal(attachment.data, undefined);
  assert.equal(attachment.downloadUrl, `/api/sales/helpdesk/tickets/${record.id}/attachments/${attachment.id}`);
  for (const system of ['sales', 'itticket']) { const download = await api.call(system, `/tickets/${record.id}/attachments/${attachment.id}`); assert.equal(download.status, 200); assert.equal(createHash('sha256').update(download.body).digest('hex'), createHash('sha256').update(bytes).digest('hex')); assert.match(download.headers.get('content-disposition'), /^attachment;/); assert.equal(download.headers.get('x-content-type-options'), 'nosniff'); }
  assert.equal((await api.call('purchasing', `/tickets/${record.id}/attachments/${attachment.id}`)).status, 404);
  assert.equal((await api.call('sales', `/tickets/${record.id}/attachments/${attachment.id}`, { id: 2 })).status, 404);
  assert.equal((await api.call('sales', `/tickets/${record.id + 1}/attachments/${attachment.id}`)).status, 404);
});

test('request workflow requires Proceed before Complete, meaningful notes and current versions', async t => {
  const api = await fixture(t); const created = (await api.create()).body.record;
  for (const status of ['in-progress', 'complete']) assert.equal((await api.call('itticket', `/tickets/${created.id}/status`, { method: 'PATCH', body: { version: 1, status, note: 'Attempt' } })).status, 409);
  const ongoing = await api.call('itticket', `/tickets/${created.id}/status`, { method: 'PATCH', body: { version: 1, status: 'ongoing', note: '' }, id: 2 });
  assert.equal(ongoing.status, 200); assert.equal(ongoing.body.record.version, 2); assert.equal(ongoing.body.record.history[1].actorName, 'itticket 2');
  assert.equal((await api.call('itticket', `/tickets/${created.id}/status`, { method: 'PATCH', body: { version: 2, status: 'complete', note: ' ' } })).status, 400);
  const complete = await api.call('itticket', `/tickets/${created.id}/status`, { method: 'PATCH', body: { version: 2, status: 'complete', note: 'Returned and verbally confirmed by requester.' } });
  assert.equal(complete.status, 200); assert.equal(complete.body.record.history.length, 3);
  assert.equal((await api.call('itticket', `/tickets/${created.id}/status`, { method: 'PATCH', body: { version: 3, status: 'ongoing' } })).status, 409);
  assert.ok(complete.body.record.history.every(row => /Z$/.test(row.createdAt)));
});

test('support workflow and concurrent same-version status updates produce one immutable event', async t => {
  const api = await fixture(t); const created = (await api.create('sales', { category: 'support' })).body.record;
  assert.equal((await api.call('itticket', `/tickets/${created.id}/status`, { method: 'PATCH', body: { version: 1, status: 'in-progress', note: '' } })).status, 400);
  const outcomes = await Promise.all([
    api.call('itticket', `/tickets/${created.id}/status`, { method: 'PATCH', body: { version: 1, status: 'in-progress', note: 'Investigating the issue.' } }),
    api.call('itticket', `/tickets/${created.id}/status`, { method: 'PATCH', body: { version: 1, status: 'declined', note: 'Outside scope.' } }),
  ]);
  assert.deepEqual(outcomes.map(row => row.status).sort(), [200, 409]);
  const state = api.snapshot(); assert.equal(state.tickets[0].version, 2); assert.equal(state.history.length, 2); assert.equal(state.audits.length, 2);
  assert.equal((await api.call('sales', `/tickets/${created.id}`)).body.record.history.length, 2);
});

test('history note corrections append new events, retain original actor/time, and allow empty ongoing notes only', async t => {
  const api = await fixture(t); const created = (await api.create()).body.record;
  const ongoing = (await api.call('itticket', `/tickets/${created.id}/status`, { method: 'PATCH', body: { version: 1, status: 'ongoing', note: 'Initial note' } })).body.record;
  const original = structuredClone(ongoing.history[1]);
  const cleared = await api.call('itticket', `/tickets/${created.id}/history/${original.id}/note`, { method: 'PATCH', body: { version: 2, note: '' }, id: 2 });
  assert.equal(cleared.status, 200); assert.equal(cleared.body.record.version, 3);
  const displayed = cleared.body.record.history.find(row => row.id === original.id);
  assert.equal(displayed.note, 'Initial note'); assert.equal(displayed.displayNote, ''); assert.equal(displayed.createdAt, original.createdAt); assert.equal(displayed.actorName, original.actorName);
  assert.equal(cleared.body.record.history.at(-1).kind, 'note-edit'); assert.equal(cleared.body.record.history.at(-1).actorName, 'itticket 2');
  assert.equal((await api.call('itticket', `/tickets/${created.id}/history/${created.history[0].id}/note`, { method: 'PATCH', body: { version: 3, note: '' } })).status, 400);
  assert.equal((await api.call('sales', `/tickets/${created.id}/history/${original.id}/note`, { method: 'PATCH', body: { version: 3, note: 'Forged' } })).status, 403);
  assert.equal((await api.call('itticket', `/tickets/${created.id}/history/${original.id}/note`, { method: 'PATCH', body: { version: 2, note: 'Stale' } })).status, 409);
  assert.equal((await api.call('itticket', `/tickets/${created.id}/history/999/note`, { method: 'PATCH', body: { version: 3, note: 'Wrong ticket' } })).status, 404);
  assert.equal(api.snapshot().history.length, 3);
  assert.equal(api.calls.some(call => /UPDATE dbo.ITTicketHistory|DELETE FROM dbo.ITTicketHistory/.test(call.query)), false);
});

test('only committed ticket writes notify the owning user and IT team; replays and rollbacks emit nothing', async t => {
  const api = await fixture(t);
  const created = await api.create(); assert.equal(created.status, 201);
  assert.deepEqual(api.notifications.map(event => event.room).sort(), ['system:configuration', 'system:itticket', 'user:sales:1']);
  assert.ok(api.notifications.every(event => event.event === 'data:changed' && !('note' in event.payload) && !('ownerId' in event.payload)));
  api.notifications.length = 0;
  assert.equal((await api.create()).status, 200); assert.deepEqual(api.notifications, []);
  const status = await api.call('itticket', `/tickets/${created.body.record.id}/status`, { method: 'PATCH', body: { version: 1, status: 'ongoing', note: '' } });
  assert.equal(status.status, 200);
  assert.deepEqual(api.notifications.map(event => event.room).sort(), ['system:configuration', 'system:itticket', 'user:sales:1']);
  api.notifications.length = 0; api.faults.audit = true;
  assert.equal((await api.call('itticket', `/tickets/${created.body.record.id}/status`, { method: 'PATCH', body: { version: 2, status: 'complete', note: 'Completed' } })).status, 409);
  assert.deepEqual(api.notifications, []); assert.equal(api.snapshot().tickets[0].status, 'ongoing');
});
