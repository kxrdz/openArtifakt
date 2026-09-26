import { describe, expect, it } from "vitest";
import { StreamParser } from "./stream-parser";
import type { ParserEvent } from "./events";

/** Feed a whole string and return every event (push + end). */
function parse(text: string): ParserEvent[] {
  const parser = new StreamParser();
  const events = parser.push(text);
  return [...events, ...parser.end()];
}

/** Concatenate the text of all `text` events. */
function textOf(events: ParserEvent[]): string {
  return events
    .filter((e): e is Extract<ParserEvent, { type: "text" }> => e.type === "text")
    .map((e) => e.text)
    .join("");
}

/** Concatenate the text of all `mermaid_delta` events. */
function mermaidTextOf(events: ParserEvent[]): string {
  return events
    .filter((e): e is Extract<ParserEvent, { type: "mermaid_delta" }> => e.type === "mermaid_delta")
    .map((e) => e.text)
    .join("");
}

describe("StreamParser: text passthrough", () => {
  it("emits plain text as a single text event", () => {
    expect(parse("hello world")).toEqual([{ type: "text", text: "hello world" }]);
  });

  it("streams text immediately across pushes", () => {
    const parser = new StreamParser();
    expect(parser.push("the quick ")).toEqual([{ type: "text", text: "the quick " }]);
    expect(parser.push("brown fox")).toEqual([{ type: "text", text: "brown fox" }]);
    expect(parser.end()).toEqual([]);
  });

  it("preserves literal angle brackets and single/double backticks", () => {
    const input = "a < b and `code` and ``two``";
    expect(parse(input)).toEqual([{ type: "text", text: input }]);
  });

  it("holds back a potential fence opener until it resolves", () => {
    const parser = new StreamParser();
    // Two backticks at the start of a line could still grow into a fence.
    expect(parser.push("before\n``")).toEqual([{ type: "text", text: "before\n" }]);
    // A non-backtick resolves them to inline code, emitted as text.
    expect(parser.push("x")).toEqual([{ type: "text", text: "``x" }]);
    expect(parser.end()).toEqual([]);
  });
});

describe("StreamParser: fence literalism", () => {
  it("keeps artifact tags inside a fenced code block as literal text", () => {
    const input =
      '```html\n<artifact identifier="demo" type="application/vnd.react" title="Demo">\n<h1>hi</h1>\n</artifact>\n```\n';
    const events = parse(input);
    expect(events.every((e) => e.type === "text")).toBe(true);
    expect(textOf(events)).toBe(input);
  });

  it("reconstructs a non-mermaid fence byte-for-byte as text", () => {
    const input = "```ts\nconst x = 1 < 2;\n```\n";
    expect(textOf(parse(input))).toBe(input);
  });

  it("keeps a fence literal when its language is not mermaid", () => {
    const input = "```python\nprint(`<tool_call name=\"x\">`)\n```\n";
    const events = parse(input);
    expect(events.some((e) => e.type !== "text")).toBe(false);
    expect(textOf(events)).toBe(input);
  });

  it("treats a four-space indented backtick run as plain text, not a fence", () => {
    const input = "    ```\nnot a fence\n    ```\n";
    expect(textOf(parse(input))).toBe(input);
  });
});

describe("StreamParser: mermaid fences", () => {
  it("emits mermaid_open/delta/close for a mermaid fence", () => {
    const input = "```mermaid\ngraph TD;\n  A --> B;\n```\n";
    const events = parse(input);
    expect(events).toEqual([
      { type: "mermaid_open" },
      { type: "mermaid_delta", text: "graph TD;\n  A --> B;\n" },
      { type: "mermaid_close" },
    ]);
  });

  it("matches the mermaid language case-insensitively", () => {
    const input = "```Mermaid\nflowchart LR\n```\n";
    const events = parse(input);
    expect(events[0]).toEqual({ type: "mermaid_open" });
    expect(mermaidTextOf(events)).toBe("flowchart LR\n");
    expect(events.at(-1)).toEqual({ type: "mermaid_close" });
  });

  it("uses the first info-string word as the fence language", () => {
    const input = "```mermaid extra info\ngraph TD;\n```\n";
    const events = parse(input);
    expect(events[0]).toEqual({ type: "mermaid_open" });
    expect(mermaidTextOf(events)).toBe("graph TD;\n");
    expect(events.at(-1)).toEqual({ type: "mermaid_close" });
  });

  it("closes an unclosed mermaid fence on end()", () => {
    const parser = new StreamParser();
    expect(parser.push("```mermaid\ngraph TD;\n")).toEqual([
      { type: "mermaid_open" },
      { type: "mermaid_delta", text: "graph TD;\n" },
    ]);
    expect(parser.end()).toEqual([{ type: "mermaid_close" }]);
  });

  it("streams mermaid deltas across chunk boundaries", () => {
    const parser = new StreamParser();
    const first = parser.push("```mermaid\ngraph");
    const second = parser.push(" TD;\n  A --> B;\n```\n");
    const rest = parser.end();
    const events = [...first, ...second, ...rest];
    expect(events[0]).toEqual({ type: "mermaid_open" });
    expect(mermaidTextOf(events)).toBe("graph TD;\n  A --> B;\n");
    expect(events.at(-1)).toEqual({ type: "mermaid_close" });
  });
});
