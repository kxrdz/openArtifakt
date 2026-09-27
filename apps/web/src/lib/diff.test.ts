import { describe, expect, it } from "vitest";

import { lineDiff, truncateText } from "./diff";

describe("lineDiff", () => {
  it("returns everything as context when the strings are identical", () => {
    expect(lineDiff("a\nb", "a\nb")).toEqual([
      { type: "context", text: "a" },
      { type: "context", text: "b" },
    ]);
  });

  it("trims a common prefix and suffix around the change", () => {
    expect(lineDiff("a\nold\nb", "a\nnew\nb")).toEqual([
      { type: "context", text: "a" },
      { type: "removed", text: "old" },
      { type: "added", text: "new" },
      { type: "context", text: "b" },
    ]);
  });

  it("handles a pure insertion", () => {
    expect(lineDiff("a", "a\nb")).toEqual([
      { type: "context", text: "a" },
      { type: "added", text: "b" },
    ]);
  });

  it("handles a pure deletion", () => {
    expect(lineDiff("a\nb", "a")).toEqual([
      { type: "context", text: "a" },
      { type: "removed", text: "b" },
    ]);
  });
});

describe("truncateText", () => {
  it("keeps short text intact", () => {
    expect(truncateText("hello", 10)).toEqual({ text: "hello", truncated: false });
  });

  it("keeps head and tail with a marker when over the cap", () => {
    const long = Array.from({ length: 10 }, (_, i) => `line ${i}`).join("\n");
    const result = truncateText(long, 40);
    expect(result.truncated).toBe(true);
    expect(result.text).toContain("line 0");
    expect(result.text).toContain("line 9");
    expect(result.text).toContain("content truncated");
  });
});
