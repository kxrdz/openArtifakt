import { describe, expect, it } from "vitest";

import { truncateResult, truncateText } from "./truncate";
import type { ToolResult } from "./types";

describe("truncateText", () => {
  it("returns short content unchanged", () => {
    const content = "one\ntwo\nthree";
    expect(truncateText(content, 1000)).toBe(content);
  });

  it("caps long output and keeps head and tail", () => {
    const lines = Array.from({ length: 1000 }, (_, i) => `line ${i} - ${"x".repeat(50)}`);
    const content = lines.join("\n");

    const out = truncateText(content, 2000);

    expect(out).toMatch(/\[\.\.\. \d+ lines truncated \.\.\.\]/);
    expect(out.startsWith("line 0 - ")).toBe(true);
    expect(out.endsWith(`line 999 - ${"x".repeat(50)}`)).toBe(true);
    expect(out.length).toBeLessThanOrEqual(2100);
  });

  it("reports the exact number of truncated lines", () => {
    const total = 100;
    const content = Array.from({ length: total }, (_, i) => `line-${i}`).join("\n");

    const out = truncateText(content, 120);

    const match = /\[\.\.\. (\d+) lines truncated \.\.\.\]/.exec(out);
    expect(match).not.toBeNull();
    const truncated = Number(match![1]);
    const keptLines = out.split("\n").length - 1; // exclude the marker line itself
    expect(truncated + keptLines).toBe(total);
    expect(truncated).toBeGreaterThan(0);
  });

  it("character-slices a single over-long line, preserving head and tail", () => {
    const out = truncateText("a".repeat(200), 60);

    expect(out).toContain("characters truncated");
    expect(out.startsWith("a")).toBe(true);
    expect(out.endsWith("a")).toBe(true);
    expect(out.length).toBeLessThanOrEqual(120);
  });
});

describe("truncateResult", () => {
  it("preserves isError while truncating content", () => {
    const result: ToolResult = { content: "x".repeat(400), isError: true };
    const out = truncateResult(result, 100);

    expect(out.isError).toBe(true);
    expect(out.content.length).toBeLessThanOrEqual(140);
  });

  it("omits isError when absent", () => {
    expect(truncateResult({ content: "short" }, 1000)).toEqual({ content: "short" });
  });
});
