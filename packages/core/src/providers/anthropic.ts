import type { Message, StopReason, StreamEvent } from "@openartifact/shared";

import { parseRetryAfter, ProviderHttpError } from "./retry";
import { toAnthropicJsonSchema } from "./schemas";
import type { ChatRequest, ProviderAdapter } from "./types";

/**
 * Anthropic adapter (Messages API, §4).
 *
 * Speaks the `/v1/messages` streaming protocol and translates
 * `content_block_start`/`content_block_delta` (`text_delta`,
 * `input_json_delta`)/`content_block_stop`/`message_delta` events into the
 * canonical `StreamEvent` union. Tool results are sent back as `tool_result`
 * content blocks inside a `user` message (Anthropic rejects a stray tool
 * result, so this invariant is centralized in {@link buildAnthropicRequest}).
 *
 * Streaming semantics:
 * - `message_start` captures `usage.input_tokens`; `message_delta` carries the
 *   final `output_tokens` and the stop reason, so the single `usage` event is
 *   emitted there (both counts together) and `message_stop` closes the stream
 *   with the mapped `done` stop reason.
 * - A `content_block_start` whose block is `tool_use` records the block's tool
 *   id and name by index and emits `tool_call_start`; `input_json_delta`
 *   fragments are accumulated per index and emitted as `tool_call_delta`;
 *   `content_block_stop` parses the accumulated JSON and emits
 *   `tool_call_end`. Text blocks stream through `text_delta`.
 * - A streamed `error` event becomes an `error` event (retryable when the
 *   error type is a rate/overload/api error), never silently retried.
 */

// ---------------------------------------------------------------------------
// Wire types (loose: parsed from external JSON, never assumed well-formed)
// ---------------------------------------------------------------------------

export interface AnthropicUsage {
  input_tokens?: number;
  output_tokens?: number;
}

export interface AnthropicTextBlock {
  type: "text";
  text: string;
}

export interface AnthropicToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: unknown;
}

export interface AnthropicToolResultBlock {
  type: "tool_result";
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

export type AnthropicContentBlock =
  | AnthropicTextBlock
  | AnthropicToolUseBlock
  | AnthropicToolResultBlock;

export interface AnthropicMessageStartEvent {
  type: "message_start";
  message: {
    id?: string;
    type?: string;
    role?: string;
    model?: string;
    content?: AnthropicContentBlock[];
    stop_reason?: string | null;
    stop_sequence?: string | null;
    usage?: AnthropicUsage;
  };
}

export interface AnthropicContentBlockStartEvent {
  type: "content_block_start";
  index: number;
  content_block: AnthropicTextBlock | AnthropicToolUseBlock;
}

export type AnthropicContentBlockDeltaBody =
  | { type: "text_delta"; text: string }
  | { type: "input_json_delta"; partial_json: string };

export interface AnthropicContentBlockDeltaEvent {
  type: "content_block_delta";
  index: number;
  delta: AnthropicContentBlockDeltaBody;
}

export interface AnthropicContentBlockStopEvent {
  type: "content_block_stop";
  index: number;
}

export interface AnthropicMessageDeltaEvent {
  type: "message_delta";
  delta: {
    stop_reason?: string | null;
    stop_sequence?: string | null;
  };
  usage?: AnthropicUsage;
}

export interface AnthropicMessageStopEvent {
  type: "message_stop";
}

export interface AnthropicPingEvent {
  type: "ping";
}

export interface AnthropicErrorEvent {
  type: "error";
  error: {
    type?: string;
    message?: string;
  };
}

export type AnthropicEvent =
  | AnthropicMessageStartEvent
  | AnthropicContentBlockStartEvent
  | AnthropicContentBlockDeltaEvent
  | AnthropicContentBlockStopEvent
  | AnthropicMessageDeltaEvent
  | AnthropicMessageStopEvent
  | AnthropicPingEvent
  | AnthropicErrorEvent;

// ---------------------------------------------------------------------------
// Request body (canonical messages -> vendor request)
// ---------------------------------------------------------------------------

export interface AnthropicRequestMessage {
  role: "user" | "assistant";
  content: AnthropicContentBlock[];
}

export interface AnthropicTool {
  name: string;
  description?: string;
  input_schema: Record<string, unknown>;
}

export interface AnthropicRequestBody {
  model: string;
  max_tokens: number;
  messages: AnthropicRequestMessage[];
  system?: string;
  stream: true;
  temperature?: number;
  tools?: AnthropicTool[];
}

/** Anthropic requires `max_tokens`; default to a generous cap when unset. */
const DEFAULT_MAX_TOKENS = 4096;

function textOf(parts: Message["parts"]): string {
  let text = "";
  for (const part of parts) {
    if (part.type === "text") text += part.text;
  }
  return text;
}

/** The arguments of a canonical tool call, normalized to a JSON value. */
function toolCallInput(args: unknown): unknown {
  if (typeof args === "string") {
    try {
      return JSON.parse(args) as unknown;
    } catch {
      return {};
    }
  }
  return args;
}

/** Build the `content` blocks for an assistant message (text + tool_use). */
function assistantContent(parts: Message["parts"]): AnthropicContentBlock[] {
  const content: AnthropicContentBlock[] = [];
  const text = textOf(parts);
  if (text.length > 0) content.push({ type: "text", text });
  for (const part of parts) {
    if (part.type === "tool_call") {
      content.push({
        type: "tool_use",
        id: part.id,
        name: part.name,
        input: toolCallInput(part.args),
      });
    }
  }
  // Anthropic rejects an empty assistant content array; an empty text block is
  // harmless and keeps history valid for an assistant turn with no output.
  if (content.length === 0) content.push({ type: "text", text: "" });
  return content;
}

/**
 * Convert the canonical message list into an Anthropic Messages request body.
 * `system` parts collapse into the top-level `system` string; `tool` results
 * are grouped into `tool_result` blocks inside a `user` message immediately
 * after the assistant turn that issued them.
 */
export function buildAnthropicRequest(req: ChatRequest): AnthropicRequestBody {
  const systemParts: string[] = [];
  const messages: AnthropicRequestMessage[] = [];
  let pendingToolResults: AnthropicToolResultBlock[] = [];

  const flushToolResults = (): void => {
    if (pendingToolResults.length > 0) {
      messages.push({ role: "user", content: pendingToolResults });
      pendingToolResults = [];
    }
  };

  for (const message of req.messages) {
    switch (message.role) {
      case "system":
        systemParts.push(textOf(message.parts));
        break;
      case "user":
        flushToolResults();
        messages.push({
          role: "user",
          content: [{ type: "text", text: textOf(message.parts) }],
        });
        break;
      case "assistant":
        flushToolResults();
        messages.push({ role: "assistant", content: assistantContent(message.parts) });
        break;
      case "tool":
        for (const part of message.parts) {
          if (part.type === "tool_result") {
            pendingToolResults.push({
              type: "tool_result",
              tool_use_id: part.callId,
              content: part.content,
              ...(part.isError === true ? { is_error: true } : {}),
            });
          }
        }
        break;
    }
  }
  flushToolResults();

  const body: AnthropicRequestBody = {
    model: req.model,
    max_tokens: req.maxTokens ?? DEFAULT_MAX_TOKENS,
    messages,
    stream: true,
  };
  if (systemParts.length > 0) body.system = systemParts.join("\n\n");
  if (req.temperature !== undefined) body.temperature = req.temperature;
  if (req.tools !== undefined && req.tools.length > 0) {
    body.tools = req.tools.map((tool) => ({
      name: tool.name,
      ...(tool.description !== undefined ? { description: tool.description } : {}),
      input_schema: toAnthropicJsonSchema(tool),
    }));
  }
  return body;
}

// ---------------------------------------------------------------------------
// SSE parsing
// ---------------------------------------------------------------------------

/** Extract the JSON payload of one SSE `data:` event. */
function parseAnthropicSseData(event: string): string | null {
  const data = event
    .replace(/\r/g, "")
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .join("\n");
  return data === "" ? null : data;
}

/** Parse one Anthropic SSE event (already split on the blank-line boundary). */
export function parseAnthropicSseEvent(event: string): AnthropicEvent | null {
  const data = parseAnthropicSseData(event);
  if (data === null) return null;
  try {
    return JSON.parse(data) as AnthropicEvent;
  } catch {
    // A malformed line is skipped; the reducer terminates the stream normally.
    return null;
  }
}

/** Parse a complete SSE response body (for tests and diagnostics). */
export function parseAnthropicSseBody(text: string): AnthropicEvent[] {
  const events: AnthropicEvent[] = [];
  for (const event of text.replace(/\r\n/g, "\n").split("\n\n")) {
    const parsed = parseAnthropicSseEvent(event);
    if (parsed !== null) events.push(parsed);
  }
  return events;
}

/**
 * Incrementally decode an SSE byte stream into parsed events, so text and tool
 * calls stream without waiting for the full response body.
 */
export async function* parseAnthropicSse(
  body: AsyncIterable<Uint8Array>,
): AsyncIterable<AnthropicEvent> {
  const decoder = new TextDecoder();
  let buffer = "";
  for await (const bytes of body) {
    buffer += decoder.decode(bytes, { stream: true }).replace(/\r/g, "");
    let boundary = buffer.indexOf("\n\n");
    while (boundary !== -1) {
      const event = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const parsed = parseAnthropicSseEvent(event);
      if (parsed !== null) yield parsed;
      boundary = buffer.indexOf("\n\n");
    }
  }
  const tail = (buffer + decoder.decode()).replace(/\r/g, "");
  const parsed = parseAnthropicSseEvent(tail);
  if (parsed !== null) yield parsed;
}

// ---------------------------------------------------------------------------
// Reducer (wire events -> canonical StreamEvents)
// ---------------------------------------------------------------------------

/** Map an Anthropic stop reason to the canonical {@link StopReason}. */
export function mapStopReason(reason: string | null | undefined): StopReason {
  switch (reason) {
    case "tool_use":
      return "tool_use";
    case "max_tokens":
      return "max_tokens";
    case "end_turn":
      return "end_turn";
    default:
      // `stop_sequence`, `refusal` and unknown values are still a completed
      // turn as far as the agent loop is concerned.
      return "end_turn";
  }
}

/** Reassemble a tool call's input; malformed JSON falls back to `{}`. */
function parseArgs(raw: string): unknown {
  const trimmed = raw.trim();
  if (trimmed === "") return {};
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return {};
  }
}

function errorMessage(error: AnthropicErrorEvent["error"]): string {
  if (typeof error.message === "string" && error.message !== "") return error.message;
  return "Anthropic provider error";
}

/** Anthropic error types that are worth retrying on a fresh request. */
function isRetryableAnthropicError(type: string | undefined): boolean {
  switch (type) {
    case "overloaded_error":
    case "rate_limit_error":
    case "api_error":
      return true;
    default:
      return false;
  }
}

interface PendingCall {
  id: string;
  name: string;
  json: string;
  started: boolean;
}

/**
 * Reduce a stream of parsed Anthropic events into canonical `StreamEvent`s.
 * Terminates with exactly one `done` (or `error`) event.
 */
export async function* reduceAnthropicEvents(
  events: AsyncIterable<AnthropicEvent>,
): AsyncIterable<StreamEvent> {
  const blocks = new Map<number, PendingCall>();
  let inputTokens = 0;
  let outputTokens = 0;
  let stopReason: StopReason = "end_turn";

  for await (const event of events) {
    switch (event.type) {
      case "message_start": {
        inputTokens = event.message.usage?.input_tokens ?? 0;
        outputTokens = event.message.usage?.output_tokens ?? 0;
        break;
      }
      case "content_block_start": {
        if (event.content_block.type === "tool_use") {
          blocks.set(event.index, {
            id: event.content_block.id,
            name: event.content_block.name,
            json: "",
            started: true,
          });
          yield {
            type: "tool_call_start",
            id: event.content_block.id,
            name: event.content_block.name,
          };
        }
        break;
      }
      case "content_block_delta": {
        const delta = event.delta;
        if (delta.type === "text_delta") {
          if (delta.text.length > 0) yield { type: "text_delta", text: delta.text };
        } else if (delta.type === "input_json_delta") {
          let call = blocks.get(event.index);
          if (call === undefined) {
            // Defensive: a delta before its block start still yields a call.
            call = { id: `tool_${event.index}`, name: "", json: "", started: false };
            blocks.set(event.index, call);
          }
          if (!call.started) {
            call.started = true;
            yield { type: "tool_call_start", id: call.id, name: call.name };
          }
          call.json += delta.partial_json;
          if (delta.partial_json.length > 0) {
            yield { type: "tool_call_delta", id: call.id, argsDelta: delta.partial_json };
          }
        }
        break;
      }
      case "content_block_stop": {
        const call = blocks.get(event.index);
        if (call !== undefined) {
          yield { type: "tool_call_end", id: call.id, args: parseArgs(call.json) };
          blocks.delete(event.index);
        }
        break;
      }
      case "message_delta": {
        stopReason = mapStopReason(event.delta.stop_reason);
        if (event.usage?.output_tokens !== undefined) {
          outputTokens = event.usage.output_tokens;
        }
        yield { type: "usage", inputTokens, outputTokens };
        break;
      }
      case "message_stop": {
        for (const [, call] of blocks) {
          yield { type: "tool_call_end", id: call.id, args: parseArgs(call.json) };
        }
        blocks.clear();
        yield { type: "done", stopReason };
        return;
      }
      case "error": {
        yield {
          type: "error",
          message: errorMessage(event.error),
          retryable: isRetryableAnthropicError(event.error.type),
        };
        return;
      }
      case "ping":
        break;
      default: {
        const exhaustive: never = event;
        void exhaustive;
      }
    }
  }

  // Stream exhausted without `message_stop`: flush any open calls and end.
  for (const [, call] of blocks) {
    yield { type: "tool_call_end", id: call.id, args: parseArgs(call.json) };
  }
  yield { type: "done", stopReason };
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

export interface AnthropicAdapterOptions {
  /** Base URL including the version path (default `https://api.anthropic.com`). */
  baseUrl?: string;
  /** API key sent via the `x-api-key` header. */
  apiKey?: string;
  /** `anthropic-version` header value (default `2023-06-01`). */
  anthropicVersion?: string;
  /** Extra headers merged over the defaults. */
  headers?: Record<string, string>;
  /** Injectable fetch for tests; defaults to the global fetch. */
  fetchImpl?: typeof fetch;
}

/** Create the `anthropic` provider adapter. */
export function createAnthropicAdapter(options: AnthropicAdapterOptions = {}): ProviderAdapter {
  const baseUrl = (options.baseUrl ?? "https://api.anthropic.com").replace(/\/+$/, "");
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "anthropic-version": options.anthropicVersion ?? "2023-06-01",
    ...(options.apiKey !== undefined ? { "x-api-key": options.apiKey } : {}),
    ...options.headers,
  };
  const fetchImpl = options.fetchImpl ?? fetch;

  return {
    id: "anthropic",
    async *stream(req: ChatRequest, signal: AbortSignal): AsyncIterable<StreamEvent> {
      const response = await fetchImpl(`${baseUrl}/v1/messages`, {
        method: "POST",
        headers,
        body: JSON.stringify(buildAnthropicRequest(req)),
        signal,
      });

      if (!response.ok) {
        throw new ProviderHttpError(
          `Anthropic request failed: HTTP ${response.status}`,
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

      yield* reduceAnthropicEvents(parseAnthropicSse(response.body));
    },
  };
}
