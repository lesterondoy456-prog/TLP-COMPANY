import { defineConfig } from 'vite';

const proxy = { '/api': { target: 'http://127.0.0.1:5189', changeOrigin: false } };

export default defineConfig({
  esbuild: { jsx: 'automatic' },
  build: { outDir: 'dist', emptyOutDir: true },
  server: { host: '0.0.0.0', port: 5190, strictPort: true, proxy },
  preview: { host: '0.0.0.0', port: 5190, strictPort: true, proxy },
});
