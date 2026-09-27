// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import {
  buildThemeVariables,
  mermaidErrorLine,
  MermaidRenderError,
  toRenderError,
  type MermaidThemeTokens,
} from "./mermaid";

const tokens: MermaidThemeTokens = {
  background: "bg",
  surface: "surface",
  sunken: "sunken",
  border: "border",
  text: "text",
  mutedText: "muted",
  fontFamily: "font",
};

describe("buildThemeVariables", () => {
  it("maps design-token values onto mermaid themeVariables", () => {
    const variables = buildThemeVariables(tokens);

    expect(variables.background).toBe("bg");
    expect(variables.primaryColor).toBe("surface");
    expect(variables.primaryTextColor).toBe("text");
    expect(variables.primaryBorderColor).toBe("border");
    expect(variables.lineColor).toBe("border");
    expect(variables.clusterBkg).toBe("sunken");
    expect(variables.clusterBorder).toBe("border");
    expect(variables.mainBkg).toBe("surface");
    expect(variables.nodeBorder).toBe("border");
    expect(variables.nodeTextColor).toBe("text");
    expect(variables.noteBkgColor).toBe("sunken");
    expect(variables.noteTextColor).toBe("muted");
    expect(variables.fontFamily).toBe("font");
  });

  it("skips empty token values so mermaid keeps its own defaults", () => {
    const variables = buildThemeVariables({ ...tokens, mutedText: "" });

    expect(variables.noteTextColor).toBeUndefined();
    expect(variables.primaryColor).toBe("surface");
  });
});

describe("mermaidErrorLine", () => {
  it("extracts the offending 1-based line from a mermaid error message", () => {
    expect(mermaidErrorLine("Parse error on line 2: ...")).toBe(2);
    expect(mermaidErrorLine("Expecting 'X' at line 12, got 'Y'")).toBe(12);
  });

  it("returns undefined when the message has no line or a non-positive line", () => {
    expect(mermaidErrorLine("something went wrong")).toBeUndefined();
    expect(mermaidErrorLine("line 0")).toBeUndefined();
  });
});

describe("toRenderError", () => {
  it("wraps an unknown error with the offending line extracted", () => {
    const error = toRenderError(new Error("Parse error on line 3"));

    expect(error).toBeInstanceOf(MermaidRenderError);
    expect(error.message).toContain("line 3");
    expect(error.line).toBe(3);
  });

  it("passes an existing MermaidRenderError through unchanged", () => {
    const original = new MermaidRenderError("bad diagram", 5);
    expect(toRenderError(original)).toBe(original);
  });
});
