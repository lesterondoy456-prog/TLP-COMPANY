import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';
import { checkOrigin } from '../Api/common.js';

const workspace = fileURLToPath(new URL('../../', import.meta.url));
const systems = { SalesSystem: 'sales', WarehouseSystem: 'warehouse', PurchasingSystem: 'purchasing', ConfigurationSystem: 'configuration' };

for (const [project, system] of Object.entries(systems)) {
  test(`${project} runs its actual Vite preview and preserves namespaced auth proxy headers and cookies`, { timeout: 30_000 }, async t => {
    // Only local static Vite and a fake HTTP API are started. Environment-file
    // loading is disabled; the production backend and SQL are never imported.
    const seen = [];
    const cookie = `tlp_${system}_session=mock-only-${system}; Path=/api/${system}; HttpOnly; SameSite=Strict`;
    const fakeApi = createServer(async (incoming, response) => {
      const chunks = [];
      for await (const chunk of incoming) chunks.push(chunk);
      const body = Buffer.concat(chunks).toString('utf8');
      const observed = { method: incoming.method, path: incoming.url, host: incoming.headers.host, origin: incoming.headers.origin, cookie: incoming.headers.cookie, contentType: incoming.headers['content-type'], body };
      seen.push(observed);
      const headers = new Headers();
      for (const [name, value] of Object.entries(incoming.headers)) if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(', ') : value);
      try {
        checkOrigin(new Request(`http://${incoming.headers.host}${incoming.url}`, { method: incoming.method, headers, ...(body ? { body } : {}) }));
      } catch (error) {
        response.writeHead(error.status, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ message: error.message }));
        return;
      }
      response.writeHead(200, { 'Content-Type': 'application/json', 'Set-Cookie': cookie });
      response.end(JSON.stringify(observed));
    });
    let vite;
    const previousTarget = process.env.API_PROXY_TARGET;
    t.after(async () => {
      await vite?.close();
      fakeApi.closeAllConnections();
      if (fakeApi.listening) await new Promise((resolve, reject) => fakeApi.close(error => error ? reject(error) : resolve()));
      if (previousTarget === undefined) delete process.env.API_PROXY_TARGET;
      else process.env.API_PROXY_TARGET = previousTarget;
    });
    fakeApi.listen(0, '127.0.0.1');
    await once(fakeApi, 'listening');
    process.env.API_PROXY_TARGET = `http://127.0.0.1:${fakeApi.address().port}`;
    const directory = path.join(workspace, project);
    const viteEntry = createRequire(path.join(directory, 'package.json')).resolve('vite');
    const { preview } = await import(pathToFileURL(viteEntry).href);
    vite = await preview({ root: directory, configFile: path.join(directory, 'vite.config.js'), envFile: false, logLevel: 'silent', preview: { host: '127.0.0.1', port: 0, strictPort: true, open: false } });
    const origin = `http://127.0.0.1:${vite.httpServer.address().port}`;
    assert.notEqual(origin, process.env.API_PROXY_TARGET);
    const entry = await fetch(origin);
    assert.equal(entry.status, 200);
    const html = await entry.text();
    assert.match(html, new RegExp('<title>[^<]*' + project.replace('System', ''), 'i'));
    const asset = html.match(/src=["'](\/assets\/[^"']+\.js)["']/)?.[1];
    assert.ok(asset, 'Each preview must serve its own built React entry.');
    const script = await fetch(origin + asset);
    assert.equal(script.status, 200);
    assert.match(script.headers.get('content-type'), /javascript/);

    const requestCookie = `tlp_${system}_session=mock-own-token; tlp_unrelated_session=mock-other-token`;
    const sessionPath = `/api/${system}/auth/session?probe=own-system`;
    const session = await fetch(origin + sessionPath, { headers: { Cookie: requestCookie } });
    assert.equal(session.status, 200);
    assert.deepEqual(session.headers.getSetCookie(), [cookie]);
    const sessionEcho = await session.json();
    assert.equal(sessionEcho.path, sessionPath);
    assert.equal(sessionEcho.host, new URL(origin).host);
    assert.equal(sessionEcho.cookie, requestCookie);

    const loginPath = `/api/${system}/auth/login`;
    const body = JSON.stringify({ username: 'mock-only-user', password: 'mock-only-password' });
    const login = await fetch(origin + loginPath, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin, 'Sec-Fetch-Site': 'same-origin', Cookie: requestCookie }, body });
    assert.equal(login.status, 200, 'Vite must preserve Host so the real same-origin policy accepts the request.');
    assert.deepEqual(login.headers.getSetCookie(), [cookie]);
    const loginEcho = await login.json();
    assert.deepEqual(loginEcho, { method: 'POST', path: loginPath, host: new URL(origin).host, origin, cookie: requestCookie, contentType: 'application/json', body });
    const rejected = await fetch(origin + loginPath, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'http://unrelated.example', 'Sec-Fetch-Site': 'cross-site' }, body });
    assert.equal(rejected.status, 403);
    assert.match((await rejected.json()).message, /workspace/);
    assert.equal(seen.length, 3);
    assert.ok(seen.every(request => request.path.startsWith(`/api/${system}/`)), 'Proxy must preserve the complete system namespace.');
  });
}
