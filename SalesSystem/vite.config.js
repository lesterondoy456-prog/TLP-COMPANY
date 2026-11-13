import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

const workspace = fileURLToPath(new URL('..', import.meta.url));

export default defineConfig({
  resolve: { dedupe: ['react', 'react-dom'] },
  esbuild: { jsx: "automatic" },
  build: { outDir: "dist", emptyOutDir: true },
  server: {
    host: "127.0.0.1",
    port: 5188,
    strictPort: true,
    fs: { allow: [workspace] },
    proxy: { "/api": { target: "http://127.0.0.1:5189", changeOrigin: false } },
  },
});
