import { z } from "zod";

import { stopReasonSchema } from "./events";

/**
 * Wire types shared by the chat server and the web client (§12.6).
 *
 * The chat server streams one {@link ChatEvent} per SSE frame — the agent
 * loop's own events (`state`, `text`, `tool_start`, `tool_result`,
 * `approval_request`, `approval_decision`, `done`, `error`) plus the transport
 * frames `conversation` (opening) and `command_output` (streamed stdout/stderr).
 * The web client parses exactly this union, so the two sides share one contract
 * without the browser importing `packages/core`.
 */

/** The agent loop's state machine (§8 "States"); mirrors `core`'s `AgentState`. */
export const agentStateSchema = z.enum([
  "idle",
  "streaming",
  "awaiting_approval",
  "executing_tool",
  "done",
  "error",
  "cancelled",
]);
export type AgentState = z.infer<typeof agentStateSchema>;

/** Type guard for {@link AgentState}. */
export function isAgentState(value: unknown): value is AgentState {
  return agentStateSchema.safeParse(value).success;
}

/**
 * A user's decision on an approval request (§8). Mirrors `core`'s
 * `ApprovalDecision`: approve runs the tool as-is, edit-command replaces the
 * command argument (for `execute_command`), reject does not run the tool and
 * returns the note to the model instead.
 */
export const approvalDecisionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("approve") }),
  z.object({ kind: z.literal("edit-command"), command: z.string().min(1) }),
  z.object({ kind: z.literal("reject"), note: z.string() }),
]);
export type ApprovalDecision = z.infer<typeof approvalDecisionSchema>;

/** Parse and validate an unknown value as an {@link ApprovalDecision}. Throws on failure. */
export function parseApprovalDecision(value: unknown): ApprovalDecision {
  return approvalDecisionSchema.parse(value);
}

/** Type guard for {@link ApprovalDecision}. */
export function isApprovalDecision(value: unknown): value is ApprovalDecision {
  return approvalDecisionSchema.safeParse(value).success;
}

/** Opening frame: identifies the conversation being streamed. */
export const conversationEventSchema = z.object({
  type: z.literal("conversation"),
  conversationId: z.string(),
});
export type ConversationEvent = z.infer<typeof conversationEventSchema>;

/** The agent loop moved to a new state. */
export const stateEventSchema = z.object({
  type: z.literal("state"),
  state: agentStateSchema,
});
export type StateEvent = z.infer<typeof stateEventSchema>;

/** A text delta the client appends to the in-progress assistant message. */
export const textEventSchema = z.object({
  type: z.literal("text"),
  text: z.string(),
});
export type TextEvent = z.infer<typeof textEventSchema>;

/** A tool call started (the loop resolved its arguments). */
export const toolStartEventSchema = z.object({
  type: z.literal("tool_start"),
  callId: z.string(),
  name: z.string(),
  args: z.unknown(),
});
export type ToolStartEvent = z.infer<typeof toolStartEventSchema>;

/** A tool call completed, with its (possibly truncated) result. */
export const toolResultEventSchema = z.object({
  type: z.literal("tool_result"),
  callId: z.string(),
  name: z.string(),
  content: z.string(),
  isError: z.boolean().optional(),
});
export type ToolResultEvent = z.infer<typeof toolResultEventSchema>;

/** A tool call paused for the user's approval. */
export const approvalRequestEventSchema = z.object({
  type: z.literal("approval_request"),
  callId: z.string(),
  name: z.string(),
  args: z.unknown(),
  reason: z.string(),
});
export type ApprovalRequestEvent = z.infer<typeof approvalRequestEventSchema>;

/** The decision the user submitted for a pending approval. */
export const approvalDecisionEventSchema = z.object({
  type: z.literal("approval_decision"),
  callId: z.string(),
  name: z.string(),
  decision: approvalDecisionSchema,
});
export type ApprovalDecisionEvent = z.infer<typeof approvalDecisionEventSchema>;

/** A chunk of a running command's stdout/stderr, forwarded as it arrives. */
export const commandOutputEventSchema = z.object({
  type: z.literal("command_output"),
  stream: z.enum(["stdout", "stderr"]),
  text: z.string(),
});
export type CommandOutputEvent = z.infer<typeof commandOutputEventSchema>;

/** The turn ended normally, by a tool request, on a limit, or by Stop. */
export const chatDoneEventSchema = z.object({
  type: z.literal("done"),
  stopReason: stopReasonSchema,
});
export type ChatDoneEvent = z.infer<typeof chatDoneEventSchema>;

/** The turn failed; `message` describes what happened. */
export const chatErrorEventSchema = z.object({
  type: z.literal("error"),
  message: z.string(),
});
export type ChatErrorEvent = z.infer<typeof chatErrorEventSchema>;

/** The union of every event the chat server streams to the client. */
export const chatEventSchema = z.discriminatedUnion("type", [
  conversationEventSchema,
  stateEventSchema,
  textEventSchema,
  toolStartEventSchema,
  toolResultEventSchema,
  approvalRequestEventSchema,
  approvalDecisionEventSchema,
  commandOutputEventSchema,
  chatDoneEventSchema,
  chatErrorEventSchema,
]);
export type ChatEvent = z.infer<typeof chatEventSchema>;

/** Parse and validate an unknown value as a {@link ChatEvent}. Throws on failure. */
export function parseChatEvent(value: unknown): ChatEvent {
  return chatEventSchema.parse(value);
}

/** Type guard for {@link ChatEvent}. */
export function isChatEvent(value: unknown): value is ChatEvent {
  return chatEventSchema.safeParse(value).success;
}
