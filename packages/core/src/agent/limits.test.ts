import { describe, expect, it } from "vitest";

import { DEFAULT_COMMAND_TIMEOUT_MS } from "../tools/execute-command";
import { DEFAULT_TOOL_RESULT_CAP } from "../tools/truncate";
import { DEFAULT_AGENT_LOOP_LIMITS, normalizeAgentLoopLimits } from "./limits";

describe("DEFAULT_AGENT_LOOP_LIMITS", () => {
  it("matches the spec limits", () => {
    expect(DEFAULT_AGENT_LOOP_LIMITS.maxIterations).toBe(50);
    expect(DEFAULT_AGENT_LOOP_LIMITS.commandTimeoutMs).toBe(120_000);
    expect(DEFAULT_AGENT_LOOP_LIMITS.toolResultCap).toBe(20_000);
    expect(DEFAULT_AGENT_LOOP_LIMITS.identicalFailureThreshold).toBe(3);
  });

  it("reuses the tool-layer defaults as its single source of truth", () => {
    expect(DEFAULT_AGENT_LOOP_LIMITS.commandTimeoutMs).toBe(DEFAULT_COMMAND_TIMEOUT_MS);
    expect(DEFAULT_AGENT_LOOP_LIMITS.toolResultCap).toBe(DEFAULT_TOOL_RESULT_CAP);
  });
});

describe("normalizeAgentLoopLimits", () => {
  it("returns the defaults when given no overrides", () => {
    expect(normalizeAgentLoopLimits()).toEqual(DEFAULT_AGENT_LOOP_LIMITS);
  });

  it("merges partial overrides over the defaults", () => {
    const limits = normalizeAgentLoopLimits({ maxIterations: 5 });
    expect(limits.maxIterations).toBe(5);
    expect(limits.commandTimeoutMs).toBe(DEFAULT_AGENT_LOOP_LIMITS.commandTimeoutMs);
    expect(limits.toolResultCap).toBe(DEFAULT_AGENT_LOOP_LIMITS.toolResultCap);
    expect(limits.identicalFailureThreshold).toBe(
      DEFAULT_AGENT_LOOP_LIMITS.identicalFailureThreshold,
    );
  });
});
