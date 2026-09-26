import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import type { StreamEvent } from "@openartifact/shared";
import { z } from "zod";

import {
  buildAnthropicRequest,
  createAnthropicAdapter,
  mapStopReason,
  parseAnthropicSse,
  parseAnthropicSseBody,
  reduceAnthropicEvents,
} from "./anthropic";

function fixture(name: string): string {
  const url = new URL(`../../test/fixtures/providers/anthropic/${name}`, import.meta.url);
  return readFileSync(fileURLToPath(url), "utf8");
}

function bytesOf(text: string, chunkSize = 0): AsyncIterable<Uint8Array> {
  const bytes = new TextEncoder().encode(text);
  return {
    async *[Symbol.asyncIterator](): AsyncIterator<Uint8Array> {
      if (chunkSize <= 0) {
        yield bytes;
        return;
      }
      for (let i = 0; i < bytes.length; i += chunkSize) {
        yield bytes.slice(i, i + chunkSize);
      }
    },
  };
}

/** Run a raw SSE body through the full parse + reduce pipeline. */
async function events(text: string, byteChunkSize = 0): Promise<StreamEvent[]> {
  const collected: StreamEvent[] = [];
  for await (const event of reduceAnthropicEvents(parseAnthropicSse(bytesOf(text, byteChunkSize)))) {
    collected.push(event);
  }
  return collected;
}

describe("anthropic: plain text", () => {
  it("emits text deltas, usage and an end_turn done event", async () => {
    expect(await events(fixture("plain-text.sse"))).toEqual([
      { type: "text_delta", text: "Hello" },
      { type: "text_delta", text: " world" },
      { type: "usage", inputTokens: 25, outputTokens: 4 },
      { type: "done", stopReason: "end_turn" },
    ]);
  });
});

describe("anthropic: single tool call", () => {
  it("emits text, then start/delta/end for one tool_use block and a tool_use done event", async () => {
    expect(await events(fixture("single-tool-call.sse"))).toEqual([
      { type: "text_delta", text: "I'll read the file." },
      { type: "tool_call_start", id: "toolu_01abc", name: "read_file" },
      { type: "tool_call_delta", id: "toolu_01abc", argsDelta: '{"path":"src/index.ts"}' },
      { type: "tool_call_end", id: "toolu_01abc", args: { path: "src/index.ts" } },
      { type: "usage", inputTokens: 30, outputTokens: 15 },
      { type: "done", stopReason: "tool_use" },
    ]);
  });
});

describe("anthropic: parallel tool calls", () => {
  it("reassembles each tool_use block by index independently", async () => {
    expect(await events(fixture("parallel-tool-calls.sse"))).toEqual([
      { type: "tool_call_start", id: "toolu_01a", name: "read_file" },
      { type: "tool_call_delta", id: "toolu_01a", argsDelta: '{"path":' },
      { type: "tool_call_start", id: "toolu_01b", name: "list_directory" },
      { type: "tool_call_delta", id: "toolu_01b", argsDelta: '{"path":"src"}' },
      { type: "tool_call_delta", id: "toolu_01a", argsDelta: '"a.ts"}' },
      { type: "tool_call_end", id: "toolu_01a", args: { path: "a.ts" } },
      { type: "tool_call_end", id: "toolu_01b", args: { path: "src" } },
      { type: "usage", inputTokens: 40, outputTokens: 22 },
      { type: "done", stopReason: "tool_use" },
    ]);
  });
});

describe("anthropic: error mid-stream", () => {
  it("surfaces a streamed error event after partial text, without retrying", async () => {
    expect(await events(fixture("error-mid-stream.sse"))).toEqual([
      { type: "text_delta", text: "Let me think" },
      { type: "error", message: "Overloaded", retryable: true },
    ]);
  });
});

describe("anthropic: stop-reason mapping", () => {
  it("maps the documented Anthropic stop reasons to canonical values", () => {
    expect(mapStopReason("end_turn")).toBe("end_turn");
    expect(mapStopReason("tool_use")).toBe("tool_use");
    expect(mapStopReason("max_tokens")).toBe("max_tokens");
    expect(mapStopReason("stop_sequence")).toBe("end_turn");
    expect(mapStopReason("refusal")).toBe("end_turn");
    expect(mapStopReason(undefined)).toBe("end_turn");
    expect(mapStopReason("something-new")).toBe("end_turn");
  });
});

describe("anthropic: SSE parsing robustness", () => {
  it("reassembles events split across arbitrary byte boundaries", async () => {
    const text = fixture("parallel-tool-calls.sse");
    const whole = await events(text);
    for (const size of [1, 3, 7, 64]) {
      expect(await events(text, size)).toEqual(whole);
    }
  });

  it("handles CRLF line endings and ignores ping events", () => {
    // The fixture's trailing newline becomes a single CRLF; add another so the
    // appended ping event sits behind its own blank-line separator.
    const withPing =
      fixture("plain-text.sse").replace(/\n/g, "\r\n") +
      '\r\nevent: ping\r\ndata: {"type":"ping"}\r\n\r\n';
    const parsed = parseAnthropicSseBody(withPing);
    expect(parsed.length).toBe(8);
    expect(parsed.at(-1)).toEqual({ type: "ping" });
  });

  it("skips malformed data lines instead of throwing", () => {
    const parsed = parseAnthropicSseBody(
      'data: not-json\n\nevent: message_stop\ndata: {"type":"message_stop"}\n\n',
    );
    expect(parsed).toEqual([{ type: "message_stop" }]);
  });
});

describe("anthropic: request body", () => {
  const readFileTool = {
    name: "read_file",
    description: "Read a file",
    parameters: z.object({ path: z.string().min(1) }),
  };

  it("maps system/user text, assistant tool calls, and user-message tool results", () => {
    const body = buildAnthropicRequest({
      model: "claude-sonnet-4-20250514",
      temperature: 0.2,
      maxTokens: 512,
      messages: [
        {
          id: "m1",
          role: "system",
          parts: [{ type: "text", text: "You are helpful." }],
          createdAt: 1,
        },
        {
          id: "m2",
          role: "user",
          parts: [{ type: "text", text: "Read src/index.ts" }],
          createdAt: 2,
        },
        {
          id: "m3",
          role: "assistant",
          parts: [
            { type: "tool_call", id: "toolu_1", name: "read_file", args: { path: "src/index.ts" } },
          ],
          createdAt: 3,
        },
        {
          id: "m4",
          role: "tool",
          parts: [{ type: "tool_result", callId: "toolu_1", content: "line 1" }],
          createdAt: 4,
        },
      ],
      tools: [readFileTool],
    });

    expect(body.model).toBe("claude-sonnet-4-20250514");
    expect(body.max_tokens).toBe(512);
    expect(body.stream).toBe(true);
    expect(body.temperature).toBe(0.2);
    expect(body.system).toBe("You are helpful.");
    expect(body.messages).toEqual([
      { role: "user", content: [{ type: "text", text: "Read src/index.ts" }] },
      {
        role: "assistant",
        content: [
          {
            type: "tool_use",
            id: "toolu_1",
            name: "read_file",
            input: { path: "src/index.ts" },
          },
        ],
      },
      {
        role: "user",
        content: [{ type: "tool_result", tool_use_id: "toolu_1", content: "line 1" }],
      },
    ]);
    expect(body.tools).toEqual([
      {
        name: "read_file",
        description: "Read a file",
        input_schema: expect.any(Object) as unknown,
      },
    ]);
  });

  it("defaults max_tokens and groups consecutive tool results into one user message", () => {
    const body = buildAnthropicRequest({
      model: "claude-sonnet-4-20250514",
      messages: [
        {
          id: "m1",
          role: "assistant",
          parts: [
            { type: "tool_call", id: "a", name: "read_file", args: { path: "a" } },
            { type: "tool_call", id: "b", name: "read_file", args: { path: "b" } },
          ],
          createdAt: 1,
        },
        {
          id: "m2",
          role: "tool",
          parts: [{ type: "tool_result", callId: "a", content: "content a", isError: true }],
          createdAt: 2,
        },
        {
          id: "m3",
          role: "tool",
          parts: [{ type: "tool_result", callId: "b", content: "content b" }],
          createdAt: 3,
        },
      ],
    });

    expect(body.max_tokens).toBe(4096);
    expect(body.tools).toBeUndefined();
    expect(body.messages).toEqual([
      {
        role: "assistant",
        content: [
          { type: "tool_use", id: "a", name: "read_file", input: { path: "a" } },
          { type: "tool_use", id: "b", name: "read_file", input: { path: "b" } },
        ],
      },
      {
        role: "user",
        content: [
          { type: "tool_result", tool_use_id: "a", content: "content a", is_error: true },
          { type: "tool_result", tool_use_id: "b", content: "content b" },
        ],
      },
    ]);
  });
});

describe("anthropic: adapter", () => {
  it("exposes the canonical id", () => {
    expect(createAnthropicAdapter().id).toBe("anthropic");
  });

  it("streams the recorded SSE body through the live fetch path", async () => {
    const response = new Response(fixture("single-tool-call.sse"), {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    });
    const fetchImpl = (async () => response) as unknown as typeof fetch;
    const adapter = createAnthropicAdapter({ fetchImpl });

    const collected: StreamEvent[] = [];
    for await (const event of adapter.stream(
      {
        model: "claude-sonnet-4-20250514",
        messages: [{ id: "m1", role: "user", parts: [{ type: "text", text: "hi" }], createdAt: 1 }],
      },
      new AbortController().signal,
    )) {
      collected.push(event);
    }

    expect(collected).toEqual([
      { type: "text_delta", text: "I'll read the file." },
      { type: "tool_call_start", id: "toolu_01abc", name: "read_file" },
      { type: "tool_call_delta", id: "toolu_01abc", argsDelta: '{"path":"src/index.ts"}' },
      { type: "tool_call_end", id: "toolu_01abc", args: { path: "src/index.ts" } },
      { type: "usage", inputTokens: 30, outputTokens: 15 },
      { type: "done", stopReason: "tool_use" },
    ]);
  });

  it("throws ProviderHttpError on a non-ok response, preserving retry hints", async () => {
    const response = new Response("rate limited", {
      status: 429,
      headers: { "retry-after": "3" },
    });
    const fetchImpl = (async () => response) as unknown as typeof fetch;
    const adapter = createAnthropicAdapter({ fetchImpl });

    const collected: StreamEvent[] = [];
    await expect(
      (async () => {
        for await (const event of adapter.stream(
          {
            model: "claude-sonnet-4-20250514",
            messages: [
              { id: "m1", role: "user", parts: [{ type: "text", text: "hi" }], createdAt: 1 },
            ],
          },
          new AbortController().signal,
        )) {
          collected.push(event);
        }
      })(),
    ).rejects.toMatchObject({ name: "ProviderHttpError", status: 429, retryAfterMs: 3000 });
  });
});
