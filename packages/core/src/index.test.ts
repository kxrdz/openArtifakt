import { describe, expect, it } from "vitest";
import {
  AgentLoop,
  CORE_VERSION,
  ToolRegistry,
  buildSystemPrompt,
  resolveWithinWorkspace,
} from "./index";

describe("core", () => {
  it("exports a semver version string", () => {
    expect(CORE_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("re-exports the agent, tools, security and prompts layers", () => {
    expect(typeof AgentLoop).toBe("function");
    expect(typeof ToolRegistry).toBe("function");
    expect(typeof resolveWithinWorkspace).toBe("function");
    expect(typeof buildSystemPrompt).toBe("function");
  });
});
