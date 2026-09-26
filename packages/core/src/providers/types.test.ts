import { describe, expect, it } from "vitest";
import { z } from "zod";

import { parseModelConfig } from "./types";

const baseConfig = {
  provider: "openai-compatible" as const,
  model: "gpt-4o-mini",
  contextWindow: 128_000,
  capabilities: { nativeTools: true, streamingToolArgs: true, vision: false },
};

describe("providers/types", () => {
  it("parses a valid model config and preserves optional fields", () => {
    const parsed = parseModelConfig({
      ...baseConfig,
      baseUrl: "https://api.example.com/v1",
      apiKeyRef: "OPENAI_API_KEY",
      temperature: 0.2,
      maxTokens: 4096,
      headers: { "x-custom": "value" },
    });

    expect(parsed.provider).toBe("openai-compatible");
    expect(parsed.baseUrl).toBe("https://api.example.com/v1");
    expect(parsed.apiKeyRef).toBe("OPENAI_API_KEY");
    expect(parsed.temperature).toBe(0.2);
    expect(parsed.maxTokens).toBe(4096);
    expect(parsed.headers).toEqual({ "x-custom": "value" });
    expect(parsed.capabilities.nativeTools).toBe(true);
  });

  it("rejects an unknown provider id", () => {
    expect(() => parseModelConfig({ ...baseConfig, provider: "nope" })).toThrow();
  });

  it("rejects a config without a context window", () => {
    const { contextWindow: _ctx, ...rest } = baseConfig;
    expect(() => parseModelConfig(rest)).toThrow();
  });

  it("exposes zod schemas that describe tool parameters", () => {
    const schema = z.object({ path: z.string().min(1) });
    expect(schema.safeParse({ path: "src/index.ts" }).success).toBe(true);
    expect(schema.safeParse({ path: 1 }).success).toBe(false);
  });
});
