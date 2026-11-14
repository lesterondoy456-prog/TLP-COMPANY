import assert from 'node:assert/strict';
import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const workspace = fileURLToPath(new URL('../../', import.meta.url));
const backend = path.join(workspace, 'NODE JS SERVER');
const systems = { SalesSystem: 5189, WarehouseSystem: 5190, PurchasingSystem: 5191, ConfigurationSystem: 5192 };
const sidebarPages = {
  SalesSystem: ['Customer', 'Product', 'SalesOrder', 'Invoice', 'DeliveryReceipt', 'ShippingInvoice', 'SalesUserLogin'],
  PurchasingSystem: ['PRMonitoring', 'POMonitoring', 'Supplier', 'Supplies', 'ReceivingReceipt', 'PurchasingUserLogin'],
  WarehouseSystem: ['SuppliesStock', 'WarehouseUserLogin'],
  ConfigurationSystem: ['ATC', 'AuditTrail', 'Bank', 'Country', 'Currency', 'CustomerCategory', 'PaymentTerm', 'ProductCategory', 'SuppliesCategory', 'UnitOfProduct', 'VAT', 'Warehouse', 'WarehouseLocation', 'ConfigurationUserLogin'],
};
const { parse } = createRequire(path.join(workspace, 'SalesSystem', 'package.json'))('@babel/parser');

function assertRouteCallbacksOnly(source, filename) {
  const pending = [{ node: parse(source, { sourceType: 'script' }), parent: null }];
  while (pending.length) {
    const { node, parent } = pending.pop();
    assert.ok(!['FunctionDeclaration', 'ClassDeclaration', 'ClassExpression', 'ObjectMethod'].includes(node.type), filename + ' must not declare helper functions or classes.');
    if (['ArrowFunctionExpression', 'FunctionExpression'].includes(node.type)) {
      assert.ok(['CallExpression', 'OptionalCallExpression'].includes(parent?.type) && parent.arguments.includes(node), filename + ' permits inline callbacks only; no function variables, object helpers or IIFEs.');
    }
    if (node.type === 'CallExpression' && node.callee.type === 'MemberExpression' && node.callee.object.name === 'sql' && ['VarChar', 'NVarChar'].includes(node.callee.property.name)) {
      const size = node.arguments[0];
      assert.ok(size?.type === 'MemberExpression' && size.object.name === 'sql' && size.property.name === 'MAX', filename + ' SQL text bindings must use sql.MAX.');
    }
    if (filename !== 'LoginApiSystem' && node.type === 'VariableDeclarator' && node.id.type === 'Identifier') assert.doesNotMatch(node.id.name, /^(?:CUSTOMER_TEXT_LENGTHS|PRODUCT_TEXT_LENGTHS|SUPPLIER_TEXT|SUPPLIES_TEXT|textLengths|textLimits)$/i, 'Form text-length maps belong in frontend validation.');
    if (['ConfigurationApi', 'SalesApi', 'PurchasingApi'].includes(filename) && node.type === 'CallExpression' && node.callee.type === 'MemberExpression' && node.callee.property.name === 'query') {
      const sql = node.arguments[0];
      assert.ok(sql?.type === 'StringLiteral' || sql?.type === 'TemplateLiteral' && sql.expressions.length === 0, filename + ' endpoint queries must contain complete SQL literals directly.');
    }
    for (const [key, value] of Object.entries(node)) {
      if (['loc', 'leadingComments', 'trailingComments', 'innerComments', 'comments', 'tokens'].includes(key)) continue;
      for (const child of Array.isArray(value) ? value : [value]) if (child && typeof child === 'object' && typeof child.type === 'string') pending.push({ node: child, parent: node });
    }
  }
}

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.map(entry => entry.isDirectory()
    ? sourceFiles(path.join(directory, entry.name))
    : /\.(?:[cm]?js|jsx|tsx?|css)$/.test(entry.name) ? [path.join(directory, entry.name)] : []))).flat();
}

for (const [project, port] of Object.entries(systems)) {
  test(`${project} owns its React package, entry, build, port ${port}, and source imports`, async () => {
    const directory = path.join(workspace, project);
    const packageJson = JSON.parse(await readFile(path.join(directory, 'package.json'), 'utf8'));
    assert.ok(packageJson.dependencies?.react && packageJson.dependencies?.['react-dom']);
    assert.ok(packageJson.devDependencies?.vite);
    assert.ok(packageJson.devDependencies?.['@vitejs/plugin-react']);
    assert.match(packageJson.scripts?.build || '', /\bvite\s+build\b/);
    assert.match(packageJson.scripts?.start || '', /^vite\s+preview\b/);
    assert.doesNotMatch(packageJson.scripts?.start || '', /NODE JS SERVER|(?:Sales|Purchasing|Warehouse|Configuration)System/);
    const lock = JSON.parse(await readFile(path.join(directory, 'package-lock.json'), 'utf8'));
    assert.equal(lock.name, packageJson.name);
    const html = await readFile(path.join(directory, 'index.html'), 'utf8');
    assert.match(html, /<script\b[^>]*type=["']module["'][^>]*src=["']\/src\/main\.jsx["']/);
    await access(path.join(directory, 'src', 'main.jsx'));
    await access(path.join(directory, 'src', 'App.jsx'));
    await access(path.join(directory, 'src', 'helper', 'validation.js'));
    for (const page of sidebarPages[project]) await access(path.join(directory, 'src', 'pages', page, page + '.jsx'));
    const apiWrapper = await readFile(path.join(directory, 'src', 'api.js'), 'utf8');
    assert.match(apiWrapper, /\bfetch\(path\s*,/);
    assert.doesNotMatch(apiWrapper, /\bAPI_BASE\b/);
    const config = await readFile(path.join(directory, 'vite.config.js'), 'utf8');
    const cliPort = script => Number(script?.match(/--port(?:=|\s+)(\d+)/)?.[1]) || undefined;
    const serverOptions = config.match(/\bserver\s*:\s*\{([\s\S]*?)\bproxy\s*:/)?.[1] || '';
    const previewOptions = config.match(/\bpreview\s*:\s*\{([^}]*)\}/)?.[1] || '';
    const configuredPort = options => Number(options.match(/\bport\s*:\s*(\d+)/)?.[1]) || undefined;
    assert.equal(cliPort(packageJson.scripts?.dev) || configuredPort(serverOptions) || 5173, port, 'Local development must retain its own project port.');
    assert.equal(cliPort(packageJson.scripts?.start) || configuredPort(previewOptions) || 4173, port, 'The actual npm start preview port must match Docker and Compose.');
    assert.match(config, /import\s+react\s+from\s+['"]@vitejs\/plugin-react['"]/);
    assert.match(config, /plugins\s*:\s*\[\s*react\(\)\s*\]/);
    assert.match(config, /process\.env\.API_PROXY_TARGET\s*\|\|\s*['"]http:\/\/localhost:5188['"]/);
    assert.match(config, /server\s*:\s*\{[\s\S]*?proxy\s*:\s*\{/);
    for (const route of ['/api', '/Uploads', '/socket.io']) {
      const escaped = route.replaceAll('.', '\\.');
      assert.match(config, new RegExp('["\']' + escaped + '["\']\\s*:\\s*\\{[^}]*\\bchangeOrigin\\s*:\\s*true'));
    }
    assert.match(config, /['"]\/socket\.io['"]\s*:\s*\{[^}]*\bws\s*:\s*true/);
    assert.doesNotMatch(config, /changeOrigin\s*:\s*false/);
    const files = [...await sourceFiles(path.join(directory, 'src')), path.join(directory, 'vite.config.js')];
    for (const filename of files) {
      assert.doesNotMatch(path.basename(filename), /workspace/i, 'Each sidebar module must own a named page.');
      const source = await readFile(filename, 'utf8');
      const imports = [...source.matchAll(/(?:\b(?:import|export)\s+(?:[^'";]*?\s+from\s*)?|\bimport\s*\()\s*['"]([^'"]+)['"]/g)];
      for (const [, specifier] of imports) {
        if (!specifier.startsWith('.')) continue;
        assert.doesNotMatch(specifier, /Workspace/);
        const resolved = path.resolve(path.dirname(filename), specifier.split('?')[0]);
        assert.ok(resolved.startsWith(directory + path.sep), `${project} must not import source from another frontend: ${path.relative(directory, filename)} → ${specifier}`);
      }
      if (/\.[cm]?jsx?$/.test(filename)) {
        const pending = [parse(source, { sourceType: 'module', plugins: ['jsx'] })];
        while (pending.length) {
          const node = pending.pop();
          if (node.type === 'JSXOpeningElement' && node.name.type === 'JSXIdentifier' && node.name.name === 'form') assert.ok(filename.startsWith(path.join(directory, 'src', 'pages') + path.sep), 'Form markup must live inside src/pages: ' + filename);
          if (node.type === 'CallExpression' && node.callee.type === 'Identifier' && node.callee.name === 'api') {
            let first = node.arguments[0];
            while (first?.type === 'BinaryExpression' && first.operator === '+') first = first.left;
            const prefix = first?.type === 'StringLiteral' ? first.value : first?.type === 'TemplateLiteral' ? first.quasis[0].value.cooked : undefined;
            if (prefix?.startsWith('/')) assert.ok(prefix.startsWith('/api/' + project.replace('System', '').toLowerCase() + '/'), 'Pages must pass explicit complete system API paths: ' + filename);
          }
          for (const [key, value] of Object.entries(node)) {
            if (['loc', 'leadingComments', 'trailingComments', 'innerComments', 'comments', 'tokens'].includes(key)) continue;
            for (const child of Array.isArray(value) ? value : [value]) if (child && typeof child === 'object' && typeof child.type === 'string') pending.push(child);
          }
        }
      }
    }
    const builtHtml = await readFile(path.join(directory, 'dist', 'index.html'), 'utf8');
    assert.match(builtHtml, new RegExp('<title>[^<]*' + project.replace('System', ''), 'i'));
    const asset = builtHtml.match(/src=["']\/(assets\/[^"']+\.js)["']/)?.[1];
    assert.ok(asset, `${project} must have its own built JavaScript entry.`);
    await access(path.join(directory, 'dist', asset));
    await assert.rejects(access(path.join(directory, 'nginx.conf')), error => error.code === 'ENOENT');
    const dockerfile = await readFile(path.join(directory, 'Dockerfile'), 'utf8');
    assert.match(dockerfile, /FROM\s+node:/i);
    assert.match(dockerfile, /npm\s+run\s+build/);
    assert.match(dockerfile, new RegExp('\\bEXPOSE\\s+' + port + '\\b'));
    assert.match(dockerfile, /CMD\s*\[\s*"npm"\s*,\s*"start"\s*\]/);
    assert.doesNotMatch(dockerfile, /nginx/i);
  });
}

test('frontend containers use their own Vite ports and the shared API proxy target without Nginx', async () => {
  const compose = await readFile(path.join(backend, 'compose.yaml'), 'utf8');
  assert.doesNotMatch(compose, /nginx/i);
  assert.equal([...compose.matchAll(/API_PROXY_TARGET:\s*["']?http:\/\/nodejs-server:5188/g)].length, 4);
  for (const port of Object.values(systems)) assert.match(compose, new RegExp(':' + port + '["\']?\\s*$', 'm'));
});

test('CommonJS Express entry mounts shared login before four business routers', async () => {
  await assert.rejects(access(path.join(backend, 'Api', 'ClientApi.js')), error => error.code === 'ENOENT');
  await assert.rejects(access(path.join(backend, 'Api', 'router.js')), error => error.code === 'ENOENT');
  assert.deepEqual((await readdir(path.join(backend, 'Api'))).filter(filename => filename.endsWith('.js')).sort(), ['ConfigurationApi.js', 'LoginApiSystem.js', 'PurchasingApi.js', 'SalesApi.js', 'WarehouseApi.js']);
  const server = await readFile(path.join(backend, 'server.js'), 'utf8');
  assert.match(server, /require\(['"]express['"]\)/);
  assert.match(server, /const\s+app\s*=\s*express\(\)/);
  const backendPackage = JSON.parse(await readFile(path.join(backend, 'package.json'), 'utf8'));
  assert.equal(backendPackage.type, 'commonjs');
  assert.match(server, /app\.use\(['"]\/api['"],\s*require\(['"]\.\/Api\/LoginApiSystem(?:\.js)?['"]\)\)/);
  const loginPosition = server.indexOf('./Api/LoginApiSystem');
  for (const filename of ['LoginApiSystem', 'SalesApi', 'PurchasingApi', 'ConfigurationApi', 'WarehouseApi']) {
    const api = await readFile(path.join(backend, 'Api', filename + '.js'), 'utf8');
    assertRouteCallbacksOnly(api, filename);
    const shared = filename === 'LoginApiSystem';
    if (!shared) {
      const system = filename.slice(0, -3);
      assert.match(server, new RegExp('app\\.use\\(["\']/api/' + system.toLowerCase() + '["\'],\\s*require\\(["\']\\./Api/' + filename + '(?:\\.js)?["\']\\)\\)'));
      assert.ok(loginPosition < server.indexOf('./Api/' + filename), 'Shared authentication must run before ' + filename);
      assert.doesNotMatch(api, /router\.(?:get|post|put|delete|all)\(['"]\/(?:auth|users)(?:\/|['"])/, 'Shared login owns account and profile routes.');
      assert.doesNotMatch(api, /createScopedSession|verifyScopedSession|AUTH_SYSTEMS/);
    }
    assert.match(api, /const\s+router\s*=\s*express\.Router\(\)/);
    assert.equal([...api.matchAll(/module\.exports\s*=/g)].length, 1);
    assert.match(api, /module\.exports\s*=\s*router\s*;/);
    assert.doesNotMatch(api, /\bexport\b|register\w+Api|module\.exports\./);
    if (filename === 'ConfigurationApi') assert.doesNotMatch(api, /\bmaxLength\b/, 'Configuration form length limits belong only in the frontend validation helper.');
    if (!shared) assert.doesNotMatch(api, /\.length\s*>\s*field\.maxLength/, 'Backend text values must not retain frontend length caps.');
    for (const [, specifier] of api.matchAll(/\brequire\(['"]([^'"]+)['"]\)/g)) {
      assert.ok(specifier.startsWith('node:') || specifier === 'express' || specifier === '../db', `${filename} must not depend on another API or backend helper: ${specifier}`);
    }
    for (const method of filename === 'WarehouseApi' ? ['get'] : ['get', 'post', 'put']) assert.ok(api.includes('router.' + method + '('), `${filename} must explicitly register ${method.toUpperCase()} endpoints.`);
    assert.doesNotMatch(api, /router\.(?:get|post|put|delete|use|all)\(['"]\/api\//);
  }
  assert.doesNotMatch(server, /readFile|frontendDirectory|\/dist\b|Api\/router\.js/);
});

test('all SQL files are located under migration and database startup delegates to its runner', async () => {
  const rootFiles = await readdir(backend);
  assert.deepEqual(rootFiles.filter(filename => filename.endsWith('.sql')), []);
  for (const filename of ['table-values.sql', 'schema.sql', 'system-accounts.sql', 'configuration-schema.sql', 'erp-schema.sql', 'sales-order-details.sql', 'text-max.sql']) await access(path.join(backend, 'migration', filename));
  await assert.rejects(access(path.join(backend, 'database.js')), error => error.code === 'ENOENT');
  const database = await readFile(path.join(backend, 'db.js'), 'utf8');
  assert.match(database, /require\(['"]\.\/migration\/run(?:\.js)?['"]\)/);
  assert.ok(database.includes('runMigrations'));
  assert.doesNotMatch(database, /readFile|\.sql['"`]/);
});
