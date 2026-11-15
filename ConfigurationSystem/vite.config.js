import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    allowedHosts: ["configurationtti.infotechsystemsolution.com"],
    port: 5192,
    proxy: {
      "/api": {
        target: process.env.API_PROXY_TARGET || "http://localhost:5188",
        changeOrigin: true,
      },
      "/Uploads": {
        target: process.env.API_PROXY_TARGET || "http://localhost:5188",
        changeOrigin: true,
      },
      "/socket.io": {
        target: process.env.API_PROXY_TARGET || "http://localhost:5188",
        changeOrigin: true,
        ws: true,
      },
    },
  },
});
