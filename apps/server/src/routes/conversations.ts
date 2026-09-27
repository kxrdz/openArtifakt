import { Hono } from "hono";

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
}

export function createConversationsRouter(options: ConversationsRoutesOptions): Hono {
  const { repository } = options;
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

  return router;
}
