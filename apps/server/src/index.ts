import { serve } from "@hono/node-server";
import { createApp } from "./app";
import { loadConfig } from "./config";
import { createFakeWorkspace } from "./fake";
import { generateSessionToken } from "./security";

const HOST = "127.0.0.1";
const port = Number(process.env.PORT ?? 4318);

async function main(): Promise<void> {
  const config = loadConfig();

  // Fake-provider mode (§12.6): run the scripted provider against a seeded temp
  // workspace so the product works without any API key or network access.
  let cleanup: (() => Promise<void>) | undefined;
  let workspaceRoot = config.workspaceRoot;
  if (config.fakeProvider) {
    const workspace = await createFakeWorkspace();
    workspaceRoot = workspace.root;
    cleanup = workspace.cleanup;
  }

  const app = createApp({
    config: { ...config, workspaceRoot },
    sessionToken: generateSessionToken(),
  });

  const shutdown = (): void => {
    void cleanup?.();
    process.exit(0);
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);

  serve({ fetch: app.fetch, port, hostname: HOST }, (info) => {
    console.log(`OpenArtifact server listening on http://${HOST}:${info.port}`);
  });
}

void main();
