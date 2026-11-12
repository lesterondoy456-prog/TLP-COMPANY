import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ApiError, validateCredentials, issueSession, requireUser, sessionCookie, expiredCookie } from '../components/auth.js';
import { buildDashboard, PERIODS } from '../data.js';

const backendDirectory = fileURLToPath(new URL('../', import.meta.url));
const frontendDirectory = path.resolve(backendDirectory, '../frontend/dist');
const mimeTypes = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers },
  });
}

async function readJson(request) {
  if (!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')) {
    throw new ApiError(415, 'Send the request as JSON.');
  }
  const text = await request.text();
  if (Buffer.byteLength(text) > 8192) throw new ApiError(413, 'This request is too large.');
  try {
    const input = JSON.parse(text);
    if (!input || Array.isArray(input) || typeof input !== 'object') throw new Error();
    return input;
  } catch {
    throw new ApiError(400, 'Enter valid login details.');
  }
}

export async function handleApi(request, env) {
  try {
    const url = new URL(request.url);
    const methods = {
      '/api/health': 'GET', '/api/auth/login': 'POST', '/api/auth/session': 'GET',
      '/api/auth/logout': 'POST', '/api/dashboard': 'GET',
    };
    const method = methods[url.pathname];
    if (!method) return json({ message: 'This endpoint was not found.' }, 404);
    if (request.method !== method) return json({ message: 'This request method is not supported.' }, 405, { Allow: method });
    if (method === 'POST') {
      const origin = request.headers.get('Origin');
      if (request.headers.get('Sec-Fetch-Site') === 'cross-site' || (origin && origin !== url.origin)) {
        throw new ApiError(403, 'Please open this request from your SalesPort workspace.');
      }
    }

    switch (url.pathname) {
      case '/api/health':
        return json({
          ok: true, service: 'SalesPort API', mode: 'demo',
          database: { status: env.checkDatabase ? await env.checkDatabase() : 'not_configured' },
        });
      case '/api/auth/login': {
        const input = await readJson(request);
        const user = validateCredentials(input, env);
        const { token, lifetime } = issueSession(env, input.remember === true);
        return json({ user }, 200, { 'Set-Cookie': sessionCookie(request, token, lifetime, input.remember === true) });
      }
      case '/api/auth/session':
        return json({ user: requireUser(request, env) });
      case '/api/auth/logout':
        return json({ success: true }, 200, { 'Set-Cookie': expiredCookie(request) });
      case '/api/dashboard': {
        requireUser(request, env);
        const period = url.searchParams.get('period') || '30d';
        if (!PERIODS.includes(period)) throw new ApiError(400, 'Choose a supported reporting period.');
        return json(buildDashboard(period));
      }
    }
  } catch (error) {
    return json({ message: error instanceof ApiError ? error.message : 'Something went wrong. Please try again.' },
      error instanceof ApiError ? error.status : 500);
  }
}

export function createApp(env, production = false) {
  return createServer(async (incoming, outgoing) => {
    try {
      const url = new URL(incoming.url, `http://${incoming.headers.host || 'localhost'}`);
      if (url.pathname.startsWith('/api/')) {
        if (Number(incoming.headers['content-length']) > 8192) {
          incoming.resume();
          outgoing.writeHead(413, { 'Content-Type': 'application/json' });
          outgoing.end(JSON.stringify({ message: 'This request is too large.' }));
          return;
        }
        const chunks = [];
        let size = 0;
        for await (const chunk of incoming) {
          size += chunk.length;
          if (size <= 8192) chunks.push(chunk);
        }
        if (size > 8192) {
          outgoing.writeHead(413, { 'Content-Type': 'application/json' });
          outgoing.end(JSON.stringify({ message: 'This request is too large.' }));
          return;
        }
        const request = new Request(url, {
          method: incoming.method, headers: incoming.headers,
          ...(!['GET', 'HEAD'].includes(incoming.method) && chunks.length ? { body: Buffer.concat(chunks) } : {}),
        });
        const response = await handleApi(request, env);
        outgoing.statusCode = response.status;
        response.headers.forEach((value, key) => outgoing.setHeader(key, value));
        outgoing.end(Buffer.from(await response.arrayBuffer()));
        return;
      }
      if (!production) {
        outgoing.writeHead(200, { 'Content-Type': 'application/json' });
        outgoing.end(JSON.stringify({ name: 'SalesPort API', frontend: 'http://127.0.0.1:5188' }));
        return;
      }
      if (!['GET', 'HEAD'].includes(incoming.method)) { outgoing.writeHead(405); outgoing.end(); return; }
      let filename = path.resolve(frontendDirectory, `.${decodeURIComponent(url.pathname)}`);
      if (filename !== frontendDirectory && !filename.startsWith(frontendDirectory + path.sep)) {
        outgoing.writeHead(403); outgoing.end(); return;
      }
      try { if (!(await stat(filename)).isFile()) filename = path.join(frontendDirectory, 'index.html'); }
      catch { filename = path.join(frontendDirectory, 'index.html'); }
      const content = await readFile(filename);
      outgoing.writeHead(200, {
        'Content-Type': mimeTypes[path.extname(filename)] || 'application/octet-stream',
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': filename.endsWith('index.html') ? 'no-cache' : 'public, max-age=31536000, immutable',
      });
      outgoing.end(incoming.method === 'HEAD' ? undefined : content);
    } catch {
      outgoing.writeHead(500, { 'Content-Type': 'application/json' });
      outgoing.end(JSON.stringify({ message: 'Unable to complete this request.' }));
    }
  });
}
