import type { ContentPart, Message } from "@openartifact/shared";

/**
 * Context management (§8 "Context management").
 *
 * The loop tracks token usage — an estimate for pending content, refined by
 * provider `usage` when available — and, above 75 % of the context window,
 * compacts history: first by replacing old tool results with short stubs, then
 * (handled by the loop, later) by summarising older turns with the model. The
 * system prompt and the latest user message are never dropped or stubbed.
 */

/** Approximate characters per token used for the pre-flight estimate. */
export const CHARS_PER_TOKEN = 4;

/** Per-message overhead (role framing, separators) added to every estimate. */
export const MESSAGE_OVERHEAD_TOKENS = 4;

/** Fraction of the context window that triggers compaction. */
export const DEFAULT_CONTEXT_WARN_FRACTION = 0.75;

/** Estimate the token count of a single string (conservative char/4 ceiling). */
export function estimateTextTokens(text: string): number {
  if (text.length === 0) return 0;
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/** Estimate the token count of one canonical content part. */
export function estimatePartTokens(part: ContentPart): number {
  switch (part.type) {
    case "text":
      return estimateTextTokens(part.text);
    case "tool_call": {
      const serialized = JSON.stringify(part.args);
      return estimateTextTokens(part.name) + estimateTextTokens(serialized ?? "") + 1;
    }
    case "tool_result":
      return estimateTextTokens(part.content);
  }
}

/** Estimate the token count of one message, including per-message overhead. */
export function estimateMessageTokens(message: Message): number {
  const body = message.parts.reduce((sum, part) => sum + estimatePartTokens(part), 0);
  return body + MESSAGE_OVERHEAD_TOKENS;
}

/** Estimate the token count of a whole history. */
export function estimateMessagesTokens(messages: Message[]): number {
  return messages.reduce((sum, message) => sum + estimateMessageTokens(message), 0);
}

/**
 * Build the stub that replaces an old tool result:
 * `[output of "pnpm test" removed — 412 lines, exit code 1]`. The line count
 * comes from the captured content; exit-code / timeout / signal markers are
 * preserved when the result carries them so the model still knows the outcome.
 */
export function buildToolResultStub(label: string, content: string): string {
  const lines = content === "" ? 0 : content.split("\n").length;
  const exitCode = /\[exit code (\d+)\]/.exec(content);
  const timedOut = /\[command timed out after (\d+) ms\]/.exec(content);
  const signaled = /\[terminated by signal\]/.test(content);

  let stub = `[output of "${label}" removed — ${lines} lines`;
  if (exitCode) stub += `, exit code ${exitCode[1]}`;
  else if (timedOut) stub += `, timed out after ${timedOut[1]} ms`;
  else if (signaled) stub += ", terminated by signal";
  return `${stub}]`;
}

/** A `tool_call` part, as embedded in an assistant message. */
type ToolCallPart = Extract<ContentPart, { type: "tool_call" }>;

/** Find the `tool_call` part with the given id across the whole history. */
function findToolCall(messages: Message[], callId: string): ToolCallPart | undefined {
  for (const message of messages) {
    if (message.role !== "assistant") continue;
    const call = message.parts.find((p): p is ToolCallPart => p.type === "tool_call" && p.id === callId);
    if (call) return call;
  }
  return undefined;
}

/** A human-readable label for a tool call: the command for `execute_command`, else the tool name. */
function toolLabel(call: ToolCallPart): string {
  if (call.name === "execute_command") {
    const args = call.args as { command?: unknown } | null | undefined;
    if (args && typeof args.command === "string" && args.command !== "") {
      return args.command;
    }
  }
  return call.name;
}

/** Index of the latest user message, or -1 when the history has none. */
function latestUserIndex(messages: Message[]): number {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i]!.role === "user") return i;
  }
  return -1;
}

export interface CompactionResult {
  /** The history after compaction (the input array is never mutated). */
  messages: Message[];
  /** How many tool results were replaced with stubs. */
  stubbed: number;
}

/**
 * Replace tool results belonging to turns older than the latest user message
 * with short stubs. The system prompt and the latest user message (and
 * everything in the latest turn) are left untouched.
 */
export function compactToolResults(messages: Message[]): CompactionResult {
  const latestUser = latestUserIndex(messages);
  if (latestUser <= 0) return { messages, stubbed: 0 };

  let stubbed = 0;
  const compacted = messages.map((message, index) => {
    if (message.role !== "tool" || index >= latestUser) return message;
    const parts = message.parts.map((part) => {
      if (part.type !== "tool_result") return part;
      const call = findToolCall(messages, part.callId);
      stubbed += 1;
      return { ...part, content: buildToolResultStub(call ? toolLabel(call) : part.callId, part.content) };
    });
    return { ...message, parts };
  });

  return { messages: compacted, stubbed };
}

export interface ContextManagerOptions {
  /** The provider/model context window in tokens. */
  contextWindow: number;
  /** Fraction of the window that triggers compaction (default 0.75). */
  warnFraction?: number;
  /** Token estimator; defaults to {@link estimateMessagesTokens}. */
  estimate?: (messages: Message[]) => number;
}

/**
 * Tracks context usage against a window and compacts history when it exceeds
 * the warning threshold. Compaction here covers the first stage (stubbing old
 * tool results); the loop layers turn summarisation on top when stubbing is
 * still not enough (see the design notes in the change's design.md).
 */
export class ContextManager {
  readonly #contextWindow: number;
  readonly #warnFraction: number;
  readonly #estimate: (messages: Message[]) => number;

  constructor(options: ContextManagerOptions) {
    this.#contextWindow = options.contextWindow;
    this.#warnFraction = options.warnFraction ?? DEFAULT_CONTEXT_WARN_FRACTION;
    this.#estimate = options.estimate ?? estimateMessagesTokens;
  }

  /** The configured context window in tokens. */
  get contextWindow(): number {
    return this.#contextWindow;
  }

  /** The token count at or above which compaction triggers. */
  threshold(): number {
    return Math.floor(this.#contextWindow * this.#warnFraction);
  }

  /** Estimated token usage for `messages`. */
  estimate(messages: Message[]): number {
    return this.#estimate(messages);
  }

  /** True when the given usage exceeds the warning threshold. */
  isOverThreshold(usage: number): boolean {
    return usage > this.threshold();
  }

  /**
   * Compact `messages` when they exceed the threshold, stubbing old tool
   * results first. Returns the (possibly unchanged) history and how many
   * results were stubbed. The input array is never mutated.
   */
  compact(messages: Message[]): CompactionResult {
    if (!this.isOverThreshold(this.estimate(messages))) {
      return { messages, stubbed: 0 };
    }
    return compactToolResults(messages);
  }
}
