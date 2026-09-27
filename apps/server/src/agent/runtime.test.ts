import { approve } from "@openartifact/core";
import { describe, expect, it } from "vitest";

import { loadConfig } from "../config";

import {
  buildToolRegistry,
  createAgentRuntime,
  defaultPromptContext,
  defaultSnapshotRoot,
  toModelConfig,
} from "./runtime";

const TOOL_NAMES = [
  "read_file",
  "list_directory",
  "glob",
  "search_code",
  "edit_file",
  "write_file",
  "execute_command",
];

describe("buildToolRegistry", () => {
  it("registers exactly the seven §8 tools in canonical order", () => {
    const registry = buildToolRegistry();
    expect(registry.size).toBe(7);
    expect(registry.list().map((tool) => tool.name)).toEqual(TOOL_NAMES);
  });
});

describe("toModelConfig", () => {
  it("maps the server config onto the adapter factory's model config", () => {
    const config = loadConfig({ OPENARTIFACT_PROVIDER: "anthropic" });
    expect(toModelConfig(config)).toEqual({
      provider: "anthropic",
      model: config.model,
      baseUrl: config.baseUrl,
      apiKeyRef: config.apiKeyRef,
      contextWindow: config.contextWindow,
      capabilities: config.capabilities,
    });
  });
});

describe("defaults", () => {
  it("derives prompt context from the live process", () => {
    const ctx = defaultPromptContext();
    expect(ctx.os).toBe(process.platform);
    expect(ctx.shell.length).toBeGreaterThan(0);
    expect(ctx.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("points the snapshot root at ~/.openartifact/snapshots", () => {
    expect(defaultSnapshotRoot().endsWith(".openartifact/snapshots")).toBe(true);
  });
});

describe("createAgentRuntime", () => {
  const config = loadConfig({
    OPENARTIFACT_PROVIDER: "openai-compatible",
    OPENARTIFACT_WORKSPACE_ROOT: "/tmp/workspace",
  });
  const promptContext = { os: "linux", shell: "/bin/bash", date: "2026-09-27" };

  function runtime() {
    return createAgentRuntime({
      config,
      approvalHandler: async () => approve(),
      promptContext,
    });
  }

  it("wires the provider adapter for the configured provider without a network call", () => {
    const rt = runtime();
    expect(rt.provider.id).toBe(config.provider);
    expect(rt.tools.size).toBe(7);
    expect(rt.loop.state).toBe("idle");
  });

  it("opens every turn with the injected system prompt", () => {
    const rt = runtime();
    const [first] = rt.loop.messages;
    expect(first?.role).toBe("system");
    expect(first?.parts).toEqual([{ type: "text", text: rt.systemPrompt }]);
  });

  it("injects the runtime values into the system prompt", () => {
    const rt = runtime();
    expect(rt.systemPrompt).toContain("/tmp/workspace");
    expect(rt.systemPrompt).toContain("OS: linux");
    expect(rt.systemPrompt).toContain("Shell: /bin/bash");
    expect(rt.systemPrompt).toContain("Date: 2026-09-27");
    expect(rt.systemPrompt).toContain("ask — reads run automatically");
    expect(rt.systemPrompt).toContain("Untrusted content");
  });

  it("includes the fallback tool protocol only for non-native tool providers", () => {
    expect(runtime().systemPrompt).not.toContain("<tool_call");

    const fallback = createAgentRuntime({
      config: { ...config, capabilities: { ...config.capabilities, nativeTools: false } },
      approvalHandler: async () => approve(),
      promptContext,
    });
    expect(fallback.systemPrompt).toContain("<tool_call");
    expect(fallback.systemPrompt).toContain("edit_file(path, oldString, newString, replaceAll?)");
  });
});
