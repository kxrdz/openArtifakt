import { describe, expect, it } from "vitest";

import { parseDocument } from "./parseDocument";
import type { Artifact } from "./parseDocument";

/** A document with one of each artifact type, all closed. */
const FIVE_TYPES = [
  "Intro text",
  '<artifact identifier="counter" type="application/vnd.react" title="Counter" language="tsx">',
  "export default function Counter() { return <button>+1</button>; }",
  "</artifact>",
  '<artifact identifier="page" type="text/html" title="Page">',
  "<html><body><h1>Hi</h1></body></html>",
  "</artifact>",
  '<artifact identifier="logo" type="image/svg+xml" title="Logo">',
  '<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>',
  "</artifact>",
  '<artifact identifier="diagram" type="application/vnd.mermaid" title="Diagram">',
  "graph TD",
  "</artifact>",
  '<artifact identifier="snippet" type="application/vnd.code" title="Snippet" language="ts">',
  "const x = 1;",
  "</artifact>",
].join("\n");

const byIdentifier = (artifacts: Artifact[]): Map<string, Artifact> =>
  new Map(artifacts.map((artifact) => [artifact.identifier, artifact]));

describe("parseDocument: artifact types", () => {
  it("folds all five artifact types into artifacts keyed by identifier", () => {
    const doc = parseDocument(FIVE_TYPES);
    const byId = byIdentifier(doc.artifacts);

    expect(doc.artifacts.map((a) => a.identifier)).toEqual([
      "counter",
      "page",
      "logo",
      "diagram",
      "snippet",
    ]);
    expect(byId.get("counter")?.artifactType).toBe("application/vnd.react");
    expect(byId.get("page")?.artifactType).toBe("text/html");
    expect(byId.get("logo")?.artifactType).toBe("image/svg+xml");
    expect(byId.get("diagram")?.artifactType).toBe("application/vnd.mermaid");
    expect(byId.get("snippet")?.artifactType).toBe("application/vnd.code");
  });

  it("carries language attributes and lifts artifact content out of the prose", () => {
    const doc = parseDocument(FIVE_TYPES);
    const byId = byIdentifier(doc.artifacts);

    expect(byId.get("counter")?.language).toBe("tsx");
    expect(byId.get("snippet")?.language).toBe("ts");
    expect(byId.get("counter")?.versions[0]?.content).toContain("export default function");

    // The prose keeps only the intro text; artifact markup is not literal.
    expect(doc.blocks).toHaveLength(1);
    expect(doc.blocks[0]?.type).toBe("text");
    if (doc.blocks[0]?.type === "text") {
      expect(doc.blocks[0].text.startsWith("Intro text")).toBe(true);
      expect(doc.blocks[0].text).not.toContain("<artifact");
    }
  });

  it("marks a fully closed artifact complete with a single version", () => {
    const doc = parseDocument(FIVE_TYPES);
    for (const artifact of doc.artifacts) {
      expect(artifact.versions).toHaveLength(1);
      expect(artifact.incomplete).toBe(false);
      expect(artifact.versions[0]?.incomplete).toBe(false);
    }
  });
});

describe("parseDocument: inline Mermaid blocks", () => {
  it("folds a complete mermaid fence into a mermaid block", () => {
    const doc = parseDocument("Here is a diagram:\n```mermaid\ngraph TD\n  A --> B\n```\nAnd done.");
    expect(doc.blocks).toEqual([
      { type: "text", text: "Here is a diagram:\n" },
      { type: "mermaid", source: "graph TD\n  A --> B\n", complete: true },
      { type: "text", text: "And done." },
    ]);
    expect(doc.artifacts).toEqual([]);
  });

  it("marks a still-open mermaid fence incomplete", () => {
    const doc = parseDocument("```mermaid\ngraph TD\n  A --> B");
    expect(doc.blocks).toEqual([
      { type: "mermaid", source: "graph TD\n  A --> B", complete: false },
    ]);
  });
});

describe("parseDocument: versioning", () => {
  it("appends a new version when a completed identifier is reused", () => {
    const content =
      '<artifact identifier="a" type="text/html" title="A">\nv1\n</artifact>\n' +
      '<artifact identifier="a" type="text/html" title="A">\nv2\n</artifact>\n';
    const doc = parseDocument(content);

    expect(doc.artifacts).toHaveLength(1);
    const artifact = doc.artifacts[0];
    expect(artifact?.versions).toHaveLength(2);
    expect(artifact?.versions[0]).toEqual({ version: 1, content: "\nv1\n", incomplete: false });
    expect(artifact?.versions[1]).toEqual({ version: 2, content: "\nv2\n", incomplete: false });
    expect(artifact?.incomplete).toBe(false);
  });

  it("flags an unclosed artifact as incomplete", () => {
    const doc = parseDocument('<artifact identifier="a" type="text/html" title="A">\n<div>hi</div>');
    expect(doc.artifacts[0]?.incomplete).toBe(true);
    expect(doc.artifacts[0]?.versions).toHaveLength(1);
    expect(doc.artifacts[0]?.versions[0]?.incomplete).toBe(true);
    expect(doc.artifacts[0]?.versions[0]?.content).toBe("\n<div>hi</div>");
  });

  it("re-parses idempotently and updates an in-progress version in place", () => {
    const streaming1 = '<artifact identifier="a" type="text/html" title="A">\n<div>hi';
    const streaming2 = '<artifact identifier="a" type="text/html" title="A">\n<div>hello world</div>';

    // Same input, same output (pure).
    expect(parseDocument(streaming1)).toEqual(parseDocument(streaming1));

    // Growing content re-parses the same in-progress version, never duplicating it.
    const first = parseDocument(streaming1);
    const second = parseDocument(streaming2);
    expect(first.artifacts[0]?.versions).toHaveLength(1);
    expect(second.artifacts[0]?.versions).toHaveLength(1);
    expect(second.artifacts[0]?.versions[0]?.content).toBe("\n<div>hello world</div>");
  });
});
