import { describe, expect, it } from "vitest";

import { createArtifactStore } from "./useArtifactStore";

const CONTENT = [
  '<artifact identifier="counter" type="application/vnd.react" title="Counter" language="tsx">',
  "export default function Counter() { return <button>+1</button>; }",
  "</artifact>",
  '<artifact identifier="page" type="text/html" title="Page">',
  "<html><body><h1>Hi</h1></body></html>",
  "</artifact>",
].join("\n");

describe("createArtifactStore", () => {
  it("derives artifacts from content and opens the first by default", () => {
    const store = createArtifactStore();
    store.getState().updateFromContent(CONTENT);

    expect(store.getState().artifacts.map((a) => a.identifier)).toEqual(["counter", "page"]);
    expect(store.getState().selectedId).toBe("counter");
  });

  it("tracks the selected artifact via selectArtifact", () => {
    const store = createArtifactStore();
    store.getState().updateFromContent(CONTENT);
    store.getState().selectArtifact("page");
    expect(store.getState().selectedId).toBe("page");
  });

  it("preserves the selection across updates while its identifier is still present", () => {
    const store = createArtifactStore();
    store.getState().updateFromContent(CONTENT);
    store.getState().selectArtifact("page");
    store.getState().updateFromContent(CONTENT + "\nAnd some trailing prose.");
    expect(store.getState().selectedId).toBe("page");
  });

  it("version-appends a reused identifier across updates", () => {
    const store = createArtifactStore();
    const first = '<artifact identifier="a" type="text/html" title="A">\nv1\n</artifact>\n';
    store.getState().updateFromContent(first);
    expect(store.getState().artifacts[0]?.versions).toHaveLength(1);

    const second =
      first + '<artifact identifier="a" type="text/html" title="A">\nv2\n</artifact>\n';
    store.getState().updateFromContent(second);

    expect(store.getState().artifacts).toHaveLength(1);
    expect(store.getState().artifacts[0]?.versions).toHaveLength(2);
    expect(store.getState().artifacts[0]?.versions[1]?.content).toBe("\nv2\n");
  });

  it("clears artifacts and selection when the content has no artifacts", () => {
    const store = createArtifactStore();
    store.getState().updateFromContent(CONTENT);
    expect(store.getState().selectedId).not.toBeNull();

    store.getState().updateFromContent("");
    expect(store.getState().artifacts).toEqual([]);
    expect(store.getState().selectedId).toBeNull();
  });
});

describe("version selection", () => {
  const FIRST =
    '<artifact identifier="a" type="application/vnd.code" title="A" language="python">\nv1\n</artifact>\n';
  const SECOND =
    FIRST +
    '<artifact identifier="a" type="application/vnd.code" title="A" language="python">\nv2\n</artifact>\n';
  const THIRD =
    SECOND +
    '<artifact identifier="a" type="application/vnd.code" title="A" language="python">\nv3\n</artifact>\n';

  it("has no pinned version until one is selected (latest is followed)", () => {
    const store = createArtifactStore();
    store.getState().updateFromContent(SECOND);
    expect(store.getState().versionSelections).toEqual({});
  });

  it("pins an older version and keeps it pinned as new versions arrive", () => {
    const store = createArtifactStore();
    store.getState().updateFromContent(SECOND);
    store.getState().selectVersion("a", 1);
    expect(store.getState().versionSelections).toEqual({ a: 1 });

    store.getState().updateFromContent(THIRD);
    expect(store.getState().versionSelections).toEqual({ a: 1 });
  });

  it("selecting the latest version returns to following it", () => {
    const store = createArtifactStore();
    store.getState().updateFromContent(SECOND);
    store.getState().selectVersion("a", 1);
    store.getState().selectVersion("a", 2);
    expect(store.getState().versionSelections).toEqual({});

    // A new version then takes over automatically.
    store.getState().updateFromContent(THIRD);
    expect(store.getState().versionSelections).toEqual({});
  });

  it("ignores versions and identifiers that do not exist", () => {
    const store = createArtifactStore();
    store.getState().updateFromContent(SECOND);
    store.getState().selectVersion("a", 9);
    store.getState().selectVersion("missing", 1);
    expect(store.getState().versionSelections).toEqual({});
  });

  it("drops a pin when the artifact or its version disappears", () => {
    const store = createArtifactStore();
    store.getState().updateFromContent(SECOND);
    store.getState().selectVersion("a", 1);

    store.getState().updateFromContent("");
    expect(store.getState().versionSelections).toEqual({});

    store.getState().updateFromContent(SECOND);
    store.getState().selectVersion("a", 2);
    store.getState().clear();
    expect(store.getState().versionSelections).toEqual({});
  });

  it("starts a restored conversation on the latest versions", () => {
    const store = createArtifactStore();
    store.getState().updateFromContent(SECOND);
    store.getState().selectVersion("a", 1);

    const artifacts = store.getState().artifacts;
    store.getState().restoreArtifacts(artifacts);
    expect(store.getState().versionSelections).toEqual({});
  });
});

describe("liftToArtifact", () => {
  it("lifts an inline diagram into a complete Mermaid artifact and selects it", () => {
    const store = createArtifactStore();
    store.getState().liftToArtifact("graph TD\n  A --> B", "Flow");

    const artifacts = store.getState().artifacts;
    expect(artifacts).toHaveLength(1);

    const artifact = artifacts[0];
    expect(artifact?.artifactType).toBe("application/vnd.mermaid");
    expect(artifact?.title).toBe("Flow");
    expect(artifact?.incomplete).toBe(false);
    expect(artifact?.versions).toHaveLength(1);
    expect(artifact?.versions[0]).toEqual({
      version: 1,
      content: "graph TD\n  A --> B",
      incomplete: false,
    });
    expect(store.getState().selectedId).toBe(artifact?.identifier);
  });

  it("persists lifted artifacts across content re-derives and keeps them selected", () => {
    const store = createArtifactStore();
    store.getState().updateFromContent(CONTENT);
    store.getState().liftToArtifact("graph TD", "Flow");

    store.getState().updateFromContent(CONTENT + "\nMore prose.");

    const identifiers = store.getState().artifacts.map((a) => a.identifier);
    expect(identifiers).toContain("counter");
    expect(identifiers).toContain("page");
    expect(identifiers.some((id) => id.startsWith("inline-mermaid-"))).toBe(true);
    expect(store.getState().selectedId?.startsWith("inline-mermaid-")).toBe(true);
  });

  it("defaults the title and gives each lift a unique identifier", () => {
    const store = createArtifactStore();
    store.getState().liftToArtifact("a");
    store.getState().liftToArtifact("b");

    const artifacts = store.getState().artifacts;
    expect(artifacts).toHaveLength(2);
    expect(artifacts[0]?.title).toBe("Inline diagram");
    expect(artifacts[0]?.identifier).not.toBe(artifacts[1]?.identifier);
  });
});
