import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    // Same-origin `/api` in dev: forward to the local server (127.0.0.1:4318)
    // so the session cookie and Host/Origin checks behave exactly as in
    // production (§12.6 / design decision 7).
    proxy: {
      "/api": {
        target: "http://127.0.0.1:4318",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: true,
  },
});
