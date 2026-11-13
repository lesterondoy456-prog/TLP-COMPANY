import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('./', import.meta.url));
const children = [
  spawn(process.execPath, ['server.js'], { cwd: root, stdio: 'inherit' }),
  spawn(process.execPath, [fileURLToPath(new URL('../SalesSystem/node_modules/vite/bin/vite.js', import.meta.url))], {
    cwd: fileURLToPath(new URL('../SalesSystem/', import.meta.url)), stdio: 'inherit',
  }),
];
// Vite runs from the frontend directory so it picks up the API proxy configuration.
children[1].on('error', stop);
children[0].on('error', stop);
let stopping = false;
function stop(error) {
  if (stopping) return;
  stopping = true;
  if (error instanceof Error) console.error(error.message);
  for (const child of children) if (!child.killed) child.kill();
  process.exitCode = error instanceof Error ? 1 : 0;
}
for (const child of children) child.on('exit', code => {
  if (!stopping) { stop(); process.exitCode = code || 0; }
});
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
