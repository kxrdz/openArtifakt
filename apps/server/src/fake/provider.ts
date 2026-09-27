import type { ChatRequest, ProviderAdapter } from "@openartifact/core";
import type { StopReason, StreamEvent } from "@openartifact/shared";

import { FAKE_ARTIFACTS_TEXT } from "./artifacts";
import { FAKE_COMMAND_ARGS, FAKE_EDIT_ARGS } from "./fixture";

/**
 * Server-side scripted provider (§12.6, "Fake provider mode").
 *
 * This is the `OPENARTIFACT_FAKE_PROVIDER=1` adapter: a {@link ProviderAdapter}
 * that replays a fixed fixture conversation on the same canonical
 * {@link StreamEvent} vocabulary a real adapter emits, so the loop cannot tell
 * the difference. It deliberately shares shape — but not code — with
 * `packages/core/test/fake-provider.ts` (which lives in test-land and streams
 * instantly); this one lives in the server and can stream slowly so the Stop
 * control has a real in-flight turn to interrupt.
 */

/** One tool call a scripted turn emits. */
export interface ScriptedToolCall {
  id: string;
  name: string;
  args: unknown;
}

/** One scripted model turn, consumed by a single {@link stream} call. */
export interface ScriptedTurn {
  /** Text streamed as `text_delta` events before any tool calls. */
  text?: string;
  /** Split `text` into multiple deltas (true: chunked; false: one delta). */
  splitText?: boolean;
  /** Character size of each chunk when {@link ScriptedTurn.splitText} is true. */
  chunkSize?: number;
  /** Tool calls emitted after the text, in order. */
  toolCalls?: ScriptedToolCall[];
  /** Stop reason (default: `tool_use` with tool calls, else `end_turn`). */
  stopReason?: StopReason;
  /** Delay (ms) between events; overrides the provider-wide default. */
  delayMs?: number;
}

/** Options for {@link FakeServerProvider}. */
export interface FakeServerProviderOptions {
  /** Default delay (ms) between events for turns without their own `delayMs`. */
  delayMs?: number;
  /** Turns to replay in order; defaults to {@link FAKE_FIXTURE_TURNS}. */
  turns?: ScriptedTurn[];
}

/** Chunk size for split text when a turn does not specify one. */
const DEFAULT_CHUNK_SIZE = 6;

/** The empty turn served once the fixture is exhausted (matches the core fake). */
const EMPTY_TURN: ScriptedTurn = { stopReason: "end_turn" };

/** Text streamed before the scripted `edit_file` call. */
export const FAKE_INTRO_TEXT =
  "I'll update the notes file, then verify it with a command.";

/** The scripted final answer. */
export const FAKE_FINAL_TEXT =
  "Done — notes.txt now says hello, world and the command confirmed it.";

/** Text of the slow-streaming turn that gives the Stop control something to cancel. */
export const FAKE_STOP_TEXT =
  "This turn streams slowly so the Stop control can interrupt it mid-stream.";

/**
 * The fixed fixture conversation. Each {@link stream} call consumes the next
 * turn in order:
 *
 * 1. streaming intro → `edit_file` (needs approval) → `tool_use`
 * 2. streaming bridge → `execute_command` (needs approval) → `tool_use`
 * 3. final answer → `end_turn`
 * 4. slow-streaming text → `end_turn` (for the Stop test)
 * 5. one `<artifact>` block per type + a valid and an invalid ```mermaid fence →
 *    `end_turn` (for the artifact renderers e2e)
 */
export const FAKE_FIXTURE_TURNS: ScriptedTurn[] = [
  {
    text: FAKE_INTRO_TEXT,
    splitText: true,
    toolCalls: [{ id: "fake-edit", name: "edit_file", args: FAKE_EDIT_ARGS }],
  },
  {
    text: "Now I'll verify the edit.",
    splitText: true,
    toolCalls: [{ id: "fake-cmd", name: "execute_command", args: FAKE_COMMAND_ARGS }],
  },
  {
    text: FAKE_FINAL_TEXT,
    splitText: true,
    stopReason: "end_turn",
  },
  {
    text: FAKE_STOP_TEXT,
    splitText: true,
    chunkSize: 4,
    delayMs: 50,
    stopReason: "end_turn",
  },
  {
    text: FAKE_ARTIFACTS_TEXT,
    splitText: true,
    stopReason: "end_turn",
  },
];

/** Resolve after `ms`, or immediately when the turn is aborted. */
function sleep(ms: number, signal: AbortSignal): Promise<void> {
  if (ms <= 0 || signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
  });
}

/** Split `text` into fixed-size chunks for streaming. */
function* chunkText(text: string, size: number): Generator<string> {
  for (let i = 0; i < text.length; i += size) {
    yield text.slice(i, i + size);
  }
}

/** A scripted {@link ProviderAdapter} that replays turns in order. */
export class FakeServerProvider implements ProviderAdapter {
  readonly id = "fake";

  readonly #turns: ScriptedTurn[];
  readonly #delayMs: number;
  #index = 0;

  constructor(options: FakeServerProviderOptions = {}) {
    this.#turns = options.turns ?? FAKE_FIXTURE_TURNS;
    this.#delayMs = options.delayMs ?? 0;
  }

  /** How many `stream` calls have been served so far. */
  get turnsServed(): number {
    return this.#index;
  }

  async *stream(_request: ChatRequest, signal: AbortSignal): AsyncIterable<StreamEvent> {
    if (signal.aborted) {
      yield { type: "done", stopReason: "cancelled" };
      return;
    }

    const turn = this.#turns[this.#index] ?? EMPTY_TURN;
    this.#index += 1;

    const delayMs = turn.delayMs ?? this.#delayMs;

    const text = turn.text ?? "";
    if (text !== "") {
      const chunks = turn.splitText
        ? chunkText(text, turn.chunkSize ?? DEFAULT_CHUNK_SIZE)
        : [text];
      for (const chunk of chunks) {
        if (signal.aborted) {
          yield { type: "done", stopReason: "cancelled" };
          return;
        }
        yield { type: "text_delta", text: chunk };
        await sleep(delayMs, signal);
      }
    }

    for (const call of turn.toolCalls ?? []) {
      if (signal.aborted) {
        yield { type: "done", stopReason: "cancelled" };
        return;
      }
      yield { type: "tool_call_start", id: call.id, name: call.name };
      await sleep(delayMs, signal);

      // Split the args into two deltas to exercise accumulation in the loop.
      const json = JSON.stringify(call.args);
      if (json.length > 0) {
        const half = Math.floor(json.length / 2);
        if (half > 0) yield { type: "tool_call_delta", id: call.id, argsDelta: json.slice(0, half) };
        yield { type: "tool_call_delta", id: call.id, argsDelta: json.slice(half) };
        await sleep(delayMs, signal);
      }

      if (signal.aborted) {
        yield { type: "done", stopReason: "cancelled" };
        return;
      }
      yield { type: "tool_call_end", id: call.id, args: call.args };
    }

    const stopReason =
      turn.stopReason ?? ((turn.toolCalls?.length ?? 0) > 0 ? "tool_use" : "end_turn");
    yield { type: "done", stopReason };
  }
}
