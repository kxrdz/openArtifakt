import { describe, expect, it } from "vitest";

import { buildSystemPrompt, SYSTEM_PROMPT_VERSION } from "./system";

const baseOptions = {
  workspaceRoot: "/home/dev/project",
  os: "linux",
  shell: "/bin/bash",
  date: "2026-09-27",
  approvalMode: "ask",
  nativeTools: true,
} as const;

describe("SYSTEM_PROMPT_VERSION", () => {
  it("carries a numeric version", () => {
    expect(SYSTEM_PROMPT_VERSION).toMatch(/^\d+$/);
  });
});

describe("buildSystemPrompt", () => {
  it("injects workspace root, OS, shell, date and approval mode", () => {
    const prompt = buildSystemPrompt(baseOptions);
    expect(prompt).toContain("/home/dev/project");
    expect(prompt).toContain("linux");
    expect(prompt).toContain("/bin/bash");
    expect(prompt).toContain("2026-09-27");
    expect(prompt).toContain("ask");
  });

  it("covers working style, artifacts, React, diagrams and untrusted content", () => {
    const prompt = buildSystemPrompt(baseOptions);
    expect(prompt).toContain("Working style");
    expect(prompt).toContain("application/vnd.react");
    expect(prompt).toContain("default export");
    expect(prompt).toContain("mermaid");
    expect(prompt).toContain("untrusted");
  });

  it("omits the fallback protocol when native tools are enabled", () => {
    const prompt = buildSystemPrompt(baseOptions);
    expect(prompt).not.toContain("<tool_call");
  });

  it("includes the fallback protocol only when native tools are disabled", () => {
    const prompt = buildSystemPrompt({ ...baseOptions, nativeTools: false });
    expect(prompt).toContain("<tool_call name=");
    expect(prompt).toContain("read_file");
    expect(prompt).toContain("edit_file");
    expect(prompt).toContain("execute_command");
  });

  it("matches the pinned snapshot for native tools", () => {
    expect(buildSystemPrompt(baseOptions)).toMatchSnapshot();
  });

  it("matches the pinned snapshot for the fallback protocol", () => {
    expect(buildSystemPrompt({ ...baseOptions, nativeTools: false })).toMatchSnapshot();
  });
});
