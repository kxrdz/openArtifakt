import { describe, expect, it } from "vitest";

import {
  approvalModeSchema,
  conversationHistorySchema,
  conversationSummarySchema,
  historyArtifactSchema,
  historyToolCallSchema,
  isConversationHistory,
  isConversationSummary,
  isSettings,
  parseConversationHistory,
  parseConversationSummary,
  parseSettings,
  providerCapabilitiesSchema,
  providerIdSchema,
  settingsSchema,
} from "./index";

describe("settings schema", () => {
  const settings = {
    provider: "anthropic",
    model: "claude-3-5-haiku-latest",
    baseUrl: "https://api.anthropic.com",
    apiKeyRef: "ANTHROPIC_API_KEY",
    approvalMode: "ask",
    contextWindow: 200_000,
    capabilities: { nativeTools: true, streamingToolArgs: true, vision: true },
  };

  it("parses a full settings object", () => {
    expect(parseSettings(settings)).toEqual(settings);
    expect(isSettings(settings)).toBe(true);
  });

  it("accepts a null api key reference (local provider needs no key)", () => {
    expect(isSettings({ ...settings, apiKeyRef: null })).toBe(true);
  });

  it("rejects an unknown provider, unknown approval mode and blank model", () => {
    expect(settingsSchema.safeParse({ ...settings, provider: "openai" }).success).toBe(false);
    expect(settingsSchema.safeParse({ ...settings, approvalMode: "none" }).success).toBe(false);
    expect(settingsSchema.safeParse({ ...settings, model: "" }).success).toBe(false);
  });

  it("exposes provider and approval-mode enums and capabilities", () => {
    for (const id of ["openai-compatible", "anthropic", "gemini", "ollama"]) {
      expect(providerIdSchema.safeParse(id).success).toBe(true);
    }
    for (const mode of ["ask", "auto-edit", "full-auto"]) {
      expect(approvalModeSchema.safeParse(mode).success).toBe(true);
    }
    expect(
      providerCapabilitiesSchema.safeParse({
        nativeTools: false,
        streamingToolArgs: false,
        vision: false,
      }).success,
    ).toBe(true);
    expect(isSettings("not settings")).toBe(false);
  });
});

describe("conversation summary schema", () => {
  it("parses a summary and its type guard agrees", () => {
    const summary = { id: "conv-1", title: "Fix the build", createdAt: 1700000000000 };
    expect(parseConversationSummary(summary)).toEqual(summary);
    expect(isConversationSummary(summary)).toBe(true);
  });

  it("rejects a malformed summary", () => {
    expect(conversationSummarySchema.safeParse({ id: "conv-1" }).success).toBe(false);
    expect(isConversationSummary(null)).toBe(false);
  });
});

describe("conversation history schema", () => {
  const history = {
    conversation: { id: "conv-1", title: "Fix the build", createdAt: 1700000000000 },
    messages: [
      {
        id: "msg-1",
        role: "user",
        parts: [{ type: "text", text: "fix it" }],
        createdAt: 1700000000001,
      },
      {
        id: "msg-2",
        role: "assistant",
        parts: [{ type: "text", text: "done" }],
        createdAt: 1700000000002,
      },
    ],
    artifacts: [
      {
        identifier: "app",
        title: "App",
        type: "application/vnd.react",
        language: null,
        createdAt: 1700000000003,
        versions: [
          { version: 1, content: "const A = 1", incomplete: false, createdAt: 1700000000003 },
          { version: 2, content: "const A = 2", incomplete: false, createdAt: 1700000000004 },
        ],
      },
    ],
    toolCalls: [
      {
        callId: "call-1",
        seq: 1,
        name: "edit_file",
        args: { path: "src/index.ts", oldString: "a", newString: "b" },
        result: "edited",
        isError: false,
        decision: { kind: "approve" },
        createdAt: 1700000000005,
      },
    ],
  };

  it("parses a full history with multi-version artifacts and approval decisions", () => {
    const parsed = parseConversationHistory(history);
    expect(parsed.conversation.id).toBe("conv-1");
    expect(parsed.messages).toHaveLength(2);
    expect(parsed.artifacts[0]?.versions).toHaveLength(2);
    expect(parsed.toolCalls[0]?.decision).toEqual({ kind: "approve" });
    expect(isConversationHistory(history)).toBe(true);
  });

  it("rejects histories with invalid nested records", () => {
    expect(
      conversationHistorySchema.safeParse({
        ...history,
        messages: [{ id: "m", role: "robot", parts: [], createdAt: 0 }],
      }).success,
    ).toBe(false);

    expect(
      historyToolCallSchema.safeParse({ ...history.toolCalls[0], decision: { kind: "maybe" } })
        .success,
    ).toBe(false);

    expect(
      historyArtifactSchema.safeParse({
        ...history.artifacts[0],
        versions: [{ version: 0, content: "", incomplete: false, createdAt: 0 }],
      }).success,
    ).toBe(false);
  });

  it("type guards distinguish history from arbitrary values", () => {
    expect(isConversationHistory("not history")).toBe(false);
    expect(isConversationSummary(42)).toBe(false);
  });
});
