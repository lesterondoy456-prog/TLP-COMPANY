import { readFileSync } from 'node:fs';
import Module, { builtinModules, createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Load the actual CommonJS routes without evaluating db.js or its .env.
// All database access is replaced with a throwing stub or an in-memory adapter.
const backend = fileURLToPath(new URL('../../', import.meta.url));
const requireBackend = createRequire(path.join(backend, 'package.json'));
const systems = { sales: 'Sales', purchasing: 'Purchasing', warehouse: 'Warehouse', configuration: 'Configuration', login: 'LoginApiSystem' };
const modules = new Map();
const blocked = () => { throw new Error('Real database operations are forbidden in isolated tests.'); };
const sql = new Proxy({}, { get: (_target, type) => type === 'MAX' ? -1 : (...args) => ({ type, args }) });
const fakeDatabase = { db: blocked, request: blocked, sql, transaction: blocked, initializeDatabase: blocked, closeDatabase: blocked };

function compile(filename, database = fakeDatabase, cache = modules) {
  if (cache.has(filename)) return cache.get(filename).exports;
  const compiled = new Module(filename);
  compiled.filename = filename;
  compiled.paths = Module._nodeModulePaths(path.dirname(filename));
  compiled.require = specifier => {
    if (/^\.\.?\/db(?:\.js)?$/.test(specifier)) return database;
    if (/^\.\/Api\/LoginApiSystem(?:\.js)?$/.test(specifier)) return compile(path.join(backend, 'Api', 'LoginApiSystem.js'), database, cache);
    const api = specifier.match(/^\.\/Api\/(Sales|Purchasing|Warehouse|Configuration)Api(?:\.js)?$/);
    if (api) return compile(path.join(backend, 'Api', api[1] + 'Api.js'), database, cache);
    if (specifier === 'express' || specifier === 'socket.io' || specifier === 'exceljs' || specifier.startsWith('node:') || builtinModules.includes(specifier)) return requireBackend(specifier);
    throw new Error('Unexpected dependency in isolated API test: ' + specifier);
  };
  cache.set(filename, compiled);
  try {
    compiled._compile(readFileSync(filename, 'utf8'), filename);
    compiled.loaded = true;
    return compiled.exports;
  } catch (error) { cache.delete(filename); throw error; }
}

export function loadApi(system) {
  if (!Object.hasOwn(systems, system)) throw new Error('Unknown test system: ' + system);
  const router = compile(path.join(backend, 'Api', system === 'login' ? 'LoginApiSystem.js' : systems[system] + 'Api.js'));
  if (system === 'configuration') return {
    configurationMetadata() {
      let response;
      const handler = router.stack.find(layer => layer.route?.path === '/masters' && layer.route.methods.get).route.stack[0].handle;
      handler({}, { json(body) { response = body; } });
      return response.modules;
    },
  };
  return router;
}

export function loadServer() { return compile(path.join(backend, 'server.js')); }
export function loadServerWithDatabase(database) { return compile(path.join(backend, 'server.js'), database, new Map()); }

// Exercise the real route callbacks against a supplied in-memory SQL adapter.
export function loadRouterWithDatabase(system, database) {
  if (!Object.hasOwn(systems, system)) throw new Error('Unknown test system: ' + system);
  const filename = path.join(backend, 'Api', system === 'login' ? 'LoginApiSystem.js' : systems[system] + 'Api.js');
  const compiled = new Module(filename);
  compiled.filename = filename;
  compiled.paths = Module._nodeModulePaths(path.dirname(filename));
  compiled.require = specifier => {
    if (/^\.\.?\/db(?:\.js)?$/.test(specifier)) return database;
    if (specifier === 'express' || specifier === 'exceljs' || specifier.startsWith('node:') || builtinModules.includes(specifier)) return requireBackend(specifier);
    throw new Error('Unexpected dependency in route test: ' + specifier);
  };
  compiled._compile(readFileSync(filename, 'utf8'), filename);
  return compiled.exports;
}

export async function invokeRoute(router, method, path, req) {
  const route = router.stack.find(layer => layer.route?.path === path && layer.route.methods[method.toLowerCase()])?.route;
  if (!route) throw new Error('Missing route: ' + method + ' ' + path);
  const response = { statusCode: 200, locals: {}, headers: {}, status(code) { this.statusCode = code; return this; }, set(name, value) { this.headers[name] = value; return this; }, setHeader(name, value) { this.headers[name] = value; }, json(body) { this.body = body; return this; } };
  if (req.testUser) response.locals.user = req.testUser;
  await route.stack.find(layer => layer.method === method.toLowerCase()).handle(req, response);
  return response;
}
