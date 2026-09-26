import type { Message, StopReason, StreamEvent } from "@openartifact/shared";

import { parseRetryAfter, ProviderHttpError } from "./retry";
import { toGeminiJsonSchema, type JsonSchema } from "./schemas";
import type { ChatRequest, ProviderAdapter } from "./types";

/**
 * Gemini adapter (`/v1beta/models/{model}:streamGenerateContent`, §4).
 *
 * Speaks the Gemini REST streaming protocol and translates each chunk's
 * `candidates[].content.parts[]` into the canonical `StreamEvent` union:
 * `text` parts stream through `text_delta`, `functionCall` parts become a
 * `tool_call_start` + `tool_call_end` (Gemini ships the arguments as a
 * complete JSON object rather than fragments), `usageMetadata` becomes a
 * `usage` event, and `finishReason` maps to the canonical stop reason
 * (`MAX_TOKENS` -> `max_tokens`, everything else -> `end_turn`).
 *
 * Tool results are converted to `functionResponse` parts inside a `user`
 * message on the next request (Gemini correlates a `functionResponse` with the
 * preceding `functionCall` by the function name).
 *
 * The parsing logic is a pure reducer over the wire format so the exact same
 * code path runs against recorded fixtures and against the live fetch body
 * (see design.md "Vendor cores parse recorded wire formats").
 */

// ---------------------------------------------------------------------------
// Wire types (loose: parsed from external JSON, never assumed well-formed)
// ---------------------------------------------------------------------------

export interface GeminiFunctionCall {
  name?: string;
  args?: unknown;
  /** Optional correlation id (present on newer API versions). */
  id?: string;
}

export interface GeminiFunctionResponse {
  name?: string;
  response?: unknown;
  id?: string;
}

export interface GeminiPart {
  text?: string;
  functionCall?: GeminiFunctionCall;
  functionResponse?: GeminiFunctionResponse;
  /** True for a thinking part (text is delivered but not shown verbatim). */
  thought?: boolean;
}

export interface GeminiContent {
  role?: string;
  parts?: GeminiPart[];
}

export interface GeminiCandidate {
  content?: GeminiContent;
  finishReason?: string | null;
  index?: number;
}

export interface GeminiUsageMetadata {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  totalTokenCount?: number;
  thoughtsTokenCount?: number;
}

export interface GeminiErrorBody {
  code?: number;
  message?: string;
  status?: string;
}

export interface GeminiChunk {
  candidates?: GeminiCandidate[];
  usageMetadata?: GeminiUsageMetadata;
  promptFeedback?: { blockReason?: string };
  modelVersion?: string;
  error?: GeminiErrorBody | null;
}

// ---------------------------------------------------------------------------
// Request body (canonical messages -> vendor request)
// ---------------------------------------------------------------------------

export interface GeminiFunctionDeclaration {
  name: string;
  description?: string;
  parameters?: JsonSchema;
}

export interface GeminiTool {
  functionDeclarations: GeminiFunctionDeclaration[];
}

export interface GeminiGenerationConfig {
  temperature?: number;
  maxOutputTokens?: number;
}

export interface GeminiRequestBody {
  contents: GeminiContent[];
  systemInstruction?: { parts: { text: string }[] };
  tools?: GeminiTool[];
  generationConfig?: GeminiGenerationConfig;
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
 * Convert the canonical message list into a Gemini `generateContent` request
 * body. `system` messages collapse into the top-level `systemInstruction`;
 * assistant tool calls become `functionCall` parts in a `model` message; tool
 * results become `functionResponse` parts in a `user` message, correlated to
 * their function name via the assistant turn that issued them.
 */
export function buildGeminiRequest(req: ChatRequest): GeminiRequestBody {
  // Gemini correlates a `functionResponse` with its `functionCall` by function
  // name, but the canonical `tool_result` part only carries the call id. Scan
  // prior assistant turns to recover each call id's function name.
  const callNames = new Map<string, string>();
  for (const message of req.messages) {
    if (message.role === "assistant") {
      for (const part of message.parts) {
        if (part.type === "tool_call") callNames.set(part.id, part.name);
      }
    }
  }

  const systemParts: string[] = [];
  const contents: GeminiContent[] = [];

  for (const message of req.messages) {
    switch (message.role) {
      case "system":
        systemParts.push(textOf(message.parts));
        break;
      case "user":
        contents.push({ role: "user", parts: [{ text: textOf(message.parts) }] });
        break;
      case "assistant": {
        const parts: GeminiPart[] = [];
        const text = textOf(message.parts);
        if (text.length > 0) parts.push({ text });
        for (const part of message.parts) {
          if (part.type === "tool_call") {
            parts.push({
              functionCall: { name: part.name, args: toolCallArgs(part.args) },
            });
          }
        }
        // Gemini rejects an empty `model` content; an empty text part keeps the
        // history valid for an assistant turn with no output.
        if (parts.length === 0) parts.push({ text: "" });
        contents.push({ role: "model", parts });
        break;
      }
      case "tool": {
        const parts: GeminiPart[] = [];
        for (const part of message.parts) {
          if (part.type === "tool_result") {
            parts.push({
              functionResponse: {
                name: callNames.get(part.callId) ?? part.callId,
                response: {
                  content: part.content,
                  ...(part.isError === true ? { isError: true } : {}),
                },
              },
            });
          }
        }
        if (parts.length > 0) contents.push({ role: "user", parts });
        break;
      }
    }
  }

  const body: GeminiRequestBody = { contents };
  if (systemParts.length > 0) {
    body.systemInstruction = { parts: [{ text: systemParts.join("\n\n") }] };
  }

  const generationConfig: GeminiGenerationConfig = {};
  if (req.temperature !== undefined) generationConfig.temperature = req.temperature;
  if (req.maxTokens !== undefined) generationConfig.maxOutputTokens = req.maxTokens;
  if (Object.keys(generationConfig).length > 0) body.generationConfig = generationConfig;

  if (req.tools !== undefined && req.tools.length > 0) {
    body.tools = [
      {
        functionDeclarations: req.tools.map((tool) => ({
          name: tool.name,
          ...(tool.description !== undefined ? { description: tool.description } : {}),
          parameters: toGeminiJsonSchema(tool),
        })),
      },
    ];
  }
  return body;
}

// ---------------------------------------------------------------------------
// SSE parsing
// ---------------------------------------------------------------------------

/** Extract the JSON payload of one SSE `data:` event. */
function parseGeminiSseData(event: string): string | null {
  const data = event
    .replace(/\r/g, "")
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .join("\n");
  return data === "" ? null : data;
}

/** Parse one Gemini SSE event (already split on the blank-line boundary). */
export function parseGeminiSseEvent(event: string): GeminiChunk | null {
  const data = parseGeminiSseData(event);
  if (data === null) return null;
  try {
    return JSON.parse(data) as GeminiChunk;
  } catch {
    // A malformed line is skipped; the reducer terminates the stream normally.
    return null;
  }
}

/** Parse a complete SSE response body (for tests and diagnostics). */
export function parseGeminiSseBody(text: string): GeminiChunk[] {
  const chunks: GeminiChunk[] = [];
  for (const event of text.replace(/\r\n/g, "\n").split("\n\n")) {
    const chunk = parseGeminiSseEvent(event);
    if (chunk !== null) chunks.push(chunk);
  }
  return chunks;
}

/**
 * Incrementally decode an SSE byte stream into parsed chunks, so text and tool
 * calls stream without waiting for the full response body.
 */
export async function* parseGeminiSse(
  body: AsyncIterable<Uint8Array>,
): AsyncIterable<GeminiChunk> {
  const decoder = new TextDecoder();
  let buffer = "";
  for await (const bytes of body) {
    buffer += decoder.decode(bytes, { stream: true }).replace(/\r/g, "");
    let boundary = buffer.indexOf("\n\n");
    while (boundary !== -1) {
      const event = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const chunk = parseGeminiSseEvent(event);
      if (chunk !== null) yield chunk;
      boundary = buffer.indexOf("\n\n");
    }
  }
  const tail = (buffer + decoder.decode()).replace(/\r/g, "");
  const chunk = parseGeminiSseEvent(tail);
  if (chunk !== null) yield chunk;
}

// ---------------------------------------------------------------------------
// Reducer (wire chunks -> canonical StreamEvents)
// ---------------------------------------------------------------------------

/** Map a Gemini finish reason to the canonical {@link StopReason}. */
export function mapGeminiStopReason(reason: string | null | undefined): StopReason {
  if (reason === "MAX_TOKENS") return "max_tokens";
  // Gemini has no distinct "tool call" finish reason: a function call still
  // finishes with STOP, so everything else is a completed turn.
  return "end_turn";
}

/** A function call's arguments arrive as a JSON object; normalize defensively. */
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

function errorMessage(error: GeminiErrorBody): string {
  if (typeof error.message === "string" && error.message !== "") return error.message;
  if (typeof error.status === "string" && error.status !== "") {
    return `Provider error (${error.status})`;
  }
  return "Gemini provider error";
}

/** Gemini error statuses that are worth retrying on a fresh request. */
function isRetryableGeminiError(error: GeminiErrorBody): boolean {
  switch (error.status) {
    case "RESOURCE_EXHAUSTED":
    case "UNAVAILABLE":
    case "INTERNAL":
      return true;
    default:
      return error.code === 429 || (error.code !== undefined && error.code >= 500);
  }
}

/**
 * Reduce a stream of parsed Gemini chunks into canonical `StreamEvent`s.
 * Terminates with exactly one `done` (or `error`) event.
 */
export async function* reduceGeminiChunks(
  chunks: AsyncIterable<GeminiChunk>,
): AsyncIterable<StreamEvent> {
  let stopReason: StopReason = "end_turn";
  let callSeq = 0;

  for await (const chunk of chunks) {
    if (chunk.error) {
      yield {
        type: "error",
        message: errorMessage(chunk.error),
        retryable: isRetryableGeminiError(chunk.error),
      };
      return;
    }

    for (const candidate of chunk.candidates ?? []) {
      for (const part of candidate.content?.parts ?? []) {
        if (part.functionCall !== undefined) {
          const call = part.functionCall;
          const id = call.id ?? `call_${callSeq++}`;
          yield { type: "tool_call_start", id, name: call.name ?? "" };
          yield { type: "tool_call_end", id, args: parseArgs(call.args) };
        } else if (typeof part.text === "string" && part.text.length > 0) {
          yield { type: "text_delta", text: part.text };
        }
      }
      if (candidate.finishReason !== undefined && candidate.finishReason !== null) {
        stopReason = mapGeminiStopReason(candidate.finishReason);
      }
    }

    if (chunk.usageMetadata) {
      yield {
        type: "usage",
        inputTokens: chunk.usageMetadata.promptTokenCount ?? 0,
        outputTokens: chunk.usageMetadata.candidatesTokenCount ?? 0,
      };
    }
  }

  // Stream exhausted without a terminal marker: end with the last stop reason.
  yield { type: "done", stopReason };
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

export interface GeminiAdapterOptions {
  /** Base URL (default `https://generativelanguage.googleapis.com`). */
  baseUrl?: string;
  /** API key sent via the `x-goog-api-key` header. */
  apiKey?: string;
  /** Extra headers merged over the defaults. */
  headers?: Record<string, string>;
  /** Injectable fetch for tests; defaults to the global fetch. */
  fetchImpl?: typeof fetch;
}

/** Create the `gemini` provider adapter. */
export function createGeminiAdapter(options: GeminiAdapterOptions = {}): ProviderAdapter {
  const baseUrl = (options.baseUrl ?? "https://generativelanguage.googleapis.com").replace(
    /\/+$/,
    "",
  );
  const headers: Record<string, string> = {
    "content-type": "application/json",
    ...(options.apiKey !== undefined ? { "x-goog-api-key": options.apiKey } : {}),
    ...options.headers,
  };
  const fetchImpl = options.fetchImpl ?? fetch;

  return {
    id: "gemini",
    async *stream(req: ChatRequest, signal: AbortSignal): AsyncIterable<StreamEvent> {
      const url = `${baseUrl}/v1beta/models/${encodeURIComponent(req.model)}:streamGenerateContent?alt=sse`;
      const response = await fetchImpl(url, {
        method: "POST",
        headers,
        body: JSON.stringify(buildGeminiRequest(req)),
        signal,
      });

      if (!response.ok) {
        throw new ProviderHttpError(
          `Gemini request failed: HTTP ${response.status}`,
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

      yield* reduceGeminiChunks(parseGeminiSse(response.body));
    },
  };
}
