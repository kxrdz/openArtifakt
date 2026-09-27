import { describe, expect, it } from "vitest";

import { loadConfig, PROVIDER_DEFAULTS } from "./config";

describe("loadConfig", () => {
  it("applies defaults when no env is set", () => {
    const cfg = loadConfig({});
    expect(cfg.provider).toBe("openai-compatible");
    expect(cfg.model).toBe("gpt-4o-mini");
    expect(cfg.baseUrl).toBe("https://api.openai.com/v1");
    expect(cfg.apiKeyRef).toBe("OPENAI_API_KEY");
    expect(cfg.approvalMode).toBe("ask");
    expect(cfg.workspaceRoot).toBe(process.cwd());
    expect(cfg.contextWindow).toBe(128_000);
    expect(cfg.capabilities).toEqual({
      nativeTools: true,
      streamingToolArgs: true,
      vision: false,
    });
    expect(cfg.fakeProvider).toBe(false);
  });

  it("switches defaults per provider", () => {
    const cfg = loadConfig({ OPENARTIFACT_PROVIDER: "ollama" });
    expect(cfg.provider).toBe("ollama");
    expect(cfg.model).toBe("llama3.2");
    expect(cfg.baseUrl).toBe("http://127.0.0.1:11434");
    expect(cfg.apiKeyRef).toBeUndefined();
    expect(cfg.contextWindow).toBe(8_192);
    expect(cfg.capabilities).toEqual({
      nativeTools: true,
      streamingToolArgs: false,
      vision: false,
    });
  });

  it("enables the fake provider flag from several truthy forms", () => {
    expect(loadConfig({ OPENARTIFACT_FAKE_PROVIDER: "1" }).fakeProvider).toBe(true);
    expect(loadConfig({ OPENARTIFACT_FAKE_PROVIDER: "true" }).fakeProvider).toBe(true);
    expect(loadConfig({ OPENARTIFACT_FAKE_PROVIDER: "on" }).fakeProvider).toBe(true);
    expect(loadConfig({ OPENARTIFACT_FAKE_PROVIDER: "0" }).fakeProvider).toBe(false);
    expect(loadConfig({ OPENARTIFACT_FAKE_PROVIDER: "false" }).fakeProvider).toBe(false);
  });

  it("overrides individual fields from the environment", () => {
    const cfg = loadConfig({
      OPENARTIFACT_PROVIDER: "anthropic",
      OPENARTIFACT_MODEL: "my-model",
      OPENARTIFACT_BASE_URL: "https://example.com/v1",
      OPENARTIFACT_API_KEY_REF: "MY_KEY",
      OPENARTIFACT_APPROVAL_MODE: "full-auto",
      OPENARTIFACT_WORKSPACE_ROOT: "/tmp/ws",
      OPENARTIFACT_CONTEXT_WINDOW: "64000",
      OPENARTIFACT_NATIVE_TOOLS: "false",
      OPENARTIFACT_VISION: "true",
    });
    expect(cfg.provider).toBe("anthropic");
    expect(cfg.model).toBe("my-model");
    expect(cfg.baseUrl).toBe("https://example.com/v1");
    expect(cfg.apiKeyRef).toBe("MY_KEY");
    expect(cfg.approvalMode).toBe("full-auto");
    expect(cfg.workspaceRoot).toBe("/tmp/ws");
    expect(cfg.contextWindow).toBe(64_000);
    expect(cfg.capabilities).toEqual({
      nativeTools: false,
      streamingToolArgs: true,
      vision: true,
    });
  });

  it("accepts every provider id in the defaults table", () => {
    for (const id of Object.keys(PROVIDER_DEFAULTS)) {
      const cfg = loadConfig({ OPENARTIFACT_PROVIDER: id });
      expect(cfg.provider).toBe(id);
      expect(cfg.model.length).toBeGreaterThan(0);
      expect(cfg.baseUrl.length).toBeGreaterThan(0);
      expect(cfg.contextWindow).toBeGreaterThan(0);
    }
  });

  it("rejects an unknown provider with the variable named", () => {
    expect(() => loadConfig({ OPENARTIFACT_PROVIDER: "nope" })).toThrow(
      /OPENARTIFACT_PROVIDER/,
    );
  });

  it("rejects an invalid approval mode", () => {
    expect(() => loadConfig({ OPENARTIFACT_APPROVAL_MODE: "nope" })).toThrow();
  });

  it("rejects a non-positive context window", () => {
    expect(() => loadConfig({ OPENARTIFACT_CONTEXT_WINDOW: "-5" })).toThrow();
    expect(() => loadConfig({ OPENARTIFACT_CONTEXT_WINDOW: "abc" })).toThrow();
  });

  it("rejects a malformed boolean flag", () => {
    expect(() => loadConfig({ OPENARTIFACT_FAKE_PROVIDER: "maybe" })).toThrow(
      /OPENARTIFACT_FAKE_PROVIDER/,
    );
  });
});
