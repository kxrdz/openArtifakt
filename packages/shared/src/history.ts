import { z } from "zod";

import { approvalDecisionSchema } from "./chat";
import { messageSchema } from "./messages";

/**
 * History wire types (§12.8, "Persistence").
 *
 * The persisted history the server exposes to the web client: a list of
 * conversation summaries plus, for one conversation, its messages (canonical
 * {@link Message} format), its artifacts with every version, and its tool-call
 * log (including each call's approval decision). The web client restores a
 * conversation from exactly this shape.
 */

/** A conversation as it appears in the conversation list. */
export const conversationSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  createdAt: z.number(),
});
export type ConversationSummary = z.infer<typeof conversationSummarySchema>;

/** One stored version of an artifact's content (append-only, never mutated). */
export const historyArtifactVersionSchema = z.object({
  /** 1-based version number, stable for the life of the artifact. */
  version: z.number().int().positive(),
  content: z.string(),
  /** True while this version was still streaming when persisted. */
  incomplete: z.boolean(),
  createdAt: z.number(),
});
export type HistoryArtifactVersion = z.infer<typeof historyArtifactVersionSchema>;

/** A persisted artifact with its full version list (never just the latest). */
export const historyArtifactSchema = z.object({
  identifier: z.string(),
  title: z.string(),
  /** Declared MIME type, e.g. `application/vnd.react`; preserved verbatim. */
  type: z.string(),
  language: z.string().nullable(),
  createdAt: z.number(),
  versions: z.array(historyArtifactVersionSchema),
});
export type HistoryArtifact = z.infer<typeof historyArtifactSchema>;

/** One persisted tool-call record, with its (optional) approval decision. */
export const historyToolCallSchema = z.object({
  callId: z.string(),
  /** Per-conversation order the calls were started. */
  seq: z.number().int(),
  name: z.string(),
  args: z.unknown(),
  result: z.string().nullable(),
  isError: z.boolean(),
  decision: approvalDecisionSchema.nullable(),
  createdAt: z.number(),
});
export type HistoryToolCall = z.infer<typeof historyToolCallSchema>;

/** A conversation's full persisted history, returned by `GET /api/conversations/:id`. */
export const conversationHistorySchema = z.object({
  conversation: conversationSummarySchema,
  messages: z.array(messageSchema),
  artifacts: z.array(historyArtifactSchema),
  toolCalls: z.array(historyToolCallSchema),
});
export type ConversationHistory = z.infer<typeof conversationHistorySchema>;

/**
 * The result of `POST /api/conversations/:id/undo` (§8 "Undo this turn").
 * Reports the turn undone and the workspace-relative paths it restored (from
 * `.before` snapshots) and deleted (files the turn created).
 */
export const undoResponseSchema = z.object({
  ok: z.literal(true),
  turnId: z.string(),
  restored: z.array(z.string()),
  deleted: z.array(z.string()),
});
export type UndoResponse = z.infer<typeof undoResponseSchema>;

/** Parse and validate an unknown value as an {@link UndoResponse}. Throws on failure. */
export function parseUndoResponse(value: unknown): UndoResponse {
  return undoResponseSchema.parse(value);
}

/** Parse and validate an unknown value as a {@link ConversationSummary}. Throws on failure. */
export function parseConversationSummary(value: unknown): ConversationSummary {
  return conversationSummarySchema.parse(value);
}

/** Type guard for {@link ConversationSummary}. */
export function isConversationSummary(value: unknown): value is ConversationSummary {
  return conversationSummarySchema.safeParse(value).success;
}

/** Parse and validate an unknown value as a {@link ConversationHistory}. Throws on failure. */
export function parseConversationHistory(value: unknown): ConversationHistory {
  return conversationHistorySchema.parse(value);
}

/** Type guard for {@link ConversationHistory}. */
export function isConversationHistory(value: unknown): value is ConversationHistory {
  return conversationHistorySchema.safeParse(value).success;
}
