import { homedir } from "node:os";
import { mkdir } from "node:fs/promises";
import * as path from "node:path";

import { serve } from "@hono/node-server";
import { settingsSchema } from "@openartifact/shared";

import { createApp } from "./app";
import { ActiveConfig, loadConfig } from "./config";
import { openRepository } from "./db";
import { createFakeWorkspace } from "./fake";
import { applySettings, SETTINGS_KEY } from "./routes/settings";
import { generateSessionToken } from "./security";

const HOST = "127.0.0.1";
const port = Number(process.env.PORT ?? 4318);

async function main(): Promise<void> {
  const envConfig = loadConfig();

  // §11: open (and migrate) the SQLite database at ~/.openartifact/data.db.
  // SQLite does not create parent directories, so make sure the dir exists.
  const dbPath = path.join(homedir(), ".openartifact", "data.db");
  await mkdir(path.dirname(dbPath), { recursive: true });
  const { repository, close } = await openRepository(dbPath);

  // Restore persisted settings over the env-derived config so a saved
  // provider/model/approval-mode survives a restart (§12.8).
  let config = envConfig;
  const persisted = repository.getSettings(SETTINGS_KEY);
  if (persisted !== null) {
    const parsed = settingsSchema.safeParse(persisted);
    if (parsed.success) config = applySettings(envConfig, parsed.data);
  }

  // Fake-provider mode (§12.6): run the scripted provider against a seeded temp
  // workspace so the product works without any API key or network access.
  let cleanup: (() => Promise<void>) | undefined;
  let workspaceRoot = config.workspaceRoot;
  if (config.fakeProvider) {
    const workspace = await createFakeWorkspace();
    workspaceRoot = workspace.root;
    cleanup = workspace.cleanup;
  }

  const activeConfig = new ActiveConfig({ ...config, workspaceRoot });

  const app = createApp({
    config: activeConfig.get(),
    sessionToken: generateSessionToken(),
    repository,
    activeConfig,
  });

  const shutdown = (): void => {
    close();
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
