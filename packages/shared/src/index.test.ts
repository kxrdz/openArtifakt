import { describe, expect, it } from "vitest";
import {
  SHARED_VERSION,
  isMessage,
  isStreamEvent,
  messageSchema,
  parseContentPart,
  parseMessage,
  parseStreamEvent,
  streamEventSchema,
} from "./index";

describe("shared", () => {
  it("exports a semver version string", () => {
    expect(SHARED_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

describe("canonical message model", () => {
  it("parses a message with text, tool call, and tool result parts", () => {
    const message = {
      id: "msg-1",
      role: "assistant",
      parts: [
        { type: "text", text: "Let me look at the file." },
        { type: "tool_call", id: "call-1", name: "read_file", args: { path: "src/index.ts" } },
        { type: "tool_result", callId: "call-1", content: "line 1", isError: false },
      ],
      createdAt: 1700000000000,
    };

    const parsed = parseMessage(message);
    expect(parsed.id).toBe("msg-1");
    expect(parsed.role).toBe("assistant");
    expect(parsed.parts).toHaveLength(3);

    const [text, call, result] = parsed.parts;
    expect(text).toEqual({ type: "text", text: "Let me look at the file." });
    expect(call).toEqual({
      type: "tool_call",
      id: "call-1",
      name: "read_file",
      args: { path: "src/index.ts" },
    });
    expect(result).toEqual({
      type: "tool_result",
      callId: "call-1",
      content: "line 1",
      isError: false,
    });
  });

  it("round-trips tool result parts with an optional isError flag", () => {
    const withoutError = parseContentPart({ type: "tool_result", callId: "c", content: "ok" });
    expect(withoutError.type).toBe("tool_result");
    if (withoutError.type === "tool_result") {
      expect(withoutError.isError).toBeUndefined();
    }

    const withError = parseContentPart({
      type: "tool_result",
      callId: "c",
      content: "boom",
      isError: true,
    });
    expect(withError.type).toBe("tool_result");
    if (withError.type === "tool_result") {
      expect(withError.isError).toBe(true);
    }
  });

  it("rejects an invalid role", () => {
    const result = messageSchema.safeParse({
      id: "m",
      role: "robot",
      parts: [],
      createdAt: 0,
    });
    expect(result.success).toBe(false);
  });

  it("type guard distinguishes messages from arbitrary values", () => {
    expect(isMessage({ id: "m", role: "user", parts: [], createdAt: 0 })).toBe(true);
    expect(isMessage({ id: "m", role: "user", parts: [{ type: "bogus" }], createdAt: 0 })).toBe(
      false,
    );
    expect(isMessage("not a message")).toBe(false);
  });
});

describe("canonical stream events", () => {
  it("parses a text_delta event", () => {
    expect(parseStreamEvent({ type: "text_delta", text: "hello" })).toEqual({
      type: "text_delta",
      text: "hello",
    });
  });

  it("parses the tool call lifecycle events", () => {
    expect(parseStreamEvent({ type: "tool_call_start", id: "call-1", name: "read_file" })).toEqual({
      type: "tool_call_start",
      id: "call-1",
      name: "read_file",
    });
    expect(parseStreamEvent({ type: "tool_call_delta", id: "call-1", argsDelta: '{"path":' })).toEqual({
      type: "tool_call_delta",
      id: "call-1",
      argsDelta: '{"path":',
    });
    expect(
      parseStreamEvent({ type: "tool_call_end", id: "call-1", args: { path: "src/index.ts" } }),
    ).toEqual({ type: "tool_call_end", id: "call-1", args: { path: "src/index.ts" } });
  });

  it("parses a usage event", () => {
    expect(parseStreamEvent({ type: "usage", inputTokens: 100, outputTokens: 42 })).toEqual({
      type: "usage",
      inputTokens: 100,
      outputTokens: 42,
    });
  });

  it("parses every terminal done stopReason", () => {
    for (const stopReason of ["end_turn", "tool_use", "max_tokens", "cancelled"] as const) {
      expect(parseStreamEvent({ type: "done", stopReason })).toEqual({ type: "done", stopReason });
    }
  });

  it("parses an error event with a retryable flag", () => {
    expect(parseStreamEvent({ type: "error", message: "rate limited", retryable: true })).toEqual({
      type: "error",
      message: "rate limited",
      retryable: true,
    });
    expect(parseStreamEvent({ type: "error", message: "bad request", retryable: false })).toEqual({
      type: "error",
      message: "bad request",
      retryable: false,
    });
  });

  it("rejects an unknown stopReason and unknown event type", () => {
    expect(streamEventSchema.safeParse({ type: "done", stopReason: "because" }).success).toBe(false);
    expect(streamEventSchema.safeParse({ type: "mystery" }).success).toBe(false);
  });

  it("type guard distinguishes stream events from arbitrary values", () => {
    expect(isStreamEvent({ type: "text_delta", text: "x" })).toBe(true);
    expect(isStreamEvent({ type: "done", stopReason: "end_turn" })).toBe(true);
    expect(isStreamEvent({ type: "error", message: "m", retryable: true })).toBe(true);
    expect(isStreamEvent({ type: "text_delta", text: 42 })).toBe(false);
    expect(isStreamEvent("not an event")).toBe(false);
  });
});
