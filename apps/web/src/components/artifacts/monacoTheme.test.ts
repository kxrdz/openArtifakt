// @vitest-environment node
import { describe, expect, it } from "vitest";

import { buildDiffThemeData, cssColorToMonaco } from "./monacoTheme";

/**
 * Task 7.2: the token → Monaco color conversion and theme mapping. Pure by
 * design (token values are passed in), so it runs in Node like the rest of
 * the diff logic — Monaco itself is never loaded here.
 */

describe("cssColorToMonaco", () => {
  it("converts the token hsl() forms to hex", () => {
    expect(cssColorToMonaco("hsl(0 0% 0%)")).toBe("#000000");
    expect(cssColorToMonaco("hsl(0 0% 100%)")).toBe("#ffffff");
    expect(cssColorToMonaco("hsl(222 24% 6%)")).toBe("#0c0e13");
    expect(cssColorToMonaco("hsl(233 85% 74%)")).toBe("#8491f5");
    expect(cssColorToMonaco("hsl(150 60% 55%)")).toBe("#47d18c");
  });

  it("keeps alpha as a hex byte (the translucent -bg tokens)", () => {
    expect(cssColorToMonaco("hsl(150 60% 55% / 0.14)")).toBe("#47d18c24");
    expect(cssColorToMonaco("hsl(228 30% 2% / 0.55)")).toHaveLength(9);
  });

  it("accepts the legacy comma-separated hsl() form", () => {
    expect(cssColorToMonaco("hsl(0, 0%, 0%)")).toBe("#000000");
    expect(cssColorToMonaco("hsl(150, 60%, 55%, 0.14)")).toBe("#47d18c24");
  });

  it("passes already-parseable colors through", () => {
    expect(cssColorToMonaco("#0c0f13")).toBe("#0c0f13");
    expect(cssColorToMonaco("rgb(1, 2, 3)")).toBe("rgb(1, 2, 3)");
  });

  it("returns null for empty or unparseable values", () => {
    expect(cssColorToMonaco("")).toBeNull();
    expect(cssColorToMonaco("  ")).toBeNull();
    expect(cssColorToMonaco("var(--color-bg)")).toBeNull();
    expect(cssColorToMonaco("hsl(broken")).toBeNull();
  });
});

/** Minimal tokens exercising every mapped slot. */
const tokens = {
  background: "hsl(222 20% 9%)",
  text: "hsl(224 20% 92%)",
  textSecondary: "hsl(224 12% 68%)",
  textMuted: "hsl(224 10% 54%)",
  textFaint: "hsl(224 9% 40%)",
  accent: "hsl(233 85% 74%)",
  accentHover: "hsl(233 90% 80%)",
  success: "hsl(150 60% 55%)",
  successBg: "hsl(150 60% 55% / 0.14)",
  warning: "hsl(40 95% 60%)",
  danger: "hsl(0 75% 66%)",
  dangerBg: "hsl(0 75% 66% / 0.14)",
  border: "hsl(222 16% 18%)",
  selection: "hsl(233 85% 74% / 0.3)",
  fontFamily: "IBM Plex Mono",
  fontSizePx: 13,
};

describe("buildDiffThemeData", () => {
  it("maps tokens onto editor and diff colors without literals", () => {
    const theme = buildDiffThemeData(tokens, "vs-dark");
    expect(theme.base).toBe("vs-dark");
    expect(theme.colors["editor.background"]).toBe("#12151c");
    expect(theme.colors["diffEditor.insertedTextBackground"]).toBe("#47d18c24");
    expect(theme.colors["diffEditor.removedLineBackground"]).toBe("#e9676724");
  });

  it("skips unparseable token values instead of guessing", () => {
    const theme = buildDiffThemeData(
      { ...tokens, background: "var(--oops)" },
      "vs-dark",
    );
    expect(theme.colors["editor.background"]).toBeUndefined();
    // Other slots still map.
    expect(theme.colors["editor.foreground"]).toBe("#e7e9ef");
  });
});
