import { defineConfig } from 'vite';

const proxy = {
  '/api': { target: process.env.API_PROXY_TARGET || 'http://localhost:5189', changeOrigin: false },
};

export default defineConfig({
  esbuild: { jsx: 'automatic' },
  build: { outDir: 'dist', emptyOutDir: true },
  server: { host: true, port: 5191, strictPort: true, proxy },
  preview: { host: true, port: 5191, strictPort: true, proxy },
});
