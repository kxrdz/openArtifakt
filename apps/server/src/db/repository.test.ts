import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { Message } from "@openartifact/shared";
import { describe, expect, it } from "vitest";

import { openBetterSqlite3Connection } from "./better-sqlite3";
import { listMigrations, runMigrations } from "./migrations";
import { SqliteRepository } from "./sqlite-repository";

describe("SQLite persistence (better-sqlite3)", () => {
  it("migrates a temp database and round-trips every record kind", async () => {
    const dir = await mkdtemp(join(tmpdir(), "openartifact-db-"));
    const db = openBetterSqlite3Connection(join(dir, "data.db"));
    try {
      const applied = await runMigrations(db);
      expect(applied).toContain("001_init.sql");
      expect(listMigrations(db).map((m) => m.name)).toContain("001_init.sql");

      // Idempotent: running again applies nothing.
      expect(await runMigrations(db)).toEqual([]);

      const repo = new SqliteRepository(db);

      // Conversation.
      repo.saveConversation({ id: "conv-1", title: "A turn", createdAt: 1000 });
      expect(repo.listConversations()).toEqual([
        { id: "conv-1", title: "A turn", createdAt: 1000 },
      ]);
      expect(repo.getConversation("conv-1")).toEqual({
        id: "conv-1",
        title: "A turn",
        createdAt: 1000,
      });

      // Message in the canonical format, restored exactly.
      const message: Message = {
        id: "msg-1",
        role: "assistant",
        parts: [
          { type: "text", text: "hello" },
          { type: "tool_call", id: "call-1", name: "read_file", args: { path: "a.ts" } },
        ],
        createdAt: 1001,
      };
      repo.saveMessage({ conversationId: "conv-1", seq: 1, message });
      const messages = repo.listMessages("conv-1");
      expect(messages).toHaveLength(1);
      expect(messages[0]?.message).toEqual(message);

      // Artifact with two versions, auto-numbered in order.
      const artifact = repo.saveArtifact({
        conversationId: "conv-1",
        identifier: "diagram",
        title: "Diagram",
        type: "application/vnd.mermaid",
        language: null,
        createdAt: 1002,
      });
      expect(repo.getArtifact("conv-1", "diagram")).toEqual(artifact);
      const v1 = repo.saveArtifactVersion({
        artifactId: artifact.id,
        content: "graph TD; A-->B;",
        incomplete: false,
        createdAt: 1003,
      });
      const v2 = repo.saveArtifactVersion({
        artifactId: artifact.id,
        content: "graph TD; A-->B; B-->C;",
        incomplete: false,
        createdAt: 1004,
      });
      expect(v1.version).toBe(1);
      expect(v2.version).toBe(2);
      expect(repo.listArtifactVersions(artifact.id)).toEqual([v1, v2]);

      // Tool call with its result and approval decision.
      repo.saveToolCall({
        conversationId: "conv-1",
        callId: "call-1",
        seq: 1,
        name: "read_file",
        args: { path: "a.ts" },
        result: "1: export const a = 1;",
        isError: false,
        decision: { kind: "approve" },
        createdAt: 1005,
      });
      const toolCalls = repo.listToolCalls("conv-1");
      expect(toolCalls).toHaveLength(1);
      expect(toolCalls[0]).toMatchObject({
        callId: "call-1",
        name: "read_file",
        args: { path: "a.ts" },
        result: "1: export const a = 1;",
        isError: false,
        decision: { kind: "approve" },
      });

      // Non-secret settings round-trip.
      expect(repo.getSettings("provider")).toBeNull();
      repo.saveSettings("provider", { id: "openai-compatible", model: "gpt-4o-mini" });
      expect(repo.getSettings("provider")).toEqual({
        id: "openai-compatible",
        model: "gpt-4o-mini",
      });
      expect(repo.listSettings()).toEqual({
        provider: { id: "openai-compatible", model: "gpt-4o-mini" },
      });
    } finally {
      db.close();
      await rm(dir, { recursive: true, force: true });
    }
  });
});
