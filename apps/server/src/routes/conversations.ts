import { access, readdir } from "node:fs/promises";
import * as path from "node:path";

import { Hono } from "hono";

import { defaultSnapshotRoot } from "../agent/runtime";
import { restoreTurnSnapshots } from "@openartifact/core";

import type { Repository } from "../db";

/**
 * Conversation history API (§12.8, "Persistence").
 *
 * `GET /api/conversations` lists every persisted conversation; `GET
 * /api/conversations/:id` returns one conversation's full history — its
 * canonical messages, its artifacts with every version, and its tool-call log
 * (including approval decisions) — in the shared `ConversationHistory` wire
 * shape so the web client can restore it on reload.
 */

export interface ConversationsRoutesOptions {
  /** Persistence store the history is read from. */
  repository: Repository;
  /** Absolute workspace root the undo endpoint restores files into. */
  workspaceRoot: string;
  /** Snapshot storage root for pre-mutation snapshots (§8); defaults to the home dir. */
  snapshotRoot?: string;
}

/** A turn id must be a plain directory segment (no separators or traversal). */
const TURN_ID = /^[A-Za-z0-9_-]+$/;

/** The highest-numbered turn directory, or `null` when none exists. */
function latestTurnId(turnDirs: string[]): string | null {
  let latest: string | null = null;
  let latestN = -1;
  for (const dir of turnDirs) {
    const match = /^(\d+)$/.exec(dir);
    if (match === null) continue;
    const n = Number(match[1]);
    if (n > latestN) {
      latestN = n;
      latest = dir;
    }
  }
  return latest;
}

export function createConversationsRouter(options: ConversationsRoutesOptions): Hono {
  const { repository, workspaceRoot } = options;
  const snapshotRoot = options.snapshotRoot ?? defaultSnapshotRoot();
  const router = new Hono();

  router.get("/", (c) => c.json(repository.listConversations()));

  router.get("/:id", (c) => {
    const id = c.req.param("id");
    const conversation = repository.getConversation(id);
    if (conversation === null) {
      return c.json({ error: "Unknown conversation" }, 404);
    }

    const messages = repository.listMessages(id).map((record) => record.message);
    const artifacts = repository.listArtifacts(id).map((artifact) => ({
      identifier: artifact.identifier,
      title: artifact.title,
      type: artifact.type,
      language: artifact.language,
      createdAt: artifact.createdAt,
      versions: repository.listArtifactVersions(artifact.id).map((version) => ({
        version: version.version,
        content: version.content,
        incomplete: version.incomplete,
        createdAt: version.createdAt,
      })),
    }));
    const toolCalls = repository.listToolCalls(id).map((record) => ({
      callId: record.callId,
      seq: record.seq,
      name: record.name,
      args: record.args,
      result: record.result,
      isError: record.isError,
      decision: record.decision,
      createdAt: record.createdAt,
    }));

    return c.json({ conversation, messages, artifacts, toolCalls });
  });

  router.post("/:id/undo", async (c) => {
    const id = c.req.param("id");
    if (repository.getConversation(id) === null) {
      return c.json({ error: "Unknown conversation" }, 404);
    }

    const turnParam = c.req.query("turn");
    if (turnParam !== undefined && !TURN_ID.test(turnParam)) {
      return c.json({ error: "Invalid turn id" }, 400);
    }

    // Resolve the turn to undo: an explicit `?turn=` wins; otherwise the most
    // recently numbered turn directory (turns are named 1, 2, … per conversation).
    let turnId = turnParam ?? null;
    if (turnId === null) {
      try {
        turnId = latestTurnId(await readdir(path.join(snapshotRoot, id)));
      } catch {
        turnId = null;
      }
    }
    if (turnId === null) {
      return c.json({ error: "No snapshots to undo for this conversation" }, 404);
    }

    // An explicit turn id must name a snapshot directory that actually exists.
    try {
      await access(path.join(snapshotRoot, id, turnId));
    } catch {
      return c.json({ error: "No snapshots to undo for this conversation" }, 404);
    }

    const result = await restoreTurnSnapshots(
      { snapshotRoot, conversationId: id, turnId },
      workspaceRoot,
    );
    return c.json({ ok: true, turnId, ...result });
  });

  return router;
}
