import assert from 'node:assert/strict';
import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const workspace = fileURLToPath(new URL('../../', import.meta.url));
const backend = path.join(workspace, 'NODE JS SERVER');
const systems = { SalesSystem: 5188, WarehouseSystem: 5190, PurchasingSystem: 5191, ConfigurationSystem: 5192 };

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
    assert.match(packageJson.scripts?.build || '', /\bvite\s+build\b/);
    assert.match(packageJson.scripts?.start || '', /^vite\s+preview\b/);
    assert.doesNotMatch(packageJson.scripts?.start || '', /NODE JS SERVER|(?:Sales|Purchasing|Warehouse|Configuration)System/);
    const lock = JSON.parse(await readFile(path.join(directory, 'package-lock.json'), 'utf8'));
    assert.equal(lock.name, packageJson.name);
    const html = await readFile(path.join(directory, 'index.html'), 'utf8');
    assert.match(html, /<script\b[^>]*type=["']module["'][^>]*src=["']\/src\/main\.jsx["']/);
    await access(path.join(directory, 'src', 'main.jsx'));
    await access(path.join(directory, 'src', 'App.jsx'));
    const config = await readFile(path.join(directory, 'vite.config.js'), 'utf8');
    for (const mode of ['server', 'preview']) assert.match(config, new RegExp('\\b' + mode + '\\s*:\\s*\\{[^}]*\\bport\\s*:\\s*' + port + '\\b'));
    assert.match(config, /process\.env\.API_PROXY_TARGET\s*\|\|\s*['"]http:\/\/localhost:5189['"]/);
    assert.match(config, /['"]\/api['"][\s\S]*?target\s*:/);
    assert.match(config, /changeOrigin\s*:\s*false/);
    const files = [...await sourceFiles(path.join(directory, 'src')), path.join(directory, 'vite.config.js')];
    for (const filename of files) {
      const source = await readFile(filename, 'utf8');
      const imports = [...source.matchAll(/(?:\b(?:import|export)\s+(?:[^'";]*?\s+from\s*)?|\bimport\s*\()\s*['"]([^'"]+)['"]/g)];
      for (const [, specifier] of imports) {
        if (!specifier.startsWith('.')) continue;
        const resolved = path.resolve(path.dirname(filename), specifier.split('?')[0]);
        assert.ok(resolved.startsWith(directory + path.sep), `${project} must not import source from another frontend: ${path.relative(directory, filename)} → ${specifier}`);
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
  assert.equal([...compose.matchAll(/API_PROXY_TARGET:\s*["']?http:\/\/nodejs-server:5189/g)].length, 4);
  for (const port of Object.values(systems)) assert.match(compose, new RegExp(':' + port + '["\']?\\s*$', 'm'));
});

test('native backend entry wires four independent APIs without the old ClientApi or router', async () => {
  await assert.rejects(access(path.join(backend, 'Api', 'ClientApi.js')), error => error.code === 'ENOENT');
  await assert.rejects(access(path.join(backend, 'Api', 'router.js')), error => error.code === 'ENOENT');
  const server = await readFile(path.join(backend, 'server.js'), 'utf8');
  for (const system of ['Sales', 'Purchasing', 'Configuration', 'Warehouse']) {
    await access(path.join(backend, 'Api', system + 'Api.js'));
    assert.ok(server.includes(`./Api/${system}Api.js`));
    assert.ok(server.includes(`handle${system}Api`));
  }
  assert.doesNotMatch(server, /readFile|frontendDirectory|\/dist\b|Api\/router\.js/);
});

test('all SQL files are located under migration and database startup delegates to its runner', async () => {
  const rootFiles = await readdir(backend);
  assert.deepEqual(rootFiles.filter(filename => filename.endsWith('.sql')), []);
  for (const filename of ['schema.sql', 'system-accounts.sql', 'configuration-schema.sql', 'erp-schema.sql']) await access(path.join(backend, 'migration', filename));
  const database = await readFile(path.join(backend, 'database.js'), 'utf8');
  assert.ok(database.includes('./migration/run.js'));
  assert.ok(database.includes('runMigrations'));
  assert.doesNotMatch(database, /readFile|\.sql['"`]/);
});
