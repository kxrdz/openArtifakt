import { describe, expect, it } from "vitest";

import type { ApprovalDecision, ChatEvent } from "@openartifact/shared";

import {
  applyChatEvent,
  createChatStore,
  initialChatState,
  type ChatMessage,
  type ChatTransport,
} from "./chatStore";

/** A transport whose events the test drives, with a manually-resolved stream. */
interface FakeTransport extends ChatTransport {
  emit: (event: ChatEvent) => void;
  resolveStream: () => void;
  decisions: Array<{ conversationId: string; decision: ApprovalDecision }>;
  stops: string[];
  undos: Array<{ conversationId: string; turn: number }>;
}

function makeFakeTransport(): FakeTransport {
  let onEvent: ((event: ChatEvent) => void) | null = null;
  let resolveStreamFn: (() => void) | null = null;
  const decisions: Array<{ conversationId: string; decision: ApprovalDecision }> = [];
  const stops: string[] = [];
  const undos: Array<{ conversationId: string; turn: number }> = [];

  return {
    stream: ({ onEvent: handler }) => {
      onEvent = handler;
      return new Promise<void>((resolve) => {
        resolveStreamFn = resolve;
      });
    },
    decide: async (input) => {
      decisions.push(input);
    },
    stop: async (input) => {
      stops.push(input.conversationId);
    },
    undo: async (input) => {
      undos.push(input);
      return { ok: true, turnId: String(input.turn), restored: [], deleted: [] };
    },
    emit: (event) => {
      onEvent?.(event);
    },
    resolveStream: () => {
      resolveStreamFn?.();
      resolveStreamFn = null;
    },
    decisions,
    stops,
    undos,
  };
}

describe("applyChatEvent", () => {
  it("accumulates text onto the in-progress assistant message", () => {
    const state: typeof initialChatState = {
      ...initialChatState,
      messages: [
        { id: "a", role: "assistant", content: "", toolCalls: [], createdAt: 0 },
      ],
    };

    const afterFirst = applyChatEvent(state, { type: "text", text: "Hello" });
    const afterSecond = applyChatEvent(afterFirst, { type: "text", text: ", world" });

    expect(afterSecond.messages[0]?.content).toBe("Hello, world");
  });

  it("records a pending approval and marks its tool call waiting", () => {
    const state: typeof initialChatState = {
      ...initialChatState,
      messages: [
        { id: "a", role: "assistant", content: "", toolCalls: [], createdAt: 0 },
      ],
    };

    const next = applyChatEvent(state, {
      type: "approval_request",
      callId: "c1",
      name: "execute_command",
      args: { command: "rm -rf dist" },
      reason: "Commands require approval.",
    });

    expect(next.pendingApproval?.callId).toBe("c1");
    expect(next.messages[0]?.toolCalls).toEqual([
      {
        callId: "c1",
        name: "execute_command",
        args: { command: "rm -rf dist" },
        status: "awaiting_approval",
      },
    ]);
  });

  it("clears the pending approval and resumes the tool on approve", () => {
    const state: typeof initialChatState = {
      ...initialChatState,
      pendingApproval: {
        type: "approval_request",
        callId: "c1",
        name: "execute_command",
        args: { command: "ls" },
        reason: "Commands require approval.",
      },
      messages: [
        {
          id: "a",
          role: "assistant",
          content: "",
          toolCalls: [
            {
              callId: "c1",
              name: "execute_command",
              args: { command: "ls" },
              status: "awaiting_approval",
            },
          ],
          createdAt: 0,
        },
      ],
    };

    const next = applyChatEvent(state, {
      type: "approval_decision",
      callId: "c1",
      name: "execute_command",
      decision: { kind: "approve" },
    });

    expect(next.pendingApproval).toBeNull();
    expect(next.messages[0]?.toolCalls[0]?.status).toBe("running");
  });

  it("appends command output to the terminal log", () => {
    const next = applyChatEvent(initialChatState, {
      type: "command_output",
      stream: "stdout",
      text: "ok\n",
    });
    expect(next.terminalLines).toEqual([{ stream: "stdout", text: "ok\n" }]);
  });
});

describe("chat store transition", () => {
  it("runs send → streaming → approval → decision → done", async () => {
    const transport = makeFakeTransport();
    const store = createChatStore(transport);

    const turn = store.getState().send("Please update notes.txt");
    expect(store.getState().isSending).toBe(true);
    expect(store.getState().messages.map((m) => m.role)).toEqual(["user", "assistant"]);

    transport.emit({ type: "conversation", conversationId: "conv-1" });
    transport.emit({ type: "state", state: "streaming" });
    transport.emit({ type: "text", text: "I'll " });
    transport.emit({ type: "text", text: "edit the file." });
    transport.emit({ type: "state", state: "awaiting_approval" });
    transport.emit({
      type: "approval_request",
      callId: "call-1",
      name: "edit_file",
      args: { path: "notes.txt", oldString: "a", newString: "b" },
      reason: "Writes require approval.",
    });

    const assistant: ChatMessage | undefined = store.getState().messages[1];
    expect(store.getState().agentState).toBe("awaiting_approval");
    expect(assistant?.content).toBe("I'll edit the file.");
    expect(store.getState().pendingApproval?.callId).toBe("call-1");
    expect(assistant?.toolCalls[0]).toMatchObject({
      callId: "call-1",
      name: "edit_file",
      status: "awaiting_approval",
    });

    await store.getState().decide({ kind: "approve" });
    expect(transport.decisions).toEqual([
      { conversationId: "conv-1", decision: { kind: "approve" } },
    ]);
    expect(store.getState().pendingApproval).toBeNull();

    transport.emit({
      type: "approval_decision",
      callId: "call-1",
      name: "edit_file",
      decision: { kind: "approve" },
    });
    transport.emit({ type: "state", state: "executing_tool" });
    transport.emit({
      type: "tool_start",
      callId: "call-1",
      name: "edit_file",
      args: { path: "notes.txt", oldString: "a", newString: "b" },
    });
    transport.emit({ type: "command_output", stream: "stdout", text: "done\n" });
    transport.emit({
      type: "tool_result",
      callId: "call-1",
      name: "edit_file",
      content: "updated",
      isError: false,
    });
    transport.emit({ type: "state", state: "done" });
    transport.emit({ type: "done", stopReason: "end_turn" });

    expect(store.getState().messages[1]?.toolCalls[0]).toMatchObject({
      status: "done",
      result: "updated",
    });
    expect(store.getState().terminalLines).toEqual([{ stream: "stdout", text: "done\n" }]);

    transport.resolveStream();
    await turn;

    expect(store.getState().agentState).toBe("done");
    expect(store.getState().isSending).toBe(false);
  });

  it("tracks a rejection decision without running the tool", async () => {
    const transport = makeFakeTransport();
    const store = createChatStore(transport);

    const turn = store.getState().send("run a command");
    transport.emit({ type: "conversation", conversationId: "conv-1" });
    transport.emit({ type: "state", state: "awaiting_approval" });
    transport.emit({
      type: "approval_request",
      callId: "c2",
      name: "execute_command",
      args: { command: "rm -rf dist" },
      reason: "Commands require approval.",
    });

    await store.getState().decide({ kind: "reject", note: "too risky" });
    expect(transport.decisions).toEqual([
      { conversationId: "conv-1", decision: { kind: "reject", note: "too risky" } },
    ]);

    transport.emit({
      type: "approval_decision",
      callId: "c2",
      name: "execute_command",
      decision: { kind: "reject", note: "too risky" },
    });
    transport.emit({
      type: "tool_result",
      callId: "c2",
      name: "execute_command",
      content: "too risky",
      isError: true,
    });
    transport.emit({ type: "state", state: "done" });
    transport.emit({ type: "done", stopReason: "end_turn" });

    expect(store.getState().messages[1]?.toolCalls[0]).toMatchObject({
      status: "error",
      isError: true,
      result: "too risky",
    });

    transport.resolveStream();
    await turn;
    expect(store.getState().isSending).toBe(false);
  });

  it("stops the in-flight turn and reports cancelled", async () => {
    const transport = makeFakeTransport();
    const store = createChatStore(transport);

    const turn = store.getState().send("stream slowly");
    transport.emit({ type: "conversation", conversationId: "conv-1" });
    transport.emit({ type: "state", state: "streaming" });
    transport.emit({ type: "text", text: "still going…" });

    store.getState().stop();
    expect(transport.stops).toEqual(["conv-1"]);
    expect(store.getState().agentState).toBe("cancelled");

    transport.emit({ type: "state", state: "cancelled" });
    transport.emit({ type: "done", stopReason: "cancelled" });
    transport.resolveStream();
    await turn;

    expect(store.getState().agentState).toBe("cancelled");
    expect(store.getState().isSending).toBe(false);
  });

  it("ignores a second send while a turn is in flight", () => {
    const transport = makeFakeTransport();
    const store = createChatStore(transport);

    void store.getState().send("first");
    void store.getState().send("second");

    // Only the first turn's messages were appended.
    expect(store.getState().messages.map((m) => m.content)).toEqual(["first", ""]);
  });

  it("undoTurn delegates to the transport with the conversation and turn ids", async () => {
    const transport = makeFakeTransport();
    const store = createChatStore(transport);
    store.setState({ conversationId: "conv-1" });

    const result = await store.getState().undoTurn(3);

    expect(transport.undos).toEqual([{ conversationId: "conv-1", turn: 3 }]);
    expect(result).toEqual({ ok: true, turnId: "3", restored: [], deleted: [] });
  });

  it("undoTurn rejects when there is no active conversation", async () => {
    const store = createChatStore(makeFakeTransport());

    await expect(store.getState().undoTurn(1)).rejects.toThrow(
      "No active conversation to undo.",
    );
  });
});
