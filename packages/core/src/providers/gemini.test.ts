import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import type { StreamEvent } from "@openartifact/shared";
import { z } from "zod";

import {
  buildGeminiRequest,
  createGeminiAdapter,
  mapGeminiStopReason,
  parseGeminiSse,
  parseGeminiSseBody,
  reduceGeminiChunks,
} from "./gemini";

function fixture(name: string): string {
  const url = new URL(`../../test/fixtures/providers/gemini/${name}`, import.meta.url);
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
  for await (const event of reduceGeminiChunks(parseGeminiSse(bytesOf(text, byteChunkSize)))) {
    collected.push(event);
  }
  return collected;
}

describe("gemini: plain text", () => {
  it("emits text deltas, usage and an end_turn done event", async () => {
    expect(await events(fixture("plain-text.sse"))).toEqual([
      { type: "text_delta", text: "Hello" },
      { type: "text_delta", text: " world" },
      { type: "usage", inputTokens: 12, outputTokens: 4 },
      { type: "done", stopReason: "end_turn" },
    ]);
  });
});

describe("gemini: single tool call", () => {
  it("emits start/end for one functionCall part with a synthesized id", async () => {
    expect(await events(fixture("single-tool-call.sse"))).toEqual([
      { type: "tool_call_start", id: "call_0", name: "read_file" },
      { type: "tool_call_end", id: "call_0", args: { path: "src/index.ts" } },
      { type: "usage", inputTokens: 30, outputTokens: 15 },
      { type: "done", stopReason: "end_turn" },
    ]);
  });
});

describe("gemini: parallel tool calls", () => {
  it("emits start/end per functionCall part, preserving correlation ids", async () => {
    expect(await events(fixture("parallel-tool-calls.sse"))).toEqual([
      { type: "tool_call_start", id: "call_a", name: "read_file" },
      { type: "tool_call_end", id: "call_a", args: { path: "a.ts" } },
      { type: "tool_call_start", id: "call_b", name: "list_directory" },
      { type: "tool_call_end", id: "call_b", args: { path: "src" } },
      { type: "usage", inputTokens: 40, outputTokens: 22 },
      { type: "done", stopReason: "end_turn" },
    ]);
  });
});

describe("gemini: error mid-stream", () => {
  it("surfaces a streamed error event after partial text, without retrying", async () => {
    expect(await events(fixture("error-mid-stream.sse"))).toEqual([
      { type: "text_delta", text: "Let me think" },
      { type: "error", message: "Resource has been exhausted", retryable: true },
    ]);
  });
});

describe("gemini: stop-reason mapping", () => {
  it("maps MAX_TOKENS to max_tokens and everything else to end_turn", () => {
    expect(mapGeminiStopReason("STOP")).toBe("end_turn");
    expect(mapGeminiStopReason("MAX_TOKENS")).toBe("max_tokens");
    expect(mapGeminiStopReason("SAFETY")).toBe("end_turn");
    expect(mapGeminiStopReason("RECITATION")).toBe("end_turn");
    expect(mapGeminiStopReason(null)).toBe("end_turn");
    expect(mapGeminiStopReason(undefined)).toBe("end_turn");
    expect(mapGeminiStopReason("FINISH_REASON_UNSPECIFIED")).toBe("end_turn");
  });
});

describe("gemini: SSE parsing robustness", () => {
  it("reassembles events split across arbitrary byte boundaries", async () => {
    const text = fixture("parallel-tool-calls.sse");
    const whole = await events(text);
    for (const size of [1, 3, 7, 64]) {
      expect(await events(text, size)).toEqual(whole);
    }
  });

  it("handles CRLF line endings", () => {
    const crlf = fixture("plain-text.sse").replace(/\n/g, "\r\n");
    const chunks = parseGeminiSseBody(crlf);
    expect(chunks.length).toBe(3);
    expect(chunks.at(-1)?.usageMetadata).toEqual({
      promptTokenCount: 12,
      candidatesTokenCount: 4,
      totalTokenCount: 16,
    });
  });

  it("skips malformed data lines instead of throwing", () => {
    const chunks = parseGeminiSseBody('data: not-json\n\ndata: {"candidates":[]}\n\n');
    expect(chunks).toEqual([{ candidates: [] }]);
  });
});

describe("gemini: request body", () => {
  const readFileTool = {
    name: "read_file",
    description: "Read a file",
    parameters: z.object({ path: z.string().min(1) }),
  };

  it("maps system/user text, assistant function calls, and user-message function responses", () => {
    const body = buildGeminiRequest({
      model: "gemini-2.5-flash",
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

    expect(body.contents).toEqual([
      { role: "user", parts: [{ text: "Read src/index.ts" }] },
      {
        role: "model",
        parts: [{ functionCall: { name: "read_file", args: { path: "src/index.ts" } } }],
      },
      {
        role: "user",
        parts: [
          {
            functionResponse: {
              name: "read_file",
              response: { content: "line 1" },
            },
          },
        ],
      },
    ]);
    expect(body.systemInstruction).toEqual({ parts: [{ text: "You are helpful." }] });
    expect(body.generationConfig).toEqual({ temperature: 0.2, maxOutputTokens: 512 });
    expect(body.tools).toEqual([
      {
        functionDeclarations: [
          {
            name: "read_file",
            description: "Read a file",
            parameters: expect.any(Object) as unknown,
          },
        ],
      },
    ]);
  });

  it("converts tool schemas to the Gemini-accepted subset", () => {
    const body = buildGeminiRequest({
      model: "gemini-2.5-flash",
      messages: [
        { id: "m1", role: "user", parts: [{ type: "text", text: "hi" }], createdAt: 1 },
      ],
      tools: [readFileTool],
    });

    const parameters = body.tools?.[0]?.functionDeclarations?.[0]?.parameters;
    expect(parameters).not.toHaveProperty("$schema");
    expect(parameters).not.toHaveProperty("additionalProperties");
    expect(parameters?.type).toBe("OBJECT");
    expect(parameters?.properties).toMatchObject({
      path: { type: "STRING", minLength: 1 },
    });
  });

  it("falls back to the call id when the function name is unknown and marks errors", () => {
    const body = buildGeminiRequest({
      model: "gemini-2.5-flash",
      messages: [
        {
          id: "m1",
          role: "tool",
          parts: [
            { type: "tool_result", callId: "call_orphan", content: "boom", isError: true },
          ],
          createdAt: 1,
        },
      ],
    });

    expect(body.contents).toEqual([
      {
        role: "user",
        parts: [
          {
            functionResponse: {
              name: "call_orphan",
              response: { content: "boom", isError: true },
            },
          },
        ],
      },
    ]);
  });

  it("omits optional request fields when not provided", () => {
    const body = buildGeminiRequest({
      model: "gemini-2.5-flash",
      messages: [{ id: "m1", role: "user", parts: [{ type: "text", text: "hi" }], createdAt: 1 }],
    });
    expect(body.systemInstruction).toBeUndefined();
    expect(body.generationConfig).toBeUndefined();
    expect(body.tools).toBeUndefined();
  });
});

describe("gemini: adapter", () => {
  it("exposes the canonical id", () => {
    expect(createGeminiAdapter().id).toBe("gemini");
  });

  it("streams the recorded SSE body through the live fetch path", async () => {
    const response = new Response(fixture("single-tool-call.sse"), {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    });
    const fetchImpl = (async () => response) as unknown as typeof fetch;
    const adapter = createGeminiAdapter({ fetchImpl });

    const collected: StreamEvent[] = [];
    for await (const event of adapter.stream(
      {
        model: "gemini-2.5-flash",
        messages: [{ id: "m1", role: "user", parts: [{ type: "text", text: "hi" }], createdAt: 1 }],
      },
      new AbortController().signal,
    )) {
      collected.push(event);
    }

    expect(collected).toEqual([
      { type: "tool_call_start", id: "call_0", name: "read_file" },
      { type: "tool_call_end", id: "call_0", args: { path: "src/index.ts" } },
      { type: "usage", inputTokens: 30, outputTokens: 15 },
      { type: "done", stopReason: "end_turn" },
    ]);
  });

  it("builds the model-scoped streamGenerateContent URL", async () => {
    let requestedUrl = "";
    const fetchImpl = (async (url: string | URL | Request) => {
      requestedUrl = String(url);
      return new Response("data: {\"candidates\":[]}\n\n", {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      });
    }) as unknown as typeof fetch;
    const adapter = createGeminiAdapter({ fetchImpl, apiKey: "secret" });

    for await (const _ of adapter.stream(
      {
        model: "gemini-2.5-flash",
        messages: [{ id: "m1", role: "user", parts: [{ type: "text", text: "hi" }], createdAt: 1 }],
      },
      new AbortController().signal,
    )) {
      // drain
    }

    expect(requestedUrl).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse",
    );
  });

  it("throws ProviderHttpError on a non-ok response, preserving retry hints", async () => {
    const response = new Response("rate limited", {
      status: 429,
      headers: { "retry-after": "3" },
    });
    const fetchImpl = (async () => response) as unknown as typeof fetch;
    const adapter = createGeminiAdapter({ fetchImpl });

    await expect(
      (async () => {
        for await (const _ of adapter.stream(
          {
            model: "gemini-2.5-flash",
            messages: [
              { id: "m1", role: "user", parts: [{ type: "text", text: "hi" }], createdAt: 1 },
            ],
          },
          new AbortController().signal,
        )) {
          // drain
        }
      })(),
    ).rejects.toMatchObject({ name: "ProviderHttpError", status: 429, retryAfterMs: 3000 });
  });
});
