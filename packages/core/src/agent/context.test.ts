import { describe, expect, it } from "vitest";

import type { ContentPart, Message } from "@openartifact/shared";

import {
  CHARS_PER_TOKEN,
  ContextManager,
  buildToolResultStub,
  compactToolResults,
  estimateMessagesTokens,
  estimateTextTokens,
} from "./context";

let counter = 0;
function message(role: Message["role"], parts: ContentPart[]): Message {
  counter += 1;
  return { id: `m${counter}`, role, parts, createdAt: counter };
}

function text(text: string): ContentPart {
  return { type: "text", text };
}

function toolCall(id: string, name: string, args: unknown): ContentPart {
  return { type: "tool_call", id, name, args };
}

function toolResult(callId: string, content: string, isError = false): ContentPart {
  return { type: "tool_result", callId, content, isError };
}

describe("estimateTextTokens", () => {
  it("returns zero for empty text", () => {
    expect(estimateTextTokens("")).toBe(0);
  });

  it("ceil-divides by the chars-per-token constant", () => {
    expect(estimateTextTokens("abc")).toBe(1);
    expect(estimateTextTokens("abcd")).toBe(1);
    expect(estimateTextTokens("abcde")).toBe(2);
    expect(CHARS_PER_TOKEN).toBe(4);
  });
});

describe("estimateMessagesTokens", () => {
  it("sums part estimates plus per-message overhead", () => {
    const history = [
      message("system", [text("you are a helpful assistant")]),
      message("user", [text("hello")]),
    ];
    // "hello" (5 chars -> 2) + 4 overhead = 6; system part 27 chars -> 7 + 4 = 11.
    expect(estimateMessagesTokens(history)).toBe(17);
  });

  it("counts tool calls and results", () => {
    const history = [
      message("assistant", [toolCall("c1", "read_file", { path: "a.ts" })]),
      message("tool", [toolResult("c1", "1|hello")]),
    ];
    const total = estimateMessagesTokens(history);
    expect(total).toBeGreaterThan(0);
    expect(typeof total).toBe("number");
  });
});

describe("buildToolResultStub", () => {
  it("keeps the exit code marker", () => {
    const stub = buildToolResultStub("pnpm test", "ok\nok\n[exit code 1]");
    expect(stub).toBe('[output of "pnpm test" removed — 3 lines, exit code 1]');
  });

  it("keeps the timeout marker", () => {
    const stub = buildToolResultStub("pnpm test", "[command timed out after 120000 ms]");
    expect(stub).toBe('[output of "pnpm test" removed — 1 lines, timed out after 120000 ms]');
  });

  it("keeps the signal marker", () => {
    const stub = buildToolResultStub("pnpm test", "[terminated by signal]");
    expect(stub).toBe('[output of "pnpm test" removed — 1 lines, terminated by signal]');
  });

  it("reports zero lines for empty content", () => {
    expect(buildToolResultStub("read_file", "")).toBe('[output of "read_file" removed — 0 lines]');
  });
});

describe("compactToolResults", () => {
  it("stubs only tool results older than the latest user message", () => {
    const history = [
      message("system", [text("system prompt")]),
      message("user", [text("run the tests")]),
      message("assistant", [toolCall("c1", "execute_command", { command: "pnpm test" })]),
      message("tool", [toolResult("c1", "line1\nline2\n[exit code 1]")]),
      message("user", [text("also read the readme")]),
      message("assistant", [toolCall("c2", "read_file", { path: "README.md" })]),
      message("tool", [toolResult("c2", "1|hello")]),
    ];

    const { messages, stubbed } = compactToolResults(history);

    expect(stubbed).toBe(1);
    expect(messages).toHaveLength(7);

    // System prompt is untouched.
    expect(messages[0]!.parts[0]).toEqual(text("system prompt"));
    // Latest user message is untouched.
    expect(messages[4]!.parts[0]).toEqual(text("also read the readme"));
    // The old tool result is stubbed with the command label.
    expect(messages[3]!.parts[0]).toEqual({
      type: "tool_result",
      callId: "c1",
      content: '[output of "pnpm test" removed — 3 lines, exit code 1]',
      isError: false,
    });
    // The current turn's tool result is left alone.
    expect(messages[6]!.parts[0]).toEqual(toolResult("c2", "1|hello"));
  });

  it("falls back to the call id when no matching tool call exists", () => {
    const history = [
      message("user", [text("first turn")]),
      message("tool", [toolResult("ghost", "1|hi")]),
      message("user", [text("latest")]),
    ];
    const { messages, stubbed } = compactToolResults(history);
    expect(stubbed).toBe(1);
    const part = messages[1]!.parts[0]!;
    expect(part.type).toBe("tool_result");
    if (part.type === "tool_result") {
      expect(part.content).toBe('[output of "ghost" removed — 1 lines]');
    }
  });

  it("does not mutate the input array", () => {
    const history = [
      message("user", [text("x")]),
      message("tool", [toolResult("c1", "1|hi")]),
    ];
    compactToolResults(history);
    expect(history[1]!.parts[0]).toEqual(toolResult("c1", "1|hi"));
  });

  it("leaves history alone when there is no user message", () => {
    const history = [message("system", [text("prompt")]), message("tool", [toolResult("c1", "1|hi")])];
    const { messages, stubbed } = compactToolResults(history);
    expect(stubbed).toBe(0);
    expect(messages).toBe(history);
  });
});

describe("ContextManager", () => {
  it("computes the 75 % threshold by flooring", () => {
    const manager = new ContextManager({ contextWindow: 1000 });
    expect(manager.threshold()).toBe(750);
  });

  it("respects a custom warn fraction", () => {
    const manager = new ContextManager({ contextWindow: 1000, warnFraction: 0.5 });
    expect(manager.threshold()).toBe(500);
  });

  it("flags usage above the threshold", () => {
    const manager = new ContextManager({ contextWindow: 1000 });
    expect(manager.isOverThreshold(750)).toBe(false);
    expect(manager.isOverThreshold(751)).toBe(true);
  });

  it("returns the history unchanged when under the threshold", () => {
    const manager = new ContextManager({ contextWindow: 1000, estimate: () => 100 });
    const history = [message("user", [text("x")])];
    const { messages, stubbed } = manager.compact(history);
    expect(stubbed).toBe(0);
    expect(messages).toBe(history);
  });

  it("stubs when the injected estimate exceeds the threshold", () => {
    const manager = new ContextManager({ contextWindow: 1000, estimate: () => 800 });
    const history = [
      message("user", [text("run tests")]),
      message("assistant", [toolCall("c1", "execute_command", { command: "pnpm test" })]),
      message("tool", [toolResult("c1", "a\n[exit code 0]")]),
      message("user", [text("latest")]),
    ];
    const { messages, stubbed } = manager.compact(history);
    expect(stubbed).toBe(1);
    expect(messages[2]!.parts[0]).toEqual({
      type: "tool_result",
      callId: "c1",
      content: '[output of "pnpm test" removed — 2 lines, exit code 0]',
      isError: false,
    });
  });
});
