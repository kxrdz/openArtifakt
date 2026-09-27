import { describe, expect, it } from "vitest";
import {
  agentStateSchema,
  approvalDecisionSchema,
  chatEventSchema,
  isAgentState,
  isApprovalDecision,
  isChatEvent,
  parseApprovalDecision,
  parseChatEvent,
} from "./chat";

describe("agent state schema", () => {
  it("accepts every legal agent state", () => {
    for (const state of [
      "idle",
      "streaming",
      "awaiting_approval",
      "executing_tool",
      "done",
      "error",
      "cancelled",
    ]) {
      expect(agentStateSchema.safeParse(state).success).toBe(true);
      expect(isAgentState(state)).toBe(true);
    }
  });

  it("rejects unknown states", () => {
    expect(isAgentState("running")).toBe(false);
    expect(isAgentState(42)).toBe(false);
  });
});

describe("approval decision schema", () => {
  it("parses the three decision kinds", () => {
    expect(parseApprovalDecision({ kind: "approve" })).toEqual({ kind: "approve" });
    expect(parseApprovalDecision({ kind: "edit-command", command: "pnpm test" })).toEqual({
      kind: "edit-command",
      command: "pnpm test",
    });
    expect(parseApprovalDecision({ kind: "reject", note: "too risky" })).toEqual({
      kind: "reject",
      note: "too risky",
    });
  });

  it("rejects an empty edited command and unknown kinds", () => {
    expect(approvalDecisionSchema.safeParse({ kind: "edit-command", command: "" }).success).toBe(
      false,
    );
    expect(approvalDecisionSchema.safeParse({ kind: "maybe" }).success).toBe(false);
    expect(isApprovalDecision("approve")).toBe(false);
  });
});

describe("chat event union", () => {
  it("parses the transport frames", () => {
    expect(parseChatEvent({ type: "conversation", conversationId: "conv-1" })).toEqual({
      type: "conversation",
      conversationId: "conv-1",
    });
    expect(parseChatEvent({ type: "command_output", stream: "stdout", text: "ok\n" })).toEqual({
      type: "command_output",
      stream: "stdout",
      text: "ok\n",
    });
  });

  it("parses the agent loop events", () => {
    expect(parseChatEvent({ type: "state", state: "streaming" })).toEqual({
      type: "state",
      state: "streaming",
    });
    expect(parseChatEvent({ type: "text", text: "hi" })).toEqual({ type: "text", text: "hi" });
    expect(
      parseChatEvent({ type: "tool_start", callId: "c1", name: "read_file", args: { path: "x" } }),
    ).toEqual({ type: "tool_start", callId: "c1", name: "read_file", args: { path: "x" } });
    expect(
      parseChatEvent({
        type: "approval_request",
        callId: "c1",
        name: "edit_file",
        args: { path: "x", oldString: "a", newString: "b" },
        reason: "Writes require approval.",
      }),
    ).toEqual({
      type: "approval_request",
      callId: "c1",
      name: "edit_file",
      args: { path: "x", oldString: "a", newString: "b" },
      reason: "Writes require approval.",
    });
    expect(
      parseChatEvent({
        type: "approval_decision",
        callId: "c1",
        name: "edit_file",
        decision: { kind: "approve" },
      }),
    ).toEqual({
      type: "approval_decision",
      callId: "c1",
      name: "edit_file",
      decision: { kind: "approve" },
    });
    expect(parseChatEvent({ type: "done", stopReason: "end_turn" })).toEqual({
      type: "done",
      stopReason: "end_turn",
    });
    expect(parseChatEvent({ type: "error", message: "boom" })).toEqual({
      type: "error",
      message: "boom",
    });
  });

  it("rejects unknown event types", () => {
    expect(chatEventSchema.safeParse({ type: "text_delta", text: "x" }).success).toBe(false);
    expect(isChatEvent({ type: "mystery" })).toBe(false);
    expect(isChatEvent("not an event")).toBe(false);
  });
});
