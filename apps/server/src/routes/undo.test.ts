import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { createApp } from "../app";
import { loadConfig } from "../config";
import { FakeServerProvider, type ScriptedTurn } from "../fake/provider";
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

/** The scripted turn used by the undo tests: edit one file, create another. */
const UNDO_TURN: ScriptedTurn = {
  text: "I'll edit an existing file and create a new one.",
  splitText: false,
  toolCalls: [
    {
      id: "edit-existing",
      name: "edit_file",
      args: { path: "existing.txt", oldString: "before", newString: "after" },
    },
    {
      id: "create-new",
      name: "write_file",
      args: { path: "sub/created.txt", content: "new file" },
    },
  ],
};

interface AppUnderTest {
  app: ReturnType<typeof createApp>;
  cookie: string;
  workspaceRoot: string;
  snapshots: string;
  cleanup: () => Promise<void>;
}

/** A fake-provider app over a temp workspace + snapshot root, seeded with one file. */
async function undoApp(): Promise<AppUnderTest> {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "openartifact-undo-ws-"));
  const snapshots = await mkdtemp(join(tmpdir(), "openartifact-undo-snap-"));
  await writeFile(join(workspaceRoot, "existing.txt"), "before content\n");

  const config = {
    ...loadConfig({ OPENARTIFACT_FAKE_PROVIDER: "1" }),
    workspaceRoot,
  };
  const app = createApp({
    config,
    sessionToken: "test-token",
    snapshotRoot: snapshots,
    providerFactory: () => new FakeServerProvider({ turns: [UNDO_TURN] }),
  });

  return {
    app,
    cookie: `${SESSION_COOKIE_NAME}=test-token`,
    workspaceRoot,
    snapshots,
    cleanup: async () => {
      await rm(workspaceRoot, { recursive: true, force: true });
      await rm(snapshots, { recursive: true, force: true });
    },
  };
}

/** Drive one full turn, approving every tool call. */
async function driveTurn(
  app: ReturnType<typeof createApp>,
  cookie: string,
  message: string,
): Promise<string> {
  const res = await app.request("/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ message }),
  });
  expect(res.status).toBe(200);

  let conversationId = "";
  for await (const frame of readSse(res)) {
    const event = JSON.parse(frame.data) as WireEvent;
    if (event.type === "conversation") conversationId = String(event.conversationId);
    if (event.type === "approval_request") {
      const decision = await app.request(`/api/chat/${conversationId}/approval`, {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({ kind: "approve" }),
      });
      expect(decision.status).toBe(200);
    }
  }
  expect(conversationId.length).toBeGreaterThan(0);
  return conversationId;
}

async function postUndo(
  app: ReturnType<typeof createApp>,
  cookie: string,
  conversationId: string,
  turn?: string,
): Promise<Response> {
  const query = turn === undefined ? "" : `?turn=${encodeURIComponent(turn)}`;
  return app.request(`/api/conversations/${conversationId}/undo${query}`, {
    method: "POST",
    headers: { cookie },
  });
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

describe("undo endpoint", () => {
  it("restores an edited file, removes a created file and clears the turn's snapshots", async () => {
    const { app, cookie, workspaceRoot, snapshots, cleanup } = await undoApp();
    try {
      const conversationId = await driveTurn(app, cookie, "Edit and create files");

      // The turn really changed the workspace.
      expect(await readFile(join(workspaceRoot, "existing.txt"), "utf8")).toBe(
        "after content\n",
      );
      expect(await readFile(join(workspaceRoot, "sub", "created.txt"), "utf8")).toBe(
        "new file",
      );

      // Snapshots were recorded under the conversation/turn ids (nested path preserved).
      expect(await exists(join(snapshots, conversationId, "1", "1_existing.txt.before"))).toBe(
        true,
      );
      expect(
        await exists(join(snapshots, conversationId, "1", "sub", "2_created.txt.created")),
      ).toBe(true);

      const undo = await postUndo(app, cookie, conversationId, "1");
      expect(undo.status).toBe(200);
      const body = (await undo.json()) as {
        ok: boolean;
        turnId: string;
        restored: string[];
        deleted: string[];
      };
      expect(body.ok).toBe(true);
      expect(body.turnId).toBe("1");
      expect(body.restored).toContain("existing.txt");
      expect(body.deleted).toContain(join("sub", "created.txt"));

      // The edited file is back to its pre-turn content and the created file is gone.
      expect(await readFile(join(workspaceRoot, "existing.txt"), "utf8")).toBe(
        "before content\n",
      );
      expect(await exists(join(workspaceRoot, "sub", "created.txt"))).toBe(false);

      // The turn's snapshot directory was removed.
      expect(await exists(join(snapshots, conversationId, "1"))).toBe(false);
    } finally {
      await cleanup();
    }
  });

  it("defaults to the latest turn and rejects unknown conversations and bad turn ids", async () => {
    const { app, cookie, workspaceRoot, snapshots, cleanup } = await undoApp();
    try {
      const conversationId = await driveTurn(app, cookie, "Edit and create files");

      // No `?turn=` parameter → the most recent (only) turn is undone.
      const undo = await postUndo(app, cookie, conversationId);
      expect(undo.status).toBe(200);
      expect(await readFile(join(workspaceRoot, "existing.txt"), "utf8")).toBe(
        "before content\n",
      );
      expect(await exists(join(snapshots, conversationId, "1"))).toBe(false);

      // Unknown conversation → 404.
      expect((await postUndo(app, cookie, "conv-missing", "1")).status).toBe(404);

      // A traversal turn id is rejected before it touches the filesystem.
      expect((await postUndo(app, cookie, conversationId, "../../etc")).status).toBe(400);
    } finally {
      await cleanup();
    }
  });
});
