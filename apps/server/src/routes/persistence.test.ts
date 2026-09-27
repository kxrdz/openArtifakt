import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { ProviderAdapter } from "@openartifact/core";
import { parseConversationHistory, type ConversationHistory } from "@openartifact/shared";
import { describe, expect, it } from "vitest";

import { createApp } from "../app";
import { ActiveConfig, loadConfig } from "../config";
import { openBetterSqlite3Connection } from "../db/better-sqlite3";
import { runMigrations } from "../db/migrations";
import { SqliteRepository } from "../db/sqlite-repository";
import { createFakeWorkspace } from "../fake";
import { FAKE_ARTIFACTS_TEXT, FAKE_REACT_IDENTIFIER, FAKE_REACT_SANDBOXED_MARKER } from "../fake/artifacts";
import { FakeServerProvider } from "../fake/provider";
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
async function persistenceApp(providerFactory?: () => ProviderAdapter) {
  const workspace = await createFakeWorkspace();
  const dir = await mkdtemp(join(tmpdir(), "openartifact-persistence-"));
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
    ...(providerFactory ? { providerFactory } : {}),
  });

  return {
    app,
    repository,
    cookie: `${SESSION_COOKIE_NAME}=test-token`,
    cleanup: async () => {
      db.close();
      await rm(dir, { recursive: true, force: true });
      await workspace.cleanup();
    },
  };
}

/** Drive one full turn, applying `decide` to every approval request. */
async function driveTurn(
  app: ReturnType<typeof createApp>,
  cookie: string,
  message: string,
  decide: (event: WireEvent) => unknown,
  conversationId?: string,
): Promise<{ events: WireEvent[]; conversationId: string }> {
  const res = await app.request("/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ message, ...(conversationId ? { conversationId } : {}) }),
  });
  expect(res.status).toBe(200);

  const events: WireEvent[] = [];
  let id = conversationId ?? "";
  for await (const frame of readSse(res)) {
    const event = JSON.parse(frame.data) as WireEvent;
    events.push(event);
    if (event.type === "conversation") id = String(event.conversationId);
    if (event.type === "approval_request") {
      const decision = await app.request(`/api/chat/${id}/approval`, {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify(decide(event)),
      });
      expect(decision.status).toBe(200);
    }
  }
  expect(id.length).toBeGreaterThan(0);
  return { events, conversationId: id };
}

async function getHistory(
  app: ReturnType<typeof createApp>,
  cookie: string,
  conversationId: string,
): Promise<Response> {
  return app.request(`/api/conversations/${conversationId}`, { headers: { cookie } });
}

describe("persistence + history endpoints", () => {
  it("persists a full turn's messages and tool-call log, and the history endpoints return them", async () => {
    const { app, repository, cookie, cleanup } = await persistenceApp();
    try {
      const { conversationId } = await driveTurn(
        app,
        cookie,
        "Fix the notes file please",
        (approval) =>
          approval.name === "edit_file"
            ? { kind: "approve" }
            : { kind: "reject", note: "skip the command" },
      );

      // The conversation row exists with a title derived from the first message.
      const conversations = repository.listConversations();
      expect(conversations).toHaveLength(1);
      expect(conversations[0]).toMatchObject({ id: conversationId, title: "Fix the notes file please" });

      // Messages: the user message, assistant messages and tool results, in order.
      const records = repository.listMessages(conversationId);
      expect(records[0]?.message).toMatchObject({
        role: "user",
        parts: [{ type: "text", text: "Fix the notes file please" }],
      });
      expect(records.some((record) => record.message.role === "assistant")).toBe(true);
      expect(records.some((record) => record.message.role === "tool")).toBe(true);

      // Tool-call log carries each call's arguments, result and approval decision.
      const toolCalls = repository.listToolCalls(conversationId);
      const byCallId = new Map(toolCalls.map((call) => [call.callId, call]));
      expect(byCallId.get("fake-edit")).toMatchObject({
        name: "edit_file",
        decision: { kind: "approve" },
        isError: false,
      });
      expect(String(byCallId.get("fake-edit")?.result)).toContain("Replaced 1 occurrence");
      expect(byCallId.get("fake-cmd")).toMatchObject({
        name: "execute_command",
        decision: { kind: "reject", note: "skip the command" },
        isError: true,
      });
      expect(String(byCallId.get("fake-cmd")?.result)).toContain("skip the command");

      // The conversation list endpoint returns the summary.
      const listRes = await app.request("/api/conversations", { headers: { cookie } });
      expect(listRes.status).toBe(200);
      expect(await listRes.json()).toEqual([
        expect.objectContaining({ id: conversationId }),
      ]);

      // The history endpoint returns the full, wire-valid history.
      const historyRes = await getHistory(app, cookie, conversationId);
      expect(historyRes.status).toBe(200);
      const history = parseConversationHistory(await historyRes.json()) as ConversationHistory;
      expect(history.conversation.id).toBe(conversationId);
      expect(history.messages.length).toBe(records.length);
      expect(history.toolCalls).toHaveLength(2);
    } finally {
      await cleanup();
    }
  });

  it("derives and persists artifact versions, returned by the history endpoint", async () => {
    const { app, repository, cookie, cleanup } = await persistenceApp(
      () => new FakeServerProvider({ turns: [{ text: FAKE_ARTIFACTS_TEXT, splitText: true }] }),
    );
    try {
      const { conversationId } = await driveTurn(app, cookie, "Show me every artifact type", () => ({
        kind: "approve",
      }));

      const artifacts = repository.listArtifacts(conversationId);
      expect(artifacts).toHaveLength(5);

      const react = artifacts.find((artifact) => artifact.identifier === FAKE_REACT_IDENTIFIER);
      expect(react).toBeDefined();
      const versions = repository.listArtifactVersions(react!.id);
      expect(versions).toHaveLength(1);
      expect(versions[0]).toMatchObject({ version: 1, incomplete: false });
      expect(versions[0]?.content).toContain(FAKE_REACT_SANDBOXED_MARKER);

      const historyRes = await getHistory(app, cookie, conversationId);
      expect(historyRes.status).toBe(200);
      const history = parseConversationHistory(await historyRes.json()) as ConversationHistory;
      expect(history.artifacts).toHaveLength(5);
      const reactHistory = history.artifacts.find(
        (artifact) => artifact.identifier === FAKE_REACT_IDENTIFIER,
      );
      expect(reactHistory?.versions).toEqual([
        expect.objectContaining({ version: 1, content: expect.stringContaining(FAKE_REACT_SANDBOXED_MARKER) }),
      ]);
    } finally {
      await cleanup();
    }
  });

  it("returns 404 for an unknown conversation", async () => {
    const { app, cookie, cleanup } = await persistenceApp();
    try {
      const res = await getHistory(app, cookie, "conv-missing");
      expect(res.status).toBe(404);
    } finally {
      await cleanup();
    }
  });
});
