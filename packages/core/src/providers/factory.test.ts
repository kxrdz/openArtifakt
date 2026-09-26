import { describe, expect, it, vi } from "vitest";

import type { StreamEvent } from "@openartifact/shared";

import { createProviderAdapter } from "./factory";
import type { ModelConfig, ProviderId } from "./types";

function collect(iterable: AsyncIterable<StreamEvent>): Promise<StreamEvent[]> {
  const events: StreamEvent[] = [];
  return (async () => {
    for await (const event of iterable) events.push(event);
    return events;
  })();
}

function configFor(
  provider: ProviderId,
  capabilities: Partial<ModelConfig["capabilities"]> = {},
): ModelConfig {
  return {
    provider,
    model: "test-model",
    contextWindow: 8192,
    capabilities: {
      nativeTools: true,
      streamingToolArgs: true,
      vision: false,
      ...capabilities,
    },
  };
}

const request = {
  model: "test-model",
  messages: [{ id: "m1", role: "user" as const, parts: [{ type: "text" as const, text: "hi" }], createdAt: 1 }],
};

/** An OpenAI-compatible SSE body whose text carries one fallback tool call. */
const fallbackTextSse = [
  'data: {"choices":[{"delta":{"content":"<tool_call name=\\"read_file\\">{\\"path\\":\\"src/index.ts\\"}</tool_call>"},"index":0}]}',
  "",
  'data: {"choices":[{"delta":{},"finish_reason":"stop","index":0}]}',
  "",
  "data: [DONE]",
  "",
  "",
].join("\n");

function sseResponse(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { "content-type": "text/event-stream" },
  });
}

describe("createProviderAdapter: selection", () => {
  const providers: ProviderId[] = ["openai-compatible", "anthropic", "gemini", "ollama"];

  it.each(providers)("selects the %s adapter and exposes its id", (provider) => {
    const adapter = createProviderAdapter(configFor(provider), { fetchImpl: vi.fn() as unknown as typeof fetch });
    expect(adapter.id).toBe(provider);
  });

  it("throws on an unsupported provider id", () => {
    const bad = { ...configFor("openai-compatible"), provider: "nope" } as unknown as ModelConfig;
    expect(() => createProviderAdapter(bad)).toThrow("Unsupported provider: nope");
  });
});

describe("createProviderAdapter: fallback wiring", () => {
  it("extracts a <tool_call> block when nativeTools is false", async () => {
    const fetchImpl = (async () => sseResponse(fallbackTextSse)) as unknown as typeof fetch;
    const adapter = createProviderAdapter(configFor("openai-compatible", { nativeTools: false }), {
      fetchImpl,
    });

    const events = await collect(adapter.stream(request, new AbortController().signal));

    expect(events).toEqual([
      { type: "tool_call_start", id: "call_0", name: "read_file" },
      { type: "tool_call_delta", id: "call_0", argsDelta: '{"path":"src/index.ts"}' },
      { type: "tool_call_end", id: "call_0", args: { path: "src/index.ts" } },
      { type: "done", stopReason: "end_turn" },
    ]);
  });

  it("passes text through unchanged when nativeTools is true", async () => {
    const fetchImpl = (async () => sseResponse(fallbackTextSse)) as unknown as typeof fetch;
    const adapter = createProviderAdapter(configFor("openai-compatible", { nativeTools: true }), {
      fetchImpl,
    });

    const events = await collect(adapter.stream(request, new AbortController().signal));

    expect(events).toEqual([
      { type: "text_delta", text: '<tool_call name="read_file">{"path":"src/index.ts"}</tool_call>' },
      { type: "done", stopReason: "end_turn" },
    ]);
  });
});

describe("createProviderAdapter: retry wiring", () => {
  it("retries a 429 before any output and succeeds on the next attempt", async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls++;
      if (calls === 1) return sseResponse("", 429);
      return sseResponse(fallbackTextSse);
    }) as unknown as typeof fetch;

    const adapter = createProviderAdapter(configFor("openai-compatible", { nativeTools: true }), {
      fetchImpl,
      retry: { sleep: async () => {}, random: () => 0 },
    });

    const events = await collect(adapter.stream(request, new AbortController().signal));

    expect(calls).toBe(2);
    expect(events).toEqual([
      { type: "text_delta", text: '<tool_call name="read_file">{"path":"src/index.ts"}</tool_call>' },
      { type: "done", stopReason: "end_turn" },
    ]);
  });
});

describe("createProviderAdapter: secret resolution", () => {
  it("resolves the apiKeyRef from the environment by default", async () => {
    const fetchImpl = (async () => sseResponse(fallbackTextSse)) as unknown as typeof fetch;
    const resolveApiKey = vi.fn((ref: string) => (ref === "MY_KEY" ? "secret-value" : undefined));

    const config = configFor("openai-compatible", { nativeTools: true });
    config.apiKeyRef = "MY_KEY";

    const adapter = createProviderAdapter(config, { fetchImpl, resolveApiKey });
    expect(adapter.id).toBe("openai-compatible");
    expect(resolveApiKey).toHaveBeenCalledWith("MY_KEY");

    // The secret is wired into the underlying request, not visible on the adapter.
    await collect(adapter.stream(request, new AbortController().signal));
  });

  it("prefers an explicit apiKey override over the referenced env var", () => {
    const resolveApiKey = vi.fn(() => {
      throw new Error("should not resolve when an override is provided");
    });
    const config = configFor("openai-compatible");
    config.apiKeyRef = "MY_KEY";

    expect(() =>
      createProviderAdapter(config, { apiKey: "override", resolveApiKey }),
    ).not.toThrow();
    expect(resolveApiKey).not.toHaveBeenCalled();
  });
});
