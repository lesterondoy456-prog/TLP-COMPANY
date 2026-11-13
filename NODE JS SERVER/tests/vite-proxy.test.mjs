import { loadServer } from './helpers/load-api.mjs';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import { createServer, request as httpRequest } from 'node:http';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';
const { checkOrigin } = loadServer();

const workspace = fileURLToPath(new URL('../../', import.meta.url));
const systems = { SalesSystem: 'sales', WarehouseSystem: 'warehouse', PurchasingSystem: 'purchasing', ConfigurationSystem: 'configuration' };

for (const [project, system] of Object.entries(systems)) {
  test(`${project} Vite preview forwards API, Uploads and socket.io with rewritten Host and preserved origins and cookies`, { timeout: 30_000 }, async t => {
    // Only local Vite and a fake HTTP API are started. The imported server
    // exposes its origin policy without starting the API or connecting SQL.
    const seen = [];
    const upgrades = [];
    const upgradeSockets = new Set();
    let origin;
    const cookie = `tti_${system}_session=mock-only-${system}; Path=/api/${system}; HttpOnly; SameSite=Strict`;
    const fakeApi = createServer(async (incoming, response) => {
      const chunks = [];
      for await (const chunk of incoming) chunks.push(chunk);
      const body = Buffer.concat(chunks).toString('utf8');
      const observed = { method: incoming.method, path: incoming.url, host: incoming.headers.host, origin: incoming.headers.origin, fetchSite: incoming.headers['sec-fetch-site'], cookie: incoming.headers.cookie, contentType: incoming.headers['content-type'], body };
      seen.push(observed);
      const headers = new Headers();
      for (const [name, value] of Object.entries(incoming.headers)) if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(', ') : value);
      try {
        checkOrigin({ method: incoming.method, protocol: 'http', get: name => headers.get(name) });
      } catch (error) {
        response.writeHead(error.status, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ message: error.message }));
        return;
      }
      response.writeHead(200, { 'Content-Type': 'application/json', 'Set-Cookie': cookie });
      response.end(JSON.stringify(observed));
    });
    fakeApi.on('upgrade', (incoming, socket) => {
      upgradeSockets.add(socket);
      socket.on('error', () => {});
      socket.on('close', () => upgradeSockets.delete(socket));
      upgrades.push({ path: incoming.url, host: incoming.headers.host, origin: incoming.headers.origin, cookie: incoming.headers.cookie });
      const accept = createHash('sha1').update(incoming.headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
      socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
    });
    let vite;
    const previousTarget = process.env.API_PROXY_TARGET;
    t.after(async () => {
      for (const socket of upgradeSockets) socket.destroy();
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
    origin = `http://127.0.0.1:${vite.httpServer.address().port}`;
    const targetHost = new URL(process.env.API_PROXY_TARGET).host;
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

    const requestCookie = `tti_${system}_session=mock-own-token; tti_unrelated_session=mock-other-token`;
    const sessionPath = `/api/${system}/auth/session?probe=own-system`;
    const session = await fetch(origin + sessionPath, { headers: { Cookie: requestCookie } });
    assert.equal(session.status, 200);
    assert.deepEqual(session.headers.getSetCookie(), [cookie]);
    const sessionEcho = await session.json();
    assert.equal(sessionEcho.path, sessionPath);
    assert.equal(sessionEcho.host, targetHost, 'changeOrigin must rewrite Host to the configured API target.');
    assert.equal(sessionEcho.cookie, requestCookie);

    const loginPath = `/api/${system}/auth/login`;
    const body = JSON.stringify({ username: 'mock-only-user', password: 'mock-only-password' });
    const login = await fetch(origin + loginPath, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin, 'Sec-Fetch-Site': 'same-origin', Cookie: requestCookie }, body });
    assert.equal(login.status, 200, 'JSON writes must work through Host rewriting without a configured frontend origin.');
    assert.deepEqual(login.headers.getSetCookie(), [cookie]);
    const loginEcho = await login.json();
    assert.deepEqual(loginEcho, { method: 'POST', path: loginPath, host: targetHost, origin, fetchSite: 'same-origin', cookie: requestCookie, contentType: 'application/json', body });
    // Plain HTTP LAN browsers omit Fetch Metadata. JSON requests must still
    // work without comparing the frontend Origin with the rewritten Host.
    const lanLogin = await fetch(origin + loginPath, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin, Cookie: requestCookie }, body });
    assert.equal(lanLogin.status, 200);
    const lanEcho = await lanLogin.json();
    assert.equal(lanEcho.origin, origin);
    assert.equal(lanEcho.host, targetHost);
    assert.equal(Object.hasOwn(lanEcho, 'fetchSite'), false);
    const unrelated = await fetch(origin + loginPath, { method: 'POST', headers: { 'Content-Type': 'text/plain', Origin: 'http://unrelated.example' }, body });
    assert.equal(unrelated.status, 415);
    await unrelated.json();
    const rejected = await fetch(origin + loginPath, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'http://unrelated.example', 'Sec-Fetch-Site': 'cross-site' }, body });
    assert.equal(rejected.status, 403);
    assert.match((await rejected.json()).message, /workspace/);
    const uploadsPath = '/Uploads/mock-only.png?probe=forwarding';
    const upload = await fetch(origin + uploadsPath);
    assert.equal(upload.status, 200);
    assert.deepEqual(await upload.json(), { method: 'GET', path: uploadsPath, host: targetHost, body: '' });
    const pollingPath = '/socket.io/?EIO=4&transport=polling&probe=mock-only';
    const polling = await fetch(origin + pollingPath, { headers: { Origin: origin, Cookie: requestCookie } });
    assert.equal(polling.status, 200);
    assert.deepEqual(await polling.json(), { method: 'GET', path: pollingPath, host: targetHost, origin, cookie: requestCookie, body: '' });
    const socketPath = '/socket.io/?EIO=4&transport=websocket&probe=mock-only';
    const socketKey = Buffer.alloc(16, 1).toString('base64');
    const handshake = await new Promise((resolve, reject) => {
      const request = httpRequest(origin + socketPath, { headers: { Connection: 'Upgrade', Upgrade: 'websocket', 'Sec-WebSocket-Version': '13', 'Sec-WebSocket-Key': socketKey, Origin: origin, Cookie: requestCookie } });
      request.once('upgrade', (response, socket) => {
        request.setTimeout(0);
        socket.destroy();
        resolve({ status: response.statusCode, accept: response.headers['sec-websocket-accept'] });
      });
      request.once('response', response => { response.resume(); reject(new Error('Expected a WebSocket upgrade, received HTTP ' + response.statusCode)); });
      request.once('error', reject);
      request.setTimeout(5_000, () => request.destroy(new Error('Mock WebSocket handshake timed out.')));
      request.end();
    });
    assert.deepEqual(handshake, { status: 101, accept: createHash('sha1').update(socketKey + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64') });
    assert.deepEqual(upgrades, [{ path: socketPath, host: targetHost, origin, cookie: requestCookie }]);
    assert.equal(seen.length, 7);
    assert.ok(seen.filter(request => request.path.startsWith('/api/')).every(request => request.path.startsWith(`/api/${system}/`)), 'Proxy must preserve the complete system namespace.');
  });
}
