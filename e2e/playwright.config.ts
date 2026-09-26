import { fileURLToPath } from "node:url";
import { defineConfig } from "@playwright/test";

const rootDir = fileURLToPath(new URL("..", import.meta.url));
const port = Number(process.env.PORT ?? 4318);
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: ".",
  outputDir: "test-results",
  timeout: 30_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  webServer: {
    // Build the web client (so the server serves the real build in production
    // mode) and start the Hono server bound to loopback.
    command: `pnpm build && NODE_ENV=production PORT=${port} pnpm --filter @openartifact/server start`,
    url: `${baseURL}/health`,
    cwd: rootDir,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
