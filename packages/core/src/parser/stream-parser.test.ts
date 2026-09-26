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

describe("StreamParser: artifact parsing", () => {
  it("emits open/delta/close for a complete artifact", () => {
    const input =
      '<artifact identifier="demo" type="application/vnd.react" title="Demo" language="tsx">\nexport default () => <div>hi</div>;\n</artifact>';
    const events = parse(input);
    expect(events).toEqual([
      {
        type: "artifact_open",
        identifier: "demo",
        artifactType: "application/vnd.react",
        title: "Demo",
        language: "tsx",
      },
      {
        type: "artifact_delta",
        identifier: "demo",
        text: "\nexport default () => <div>hi</div>;\n",
      },
      { type: "artifact_close", identifier: "demo" },
    ]);
  });

  it("reassembles an open tag split across chunks", () => {
    const parser = new StreamParser();
    const first = parser.push("<arti");
    const second = parser.push(
      'fact identifier="x" type="application/vnd.code" title="X" language="ts">body',
    );
    const third = parser.push("</artifact>");
    expect([...first, ...second, ...third]).toEqual([
      {
        type: "artifact_open",
        identifier: "x",
        artifactType: "application/vnd.code",
        title: "X",
        language: "ts",
      },
      { type: "artifact_delta", identifier: "x", text: "body" },
      { type: "artifact_close", identifier: "x" },
    ]);
  });

  it("reassembles a close tag split across chunks", () => {
    const parser = new StreamParser();
    expect(
      parser.push('<artifact identifier="a" type="application/vnd.code" title="A">body</art'),
    ).toEqual([
      { type: "artifact_open", identifier: "a", artifactType: "application/vnd.code", title: "A" },
      { type: "artifact_delta", identifier: "a", text: "body" },
    ]);
    expect(parser.push("ifact>")).toEqual([{ type: "artifact_close", identifier: "a" }]);
    expect(parser.end()).toEqual([]);
  });

  it("treats artifact content as raw text (nested tags and markdown stay literal)", () => {
    const input =
      '<artifact identifier="a" type="text/html" title="A">\n<h1>hi</h1>\n**bold** <span>inline</span>\n</artifact>';
    const events = parse(input);
    expect(events[0]).toEqual({
      type: "artifact_open",
      identifier: "a",
      artifactType: "text/html",
      title: "A",
    });
    expect(events[1]).toEqual({
      type: "artifact_delta",
      identifier: "a",
      text: "\n<h1>hi</h1>\n**bold** <span>inline</span>\n",
    });
    expect(events[2]).toEqual({ type: "artifact_close", identifier: "a" });
  });

  it("preserves an unknown type verbatim", () => {
    const input = '<artifact identifier="u" type="application/vnd.unknown" title="U">x</artifact>';
    const events = parse(input);
    expect(events[0]).toEqual({
      type: "artifact_open",
      identifier: "u",
      artifactType: "application/vnd.unknown",
      title: "U",
    });
  });

  it("generates a kebab-case identifier from the title when missing", () => {
    const input = '<artifact type="application/vnd.code" title="My Cool Component!">x</artifact>';
    const events = parse(input);
    expect(events[0]).toEqual({
      type: "artifact_open",
      identifier: "my-cool-component",
      artifactType: "application/vnd.code",
      title: "My Cool Component!",
    });
    expect(events.at(-1)).toEqual({ type: "artifact_close", identifier: "my-cool-component" });
  });

  it('falls back to "artifact" when both identifier and title are missing', () => {
    const input = '<artifact type="application/vnd.code">x</artifact>';
    const events = parse(input);
    expect(events[0]).toEqual({
      type: "artifact_open",
      identifier: "artifact",
      artifactType: "application/vnd.code",
      title: "",
    });
  });

  it("flags an unclosed artifact on end()", () => {
    const parser = new StreamParser();
    expect(parser.push('<artifact identifier="a" type="application/vnd.code" title="A">body')).toEqual([
      { type: "artifact_open", identifier: "a", artifactType: "application/vnd.code", title: "A" },
      { type: "artifact_delta", identifier: "a", text: "body" },
    ]);
    expect(parser.end()).toEqual([{ type: "artifact_close", identifier: "a", incomplete: true }]);
  });

  it("keeps a stray close tag as literal text", () => {
    expect(parse("before </artifact> after")).toEqual([
      { type: "text", text: "before </artifact> after" },
    ]);
  });

  it("keeps a lone < in prose as literal text", () => {
    expect(parse("1 < 2")).toEqual([{ type: "text", text: "1 < 2" }]);
  });

  it("parses multiple artifacts in sequence", () => {
    const input =
      '<artifact identifier="a" type="application/vnd.code" title="A">one</artifact>\n<artifact identifier="b" type="application/vnd.code" title="B">two</artifact>';
    const events = parse(input);
    const ids = events
      .filter((e) => e.type === "artifact_open")
      .map((e) => (e as { identifier: string }).identifier);
    expect(ids).toEqual(["a", "b"]);
    expect(events.filter((e) => e.type === "artifact_close").length).toBe(2);
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
