import type { ContentPart, Message, StopReason } from "@openartifact/shared";

import type { ChatRequest, ProviderAdapter } from "../providers/types";
import type { SnapshotLocation } from "../tools/snapshot";
import type { ToolRegistry } from "../tools/registry";
import { truncateResult } from "../tools/truncate";
import type { ToolContext, ToolResult } from "../tools/types";

import {
  applyApprovalDecision,
  DEFAULT_APPROVAL_POLICIES,
  resolveApproval,
  type ApprovalDecision,
  type ApprovalMode,
  type ApprovalPolicies,
} from "./approval";
import { cancelPendingToolCalls } from "./cancellation";
import { ContextManager } from "./context";
import { IdenticalFailureTracker } from "./identical-failure";
import { normalizeAgentLoopLimits, type AgentLoopLimits } from "./limits";
import { AgentStateMachine, type AgentState } from "./state";

/**
 * Agent loop orchestrator (§8).
 *
 * The loop is the first consumer of the provider adapters: it owns the message
 * history, drives the explicit state machine, runs tool calls through the
 * approval flow, enforces the iteration/identical-failure limits, compacts
 * context above 75 % of the window, and keeps history valid on cancellation.
 * It is an async generator of {@link AgentEvent}s so a host (server, CLI or
 * test) can render state, text, approvals and tool results as they happen.
 */

/** The information handed to the host's {@link ApprovalHandler}. */
export interface ApprovalRequest {
  callId: string;
  name: string;
  args: unknown;
  /** Human-readable reason the tool requires approval. */
  reason: string;
}

/**
 * Resolves an approval request to a decision. The host (server, CLI, test)
 * drives this seam; the loop awaits the promise before running the tool.
 */
export type ApprovalHandler = (
  request: ApprovalRequest,
  signal: AbortSignal,
) => Promise<ApprovalDecision> | ApprovalDecision;

/** One completed tool call as reconstructed from the stream. */
export interface ToolCallRecord {
  id: string;
  name: string;
  args: unknown;
}

/** Events the loop yields to its host. */
export type AgentEvent =
  | { type: "state"; state: AgentState }
  | { type: "text"; text: string }
  | { type: "tool_start"; callId: string; name: string; args: unknown }
  | {
      type: "tool_result";
      callId: string;
      name: string;
      content: string;
      isError?: boolean;
    }
  | {
      type: "approval_request";
      callId: string;
      name: string;
      args: unknown;
      reason: string;
    }
  | { type: "approval_decision"; callId: string; name: string; decision: ApprovalDecision }
  | { type: "done"; stopReason: StopReason }
  | { type: "error"; message: string };

export interface AgentLoopOptions {
  provider: ProviderAdapter;
  model: string;
  tools: ToolRegistry;
  /** Absolute, realpath'd workspace root tools operate in. */
  workspaceRoot: string;
  /** Versioned system prompt sent as the first message of every request. */
  systemPrompt: string;
  approvalMode: ApprovalMode;
  approvalHandler: ApprovalHandler;
  /** Provider/model context window in tokens (drives compaction). */
  contextWindow: number;
  /** Whether the provider supports native tool calling (else the fallback protocol applies). */
  nativeTools?: boolean;
  limits?: Partial<AgentLoopLimits>;
  /** Security predicates; defaults to the real secret/sudo rules. */
  policies?: ApprovalPolicies;
  /** Snapshot storage location for pre-mutation snapshots (§8 "Undo"). */
  snapshot?: SnapshotLocation;
  /** Forwards command stdout/stderr chunks to the host as they arrive. */
  onCommandOutput?: (chunk: string, stream: "stdout" | "stderr") => void;
  /** External abort signal (e.g. a server-level shutdown), propagated to the turn. */
  signal?: AbortSignal;
}

/** Result of consuming one provider turn. */
interface StreamTurnResult {
  /** Assistant message parts reconstructed from the stream. */
  assistantParts: ContentPart[];
  /** Completed tool calls, in order of appearance. */
  calls: ToolCallRecord[];
  stopReason: StopReason;
  /** Terminal error message, when the provider failed. */
  error: string | null;
}

/** True when `err` is a DOM-style abort error or a provider abort. */
function isAbortError(err: unknown): boolean {
  return typeof err === "object" && err !== null && "name" in err &&
    (err as { name?: unknown }).name === "AbortError";
}

export class AgentLoop {
  readonly #options: AgentLoopOptions;
  readonly #limits: AgentLoopLimits;
  readonly #state = new AgentStateMachine();
  readonly #identical: IdenticalFailureTracker;
  readonly #context: ContextManager;
  #messages: Message[];
  #controller = new AbortController();
  #msgCounter = 0;
  /** The snapshot turn id for the run in flight (defaults to the configured location's). */
  #turnId: string;

  constructor(options: AgentLoopOptions) {
    this.#options = options;
    this.#limits = normalizeAgentLoopLimits(options.limits);
    this.#identical = new IdenticalFailureTracker(this.#limits.identicalFailureThreshold);
    this.#context = new ContextManager({ contextWindow: options.contextWindow });
    this.#turnId = options.snapshot?.turnId ?? "default";
    this.#messages = [
      {
        id: this.#nextId(),
        role: "system",
        parts: [{ type: "text", text: options.systemPrompt }],
        createdAt: Date.now(),
      },
    ];
  }

  /** The message history, including the system prompt and the latest turn. */
  get messages(): Message[] {
    return this.#messages;
  }

  /** The loop's current state. */
  get state(): AgentState {
    return this.#state.state;
  }

  /** Abort the in-flight turn (provider request and running child processes). */
  cancel(): void {
    this.#controller.abort();
  }

  /**
   * Run one user turn to completion (done, error or cancelled). Appends the
   * user message to the history, then loops: stream → run tools → stream …
   * until the model answers without tool calls or a terminal condition stops
   * the loop. Yields every state change and event for the host to render.
   */
  async *run(
    userText: string,
    options?: { turnId?: string },
  ): AsyncIterable<AgentEvent> {
    const controller = new AbortController();
    this.#controller = controller;
    const signal = controller.signal;

    // Each `run` is one user turn; snapshots for the turn go under its own id.
    this.#turnId = options?.turnId ?? this.#options.snapshot?.turnId ?? "default";

    const external = this.#options.signal;
    const onExternalAbort = (): void => controller.abort();
    if (external) {
      if (external.aborted) controller.abort();
      else external.addEventListener("abort", onExternalAbort, { once: true });
    }

    this.#state.reset();
    this.#identical.reset();

    this.#messages = [
      ...this.#messages,
      {
        id: this.#nextId(),
        role: "user",
        parts: [{ type: "text", text: userText }],
        createdAt: Date.now(),
      },
    ];

    try {
      for (let iteration = 0; iteration < this.#limits.maxIterations; iteration += 1) {
        if (signal.aborted) return yield* this.#finishCancelled();

        const compacted = this.#context.compact(this.#messages);
        if (compacted.stubbed > 0) this.#messages = compacted.messages;

        this.#state.transition("streaming");
        yield { type: "state", state: "streaming" };

        const request: ChatRequest = {
          model: this.#options.model,
          messages: this.#messages,
          ...(this.#options.nativeTools
            ? { tools: this.#options.tools.toDefinitions() }
            : {}),
        };

        const result = yield* this.#streamTurn(request, signal);

        if (result.assistantParts.length > 0) {
          this.#messages = [
            ...this.#messages,
            {
              id: this.#nextId(),
              role: "assistant",
              parts: result.assistantParts,
              createdAt: Date.now(),
            },
          ];
        }

        if (signal.aborted) return yield* this.#finishCancelled();
        if (result.error !== null) return yield* this.#finishError(result.error);

        if (result.calls.length === 0) {
          this.#state.transition("done");
          yield { type: "state", state: "done" };
          yield { type: "done", stopReason: result.stopReason };
          return;
        }

        for (const call of result.calls) {
          if (signal.aborted) return yield* this.#finishCancelled();

          const toolResult: ToolResult = yield* this.#runOneTool(call, signal);

          this.#messages = [
            ...this.#messages,
            {
              id: this.#nextId(),
              role: "tool",
              parts: [
                {
                  type: "tool_result",
                  callId: call.id,
                  content: toolResult.content,
                  isError: toolResult.isError,
                },
              ],
              createdAt: Date.now(),
            },
          ];

          yield {
            type: "tool_result",
            callId: call.id,
            name: call.name,
            content: toolResult.content,
            isError: toolResult.isError,
          };

          if (toolResult.isError) {
            if (this.#identical.record(call.name, call.args, true)) {
              return yield* this.#finishError(
                `Tool "${call.name}" failed ${this.#limits.identicalFailureThreshold} times with identical arguments`,
              );
            }
          } else {
            this.#identical.record(call.name, call.args, false);
          }
        }
      }

      // The iteration cap was reached without a final answer.
      return yield* this.#finishError(
        `Stopped after ${this.#limits.maxIterations} model iterations without a final answer`,
      );
    } finally {
      if (external) external.removeEventListener("abort", onExternalAbort);
    }
  }

  /** Consume one provider turn, yielding text and returning the reconstructed parts. */
  async *#streamTurn(
    request: ChatRequest,
    signal: AbortSignal,
  ): AsyncGenerator<AgentEvent, StreamTurnResult, void> {
    const calls: ToolCallRecord[] = [];
    const callNames = new Map<string, string>();
    let text = "";
    let stopReason: StopReason = "end_turn";
    let error: string | null = null;

    try {
      for await (const event of this.#options.provider.stream(request, signal)) {
        if (signal.aborted) break;
        switch (event.type) {
          case "text_delta":
            text += event.text;
            yield { type: "text", text: event.text };
            break;
          case "tool_call_start":
            callNames.set(event.id, event.name);
            break;
          case "tool_call_delta":
            break;
          case "tool_call_end":
            calls.push({
              id: event.id,
              name: callNames.get(event.id) ?? "unknown",
              args: event.args,
            });
            break;
          case "done":
            stopReason = event.stopReason;
            break;
          case "error":
            error = event.message;
            break;
          case "usage":
            break;
        }
        if (error !== null) break;
      }
    } catch (err) {
      if (!signal.aborted && !isAbortError(err)) {
        error = err instanceof Error ? err.message : String(err);
      }
    }

    const assistantParts: ContentPart[] = [];
    if (text !== "") assistantParts.push({ type: "text", text });
    for (const call of calls) {
      assistantParts.push({ type: "tool_call", id: call.id, name: call.name, args: call.args });
    }

    return { assistantParts, calls, stopReason, error };
  }

  /** Resolve approval (if any), run one tool, and yield the resulting events. */
  async *#runOneTool(
    call: ToolCallRecord,
    signal: AbortSignal,
  ): AsyncGenerator<AgentEvent, ToolResult, void> {
    // After a previous tool the state is executing_tool/awaiting_approval;
    // return to streaming so the next tool's transitions are legal.
    const current = this.#state.state;
    if (current === "executing_tool" || current === "awaiting_approval") {
      this.#state.transition("streaming");
      yield { type: "state", state: "streaming" };
    }

    const tool = this.#options.tools.get(call.name);
    if (!tool) {
      return { content: `Unknown tool: ${call.name}`, isError: true };
    }

    const policies = this.#options.policies ?? DEFAULT_APPROVAL_POLICIES;
    const resolution = resolveApproval(
      { name: call.name, approval: tool.approval },
      call.args,
      this.#options.approvalMode,
      policies,
    );

    let finalArgs = call.args;
    if (resolution.needsApproval) {
      this.#state.transition("awaiting_approval");
      yield { type: "state", state: "awaiting_approval" };
      yield {
        type: "approval_request",
        callId: call.id,
        name: call.name,
        args: call.args,
        reason: resolution.reason,
      };

      let decision: ApprovalDecision;
      try {
        decision = await this.#options.approvalHandler(
          { callId: call.id, name: call.name, args: call.args, reason: resolution.reason },
          signal,
        );
      } catch (err) {
        if (signal.aborted || isAbortError(err)) {
          return { content: "cancelled by user", isError: true };
        }
        return {
          content: `Approval handler failed: ${err instanceof Error ? err.message : String(err)}`,
          isError: true,
        };
      }

      yield { type: "approval_decision", callId: call.id, name: call.name, decision };

      const outcome = applyApprovalDecision(decision, call.args);
      if (!outcome.run) return outcome.toolResult;
      finalArgs = outcome.args;
    }

    this.#state.transition("executing_tool");
    yield { type: "state", state: "executing_tool" };
    yield { type: "tool_start", callId: call.id, name: call.name, args: finalArgs };

    const ctx: ToolContext = {
      workspaceRoot: this.#options.workspaceRoot,
      signal,
      timeoutMs: this.#limits.commandTimeoutMs,
      ...(this.#options.onCommandOutput ? { onOutput: this.#options.onCommandOutput } : {}),
      ...(this.#options.snapshot
        ? {
            snapshotRoot: this.#options.snapshot.snapshotRoot,
            conversationId: this.#options.snapshot.conversationId,
            turnId: this.#turnId,
          }
        : {}),
    };

    let result: ToolResult;
    try {
      result = await tool.execute(finalArgs, ctx);
    } catch (err) {
      result = { content: err instanceof Error ? err.message : String(err), isError: true };
    }

    return truncateResult(result, this.#limits.toolResultCap);
  }

  async *#finishCancelled(): AsyncGenerator<AgentEvent, void, void> {
    this.#messages = cancelPendingToolCalls(this.#messages);
    this.#state.transition("cancelled");
    yield { type: "state", state: "cancelled" };
    yield { type: "done", stopReason: "cancelled" };
  }

  async *#finishError(message: string): AsyncGenerator<AgentEvent, void, void> {
    this.#messages = cancelPendingToolCalls(this.#messages);
    this.#state.transition("error");
    yield { type: "state", state: "error" };
    yield { type: "error", message };
  }

  #nextId(): string {
    this.#msgCounter += 1;
    return `msg-${this.#msgCounter}-${Date.now()}`;
  }
}
