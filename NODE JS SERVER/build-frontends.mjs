import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const projects = ['SalesSystem', 'WarehouseSystem', 'PurchasingSystem', 'ConfigurationSystem'];
if (!process.env.npm_execpath) throw new Error('Run this script with npm run build inside NODE JS SERVER.');
const results = await Promise.allSettled(projects.map(project => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [process.env.npm_execpath, 'run', 'build'], {
    cwd: fileURLToPath(new URL(`../${project}/`, import.meta.url)), stdio: 'inherit',
  });
  child.once('error', reject);
  child.once('exit', code => code === 0 ? resolve(project) : reject(new Error(`${project} build failed (${code}).`)));
})));
for (const result of results) if (result.status === 'rejected') console.error(result.reason.message);
if (results.some(result => result.status === 'rejected')) process.exitCode = 1;
