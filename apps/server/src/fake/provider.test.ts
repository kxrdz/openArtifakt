import type { StreamEvent } from "@openartifact/shared";
import { describe, expect, it } from "vitest";

import { FAKE_COMMAND_ARGS, FAKE_EDIT_ARGS } from "./fixture";
import {
  FAKE_FINAL_TEXT,
  FAKE_FIXTURE_TURNS,
  FAKE_INTRO_TEXT,
  FAKE_STOP_TEXT,
  FakeServerProvider,
} from "./provider";

/** Collect the first `turns` scripted turns as event sequences. */
async function collect(
  provider: FakeServerProvider,
  turns: number,
): Promise<StreamEvent[][]> {
  const out: StreamEvent[][] = [];
  for (let i = 0; i < turns; i += 1) {
    const events: StreamEvent[] = [];
    for await (const event of provider.stream(
      { model: "fake", messages: [] },
      new AbortController().signal,
    )) {
      events.push(event);
    }
    out.push(events);
  }
  return out;
}

function textDeltas(turn: StreamEvent[]): Extract<StreamEvent, { type: "text_delta" }>[] {
  return turn.filter(
    (e): e is Extract<StreamEvent, { type: "text_delta" }> => e.type === "text_delta",
  );
}

function textOf(turn: StreamEvent[]): string {
  return textDeltas(turn).map((e) => e.text).join("");
}

function toolArgs(turn: StreamEvent[]): unknown[] {
  return turn
    .filter((e): e is Extract<StreamEvent, { type: "tool_call_end" }> => e.type === "tool_call_end")
    .map((e) => e.args);
}

describe("FakeServerProvider", () => {
  it("replays the fixed fixture conversation in order, deterministically", async () => {
    const first = await collect(new FakeServerProvider(), FAKE_FIXTURE_TURNS.length);
    const second = await collect(new FakeServerProvider(), FAKE_FIXTURE_TURNS.length);
    expect(second).toEqual(first);

    expect(first).toHaveLength(4);

    // Tool calls appear in the scripted order across the turns.
    const started = first.flatMap((turn) =>
      turn.filter(
        (e): e is Extract<StreamEvent, { type: "tool_call_start" }> =>
          e.type === "tool_call_start",
      ),
    );
    expect(started.map((c) => c.name)).toEqual(["edit_file", "execute_command"]);

    // Turn 1: intro text, then the edit call (which asks for approval in ask mode).
    expect(textOf(first[0]!)).toBe(FAKE_INTRO_TEXT);
    expect(toolArgs(first[0]!)).toEqual([FAKE_EDIT_ARGS]);
    expect(first[0]!.at(-1)).toMatchObject({ type: "done", stopReason: "tool_use" });

    // Turn 2: bridge text, then the command call.
    expect(toolArgs(first[1]!)).toEqual([FAKE_COMMAND_ARGS]);
    expect(first[1]!.at(-1)).toMatchObject({ type: "done", stopReason: "tool_use" });

    // Turn 3: the final answer ends the turn.
    expect(textOf(first[2]!)).toBe(FAKE_FINAL_TEXT);
    expect(first[2]!.at(-1)).toMatchObject({ type: "done", stopReason: "end_turn" });

    // Turn 4: the slow-streaming turn for Stop.
    expect(textOf(first[3]!)).toBe(FAKE_STOP_TEXT);
    expect(first[3]!.at(-1)).toMatchObject({ type: "done", stopReason: "end_turn" });
  });

  it("yields streamed text in multiple deltas", async () => {
    const provider = new FakeServerProvider();
    const [intro] = await collect(provider, 1);
    const deltas = textDeltas(intro!);
    expect(deltas.length).toBeGreaterThan(1);
    expect(deltas.map((d) => d.text).join("")).toBe(FAKE_INTRO_TEXT);

    const remaining = await collect(provider, FAKE_FIXTURE_TURNS.length - 1);
    const slowDeltas = textDeltas(remaining[2]!);
    expect(slowDeltas.length).toBeGreaterThan(1);
    expect(slowDeltas.map((d) => d.text).join("")).toBe(FAKE_STOP_TEXT);
  });

  it("serves an empty end-of-turn once the fixture is exhausted", async () => {
    const provider = new FakeServerProvider();
    await collect(provider, FAKE_FIXTURE_TURNS.length);
    const [extra] = await collect(provider, 1);
    expect(extra).toEqual([{ type: "done", stopReason: "end_turn" }]);
  });
});
