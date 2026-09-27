import type { StreamEvent, StopReason } from "@openartifact/shared";

import type { ChatRequest, ProviderAdapter } from "../src/providers/types";

/**
 * Test-only scripted provider (§12.4 acceptance test). It is deliberately not
 * exported from the package index: it exists so the agent-loop integration
 * test can drive read → edit → execute → answer deterministically without any
 * network. Each {@link stream} call consumes one scripted turn (in order) and
 * emits the same canonical {@link StreamEvent} union a real adapter emits, so
 * the loop cannot tell the difference.
 */

/** One tool call the scripted provider will emit in a turn. */
export interface ScriptedToolCall {
  id: string;
  name: string;
  args: unknown;
}

/** One scripted model turn. */
export interface ScriptedTurn {
  /** Plain text to stream as `text_delta` events (before any tool calls). */
  text?: string;
  /** Tool calls to emit as `tool_call_start`/`tool_call_delta`/`tool_call_end`. */
  toolCalls?: ScriptedToolCall[];
  /** Stop reason (default: `tool_use` when there are tool calls, else `end_turn`). */
  stopReason?: StopReason;
  /** Assertion hook run against the incoming request before emitting. */
  inspect?: (req: ChatRequest) => void;
}

/** Convenience for a text-only final turn. */
export function finalAnswer(text: string): ScriptedTurn {
  return { text, stopReason: "end_turn" };
}

/** Convenience for a turn that issues a single tool call. */
export function toolCallTurn(id: string, name: string, args: unknown): ScriptedTurn {
  return { toolCalls: [{ id, name, args }] };
}

/** A scripted {@link ProviderAdapter} that replays turns in order. */
export class FakeProvider implements ProviderAdapter {
  readonly id = "fake";

  readonly #turns: ScriptedTurn[];
  #index = 0;

  constructor(turns: ScriptedTurn[]) {
    this.#turns = turns;
  }

  /** How many `stream` calls have been served so far. */
  get turnsServed(): number {
    return this.#index;
  }

  async *stream(req: ChatRequest, signal: AbortSignal): AsyncIterable<StreamEvent> {
    if (signal.aborted) {
      yield { type: "done", stopReason: "cancelled" };
      return;
    }

    const turn = this.#turns[this.#index] ?? finalAnswer("");
    this.#index += 1;
    turn.inspect?.(req);

    if (turn.text) {
      yield { type: "text_delta", text: turn.text };
    }

    const calls = turn.toolCalls ?? [];
    for (const call of calls) {
      yield { type: "tool_call_start", id: call.id, name: call.name };

      const json = JSON.stringify(call.args);
      if (json.length > 0) {
        // Split the args into two deltas to exercise accumulation in the loop.
        const half = Math.floor(json.length / 2);
        if (half > 0) yield { type: "tool_call_delta", id: call.id, argsDelta: json.slice(0, half) };
        yield { type: "tool_call_delta", id: call.id, argsDelta: json.slice(half) };
      }

      yield { type: "tool_call_end", id: call.id, args: call.args };
    }

    const stopReason =
      turn.stopReason ?? (calls.length > 0 ? "tool_use" : "end_turn");
    yield { type: "done", stopReason };
  }
}
