import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

// Static assets and in-memory routes only: no environment, backend, or SQL imports.
const workspace = fileURLToPath(new URL('../../../', import.meta.url));
const projects = new Set(['SalesSystem', 'PurchasingSystem', 'WarehouseSystem', 'ConfigurationSystem', 'ITTicketSystem']);
const systemNames = { SalesSystem: 'sales', PurchasingSystem: 'purchasing', WarehouseSystem: 'warehouse', ConfigurationSystem: 'configuration', ITTicketSystem: 'itticket' };
const screenshots = new URL('../../.qa/screenshots/', import.meta.url);
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };

export async function mockBrowser(t, onApi, { project = 'SalesSystem', dist: customDist, screenshotName, realtime = false, viewport = { width: 1440, height: 1100 } } = {}) {
  const escapedApiRequests = [];
  const unexpectedRequests = [];
  const apiRequests = [];
  const pageErrors = [];
  let browser;
  let page;
  const servers = [];
  const sockets = new Map();
  const tickets = new Map();
  const origins = new Map();
  async function projectOrigin(name, overrideDist) {
    if (!projects.has(name)) throw new Error('Unknown independent test project: ' + name);
    if (origins.has(name)) return origins.get(name);
    const dist = overrideDist ? path.resolve(overrideDist) : path.join(workspace, name, 'dist');
    await stat(path.join(dist, 'index.html'));
    const server = createServer(async (request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    if (url.pathname.startsWith('/api/')) {
      escapedApiRequests.push({ method: request.method, pathname: url.pathname });
      response.writeHead(503, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ message: 'Static test server: no API or database.' }));
      return;
    }
    if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405); response.end(); return; }
    try {
      let filename = path.resolve(dist, `.${decodeURIComponent(url.pathname)}`);
      if (filename !== path.resolve(dist) && !filename.startsWith(path.resolve(dist) + path.sep)) { response.writeHead(403); response.end(); return; }
      try { if (!(await stat(filename)).isFile()) filename = path.join(dist, 'index.html'); }
      catch { filename = path.join(dist, 'index.html'); }
      const data = await readFile(filename);
      response.writeHead(200, { 'Content-Type': mime[path.extname(filename)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      response.end(request.method === 'HEAD' ? undefined : data);
    } catch { response.writeHead(500); response.end(); }
    });
    if (realtime) {
      const { Server } = await import('socket.io');
      const io = new Server(server, { serveClient: false });
      io.use((socket, next) => {
        const ticket = socket.handshake.auth?.ticket;
        const system = tickets.get(ticket);
        tickets.delete(ticket);
        next(system === systemNames[name] ? undefined : new Error('Invalid mock realtime ticket.'));
      });
      sockets.set(name, io);
    }
    servers.push(server);
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const origin = `http://127.0.0.1:${server.address().port}`;
    origins.set(name, origin);
    return origin;
  }
  const screenshot = async name => page.screenshot({ path: fileURLToPath(new URL(name, screenshots)), fullPage: true });
  t.after(async () => {
    if (screenshotName && page && !page.isClosed()) await screenshot(screenshotName).catch(() => {});
    await browser?.close();
    await Promise.all([...sockets.values()].map(io => new Promise(resolve => io.close(resolve))));
    await Promise.all(servers.map(async server => {
      server.closeAllConnections();
      if (server.listening) await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }));
  });
  const origin = await projectOrigin(project, customDist);
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport, locale: 'en-PH', timezoneId: 'Asia/Manila', serviceWorkers: 'block' });
  await context.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === 'GET' && url.hostname === 'fonts.googleapis.com') { await route.fulfill({ contentType: 'text/css', body: '' }); return; }
    const currentProject = [...origins].find(([, candidate]) => candidate === url.origin)?.[0];
    if (!currentProject) {
      unexpectedRequests.push({ method: request.method(), url: request.url() });
      await route.abort('blockedbyclient'); return;
    }
    if (realtime && url.pathname.startsWith('/socket.io/')) { await route.continue(); return; }
    if (!url.pathname.startsWith('/api/')) {
      if (['GET', 'HEAD'].includes(request.method())) await route.continue();
      else { unexpectedRequests.push({ method: request.method(), url: request.url() }); await route.abort('blockedbyclient'); }
      return;
    }
    const system = systemNames[currentProject];
    const prefix = `/api/${system}`;
    if (!url.pathname.startsWith(prefix + '/')) {
      unexpectedRequests.push({ method: request.method(), url: request.url(), expectedNamespace: prefix });
      await route.fulfill({ status: 500, json: { message: 'This app must use its own API namespace.' } });
      return;
    }
    // Existing business stubs use a system-local logical path. Preserve and
    // assert the actual namespace separately so no cross-system call is hidden.
    let pathname = '/api' + url.pathname.slice(prefix.length);
    if (system === 'configuration') pathname = pathname.replace(/^\/api\/masters(?=\/|$)/, '/api/configuration');
    if (request.method() === 'GET' && pathname === '/api/realtime-ticket') {
      if (!realtime) { await route.fulfill({ status: 503, json: { message: 'Realtime is disabled in this isolated workflow test.' } }); return; }
      const ticket = randomBytes(32).toString('hex');
      tickets.set(ticket, system);
      await route.fulfill({ json: { ticket, expiresAt: Date.now() + 30000 } });
      return;
    }
    const call = { project: currentProject, system, origin: url.origin, method: request.method(), pathname, requestPathname: url.pathname, search: url.search, body: request.postData() ? request.postDataJSON() : undefined };
    apiRequests.push(call);
    const result = await onApi(call);
    if (result) { await route.fulfill(result); return; }
    unexpectedRequests.push({ method: call.method, url: request.url() });
    await route.fulfill({ status: 500, json: { message: 'Unexpected API call in mocked browser test.' } });
  });
  page = await context.newPage();
  page.setDefaultTimeout(10_000);
  page.on('pageerror', error => pageErrors.push(error.message));
  await mkdir(screenshots, { recursive: true });
  return {
    page, origin, apiRequests, screenshot, projectOrigin,
    realtimeClients(name = project) { return sockets.get(name)?.sockets.sockets.size || 0; },
    emitChange(name, resources = ['*']) { sockets.get(name)?.emit('data:changed', { system: systemNames[name], resources, changedAt: new Date().toISOString() }); },
    disconnectRealtime(name = project) { sockets.get(name)?.disconnectSockets(true); },
    async gotoProject(name) { const destination = await projectOrigin(name); await page.goto(destination); return destination; },
    assertSafe() {
      assert.deepEqual(escapedApiRequests, [], 'No API request may reach the static-only HTTP server.');
      assert.deepEqual(unexpectedRequests, [], 'No external calls or unrelated API mutations are allowed.');
      assert.deepEqual(pageErrors, [], 'No uncaught browser errors are allowed.');
    },
  };
}
