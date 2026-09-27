import { describe, expect, it } from "vitest";

import {
  AGENT_STATES,
  AgentStateMachine,
  TERMINAL_STATES,
  isValidTransition,
  type AgentState,
} from "./state";

describe("isValidTransition", () => {
  it("allows the spec'd happy path in order", () => {
    const path: AgentState[] = [
      "idle",
      "streaming",
      "executing_tool",
      "streaming",
      "awaiting_approval",
      "executing_tool",
      "streaming",
      "done",
    ];
    for (let i = 0; i < path.length - 1; i += 1) {
      expect(isValidTransition(path[i]!, path[i + 1]!)).toBe(true);
    }
  });

  it("rejects illegal transitions", () => {
    expect(isValidTransition("idle", "done")).toBe(false);
    expect(isValidTransition("idle", "executing_tool")).toBe(false);
    expect(isValidTransition("streaming", "idle")).toBe(false);
    expect(isValidTransition("done", "streaming")).toBe(false);
  });

  it("treats every terminal state as having no outgoing transitions", () => {
    for (const terminal of TERMINAL_STATES) {
      for (const state of AGENT_STATES) {
        expect(isValidTransition(terminal, state)).toBe(false);
      }
    }
  });
});

describe("AgentStateMachine", () => {
  it("starts idle and non-terminal", () => {
    const machine = new AgentStateMachine();
    expect(machine.state).toBe("idle");
    expect(machine.isTerminal).toBe(false);
  });

  it("transitions through a full streaming lifecycle", () => {
    const machine = new AgentStateMachine();
    machine.transition("streaming");
    expect(machine.state).toBe("streaming");

    machine.transition("executing_tool");
    expect(machine.state).toBe("executing_tool");

    machine.transition("streaming");
    machine.transition("awaiting_approval");
    expect(machine.state).toBe("awaiting_approval");

    machine.transition("executing_tool");
    machine.transition("done");
    expect(machine.state).toBe("done");
    expect(machine.isTerminal).toBe(true);
  });

  it("throws on an illegal transition", () => {
    const machine = new AgentStateMachine();
    expect(() => machine.transition("done")).toThrow(/Invalid agent state transition/);
  });

  it("reports error and cancelled as terminal", () => {
    const errored = new AgentStateMachine();
    errored.transition("streaming");
    errored.transition("error");
    expect(errored.isTerminal).toBe(true);

    const cancelled = new AgentStateMachine();
    cancelled.transition("streaming");
    cancelled.transition("cancelled");
    expect(cancelled.isTerminal).toBe(true);
  });

  it("resets back to idle", () => {
    const machine = new AgentStateMachine();
    machine.transition("streaming");
    machine.transition("done");
    machine.reset();
    expect(machine.state).toBe("idle");
    expect(machine.isTerminal).toBe(false);
  });
});
