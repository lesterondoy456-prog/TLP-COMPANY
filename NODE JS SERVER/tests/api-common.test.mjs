import { loadServer } from './helpers/load-api.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { once } from 'node:events';
const { MAX_BODY, checkOrigin, createApp } = loadServer();

function policyRequest(url, { method = 'GET', headers = {} } = {}) {
  const parsed = new URL(url);
  const values = new Headers(headers);
  return { method, protocol: parsed.protocol.slice(0, -1), get: name => name.toLowerCase() === 'host' ? parsed.host : values.get(name) };
}

test('each frontend port can send same-origin proxy writes while cross-origin writes are rejected', () => {
  for (const port of [5188, 5190, 5191, 5192]) {
    const origin = `http://127.0.0.1:${port}`;
    assert.doesNotThrow(() => checkOrigin(policyRequest(origin + '/api/mock', { method: 'POST', headers: { Origin: origin, 'Sec-Fetch-Site': 'same-origin' } })));
    assert.throws(() => checkOrigin(policyRequest(origin + '/api/mock', { method: 'POST', headers: { Origin: 'http://unrelated.example' } })), error => error.status === 403);
    assert.throws(() => checkOrigin(policyRequest(origin + '/api/mock', { method: 'POST', headers: { Origin: origin, 'Sec-Fetch-Site': 'cross-site' } })), error => error.status === 403);
  }
});

test('rewritten proxy hosts accept only configured frontend origins, including HTTP LAN without Fetch Metadata', () => {
  for (const host of ['localhost', '127.0.0.1', '192.168.1.5']) {
    for (const port of [5188, 5190, 5191, 5192]) {
      const origin = `http://${host}:${port}`;
      const request = headers => policyRequest('http://nodejs-server:5189/api/mock', { method: 'POST', headers: { Origin: origin, ...headers } });
      assert.doesNotThrow(() => checkOrigin(request(), [origin]));
      assert.doesNotThrow(() => checkOrigin(request({ 'Sec-Fetch-Site': 'same-origin' }), [origin]));
      assert.throws(() => checkOrigin(request()), error => error.status === 403);
      assert.throws(() => checkOrigin(request({ 'Sec-Fetch-Site': 'cross-site' }), [origin]), error => error.status === 403);
    }
  }
  const allowedOrigins = ['http://192.168.1.5:5188'];
  for (const origin of ['http://unrelated.example', 'http://192.168.1.5:5999', 'http://192.168.1.5:5188.unrelated.example', 'null']) {
    for (const site of [undefined, 'same-origin', 'same-site', 'none']) {
      const headers = { Origin: origin, ...(site ? { 'Sec-Fetch-Site': site } : {}) };
      assert.throws(() => checkOrigin(policyRequest('http://nodejs-server:5189/api/mock', { method: 'POST', headers }), allowedOrigins), error => error.status === 403);
    }
  }
});

test('invalid or non-HTTP origins cannot be enabled by allowlist configuration', () => {
  for (const origin of ['null', 'not-an-origin', 'data:text/plain,mock', 'file://', 'http://localhost:5188/', 'http://localhost:5188/path', 'http://user:password@localhost:5188']) {
    const request = policyRequest('http://nodejs-server:5189/api/mock', { method: 'POST', headers: { Origin: origin } });
    assert.throws(() => checkOrigin(request, [origin]), error => error.status === 403);
  }
  assert.doesNotThrow(() => checkOrigin(policyRequest('http://nodejs-server:5189/api/mock', { method: 'POST' })));
});

test('Express JSON parsing and per-system authentication reject invalid requests before any SQL operation', async t => {
  const server = createApp({ SESSION_SECRET: 'mock-only-test-secret-12345678901234567890' }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  for (const system of ['sales', 'purchasing', 'warehouse', 'configuration']) {
    const route = base + `/api/${system}/auth/login`;
    for (const body of ['[]', 'null', 'true', '{broken', '{}']) {
      const response = await fetch(route, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base }, body });
      assert.equal(response.status, 400, system + ' must validate JSON and credentials before querying SQL');
      assert.ok((await response.json()).message);
    }
    const badType = await fetch(route, { method: 'POST', headers: { Origin: base }, body: '{}' });
    assert.equal(badType.status, 415);
    const huge = await fetch(route, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base }, body: JSON.stringify({ text: 'x'.repeat(MAX_BODY) }) });
    assert.equal(huge.status, 413);
    const session = await fetch(base + `/api/${system}/auth/session`);
    assert.equal(session.status, 401);
    assert.equal(session.headers.get('cache-control'), 'no-store');
    assert.equal(session.headers.get('x-content-type-options'), 'nosniff');
    const hostile = await fetch(route, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'http://unrelated.example' }, body: '{}' });
    assert.equal(hostile.status, 403);
  }
  assert.equal((await fetch(base + '/api/purchasing/purchase-orders/1/post', { method: 'POST', headers: { Origin: base } })).status, 401, 'Bodyless posting routes must reach authentication');
  assert.equal((await fetch(base + '/api/auth/session')).status, 404);
});
