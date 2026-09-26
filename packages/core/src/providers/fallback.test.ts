import { describe, expect, it } from "vitest";

import type { StreamEvent } from "@openartifact/shared";

import { withFallbackTools } from "./fallback";

async function collect(iterable: AsyncIterable<StreamEvent>): Promise<StreamEvent[]> {
  const events: StreamEvent[] = [];
  for await (const event of iterable) events.push(event);
  return events;
}

async function* fromEvents(...events: StreamEvent[]): AsyncIterable<StreamEvent> {
  yield* events;
}

const done: StreamEvent = { type: "done", stopReason: "end_turn" };

/** Feed `text` one character per `text_delta` to exercise split-tag handling. */
function splitText(text: string): StreamEvent[] {
  return Array.from(text, (char) => ({ type: "text_delta", text: char }));
}

describe("withFallbackTools", () => {
  it("passes plain text through unchanged", async () => {
    const source = fromEvents(
      { type: "text_delta", text: "Hello, " },
      { type: "text_delta", text: "world." },
      done,
    );

    expect(await collect(withFallbackTools(source))).toEqual([
      { type: "text_delta", text: "Hello, " },
      { type: "text_delta", text: "world." },
      done,
    ]);
  });

  it("extracts a single fallback tool call into native-equivalent events", async () => {
    const source = fromEvents(
      {
        type: "text_delta",
        text: 'Let me check:\n<tool_call name="read_file">{"path":"src/index.ts"}</tool_call>\nDone.',
      },
      done,
    );

    expect(await collect(withFallbackTools(source))).toEqual([
      { type: "text_delta", text: "Let me check:\n" },
      { type: "tool_call_start", id: "call_0", name: "read_file" },
      { type: "tool_call_delta", id: "call_0", argsDelta: '{"path":"src/index.ts"}' },
      { type: "tool_call_end", id: "call_0", args: { path: "src/index.ts" } },
      { type: "text_delta", text: "\nDone." },
      done,
    ]);
  });

  it("keeps a malformed-JSON tool call block as literal text", async () => {
    const source = fromEvents(
      { type: "text_delta", text: '<tool_call name="read_file">not json</tool_call>' },
      done,
    );

    expect(await collect(withFallbackTools(source))).toEqual([
      { type: "text_delta", text: '<tool_call name="read_file">not json</tool_call>' },
      done,
    ]);
  });

  it("keeps a non-object tool-call body as literal text", async () => {
    const source = fromEvents(
      { type: "text_delta", text: '<tool_call name="read_file">[1, 2, 3]</tool_call>' },
      done,
    );

    expect(await collect(withFallbackTools(source))).toEqual([
      { type: "text_delta", text: '<tool_call name="read_file">[1, 2, 3]</tool_call>' },
      done,
    ]);
  });

  it("keeps an unclosed tool call as literal text at the end of the stream", async () => {
    const source = fromEvents(
      { type: "text_delta", text: 'before <tool_call name="read_file">{"path":"x"' },
      done,
    );

    expect(await collect(withFallbackTools(source))).toEqual([
      { type: "text_delta", text: "before " },
      { type: "text_delta", text: '<tool_call name="read_file">{"path":"x"' },
      done,
    ]);
  });

  it("extracts a tool call split across many single-character deltas", async () => {
    const text = '<tool_call name="read_file">{"path":"src/a.ts"}</tool_call>';
    const source = fromEvents(...splitText(text), done);

    expect(await collect(withFallbackTools(source))).toEqual([
      { type: "tool_call_start", id: "call_0", name: "read_file" },
      { type: "tool_call_delta", id: "call_0", argsDelta: '{"path":"src/a.ts"}' },
      { type: "tool_call_end", id: "call_0", args: { path: "src/a.ts" } },
      done,
    ]);
  });

  it("assigns distinct ids to multiple fallback calls", async () => {
    const source = fromEvents(
      {
        type: "text_delta",
        text: '<tool_call name="read_file">{"path":"a"}</tool_call>\n<tool_call name="write_file">{"path":"b"}</tool_call>',
      },
      done,
    );

    expect(await collect(withFallbackTools(source))).toEqual([
      { type: "tool_call_start", id: "call_0", name: "read_file" },
      { type: "tool_call_delta", id: "call_0", argsDelta: '{"path":"a"}' },
      { type: "tool_call_end", id: "call_0", args: { path: "a" } },
      { type: "text_delta", text: "\n" },
      { type: "tool_call_start", id: "call_1", name: "write_file" },
      { type: "tool_call_delta", id: "call_1", argsDelta: '{"path":"b"}' },
      { type: "tool_call_end", id: "call_1", args: { path: "b" } },
      done,
    ]);
  });

  it("round-trips artifact and mermaid content as literal text", async () => {
    const input = [
      "Here is a diagram:\n",
      "```mermaid\n",
      "graph TD; A-->B;\n",
      "```\n",
      "And an artifact:\n",
      '<artifact identifier="demo" type="application/vnd.react" title="Demo" language="tsx">\n',
      "export default function Demo(){return <div/>}\n",
      "</artifact>\n",
      "Done.",
    ].join("");

    const events = await collect(withFallbackTools(fromEvents({ type: "text_delta", text: input }, done)));

    const text = events
      .filter((event) => event.type === "text_delta")
      .map((event) => (event.type === "text_delta" ? event.text : ""))
      .join("");
    expect(text).toBe(input);
    expect(events.some((event) => event.type === "tool_call_start")).toBe(false);
    expect(events.at(-1)).toEqual(done);
  });

  it("leaves an artifact unclosed when the stream ends mid-artifact", async () => {
    const input =
      '<artifact identifier="demo" type="application/vnd.react" title="Demo">\nexport default function D(){\n';
    const source = fromEvents({ type: "text_delta", text: input }, done);

    const events = await collect(withFallbackTools(source));
    const text = events
      .filter((event) => event.type === "text_delta")
      .map((event) => (event.type === "text_delta" ? event.text : ""))
      .join("");

    // The reconstructed text must not invent a closing tag the source never had.
    expect(text).toBe(input);
  });

  it("passes events through unchanged when nativeTools is true", async () => {
    const source = fromEvents(
      { type: "text_delta", text: "calling" },
      { type: "tool_call_start", id: "call_xyz", name: "read_file" },
      { type: "tool_call_delta", id: "call_xyz", argsDelta: '{"pa' },
      { type: "tool_call_end", id: "call_xyz", args: { path: "a" } },
      done,
    );

    expect(await collect(withFallbackTools(source, { nativeTools: true }))).toEqual([
      { type: "text_delta", text: "calling" },
      { type: "tool_call_start", id: "call_xyz", name: "read_file" },
      { type: "tool_call_delta", id: "call_xyz", argsDelta: '{"pa' },
      { type: "tool_call_end", id: "call_xyz", args: { path: "a" } },
      done,
    ]);
  });

  it("passes usage events through and flushes an unclosed call before the error", async () => {
    const source = fromEvents(
      { type: "usage", inputTokens: 10, outputTokens: 3 },
      { type: "text_delta", text: '<tool_call name="read_file">{"path":"x"}' },
      { type: "error", message: "boom", retryable: false },
    );

    expect(await collect(withFallbackTools(source))).toEqual([
      { type: "usage", inputTokens: 10, outputTokens: 3 },
      { type: "text_delta", text: '<tool_call name="read_file">{"path":"x"}' },
      { type: "error", message: "boom", retryable: false },
    ]);
  });
});
