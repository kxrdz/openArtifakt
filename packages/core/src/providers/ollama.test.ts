import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import type { StreamEvent } from "@openartifact/shared";
import { z } from "zod";

import {
  buildOllamaRequest,
  createOllamaAdapter,
  mapOllamaStopReason,
  parseOllamaBody,
  parseOllamaNdjson,
  reduceOllamaChunks,
} from "./ollama";

function fixture(name: string): string {
  const url = new URL(`../../test/fixtures/providers/ollama/${name}`, import.meta.url);
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

/** Run a raw NDJSON body through the full parse + reduce pipeline. */
async function events(text: string, byteChunkSize = 0): Promise<StreamEvent[]> {
  const collected: StreamEvent[] = [];
  for await (const event of reduceOllamaChunks(parseOllamaNdjson(bytesOf(text, byteChunkSize)))) {
    collected.push(event);
  }
  return collected;
}

describe("ollama: plain text", () => {
  it("emits text deltas, usage and an end_turn done event", async () => {
    expect(await events(fixture("plain-text.ndjson"))).toEqual([
      { type: "text_delta", text: "Hello" },
      { type: "text_delta", text: " world" },
      { type: "usage", inputTokens: 12, outputTokens: 4 },
      { type: "done", stopReason: "end_turn" },
    ]);
  });
});

describe("ollama: single tool call", () => {
  it("emits start/end for one native tool call with a synthesized id", async () => {
    expect(await events(fixture("single-tool-call.ndjson"))).toEqual([
      { type: "tool_call_start", id: "call_0", name: "read_file" },
      { type: "tool_call_end", id: "call_0", args: { path: "src/index.ts" } },
      { type: "usage", inputTokens: 30, outputTokens: 15 },
      { type: "done", stopReason: "tool_use" },
    ]);
  });
});

describe("ollama: parallel tool calls", () => {
  it("emits start/end per tool call in arrival order, keyed by synthesized ids", async () => {
    expect(await events(fixture("parallel-tool-calls.ndjson"))).toEqual([
      { type: "tool_call_start", id: "call_0", name: "read_file" },
      { type: "tool_call_end", id: "call_0", args: { path: "a.ts" } },
      { type: "tool_call_start", id: "call_1", name: "list_directory" },
      { type: "tool_call_end", id: "call_1", args: { path: "src" } },
      { type: "usage", inputTokens: 40, outputTokens: 22 },
      { type: "done", stopReason: "tool_use" },
    ]);
  });
});

describe("ollama: error mid-stream", () => {
  it("surfaces a streamed error event after partial text, without retrying", async () => {
    expect(await events(fixture("error-mid-stream.ndjson"))).toEqual([
      { type: "text_delta", text: "Let me think" },
      { type: "error", message: "model load failed: out of memory", retryable: false },
    ]);
  });

  it("parses an error reported as an object", async () => {
    const result = await events('{"message":{"role":"assistant","content":"x"},"done":false}\n{"error":{"message":"bad model"}}\n');
    expect(result).toEqual([
      { type: "text_delta", text: "x" },
      { type: "error", message: "bad model", retryable: false },
    ]);
  });
});

describe("ollama: final-line handling", () => {
  it("maps done_reason and emits usage before the terminal done", () => {
    expect(mapOllamaStopReason("stop")).toBe("end_turn");
    expect(mapOllamaStopReason("tool_calls")).toBe("tool_use");
    expect(mapOllamaStopReason("length")).toBe("max_tokens");
    expect(mapOllamaStopReason("load")).toBe("end_turn");
    expect(mapOllamaStopReason(null)).toBe("end_turn");
    expect(mapOllamaStopReason(undefined)).toBe("end_turn");
  });

  it("terminates a stream that ends without a done:true line, flushing open calls", async () => {
    expect(await events(fixture("truncated.ndjson"))).toEqual([
      { type: "tool_call_start", id: "call_0", name: "write_file" },
      { type: "tool_call_end", id: "call_0", args: { path: "out.txt", content: "hi" } },
      { type: "done", stopReason: "end_turn" },
    ]);
  });

  it("emits no usage event when the final line lacks eval counts", async () => {
    const result = await events('{"message":{"role":"assistant","content":"done"},"done":true,"done_reason":"stop"}\n');
    expect(result).toEqual([
      { type: "text_delta", text: "done" },
      { type: "done", stopReason: "end_turn" },
    ]);
  });
});

describe("ollama: NDJSON parsing robustness", () => {
  it("reassembles lines split across arbitrary byte boundaries", async () => {
    const text = fixture("parallel-tool-calls.ndjson");
    const whole = await events(text);
    for (const size of [1, 3, 7, 64]) {
      expect(await events(text, size)).toEqual(whole);
    }
  });

  it("handles CRLF line endings and skips blank lines", () => {
    const crlf = fixture("plain-text.ndjson").replace(/\n/g, "\r\n") + "\r\n";
    const chunks = parseOllamaBody(crlf);
    expect(chunks.length).toBe(3);
    expect(chunks.at(-1)).toMatchObject({
      done: true,
      done_reason: "stop",
      prompt_eval_count: 12,
      eval_count: 4,
    });
  });

  it("skips malformed lines instead of throwing", () => {
    const chunks = parseOllamaBody('not-json\n{"message":{"role":"assistant","content":"hi"},"done":true}\n');
    expect(chunks).toEqual([{ message: { role: "assistant", content: "hi" }, done: true }]);
  });
});

describe("ollama: request body", () => {
  const readFileTool = {
    name: "read_file",
    description: "Read a file",
    parameters: z.object({ path: z.string().min(1) }),
  };

  it("maps system/user text, assistant tool calls, and tool results with tool_name recovery", () => {
    const body = buildOllamaRequest({
      model: "llama3.2",
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

    expect(body.model).toBe("llama3.2");
    expect(body.stream).toBe(true);
    expect(body.options).toEqual({ temperature: 0.2, num_predict: 512 });
    expect(body.messages).toEqual([
      { role: "system", content: "You are helpful." },
      { role: "user", content: "Read src/index.ts" },
      {
        role: "assistant",
        content: "",
        tool_calls: [{ function: { name: "read_file", arguments: { path: "src/index.ts" } } }],
      },
      { role: "tool", content: "line 1", tool_name: "read_file" },
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

  it("converts tool schemas to the Ollama dialect (no $schema/additionalProperties)", () => {
    const body = buildOllamaRequest({
      model: "llama3.2",
      messages: [{ id: "m1", role: "user", parts: [{ type: "text", text: "hi" }], createdAt: 1 }],
      tools: [readFileTool],
    });

    const parameters = body.tools?.[0]?.function?.parameters;
    expect(parameters).not.toHaveProperty("$schema");
    expect(parameters).not.toHaveProperty("additionalProperties");
    expect(parameters?.type).toBe("object");
    expect(parameters?.properties).toMatchObject({ path: { type: "string", minLength: 1 } });
  });

  it("falls back to the call id as tool_name when the function name is unknown", () => {
    const body = buildOllamaRequest({
      model: "llama3.2",
      messages: [
        {
          id: "m1",
          role: "tool",
          parts: [{ type: "tool_result", callId: "call_orphan", content: "boom" }],
          createdAt: 1,
        },
      ],
    });

    expect(body.messages).toEqual([
      { role: "tool", content: "boom", tool_name: "call_orphan" },
    ]);
  });

  it("parses string-encoded tool arguments into a JSON object", () => {
    const body = buildOllamaRequest({
      model: "llama3.2",
      messages: [
        {
          id: "m1",
          role: "assistant",
          parts: [
            { type: "tool_call", id: "call_1", name: "read_file", args: '{"path":"a.ts"}' },
          ],
          createdAt: 1,
        },
      ],
    });

    expect(body.messages).toEqual([
      {
        role: "assistant",
        content: "",
        tool_calls: [{ function: { name: "read_file", arguments: { path: "a.ts" } } }],
      },
    ]);
  });

  it("omits optional request fields when not provided", () => {
    const body = buildOllamaRequest({
      model: "llama3.2",
      messages: [{ id: "m1", role: "user", parts: [{ type: "text", text: "hi" }], createdAt: 1 }],
    });
    expect(body.options).toBeUndefined();
    expect(body.tools).toBeUndefined();
  });
});

describe("ollama: adapter", () => {
  it("exposes the canonical id", () => {
    expect(createOllamaAdapter().id).toBe("ollama");
  });

  it("streams the recorded NDJSON body through the live fetch path", async () => {
    const response = new Response(fixture("single-tool-call.ndjson"), {
      status: 200,
      headers: { "content-type": "application/x-ndjson" },
    });
    const fetchImpl = (async () => response) as unknown as typeof fetch;
    const adapter = createOllamaAdapter({ fetchImpl });

    const collected: StreamEvent[] = [];
    for await (const event of adapter.stream(
      {
        model: "llama3.2",
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
      { type: "done", stopReason: "tool_use" },
    ]);
  });

  it("posts to /api/chat under the configured base URL", async () => {
    let requestedUrl = "";
    const fetchImpl = (async (url: string | URL | Request) => {
      requestedUrl = String(url);
      return new Response('{"message":{"role":"assistant","content":"hi"},"done":true}\n', {
        status: 200,
        headers: { "content-type": "application/x-ndjson" },
      });
    }) as unknown as typeof fetch;
    const adapter = createOllamaAdapter({ fetchImpl, baseUrl: "http://127.0.0.1:11434/" });

    for await (const _ of adapter.stream(
      {
        model: "llama3.2",
        messages: [{ id: "m1", role: "user", parts: [{ type: "text", text: "hi" }], createdAt: 1 }],
      },
      new AbortController().signal,
    )) {
      // drain
    }

    expect(requestedUrl).toBe("http://127.0.0.1:11434/api/chat");
  });

  it("throws ProviderHttpError on a non-ok response, preserving retry hints", async () => {
    const response = new Response("rate limited", {
      status: 429,
      headers: { "retry-after": "3" },
    });
    const fetchImpl = (async () => response) as unknown as typeof fetch;
    const adapter = createOllamaAdapter({ fetchImpl });

    await expect(
      (async () => {
        for await (const _ of adapter.stream(
          {
            model: "llama3.2",
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
