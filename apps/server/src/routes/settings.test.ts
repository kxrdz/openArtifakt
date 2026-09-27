import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { type Settings } from "@openartifact/shared";
import { describe, expect, it } from "vitest";

import { createApp } from "../app";
import { ActiveConfig, loadConfig } from "../config";
import { openBetterSqlite3Connection } from "../db/better-sqlite3";
import { runMigrations } from "../db/migrations";
import { SqliteRepository } from "../db/sqlite-repository";
import { createFakeWorkspace } from "../fake";
import { SESSION_COOKIE_NAME } from "../security";

/** A parsed SSE frame: its `event:` name and its JSON `data`. */
interface SseFrame {
  event?: string;
  data: string;
}

function parseSseBlock(block: string): SseFrame | null {
  let event: string | undefined;
  const dataLines: string[] = [];
  for (const line of block.split("\n")) {
    if (line.startsWith("event:")) event = line.slice("event:".length).trim();
    else if (line.startsWith("data:")) dataLines.push(line.slice("data:".length).trimStart());
  }
  if (dataLines.length === 0) return null;
  return { event, data: dataLines.join("\n") };
}

async function* readSse(res: Response): AsyncGenerator<SseFrame> {
  const reader = res.body?.getReader();
  if (reader === undefined) return;
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let boundary = buffer.indexOf("\n\n");
      while (boundary !== -1) {
        const block = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const frame = parseSseBlock(block);
        if (frame !== null) yield frame;
        boundary = buffer.indexOf("\n\n");
      }
    }
    if (buffer.trim() !== "") {
      const frame = parseSseBlock(buffer);
      if (frame !== null) yield frame;
    }
  } finally {
    reader.releaseLock();
  }
}

type WireEvent = { type: string } & Record<string, unknown>;

/** A fake-provider app over a temp SQLite repository and seeded workspace. */
async function settingsApp() {
  const workspace = await createFakeWorkspace();
  const dir = await mkdtemp(join(tmpdir(), "openartifact-settings-"));
  const db = openBetterSqlite3Connection(join(dir, "data.db"));
  await runMigrations(db);
  const repository = new SqliteRepository(db);

  const config = {
    ...loadConfig({ OPENARTIFACT_FAKE_PROVIDER: "1" }),
    workspaceRoot: workspace.root,
  };
  const activeConfig = new ActiveConfig(config);
  const app = createApp({
    config,
    sessionToken: "test-token",
    repository,
    activeConfig,
  });

  return {
    app,
    repository,
    activeConfig,
    cookie: `${SESSION_COOKIE_NAME}=test-token`,
    cleanup: async () => {
      db.close();
      await rm(dir, { recursive: true, force: true });
      await workspace.cleanup();
    },
  };
}

/** The full, valid settings object a PUT sends. */
const FULL_SETTINGS: Settings = {
  provider: "openai-compatible",
  model: "gpt-4o-mini",
  baseUrl: "https://api.openai.com/v1",
  apiKeyRef: "OPENAI_API_KEY",
  approvalMode: "ask",
  contextWindow: 128_000,
  capabilities: { nativeTools: true, streamingToolArgs: true, vision: false },
};

async function getSettings(app: ReturnType<typeof createApp>, cookie: string): Promise<Response> {
  return app.request("/api/settings", { method: "GET", headers: { cookie } });
}

async function putSettings(
  app: ReturnType<typeof createApp>,
  cookie: string,
  body: unknown,
): Promise<Response> {
  return app.request("/api/settings", {
    method: "PUT",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify(body),
  });
}

describe("settings endpoints", () => {
  it("returns the active config's settings when nothing is persisted", async () => {
    const { app, cookie, cleanup } = await settingsApp();
    try {
      const res = await getSettings(app, cookie);
      expect(res.status).toBe(200);
      const body = (await res.json()) as Settings;
      expect(body).toMatchObject({
        provider: "openai-compatible",
        model: "gpt-4o-mini",
        approvalMode: "ask",
      });
      // Key reference is a name only, never a value (§9).
      expect(body.apiKeyRef).toBe("OPENAI_API_KEY");
    } finally {
      await cleanup();
    }
  });

  it("persists settings on PUT and rejects an unknown provider", async () => {
    const { app, repository, cookie, cleanup } = await settingsApp();
    try {
      const changed: Settings = { ...FULL_SETTINGS, model: "gpt-4.1", approvalMode: "auto-edit" };
      const put = await putSettings(app, cookie, changed);
      expect(put.status).toBe(200);
      expect(await put.json()).toEqual(changed);

      // Read back from the route and straight from the repository.
      const got = await getSettings(app, cookie);
      expect(got.status).toBe(200);
      expect(await got.json()).toEqual(changed);
      expect(repository.getSettings("settings")).toEqual(changed);

      // Unknown provider is rejected and nothing is written.
      const bad = await putSettings(app, cookie, { ...FULL_SETTINGS, provider: "nope" });
      expect(bad.status).toBe(400);
      expect(repository.getSettings("settings")).toEqual(changed);
    } finally {
      await cleanup();
    }
  });

  it("applies a changed approval mode to the next conversation", async () => {
    const { app, cookie, cleanup } = await settingsApp();
    try {
      // Full auto: edits and commands run without asking (§8).
      const put = await putSettings(app, cookie, { ...FULL_SETTINGS, approvalMode: "full-auto" });
      expect(put.status).toBe(200);

      const res = await app.request("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({ message: "Fix the notes file please" }),
      });
      expect(res.status).toBe(200);

      const events: WireEvent[] = [];
      for await (const frame of readSse(res)) {
        events.push(JSON.parse(frame.data) as WireEvent);
      }

      expect(events.some((e) => e.type === "approval_request")).toBe(false);
      const results = events.filter((e) => e.type === "tool_result");
      expect(results.map((e) => e.callId)).toEqual(["fake-edit", "fake-cmd"]);
      expect(events.at(-1)).toMatchObject({ type: "done", stopReason: "end_turn" });
    } finally {
      await cleanup();
    }
  });

  it("rejects settings requests without the session token", async () => {
    const { app, cleanup } = await settingsApp();
    try {
      expect((await app.request("/api/settings")).status).toBe(401);
    } finally {
      await cleanup();
    }
  });
});
