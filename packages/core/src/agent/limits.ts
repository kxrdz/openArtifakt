import { DEFAULT_COMMAND_TIMEOUT_MS } from "../tools/execute-command";
import { DEFAULT_TOOL_RESULT_CAP } from "../tools/truncate";

/**
 * Agent-loop limits (§8 "Limits"). Every cap is configurable so hosts and
 * tests can tighten or loosen them; the defaults match the spec.
 */
export interface AgentLoopLimits {
  /** Maximum model iterations (provider round-trips) per user turn. */
  maxIterations: number;
  /** Default `execute_command` timeout in milliseconds. */
  commandTimeoutMs: number;
  /** Character cap applied to tool results (head + tail + marker). */
  toolResultCap: number;
  /** Stop after this many failures of the same tool call with identical args. */
  identicalFailureThreshold: number;
}

/** Spec-mandated defaults (§8). */
export const DEFAULT_AGENT_LOOP_LIMITS: AgentLoopLimits = {
  maxIterations: 50,
  commandTimeoutMs: DEFAULT_COMMAND_TIMEOUT_MS,
  toolResultCap: DEFAULT_TOOL_RESULT_CAP,
  identicalFailureThreshold: 3,
};

/** Merge partial limits over the defaults, producing a complete config. */
export function normalizeAgentLoopLimits(
  overrides: Partial<AgentLoopLimits> = {},
): AgentLoopLimits {
  return { ...DEFAULT_AGENT_LOOP_LIMITS, ...overrides };
}
