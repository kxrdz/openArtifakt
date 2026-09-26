import { describe, expect, it } from "vitest";
import {
  SHARED_VERSION,
  isMessage,
  messageSchema,
  parseContentPart,
  parseMessage,
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
