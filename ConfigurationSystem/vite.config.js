import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5192,
    proxy: {
      "/api": {
        target: process.env.API_PROXY_TARGET || "http://localhost:5189",
        changeOrigin: true,
      },
      "/Uploads": {
        target: process.env.API_PROXY_TARGET || "http://localhost:5189",
        changeOrigin: true,
      },
      "/socket.io": {
        target: process.env.API_PROXY_TARGET || "http://localhost:5189",
        changeOrigin: true,
        ws: true,
      },
    },
  },
});
