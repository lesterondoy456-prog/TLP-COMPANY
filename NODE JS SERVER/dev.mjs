import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('./', import.meta.url));
const projects = ['SalesSystem', 'WarehouseSystem', 'PurchasingSystem', 'ConfigurationSystem'];
const entries = projects.map(project => ({
  project,
  cwd: fileURLToPath(new URL(`../${project}/`, import.meta.url)),
  vite: fileURLToPath(new URL(`../${project}/node_modules/vite/bin/vite.js`, import.meta.url)),
}));
for (const entry of entries) if (!existsSync(entry.vite)) throw new Error(`Install dependencies in ${entry.project} with npm ci before running dev:all.`);
const children = [spawn(process.execPath, ['server.js'], { cwd: root, stdio: 'inherit' }), ...entries.map(entry => spawn(process.execPath, [entry.vite], { cwd: entry.cwd, stdio: 'inherit' }))];
let stopping = false;
function stop(error) {
  if (stopping) return;
  stopping = true;
  if (error instanceof Error) console.error(error.message);
  for (const child of children) if (!child.killed) child.kill();
  process.exitCode = error instanceof Error ? 1 : 0;
}
for (const child of children) {
  child.once('error', stop);
  child.once('exit', code => { if (!stopping) { stop(); process.exitCode = code || 0; } });
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
