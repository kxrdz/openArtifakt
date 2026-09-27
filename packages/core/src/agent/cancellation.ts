import type { ContentPart, Message } from "@openartifact/shared";

/**
 * Cancellation (§8 "Cancellation").
 *
 * A cancelled turn must still leave a valid history: every `tool_call` needs a
 * matching `tool_result` or providers reject the next request. When the user
 * stops mid-turn, the loop calls {@link cancelPendingToolCalls} to append
 * `"cancelled by user"` results for any tool call that never ran, so the
 * history stays provider-valid without inventing success.
 */

/** The content of a tool result the loop writes for a call cancelled by the user. */
export const CANCELLED_TOOL_RESULT = "cancelled by user";

export interface CancellationOptions {
  /** `createdAt` for the synthetic tool message (defaults to `Date.now()`). */
  now?: number;
  /** `id` for the synthetic tool message (defaults to `cancelled-<now>`). */
  messageId?: string;
}

/**
 * The ids of `tool_call` parts that have no matching `tool_result` anywhere in
 * the history, in first-appearance order. A valid history has none.
 */
export function pendingToolCallIds(messages: Message[]): string[] {
  const answered = new Set<string>();
  for (const message of messages) {
    for (const part of message.parts) {
      if (part.type === "tool_result") answered.add(part.callId);
    }
  }

  const pending: string[] = [];
  const seen = new Set<string>();
  for (const message of messages) {
    if (message.role !== "assistant") continue;
    for (const part of message.parts) {
      if (part.type === "tool_call" && !answered.has(part.id) && !seen.has(part.id)) {
        seen.add(part.id);
        pending.push(part.id);
      }
    }
  }
  return pending;
}

/**
 * Return the history with every unanswered `tool_call` closed by a
 * `"cancelled by user"` tool result (in one appended `tool` message). The
 * input array is never mutated; when nothing is pending, the input is returned
 * unchanged.
 */
export function cancelPendingToolCalls(
  messages: Message[],
  options: CancellationOptions = {},
): Message[] {
  const pending = pendingToolCallIds(messages);
  if (pending.length === 0) return messages;

  const now = options.now ?? Date.now();
  const parts: ContentPart[] = pending.map((callId) => ({
    type: "tool_result" as const,
    callId,
    content: CANCELLED_TOOL_RESULT,
    isError: true,
  }));

  const toolMessage: Message = {
    id: options.messageId ?? `cancelled-${now}`,
    role: "tool",
    parts,
    createdAt: now,
  };

  return [...messages, toolMessage];
}
