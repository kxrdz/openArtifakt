// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  defaultDiffPair,
  monacoLanguage,
  orderedPair,
  resolveDiffPair,
  versionNumbers,
  withVersionPick,
} from "./versionDiff";

/**
 * Task 7.2: the version-pair selection logic for the diff view is pure and
 * fully unit-tested here — the Monaco editor itself is browser-only and
 * lazily loaded, so it never runs under Vitest (see monacoSetup.ts).
 */

const versions = (numbers: number[]) =>
  numbers.map((version) => ({ version, content: "", incomplete: false }));

describe("versionNumbers", () => {
  it("sorts ascending regardless of input order", () => {
    expect(versionNumbers(versions([3, 1, 2]))).toEqual([1, 2, 3]);
  });
});

describe("defaultDiffPair", () => {
  it("returns null with fewer than two versions", () => {
    expect(defaultDiffPair(versions([]))).toBeNull();
    expect(defaultDiffPair(versions([1]))).toBeNull();
  });

  it("diffs the two most recent versions by default", () => {
    expect(defaultDiffPair(versions([1, 2, 3]))).toEqual({
      original: 2,
      modified: 3,
    });
    expect(defaultDiffPair(versions([4, 7]))).toEqual({
      original: 4,
      modified: 7,
    });
  });

  it("prefers a pinned older version against the latest", () => {
    expect(defaultDiffPair(versions([1, 2, 3]), 1)).toEqual({
      original: 1,
      modified: 3,
    });
  });

  it("ignores a preferred version that is the latest or unknown", () => {
    expect(defaultDiffPair(versions([1, 2, 3]), 3)).toEqual({
      original: 2,
      modified: 3,
    });
    expect(defaultDiffPair(versions([1, 2, 3]), 99)).toEqual({
      original: 2,
      modified: 3,
    });
  });
});

describe("orderedPair", () => {
  it("always puts the older version first", () => {
    expect(orderedPair(3, 5)).toEqual({ original: 3, modified: 5 });
    expect(orderedPair(5, 3)).toEqual({ original: 3, modified: 5 });
  });

  it("rejects equal or invalid picks", () => {
    expect(orderedPair(2, 2)).toBeNull();
    expect(orderedPair(Number.NaN, 2)).toBeNull();
    expect(orderedPair(2, Number.POSITIVE_INFINITY)).toBeNull();
  });
});

describe("resolveDiffPair", () => {
  it("keeps a still-valid pair when new versions stream in", () => {
    const pair = { original: 2, modified: 3 };
    expect(resolveDiffPair(pair, versions([1, 2, 3, 4]))).toEqual(pair);
  });

  it("falls back to the default pair when a side disappears", () => {
    // A re-parse pruned v3 (and v2 is now the latest).
    expect(resolveDiffPair({ original: 2, modified: 3 }, versions([1, 2]))).toEqual(
      { original: 1, modified: 2 },
    );
  });

  it("normalizes a pair whose sides were somehow swapped", () => {
    expect(resolveDiffPair({ original: 3, modified: 1 }, versions([1, 2, 3]))).toEqual(
      { original: 1, modified: 3 },
    );
  });
});

describe("withVersionPick", () => {
  it("changes the picked side while keeping the pair ordered", () => {
    expect(
      withVersionPick({ original: 2, modified: 3 }, "original", 1, versions([1, 2, 3])),
    ).toEqual({ original: 1, modified: 3 });
  });

  it("swaps sides when a newer version is picked on the older side", () => {
    // Picking v1 on the modified side: older/newer re-normalize so the
    // selected version is always diffed, older on the left.
    expect(
      withVersionPick({ original: 2, modified: 3 }, "modified", 1, versions([1, 2, 3])),
    ).toEqual({ original: 1, modified: 2 });
  });

  it("moves the other side to the nearest newer version on an equal pick", () => {
    // Older side picks v3, which the newer side already shows: the newer
    // side moves to the nearest version above v3 — none exists, so it falls
    // back to the newest older one (v2).
    expect(
      withVersionPick({ original: 2, modified: 3 }, "original", 3, versions([1, 2, 3])),
    ).toEqual({ original: 2, modified: 3 });
    // With a v4 available, the newer side moves up to it.
    expect(
      withVersionPick({ original: 2, modified: 3 }, "original", 3, versions([1, 2, 3, 4])),
    ).toEqual({ original: 3, modified: 4 });
  });

  it("moves the other side to the nearest older version when no newer one exists", () => {
    expect(
      withVersionPick({ original: 1, modified: 3 }, "modified", 1, versions([1, 2, 3])),
    ).toEqual({ original: 1, modified: 2 });
  });

  it("ignores unknown version numbers", () => {
    const pair = { original: 1, modified: 3 };
    expect(withVersionPick(pair, "original", 99, versions([1, 2, 3]))).toEqual(pair);
  });
});

describe("monacoLanguage", () => {
  it("maps the known artifact languages onto registered Monaco grammars", () => {
    expect(monacoLanguage("tsx")).toBe("typescript");
    expect(monacoLanguage("typescript")).toBe("typescript");
    expect(monacoLanguage("jsx")).toBe("javascript");
    expect(monacoLanguage("html")).toBe("html");
    expect(monacoLanguage("xml")).toBe("xml");
    expect(monacoLanguage("python")).toBe("python");
    expect(monacoLanguage("markdown")).toBe("markdown");
    expect(monacoLanguage("yaml")).toBe("yaml");
    expect(monacoLanguage("shell")).toBe("shell");
    expect(monacoLanguage("sql")).toBe("sql");
  });

  it("falls back to plaintext for unmapped languages (mermaid, unknown)", () => {
    expect(monacoLanguage("mermaid")).toBe("plaintext");
    expect(monacoLanguage("some-lang")).toBe("plaintext");
    expect(monacoLanguage(undefined)).toBe("plaintext");
  });
});
