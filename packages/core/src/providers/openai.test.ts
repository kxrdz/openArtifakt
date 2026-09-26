import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import type { StreamEvent } from "@openartifact/shared";
import { z } from "zod";

import {
  buildOpenAiRequest,
  createOpenAiCompatibleAdapter,
  parseOpenAiSse,
  parseOpenAiSseBody,
  reduceOpenAiChunks,
} from "./openai";

function fixture(name: string): string {
  const url = new URL(`../../test/fixtures/providers/openai/${name}`, import.meta.url);
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
  for await (const event of reduceOpenAiChunks(parseOpenAiSse(bytesOf(text, byteChunkSize)))) {
    collected.push(event);
  }
  return collected;
}

describe("openai-compatible: plain text", () => {
  it("emits text deltas, usage and an end_turn done event", async () => {
    expect(await events(fixture("plain-text.sse"))).toEqual([
      { type: "text_delta", text: "Hello" },
      { type: "text_delta", text: " world" },
      { type: "usage", inputTokens: 12, outputTokens: 4 },
      { type: "done", stopReason: "end_turn" },
    ]);
  });
});

describe("openai-compatible: single tool call", () => {
  it("emits start/delta/end for one tool call and a tool_use done event", async () => {
    expect(await events(fixture("single-tool-call.sse"))).toEqual([
      { type: "tool_call_start", id: "call_abc123", name: "read_file" },
      { type: "tool_call_delta", id: "call_abc123", argsDelta: '{"path":"src/index.ts"}' },
      { type: "tool_call_end", id: "call_abc123", args: { path: "src/index.ts" } },
      { type: "done", stopReason: "tool_use" },
    ]);
  });
});

describe("openai-compatible: parallel tool calls", () => {
  it("reassembles each call by index independently", async () => {
    expect(await events(fixture("parallel-tool-calls.sse"))).toEqual([
      { type: "tool_call_start", id: "call_a", name: "read_file" },
      { type: "tool_call_delta", id: "call_a", argsDelta: '{"path":' },
      { type: "tool_call_start", id: "call_b", name: "list_directory" },
      { type: "tool_call_delta", id: "call_b", argsDelta: '{"path":"src"}' },
      { type: "tool_call_delta", id: "call_a", argsDelta: '"a.ts"}' },
      { type: "tool_call_end", id: "call_a", args: { path: "a.ts" } },
      { type: "tool_call_end", id: "call_b", args: { path: "src" } },
      { type: "done", stopReason: "tool_use" },
    ]);
  });
});

describe("openai-compatible: fragmented arguments", () => {
  it("concatenates argument fragments in arrival order into one parsed args object", async () => {
    const result = await events(fixture("fragmented-args.sse"));
    expect(result).toEqual([
      { type: "tool_call_start", id: "call_frag", name: "execute_command" },
      { type: "tool_call_delta", id: "call_frag", argsDelta: '{"com' },
      { type: "tool_call_delta", id: "call_frag", argsDelta: 'mand":' },
      { type: "tool_call_delta", id: "call_frag", argsDelta: '"pnpm' },
      { type: "tool_call_delta", id: "call_frag", argsDelta: ' test"}' },
      { type: "tool_call_end", id: "call_frag", args: { command: "pnpm test" } },
      { type: "done", stopReason: "tool_use" },
    ]);
  });
});

describe("openai-compatible: error mid-stream", () => {
  it("surfaces a streamed error event after partial text, without retrying", async () => {
    expect(await events(fixture("error-mid-stream.sse"))).toEqual([
      { type: "text_delta", text: "Let me think" },
      { type: "text_delta", text: " about this..." },
      {
        type: "error",
        message: "The server had an error while processing your request",
        retryable: false,
      },
    ]);
  });
});

describe("openai-compatible: SSE parsing robustness", () => {
  it("reassembles events split across arbitrary byte boundaries", async () => {
    const text = fixture("plain-text.sse");
    const whole = await events(text);
    for (const size of [1, 3, 7, 64]) {
      expect(await events(text, size)).toEqual(whole);
    }
  });

  it("handles CRLF line endings and skips the [DONE] sentinel", () => {
    const crlf = fixture("plain-text.sse").replace(/\n/g, "\r\n");
    const chunks = parseOpenAiSseBody(crlf);
    expect(chunks.length).toBe(5);
    expect(chunks.at(-1)?.usage).toEqual({
      prompt_tokens: 12,
      completion_tokens: 4,
      total_tokens: 16,
    });
    expect(chunks.at(-1)?.choices).toEqual([]);
  });

  it("skips malformed data lines instead of throwing", () => {
    const chunks = parseOpenAiSseBody('data: not-json\n\ndata: {"choices":[]}\n\n');
    expect(chunks).toEqual([{ choices: [] }]);
  });
});

describe("openai-compatible: request body", () => {
  const readFileTool = {
    name: "read_file",
    description: "Read a file",
    parameters: z.object({ path: z.string().min(1) }),
  };

  it("maps system/user text, assistant tool calls, and tool results", () => {
    const body = buildOpenAiRequest({
      model: "gpt-4o-mini",
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
            { type: "tool_call", id: "call_1", name: "read_file", args: { path: "src/index.ts" } },
          ],
          createdAt: 3,
        },
        {
          id: "m4",
          role: "tool",
          parts: [{ type: "tool_result", callId: "call_1", content: "line 1" }],
          createdAt: 4,
        },
      ],
      tools: [readFileTool],
    });

    expect(body.model).toBe("gpt-4o-mini");
    expect(body.stream).toBe(true);
    expect(body.temperature).toBe(0.2);
    expect(body.max_tokens).toBe(512);
    expect(body.messages).toEqual([
      { role: "system", content: "You are helpful." },
      { role: "user", content: "Read src/index.ts" },
      {
        role: "assistant",
        content: null,
        tool_calls: [
          {
            id: "call_1",
            type: "function",
            function: { name: "read_file", arguments: '{"path":"src/index.ts"}' },
          },
        ],
      },
      { role: "tool", tool_call_id: "call_1", content: "line 1" },
    ]);
    expect(body.tools).toEqual([
      {
        type: "function",
        function: {
          name: "read_file",
          description: "Read a file",
          parameters: expect.any(Object) as unknown,
        },
      },
    ]);
  });

  it("omits optional request fields when not provided", () => {
    const body = buildOpenAiRequest({
      model: "gpt-4o-mini",
      messages: [{ id: "m1", role: "user", parts: [{ type: "text", text: "hi" }], createdAt: 1 }],
    });
    expect(body.temperature).toBeUndefined();
    expect(body.max_tokens).toBeUndefined();
    expect(body.tools).toBeUndefined();
  });
});

describe("openai-compatible: adapter", () => {
  it("exposes the canonical id", () => {
    expect(createOpenAiCompatibleAdapter().id).toBe("openai-compatible");
  });

  it("streams the recorded SSE body through the live fetch path", async () => {
    const response = new Response(fixture("single-tool-call.sse"), {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    });
    const fetchImpl = (async () => response) as unknown as typeof fetch;
    const adapter = createOpenAiCompatibleAdapter({ fetchImpl });

    const collected: StreamEvent[] = [];
    for await (const event of adapter.stream(
      {
        model: "gpt-4o-mini",
        messages: [{ id: "m1", role: "user", parts: [{ type: "text", text: "hi" }], createdAt: 1 }],
      },
      new AbortController().signal,
    )) {
      collected.push(event);
    }

    expect(collected).toEqual([
      { type: "tool_call_start", id: "call_abc123", name: "read_file" },
      { type: "tool_call_delta", id: "call_abc123", argsDelta: '{"path":"src/index.ts"}' },
      { type: "tool_call_end", id: "call_abc123", args: { path: "src/index.ts" } },
      { type: "done", stopReason: "tool_use" },
    ]);
  });
});
