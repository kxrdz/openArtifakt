import { describe, expect, it } from "vitest";

import type { Message } from "@openartifact/shared";

import {
  CANCELLED_TOOL_RESULT,
  cancelPendingToolCalls,
  pendingToolCallIds,
} from "./cancellation";

function assistant(id: string, callId: string): Message {
  return {
    id,
    role: "assistant",
    parts: [{ type: "tool_call", id: callId, name: "execute_command", args: { command: "pnpm test" } }],
    createdAt: 1,
  };
}

function toolResult(id: string, callId: string): Message {
  return {
    id,
    role: "tool",
    parts: [{ type: "tool_result", callId, content: "[exit code 0]" }],
    createdAt: 2,
  };
}

describe("pendingToolCallIds", () => {
  it("returns every tool_call id that has no matching tool_result", () => {
    const history: Message[] = [
      assistant("a1", "call_1"),
      toolResult("t1", "call_1"),
      assistant("a2", "call_2"),
    ];
    expect(pendingToolCallIds(history)).toEqual(["call_2"]);
  });

  it("returns an empty list when the history is fully answered", () => {
    const history: Message[] = [
      assistant("a1", "call_1"),
      toolResult("t1", "call_1"),
      assistant("a2", "call_2"),
      toolResult("t2", "call_2"),
    ];
    expect(pendingToolCallIds(history)).toEqual([]);
  });

  it("does not duplicate a repeated tool_call id", () => {
    const history: Message[] = [
      { id: "a1", role: "assistant", parts: [
        { type: "tool_call", id: "call_1", name: "read_file", args: {} },
        { type: "tool_call", id: "call_1", name: "read_file", args: {} },
      ], createdAt: 1 },
    ];
    expect(pendingToolCallIds(history)).toEqual(["call_1"]);
  });
});

describe("cancelPendingToolCalls", () => {
  it("appends a 'cancelled by user' tool result for the pending call", () => {
    const history: Message[] = [assistant("a1", "call_1")];
    const cancelled = cancelPendingToolCalls(history, { now: 100, messageId: "cancel-msg" });

    expect(cancelled).toHaveLength(2);
    expect(cancelled[1]).toEqual({
      id: "cancel-msg",
      role: "tool",
      parts: [{ type: "tool_result", callId: "call_1", content: CANCELLED_TOOL_RESULT, isError: true }],
      createdAt: 100,
    });
    expect(pendingToolCallIds(cancelled)).toEqual([]);
  });

  it("closes multiple pending calls in one tool message", () => {
    const history: Message[] = [
      { id: "a1", role: "assistant", parts: [
        { type: "tool_call", id: "call_1", name: "read_file", args: {} },
        { type: "tool_call", id: "call_2", name: "read_file", args: {} },
      ], createdAt: 1 },
    ];
    const cancelled = cancelPendingToolCalls(history, { now: 5 });

    expect(cancelled).toHaveLength(2);
    const result = cancelled[1]!;
    expect(result.role).toBe("tool");
    expect(result.parts.map((p) => (p.type === "tool_result" ? p.callId : null))).toEqual(["call_1", "call_2"]);
    expect(pendingToolCallIds(cancelled)).toEqual([]);
  });

  it("returns the same array unchanged when nothing is pending", () => {
    const history: Message[] = [assistant("a1", "call_1"), toolResult("t1", "call_1")];
    expect(cancelPendingToolCalls(history)).toBe(history);
  });

  it("never mutates the input history", () => {
    const history: Message[] = [assistant("a1", "call_1")];
    const snapshot = structuredClone(history);
    cancelPendingToolCalls(history, { now: 1, messageId: "x" });
    expect(history).toEqual(snapshot);
    expect(history).toHaveLength(1);
  });

  it("does not touch already-answered calls", () => {
    const history: Message[] = [
      assistant("a1", "call_1"),
      toolResult("t1", "call_1"),
      assistant("a2", "call_2"),
    ];
    const cancelled = cancelPendingToolCalls(history, { now: 1, messageId: "x" });
    expect(cancelled[1]).toEqual(toolResult("t1", "call_1"));
    expect(cancelled).toHaveLength(4);
  });
});
