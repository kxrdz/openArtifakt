import type {
  Message,
  StopReason,
  StreamEvent,
  ToolCallPart,
  ToolResultPart,
} from "@openartifact/shared";

import { parseRetryAfter, ProviderHttpError } from "./retry";
import { toOpenAiJsonSchema } from "./schemas";
import type { ChatRequest, ProviderAdapter } from "./types";

/**
 * OpenAI-compatible adapter (`/v1/chat/completions`, §4).
 *
 * Covers OpenAI, Groq, Together, DeepSeek, OpenRouter, vLLM, LM Studio and
 * LocalAI. The parsing logic lives in a pure reducer over the wire format so
 * the exact same code path runs against recorded fixtures and against the live
 * fetch body (see design.md "Vendor cores parse recorded wire formats").
 *
 * Streaming semantics:
 * - `choices[].delta` may carry `content` and/or `tool_calls[]` with an
 *   `index`; `tool_calls[].function.arguments` fragments are accumulated per
 *   index so parallel tool calls are reassembled independently.
 * - `tool_call_start` is emitted on first sight of an index; `tool_call_delta`
 *   per non-empty fragment; `tool_call_end` (with `JSON.parse`d arguments,
 *   falling back to `{}` on malformed JSON) once the response finishes.
 * - `finish_reason` maps to the canonical stop reason, `usage` (returned via
 *   `stream_options.include_usage`) becomes a `usage` event, and a streamed
 *   `error` object becomes an `error` event (never silently retried).
 */

// ---------------------------------------------------------------------------
// Wire types (loose: parsed from external JSON, never assumed well-formed)
// ---------------------------------------------------------------------------

export interface OpenAiToolCallDelta {
  index?: number;
  id?: string;
  type?: string;
  function?: { name?: string; arguments?: string };
}

export interface OpenAiDelta {
  role?: string;
  content?: string | null;
  tool_calls?: OpenAiToolCallDelta[];
}

export interface OpenAiChoice {
  index?: number;
  delta?: OpenAiDelta;
  /** Non-streaming final message (used by providers that omit streamed tool args). */
  message?: OpenAiDelta;
  finish_reason?: string | null;
}

export interface OpenAiUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

export interface OpenAiErrorBody {
  message?: string;
  type?: string;
  code?: string | number | null;
}

export interface OpenAiChunk {
  id?: string;
  object?: string;
  created?: number;
  model?: string;
  choices?: OpenAiChoice[];
  usage?: OpenAiUsage | null;
  error?: OpenAiErrorBody | null;
}

// ---------------------------------------------------------------------------
// Request body (canonical messages -> vendor request)
// ---------------------------------------------------------------------------

export interface OpenAiToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface OpenAiRequestMessage {
  role: "system" | "user" | "assistant" | "tool";
  content?: string | null;
  tool_calls?: OpenAiToolCall[];
  tool_call_id?: string;
}

export interface OpenAiTool {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters: Record<string, unknown>;
  };
}

export interface OpenAiRequestBody {
  model: string;
  messages: OpenAiRequestMessage[];
  stream: true;
  stream_options?: { include_usage: boolean };
  temperature?: number;
  max_tokens?: number;
  tools?: OpenAiTool[];
}

function textOf(parts: Message["parts"]): string {
  let text = "";
  for (const part of parts) {
    if (part.type === "text") text += part.text;
  }
  return text;
}

/** Convert one canonical message into zero or more OpenAI request messages. */
function messageToOpenAi(message: Message): OpenAiRequestMessage[] {
  switch (message.role) {
    case "system":
    case "user":
      return [{ role: message.role, content: textOf(message.parts) }];
    case "assistant": {
      const text = textOf(message.parts);
      const toolCalls = message.parts.filter(
        (part): part is ToolCallPart => part.type === "tool_call",
      );
      const result: OpenAiRequestMessage = {
        role: "assistant",
        content: text.length > 0 ? text : null,
      };
      if (toolCalls.length > 0) {
        result.tool_calls = toolCalls.map((call) => ({
          id: call.id,
          type: "function",
          function: { name: call.name, arguments: JSON.stringify(call.args) },
        }));
      }
      return [result];
    }
    case "tool":
      // Each tool_result part becomes its own `role: "tool"` message so the
      // provider can correlate it with the matching tool_call id.
      return message.parts
        .filter((part): part is ToolResultPart => part.type === "tool_result")
        .map((result) => ({
          role: "tool" as const,
          tool_call_id: result.callId,
          content: result.content,
        }));
  }
}

/** Build the `/v1/chat/completions` request body from a canonical request. */
export function buildOpenAiRequest(req: ChatRequest): OpenAiRequestBody {
  const body: OpenAiRequestBody = {
    model: req.model,
    messages: req.messages.flatMap(messageToOpenAi),
    stream: true,
    stream_options: { include_usage: true },
  };
  if (req.temperature !== undefined) body.temperature = req.temperature;
  if (req.maxTokens !== undefined) body.max_tokens = req.maxTokens;
  if (req.tools !== undefined && req.tools.length > 0) {
    body.tools = req.tools.map((tool) => ({
      type: "function",
      function: {
        name: tool.name,
        ...(tool.description !== undefined ? { description: tool.description } : {}),
        parameters: toOpenAiJsonSchema(tool),
      },
    }));
  }
  return body;
}

// ---------------------------------------------------------------------------
// SSE parsing
// ---------------------------------------------------------------------------

/** Extract the JSON payload of one SSE `data:` event. */
function parseSseEvent(event: string): OpenAiChunk | null {
  const data = event
    .replace(/\r/g, "")
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .join("\n");
  if (data === "" || data === "[DONE]") return null;
  try {
    return JSON.parse(data) as OpenAiChunk;
  } catch {
    // A malformed line is skipped; the reducer terminates the stream normally.
    return null;
  }
}

/** Parse a complete SSE response body (for tests and diagnostics). */
export function parseOpenAiSseBody(text: string): OpenAiChunk[] {
  const chunks: OpenAiChunk[] = [];
  for (const event of text.replace(/\r\n/g, "\n").split("\n\n")) {
    const chunk = parseSseEvent(event);
    if (chunk !== null) chunks.push(chunk);
  }
  return chunks;
}

/**
 * Incrementally decode an SSE byte stream into parsed chunks, so text and tool
 * calls stream without waiting for the full response body.
 */
export async function* parseOpenAiSse(
  body: AsyncIterable<Uint8Array>,
): AsyncIterable<OpenAiChunk> {
  const decoder = new TextDecoder();
  let buffer = "";
  for await (const bytes of body) {
    buffer += decoder.decode(bytes, { stream: true }).replace(/\r/g, "");
    let boundary = buffer.indexOf("\n\n");
    while (boundary !== -1) {
      const event = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const chunk = parseSseEvent(event);
      if (chunk !== null) yield chunk;
      boundary = buffer.indexOf("\n\n");
    }
  }
  const tail = (buffer + decoder.decode()).replace(/\r/g, "");
  const chunk = parseSseEvent(tail);
  if (chunk !== null) yield chunk;
}

// ---------------------------------------------------------------------------
// Reducer (wire chunks -> canonical StreamEvents)
// ---------------------------------------------------------------------------

function mapStopReason(reason: string): StopReason {
  switch (reason) {
    case "tool_calls":
    case "function_call":
      return "tool_use";
    case "length":
      return "max_tokens";
    default:
      return "end_turn";
  }
}

/** Reassemble a tool call's arguments; malformed JSON falls back to `{}`. */
function parseArgs(raw: string): unknown {
  const trimmed = raw.trim();
  if (trimmed === "") return {};
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return {};
  }
}

function errorMessage(error: OpenAiErrorBody): string {
  if (typeof error.message === "string" && error.message !== "") return error.message;
  if (error.code !== undefined && error.code !== null) {
    return `Provider error (code ${String(error.code)})`;
  }
  return "Provider error";
}

interface PendingCall {
  id: string;
  name: string;
  args: string;
  started: boolean;
}

/**
 * Reduce a stream of parsed OpenAI chunks into canonical `StreamEvent`s.
 * Terminates with exactly one `done` (or `error`) event.
 */
export async function* reduceOpenAiChunks(
  chunks: AsyncIterable<OpenAiChunk>,
): AsyncIterable<StreamEvent> {
  const calls = new Map<number, PendingCall>();
  let stopReason: StopReason = "end_turn";

  for await (const chunk of chunks) {
    if (chunk.error) {
      yield { type: "error", message: errorMessage(chunk.error), retryable: false };
      return;
    }

    for (const choice of chunk.choices ?? []) {
      const delta = choice.delta ?? choice.message;
      if (delta !== undefined) {
        if (typeof delta.content === "string" && delta.content.length > 0) {
          yield { type: "text_delta", text: delta.content };
        }

        for (const tc of delta.tool_calls ?? []) {
          const index = tc.index ?? 0;
          let call = calls.get(index);
          if (call === undefined) {
            call = { id: tc.id ?? `call_${index}`, name: "", args: "", started: false };
            calls.set(index, call);
          }
          if (call.name === "" && typeof tc.function?.name === "string") {
            call.name = tc.function.name;
          }
          if (!call.started) {
            call.started = true;
            yield { type: "tool_call_start", id: call.id, name: call.name };
          }
          const argsDelta = tc.function?.arguments;
          if (typeof argsDelta === "string" && argsDelta.length > 0) {
            call.args += argsDelta;
            yield { type: "tool_call_delta", id: call.id, argsDelta };
          }
        }
      }

      if (choice.finish_reason) {
        // The response is complete: close every open tool call in index order.
        for (const [, call] of calls) {
          yield { type: "tool_call_end", id: call.id, args: parseArgs(call.args) };
        }
        calls.clear();
        stopReason = mapStopReason(choice.finish_reason);
      }
    }

    if (chunk.usage) {
      yield {
        type: "usage",
        inputTokens: chunk.usage.prompt_tokens ?? 0,
        outputTokens: chunk.usage.completion_tokens ?? 0,
      };
    }
  }

  // Stream exhausted without a terminal marker: flush any open calls and end.
  for (const [, call] of calls) {
    yield { type: "tool_call_end", id: call.id, args: parseArgs(call.args) };
  }
  yield { type: "done", stopReason };
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

export interface OpenAiCompatibleAdapterOptions {
  /** Base URL including `/v1` (default `https://api.openai.com/v1`). */
  baseUrl?: string;
  /** Bearer token, when the provider requires authentication. */
  apiKey?: string;
  /** Extra headers merged over the defaults. */
  headers?: Record<string, string>;
  /** Injectable fetch for tests; defaults to the global fetch. */
  fetchImpl?: typeof fetch;
}

/** Create the `openai-compatible` provider adapter. */
export function createOpenAiCompatibleAdapter(
  options: OpenAiCompatibleAdapterOptions = {},
): ProviderAdapter {
  const baseUrl = (options.baseUrl ?? "https://api.openai.com/v1").replace(/\/+$/, "");
  const headers: Record<string, string> = {
    "content-type": "application/json",
    ...(options.apiKey !== undefined ? { authorization: `Bearer ${options.apiKey}` } : {}),
    ...options.headers,
  };
  const fetchImpl = options.fetchImpl ?? fetch;

  return {
    id: "openai-compatible",
    async *stream(req: ChatRequest, signal: AbortSignal): AsyncIterable<StreamEvent> {
      const response = await fetchImpl(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers,
        body: JSON.stringify(buildOpenAiRequest(req)),
        signal,
      });

      if (!response.ok) {
        throw new ProviderHttpError(
          `OpenAI-compatible request failed: HTTP ${response.status}`,
          {
            status: response.status,
            retryAfterMs: parseRetryAfter(response.headers.get("retry-after")),
          },
        );
      }

      if (response.body === null) {
        yield { type: "error", message: "Provider returned an empty response body", retryable: false };
        return;
      }

      yield* reduceOpenAiChunks(parseOpenAiSse(response.body));
    },
  };
}
