import type { Message, StopReason, StreamEvent } from "@openartifact/shared";

import { parseRetryAfter, ProviderHttpError } from "./retry";
import { toOllamaJsonSchema } from "./schemas";
import type { ChatRequest, ProviderAdapter } from "./types";

/**
 * Ollama adapter (native `/api/chat`, §4).
 *
 * Speaks Ollama's local chat protocol: a streaming response is a sequence of
 * newline-delimited JSON objects, each carrying an assistant `message` with
 * `content` and/or `tool_calls`, terminated by a `{ "done": true, … }` line
 * that also carries the token counts (`prompt_eval_count`/`eval_count`) and a
 * `done_reason`. The parsing logic is a pure reducer over the wire format so
 * the exact same code path runs against recorded fixtures and against the live
 * fetch body (see design.md "Vendor cores parse recorded wire formats").
 *
 * Streaming semantics:
 * - `message.content` streams through `text_delta`.
 * - In native mode `message.tool_calls[].function` carries a complete JSON
 *   object as `arguments` (never fragments), and Ollama assigns no tool-call
 *   id, so each call gets a synthesized `call_<n>` id and a
 *   `tool_call_start`/`tool_call_end` pair.
 * - The final `done:true` line maps `done_reason` (`tool_calls` -> `tool_use`,
 *   `length` -> `max_tokens`, otherwise `end_turn`) and emits the single
 *   `usage` event from the eval counts before the terminal `done`.
 * - A streamed `error` field becomes an `error` event, never silently retried.
 *
 * Tool results are converted to `role:"tool"` messages with a `tool_name`
 * (recovered from the assistant turn that issued the call, since the canonical
 * `tool_result` part only carries the call id).
 */

// ---------------------------------------------------------------------------
// Wire types (loose: parsed from external JSON, never assumed well-formed)
// ---------------------------------------------------------------------------

export interface OllamaToolCall {
  function?: { name?: string; arguments?: unknown };
}

export interface OllamaMessage {
  role?: string;
  content?: string;
  tool_calls?: OllamaToolCall[];
  /** Present on `role:"tool"` request messages, not on responses. */
  tool_name?: string;
}

export interface OllamaChunk {
  model?: string;
  created_at?: string;
  message?: OllamaMessage;
  done?: boolean;
  done_reason?: string | null;
  prompt_eval_count?: number;
  eval_count?: number;
  /** Streamed error: Ollama reports failures as a JSON object or a string. */
  error?: string | { message?: string } | null;
}

// ---------------------------------------------------------------------------
// Request body (canonical messages -> vendor request)
// ---------------------------------------------------------------------------

export interface OllamaTool {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters: Record<string, unknown>;
  };
}

export interface OllamaRequestToolCall {
  function: { name: string; arguments: unknown };
}

export interface OllamaRequestMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: OllamaRequestToolCall[];
  tool_name?: string;
}

export interface OllamaRequestBody {
  model: string;
  messages: OllamaRequestMessage[];
  stream: true;
  tools?: OllamaTool[];
  options?: { temperature?: number; num_predict?: number };
}

function textOf(parts: Message["parts"]): string {
  let text = "";
  for (const part of parts) {
    if (part.type === "text") text += part.text;
  }
  return text;
}

/** The arguments of a canonical tool call, normalized to a JSON value. */
function toolCallArgs(args: unknown): unknown {
  if (typeof args === "string") {
    try {
      return JSON.parse(args) as unknown;
    } catch {
      return {};
    }
  }
  return args;
}

/**
 * Convert the canonical message list into an Ollama `/api/chat` request body.
 * `system` parts become a `system` message; assistant tool calls become
 * `tool_calls` on the assistant message; tool results become `role:"tool"`
 * messages correlated to their function name via the assistant turn that
 * issued them (Ollama has no tool-call id, only the name).
 */
export function buildOllamaRequest(req: ChatRequest): OllamaRequestBody {
  // Ollama correlates a `role:"tool"` message with its call by `tool_name`,
  // but the canonical `tool_result` part only carries the call id. Scan prior
  // assistant turns to recover each call id's function name.
  const callNames = new Map<string, string>();
  for (const message of req.messages) {
    if (message.role === "assistant") {
      for (const part of message.parts) {
        if (part.type === "tool_call") callNames.set(part.id, part.name);
      }
    }
  }

  const messages: OllamaRequestMessage[] = [];

  for (const message of req.messages) {
    switch (message.role) {
      case "system":
      case "user":
        messages.push({ role: message.role, content: textOf(message.parts) });
        break;
      case "assistant": {
        const toolCalls: OllamaRequestToolCall[] = [];
        for (const part of message.parts) {
          if (part.type === "tool_call") {
            toolCalls.push({
              function: { name: part.name, arguments: toolCallArgs(part.args) },
            });
          }
        }
        const assistant: OllamaRequestMessage = {
          role: "assistant",
          content: textOf(message.parts),
        };
        if (toolCalls.length > 0) assistant.tool_calls = toolCalls;
        messages.push(assistant);
        break;
      }
      case "tool":
        for (const part of message.parts) {
          if (part.type === "tool_result") {
            messages.push({
              role: "tool",
              content: part.content,
              tool_name: callNames.get(part.callId) ?? part.callId,
            });
          }
        }
        break;
    }
  }

  const body: OllamaRequestBody = {
    model: req.model,
    messages,
    stream: true,
  };

  const options: NonNullable<OllamaRequestBody["options"]> = {};
  if (req.temperature !== undefined) options.temperature = req.temperature;
  if (req.maxTokens !== undefined) options.num_predict = req.maxTokens;
  if (Object.keys(options).length > 0) body.options = options;

  if (req.tools !== undefined && req.tools.length > 0) {
    body.tools = req.tools.map((tool) => ({
      type: "function",
      function: {
        name: tool.name,
        ...(tool.description !== undefined ? { description: tool.description } : {}),
        parameters: toOllamaJsonSchema(tool),
      },
    }));
  }
  return body;
}

// ---------------------------------------------------------------------------
// NDJSON parsing
// ---------------------------------------------------------------------------

/** Parse one NDJSON line into an {@link OllamaChunk}; malformed lines are skipped. */
export function parseOllamaLine(line: string): OllamaChunk | null {
  const trimmed = line.trim();
  if (trimmed === "") return null;
  try {
    return JSON.parse(trimmed) as OllamaChunk;
  } catch {
    return null;
  }
}

/** Parse a complete NDJSON response body (for tests and diagnostics). */
export function parseOllamaBody(text: string): OllamaChunk[] {
  const chunks: OllamaChunk[] = [];
  for (const line of text.replace(/\r/g, "").split("\n")) {
    const chunk = parseOllamaLine(line);
    if (chunk !== null) chunks.push(chunk);
  }
  return chunks;
}

/**
 * Incrementally decode an NDJSON byte stream into parsed chunks, so text and
 * tool calls stream without waiting for the full response body.
 */
export async function* parseOllamaNdjson(
  body: AsyncIterable<Uint8Array>,
): AsyncIterable<OllamaChunk> {
  const decoder = new TextDecoder();
  let buffer = "";
  for await (const bytes of body) {
    buffer += decoder.decode(bytes, { stream: true }).replace(/\r/g, "");
    let boundary = buffer.indexOf("\n");
    while (boundary !== -1) {
      const line = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 1);
      const chunk = parseOllamaLine(line);
      if (chunk !== null) yield chunk;
      boundary = buffer.indexOf("\n");
    }
  }
  const tail = (buffer + decoder.decode()).replace(/\r/g, "");
  const chunk = parseOllamaLine(tail);
  if (chunk !== null) yield chunk;
}

// ---------------------------------------------------------------------------
// Reducer (wire chunks -> canonical StreamEvents)
// ---------------------------------------------------------------------------

/** Map an Ollama `done_reason` to the canonical {@link StopReason}. */
export function mapOllamaStopReason(reason: string | null | undefined): StopReason {
  switch (reason) {
    case "tool_calls":
      return "tool_use";
    case "length":
      return "max_tokens";
    default:
      return "end_turn";
  }
}

/** A tool call's arguments arrive as a JSON object; normalize defensively. */
function parseArgs(args: unknown): unknown {
  if (typeof args === "string") {
    try {
      return JSON.parse(args) as unknown;
    } catch {
      return {};
    }
  }
  return args ?? {};
}

function errorMessage(error: OllamaChunk["error"]): string {
  if (typeof error === "string" && error !== "") return error;
  if (typeof error === "object" && error !== null && typeof error.message === "string") {
    return error.message;
  }
  return "Ollama provider error";
}

/**
 * Reduce a stream of parsed Ollama NDJSON chunks into canonical `StreamEvent`s.
 * Terminates with exactly one `done` (or `error`) event.
 */
export async function* reduceOllamaChunks(
  chunks: AsyncIterable<OllamaChunk>,
): AsyncIterable<StreamEvent> {
  let stopReason: StopReason = "end_turn";
  let callSeq = 0;

  for await (const chunk of chunks) {
    if (chunk.error !== undefined && chunk.error !== null && chunk.error !== "") {
      yield { type: "error", message: errorMessage(chunk.error), retryable: false };
      return;
    }

    const message = chunk.message;
    if (message !== undefined) {
      if (typeof message.content === "string" && message.content.length > 0) {
        yield { type: "text_delta", text: message.content };
      }
      for (const call of message.tool_calls ?? []) {
        const id = `call_${callSeq++}`;
        yield { type: "tool_call_start", id, name: call.function?.name ?? "" };
        yield { type: "tool_call_end", id, args: parseArgs(call.function?.arguments) };
      }
    }

    if (chunk.done === true) {
      if (chunk.done_reason !== undefined && chunk.done_reason !== null) {
        stopReason = mapOllamaStopReason(chunk.done_reason);
      }
      if (chunk.prompt_eval_count !== undefined || chunk.eval_count !== undefined) {
        yield {
          type: "usage",
          inputTokens: chunk.prompt_eval_count ?? 0,
          outputTokens: chunk.eval_count ?? 0,
        };
      }
      yield { type: "done", stopReason };
      return;
    }
  }

  // Stream exhausted without a `done:true` line: end with the last stop reason.
  yield { type: "done", stopReason };
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

export interface OllamaAdapterOptions {
  /** Base URL (default `http://127.0.0.1:11434`). */
  baseUrl?: string;
  /** Extra headers merged over the defaults. */
  headers?: Record<string, string>;
  /** Injectable fetch for tests; defaults to the global fetch. */
  fetchImpl?: typeof fetch;
}

/** Create the `ollama` provider adapter. */
export function createOllamaAdapter(options: OllamaAdapterOptions = {}): ProviderAdapter {
  const baseUrl = (options.baseUrl ?? "http://127.0.0.1:11434").replace(/\/+$/, "");
  const headers: Record<string, string> = {
    "content-type": "application/json",
    ...options.headers,
  };
  const fetchImpl = options.fetchImpl ?? fetch;

  return {
    id: "ollama",
    async *stream(req: ChatRequest, signal: AbortSignal): AsyncIterable<StreamEvent> {
      const response = await fetchImpl(`${baseUrl}/api/chat`, {
        method: "POST",
        headers,
        body: JSON.stringify(buildOllamaRequest(req)),
        signal,
      });

      if (!response.ok) {
        throw new ProviderHttpError(
          `Ollama request failed: HTTP ${response.status}`,
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

      yield* reduceOllamaChunks(parseOllamaNdjson(response.body));
    },
  };
}
