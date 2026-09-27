import { describe, expect, it } from "vitest";

import { normalizeLanguage } from "./highlight";

describe("normalizeLanguage", () => {
  it("maps MIME types to shiki grammar ids", () => {
    expect(normalizeLanguage("image/svg+xml")).toBe("xml");
    expect(normalizeLanguage("text/html")).toBe("html");
    expect(normalizeLanguage("application/json")).toBe("json");
  });

  it("lowercases and trims a plain language name", () => {
    expect(normalizeLanguage("  TSX ")).toBe("tsx");
    expect(normalizeLanguage("Python")).toBe("python");
  });

  it("falls back to plain text when the language is missing", () => {
    expect(normalizeLanguage(undefined)).toBe("text");
    expect(normalizeLanguage("")).toBe("text");
  });
});
