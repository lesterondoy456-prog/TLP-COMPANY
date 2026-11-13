import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { mkdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

// Static assets and in-memory routes only: no environment, backend, or SQL imports.
const dist = fileURLToPath(new URL('../../../SalesSystem/dist/', import.meta.url));
const screenshots = new URL('../../.qa/screenshots/', import.meta.url);
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };

export async function mockBrowser(t, onApi, { screenshotName, viewport = { width: 1440, height: 1100 } } = {}) {
  await stat(path.join(dist, 'index.html'));
  const escapedApiRequests = [];
  const unexpectedRequests = [];
  const apiRequests = [];
  const pageErrors = [];
  let browser;
  let page;
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
  const screenshot = async name => page.screenshot({ path: fileURLToPath(new URL(name, screenshots)), fullPage: true });
  t.after(async () => {
    if (screenshotName && page && !page.isClosed()) await screenshot(screenshotName).catch(() => {});
    await browser?.close();
    server.closeAllConnections();
    if (server.listening) await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport, locale: 'en-PH', timezoneId: 'Asia/Manila', serviceWorkers: 'block' });
  await context.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === 'GET' && url.hostname === 'fonts.googleapis.com') { await route.fulfill({ contentType: 'text/css', body: '' }); return; }
    if (url.origin !== origin) {
      unexpectedRequests.push({ method: request.method(), url: request.url() });
      await route.abort('blockedbyclient'); return;
    }
    if (!url.pathname.startsWith('/api/')) {
      if (['GET', 'HEAD'].includes(request.method())) await route.continue();
      else { unexpectedRequests.push({ method: request.method(), url: request.url() }); await route.abort('blockedbyclient'); }
      return;
    }
    const call = { method: request.method(), pathname: url.pathname, search: url.search, body: request.postData() ? request.postDataJSON() : undefined };
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
    page, origin, apiRequests, screenshot,
    assertSafe() {
      assert.deepEqual(escapedApiRequests, [], 'No API request may reach the static-only HTTP server.');
      assert.deepEqual(unexpectedRequests, [], 'No external calls or unrelated API mutations are allowed.');
      assert.deepEqual(pageErrors, [], 'No uncaught browser errors are allowed.');
    },
  };
}
