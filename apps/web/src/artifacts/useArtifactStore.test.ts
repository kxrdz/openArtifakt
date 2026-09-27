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
