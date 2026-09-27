import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { openRepository } from "./factory";
import { listMigrations, runMigrations } from "./migrations";
import { openNodeSqliteConnection } from "./node-sqlite";
import { SqliteRepository } from "./sqlite-repository";

// Simulate the native `better-sqlite3` build failing to load (§11): any import
// of the module throws. `openRepository` must catch this and fall back to
// `node:sqlite` behind the same Repository interface.
vi.mock("better-sqlite3", () => {
  throw new Error("simulated native build failure");
});

// §11: the fallback engine is node:sqlite, available since Node 22.5. Tests
// that need it are skipped on runtimes that do not expose it.
let nodeSqliteAvailable = false;
try {
  await import("node:sqlite");
  nodeSqliteAvailable = true;
} catch {
  nodeSqliteAvailable = false;
}

describe("repository factory", () => {
  it.runIf(nodeSqliteAvailable)(
    "falls back to node:sqlite when the better-sqlite3 import throws",
    async () => {
      const dir = await mkdtemp(join(tmpdir(), "openartifact-fallback-"));
      try {
        const opened = await openRepository(join(dir, "data.db"));
        expect(opened.engine).toBe("node:sqlite");

        // The fallback is a fully working repository, not a stub.
        opened.repository.saveConversation({ id: "c1", title: "Fallback", createdAt: 1 });
        expect(opened.repository.listConversations()).toEqual([
          { id: "c1", title: "Fallback", createdAt: 1 },
        ]);

        opened.close();
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    },
  );

  it.runIf(nodeSqliteAvailable)(
    "migrates and round-trips the full schema against node:sqlite",
    async () => {
      const dir = await mkdtemp(join(tmpdir(), "openartifact-node-sqlite-"));
      const db = openNodeSqliteConnection(join(dir, "data.db"));
      try {
        const applied = await runMigrations(db);
        expect(applied).toContain("001_init.sql");
        expect(listMigrations(db).map((m) => m.name)).toContain("001_init.sql");
        // Idempotent like better-sqlite3.
        expect(await runMigrations(db)).toEqual([]);

        const repo = new SqliteRepository(db);
        repo.saveConversation({ id: "c1", title: "Node", createdAt: 1 });
        repo.saveMessage({
          conversationId: "c1",
          seq: 1,
          message: {
            id: "m1",
            role: "assistant",
            parts: [{ type: "text", text: "hi" }],
            createdAt: 2,
          },
        });
        const artifact = repo.saveArtifact({
          conversationId: "c1",
          identifier: "a1",
          title: "A1",
          type: "application/vnd.code",
          language: "ts",
          createdAt: 3,
        });
        const version = repo.saveArtifactVersion({
          artifactId: artifact.id,
          content: "export const x = 1;",
          incomplete: false,
          createdAt: 4,
        });
        repo.saveToolCall({
          conversationId: "c1",
          callId: "t1",
          seq: 1,
          name: "read_file",
          args: { path: "a.ts" },
          result: "ok",
          isError: false,
          decision: { kind: "approve" },
          createdAt: 5,
        });
        repo.saveSettings("provider", { id: "openai-compatible" });

        expect(repo.listMessages("c1")).toHaveLength(1);
        expect(repo.listArtifacts("c1")).toHaveLength(1);
        expect(repo.listArtifactVersions(artifact.id)).toEqual([version]);
        expect(repo.listToolCalls("c1")).toHaveLength(1);
        expect(repo.getSettings("provider")).toEqual({ id: "openai-compatible" });
      } finally {
        db.close();
        await rm(dir, { recursive: true, force: true });
      }
    },
  );
});
