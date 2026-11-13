import { loadServer } from './helpers/load-api.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { chromium } from '@playwright/test';
const { MAX_BODY, checkOrigin, createApp } = loadServer();

function policyRequest({ method = 'GET', headers = {} } = {}) {
  const values = new Headers(headers);
  return { method, get: name => values.get(name) };
}

test('JSON writes work through rewritten proxy hosts without origin or port allowlists', () => {
  for (const host of ['localhost', '127.0.0.1', '192.168.1.5']) for (const port of [5189, 5190, 5191, 5192]) {
    const origin = `http://${host}:${port}`;
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      const headers = { Host: 'nodejs-server:5188', Origin: origin, 'Content-Type': 'application/json' };
      assert.doesNotThrow(() => checkOrigin(policyRequest({ method, headers })));
      assert.doesNotThrow(() => checkOrigin(policyRequest({ method, headers: { ...headers, 'Sec-Fetch-Site': 'same-origin' } })));
      assert.throws(() => checkOrigin(policyRequest({ method, headers: { ...headers, 'Sec-Fetch-Site': 'cross-site' } })), error => error.status === 403);
    }
  }
  assert.doesNotThrow(() => checkOrigin(policyRequest({ method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' } })));
});

test('every unsafe API method rejects form content types and absent JSON headers, including bodyless actions', () => {
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) for (const contentType of [undefined, 'application/x-www-form-urlencoded', 'multipart/form-data; boundary=mock', 'text/plain', 'application/jsonx', 'application/json, text/plain']) {
    const headers = contentType ? { 'Content-Type': contentType } : {};
    assert.throws(() => checkOrigin(policyRequest({ method, headers })), error => error.status === 415);
  }
  for (const method of ['GET', 'HEAD', 'OPTIONS']) assert.doesNotThrow(() => checkOrigin(policyRequest({ method })));
});

test('malformed and opaque Origin values remain rejected without a frontend allowlist', () => {
  for (const origin of ['null', 'not-an-origin', 'data:text/plain,mock', 'file://', 'http://localhost:5189/', 'http://localhost:5189/path', 'http://user:password@localhost:5189']) {
    assert.throws(() => checkOrigin(policyRequest({ method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' } })), error => error.status === 403);
  }
});

test('all four actual HTTP wrappers send JSON for mutations, including empty post/cancel/logout/delete actions', async t => {
  const calls = [];
  const mocked = t.mock.method(globalThis, 'fetch', async (path, options) => {
    calls.push({ path, ...options });
    const system = path.split('/')[2];
    return new Response(JSON.stringify(path.endsWith('/auth/session') || path.endsWith('/auth/login') ? { user: { system } } : { success: true }), { headers: { 'Content-Type': 'application/json' } });
  });
  try {
    for (const [project, system] of [['SalesSystem', 'sales'], ['PurchasingSystem', 'purchasing'], ['WarehouseSystem', 'warehouse'], ['ConfigurationSystem', 'configuration']]) {
      const { api } = await import(new URL(`../../${project}/src/api.js`, import.meta.url));
      for (const path of [`/api/${system}/auth/logout`, `/api/${system}/documents/1/post`, `/api/${system}/documents/1/cancel`]) {
        await api(path, { method: 'POST', headers: { 'content-type': 'text/plain', 'X-Mock': 'preserved' } });
        const call = calls.at(-1);
        assert.equal(call.path, path);
        assert.equal(call.method, 'POST');
        assert.equal(call.headers.get('Content-Type'), 'application/json');
        assert.equal(call.headers.get('X-Mock'), 'preserved');
        assert.equal(call.body, '{}');
        assert.equal(call.credentials, 'same-origin');
      }
      for (const method of ['PUT', 'PATCH', 'DELETE']) {
        await api(`/api/${system}/mock/1`, { method, body: { note: 'mock-only' } });
        assert.equal(calls.at(-1).body, '{"note":"mock-only"}');
        assert.equal(calls.at(-1).headers.get('Content-Type'), 'application/json');
      }
      await api(`/api/${system}/auth/session`);
      assert.equal(calls.at(-1).method, 'GET');
      assert.equal(calls.at(-1).body, undefined);
      assert.equal(calls.at(-1).headers.get('Content-Type'), null);
    }
  } finally { mocked.mock.restore(); }
});

test('Express JSON parsing and per-system authentication reject invalid requests before SQL', async t => {
  const server = createApp({ SESSION_SECRET: 'mock-only-test-secret-12345678901234567890' }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  for (const system of ['sales', 'purchasing', 'warehouse', 'configuration']) {
    const route = base + `/api/${system}/auth/login`;
    for (const body of ['[]', 'null', 'true', '{broken', '{}']) {
      const response = await fetch(route, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base }, body });
      assert.equal(response.status, 400);
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
    const hostile = await fetch(route, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'http://unrelated.example', 'Sec-Fetch-Site': 'cross-site' }, body: '{}' });
    assert.equal(hostile.status, 403);
    const formLogout = await fetch(base + `/api/${system}/auth/logout`, { method: 'POST', body: '' });
    assert.equal(formLogout.status, 415);
    const jsonLogout = await fetch(base + `/api/${system}/auth/logout`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(jsonLogout.status, 200);
    assert.ok(jsonLogout.headers.get('Set-Cookie').includes(`Path=/api/${system}`));
  }
  const action = base + '/api/purchasing/purchase-orders/1/post';
  assert.equal((await fetch(action, { method: 'POST' })).status, 415);
  assert.equal((await fetch(action, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 401);
  const preflight = await fetch(base + '/api/sales/auth/login', { method: 'OPTIONS', headers: { Origin: 'http://unrelated.example', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' } });
  assert.equal(preflight.headers.get('Access-Control-Allow-Origin'), null);
  assert.equal(preflight.headers.get('Access-Control-Allow-Headers'), null);
  assert.equal((await fetch(base + '/api/auth/session')).status, 404);
});

test('a hostile browser origin cannot forge form writes or pass a JSON preflight to a fake API', { timeout: 30_000 }, async t => {
  const accepted = [];
  const observed = [];
  const api = createServer(async (request, response) => {
    observed.push({ method: request.method, path: request.url, cookie: request.headers.cookie, type: request.headers['content-type'] });
    if (request.method === 'GET') { response.writeHead(200, { 'Content-Type': 'text/html' }); response.end('<!doctype html><title>Mock API client</title>'); return; }
    try { checkOrigin({ method: request.method, get: name => request.headers[name.toLowerCase()] }); }
    catch (error) { request.resume(); response.writeHead(error.status); response.end(error.message); return; }
    if (request.method !== 'OPTIONS') accepted.push({ method: request.method, path: request.url });
    request.resume();
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end('{}');
  });
  const hostile = createServer((_request, response) => { response.writeHead(200, { 'Content-Type': 'text/html' }); response.end('<!doctype html><title>Mock hostile origin</title>'); });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  t.after(async () => {
    await browser.close();
    await Promise.all([api, hostile].map(server => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); })));
  });
  api.listen(0, '127.0.0.1'); hostile.listen(0, '127.0.0.1');
  await Promise.all([once(api, 'listening'), once(hostile, 'listening')]);
  const target = `http://127.0.0.1:${api.address().port}`;
  const attackOrigin = `http://127.0.0.1:${hostile.address().port}`;
  const context = await browser.newContext();
  await context.addCookies([{ name: 'mock_session', value: 'not-a-real-token', url: target + '/api/', httpOnly: true, sameSite: 'Lax' }]);
  const page = await context.newPage();
  await page.goto(target);
  assert.equal(await page.evaluate(async () => (await fetch('/api/probe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status), 200);
  assert.equal(accepted.length, 1);
  await page.goto(attackOrigin);
  for (const [index, contentType] of ['application/x-www-form-urlencoded', 'text/plain', 'multipart/form-data'].entries()) {
    const destination = target + '/api/sales/auth/logout?mock-form=' + index;
    const response = page.waitForResponse(response => response.url() === destination);
    await page.evaluate(({ destination, contentType, index }) => {
      const frame = document.createElement('iframe'); frame.name = 'mock-frame-' + index; document.body.append(frame);
      const form = document.createElement('form'); form.action = destination; form.method = 'POST'; form.enctype = contentType; form.target = frame.name;
      const field = document.createElement('input'); field.name = 'payload'; field.value = '{}'; form.append(field); document.body.append(form); form.submit();
    }, { destination, contentType, index });
    assert.equal((await response).status(), 415);
  }
  const result = await page.evaluate(async destination => {
    try { await fetch(destination, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: '{}' }); return 'unexpected success'; }
    catch (error) { return error.name; }
  }, target + '/api/probe?mock-preflight');
  assert.equal(result, 'TypeError');
  assert.ok(observed.some(request => request.method === 'OPTIONS' && request.path.includes('mock-preflight')));
  assert.equal(observed.some(request => request.method === 'POST' && request.path.includes('mock-preflight')), false);
  assert.ok(observed.filter(request => request.path.includes('mock-form')).every(request => request.cookie?.includes('mock_session=')), 'Same-site cookies were present; the JSON policy itself must block the forged forms.');
  assert.equal(accepted.length, 1, 'Only the legitimate same-origin JSON write reached the mock action.');
});
