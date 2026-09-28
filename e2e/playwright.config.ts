import { fileURLToPath } from "node:url";
import { defineConfig } from "@playwright/test";

const rootDir = fileURLToPath(new URL("..", import.meta.url));
const port = Number(process.env.PORT || 4318);
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
    // mode) and start the Hono server bound to loopback, in fake-provider mode
    // (§12.6) so e2e runs key-free against a seeded temp workspace (the server
    // creates the workspace itself when the flag is set).
    command: `pnpm build && OPENARTIFACT_FAKE_PROVIDER=1 NODE_ENV=production PORT=${port} pnpm --filter @openartifact/server start`,
    url: `${baseURL}/health`,
    cwd: rootDir,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
  projects: [
    {
      // The assertion suite: axe + behaviour. Screenshots are a capture tool,
      // not an assertion, so they live in their own project below and do not
      // run under `pnpm check` (which runs `pnpm e2e`).
      name: "e2e",
      testIgnore: "**/screenshots.spec.ts",
    },
    {
      name: "screenshots",
      testMatch: "**/screenshots.spec.ts",
    },
  ],
});
