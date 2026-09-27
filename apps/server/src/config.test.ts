import { describe, expect, it } from "vitest";

import { isProviderReady, loadConfig, PROVIDER_DEFAULTS } from "./config";

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

  it("wires the 9router preset to the openai-compatible gateway", () => {
    const cfg = loadConfig({ OPENARTIFACT_PROVIDER: "9router" });
    expect(cfg.provider).toBe("9router");
    expect(cfg.model).toBe("cc/claude-sonnet-4-5");
    expect(cfg.baseUrl).toBe("http://localhost:20128/v1");
    expect(cfg.apiKeyRef).toBe("NINEROUTER_KEY");
    expect(cfg.contextWindow).toBe(200_000);
    expect(cfg.capabilities).toEqual({
      nativeTools: true,
      streamingToolArgs: true,
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

describe("isProviderReady", () => {
  const base = loadConfig({});

  it("is ready in fake-provider replay mode without a key", () => {
    expect(isProviderReady({ ...base, fakeProvider: true })).toBe(true);
  });

  it("is ready for the local ollama provider without a key", () => {
    const ollama = loadConfig({ OPENARTIFACT_PROVIDER: "ollama" });
    expect(isProviderReady(ollama)).toBe(true);
  });

  it("is ready for the 9router gateway without a key (auth is optional)", () => {
    const nine = loadConfig({ OPENARTIFACT_PROVIDER: "9router" });
    expect(isProviderReady(nine, {})).toBe(true);
  });

  it("is ready when the referenced API key is present in the environment", () => {
    expect(isProviderReady(base, { OPENAI_API_KEY: "sk-test" })).toBe(true);
  });

  it("is not ready when the referenced API key is missing or empty", () => {
    expect(isProviderReady(base, {})).toBe(false);
    expect(isProviderReady(base, { OPENAI_API_KEY: "" })).toBe(false);
  });

  it("is not ready when no key reference is configured", () => {
    expect(isProviderReady({ ...base, apiKeyRef: undefined }, {})).toBe(false);
  });
});
