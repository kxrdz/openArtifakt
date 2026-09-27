import { z } from "zod";

import type { Message, StreamEvent } from "@openartifact/shared";

/**
 * Provider adapter layer types (§4). Every provider adapter converts to and
 * from the canonical `Message`/`StreamEvent` vocabulary in
 * `@openartifact/shared`; the rest of the app never sees provider-specific
 * shapes. This module carries the contract, request/config types and the
 * tool-definition wrapper that the adapters and the future agent loop share.
 */

export const providerIdSchema = z.enum([
  "openai-compatible",
  "anthropic",
  "gemini",
  "ollama",
  "9router",
]);
export type ProviderId = z.infer<typeof providerIdSchema>;

/** Capability flags an adapter branches on (never provider-name checks). */
export const providerCapabilitiesSchema = z.object({
  /** Whether the provider/model supports native function/tool calling. */
  nativeTools: z.boolean(),
  /** Whether tool-call arguments are streamed incrementally. */
  streamingToolArgs: z.boolean(),
  /** Whether the provider/model accepts image input. */
  vision: z.boolean(),
});
export type ProviderCapabilities = z.infer<typeof providerCapabilitiesSchema>;

export const modelConfigSchema = z.object({
  provider: providerIdSchema,
  model: z.string(),
  baseUrl: z.string().optional(),
  /** Name of an env var / config entry; never the key itself. */
  apiKeyRef: z.string().optional(),
  temperature: z.number().optional(),
  maxTokens: z.number().int().positive().optional(),
  headers: z.record(z.string(), z.string()).optional(),
  contextWindow: z.number().int().positive(),
  capabilities: providerCapabilitiesSchema,
});
export type ModelConfig = z.infer<typeof modelConfigSchema>;

/**
 * A tool the agent may call. Each tool defines its arguments once with a zod
 * schema; adapters convert that schema to the provider's JSON-schema dialect.
 */
export interface ToolDefinition {
  name: string;
  description?: string;
  parameters: z.ZodType;
}

/** A single provider request in canonical form. */
export interface ChatRequest {
  model: string;
  messages: Message[];
  tools?: ToolDefinition[];
  temperature?: number;
  maxTokens?: number;
}

/** A model as reported by `listModels()`. */
export interface ModelInfo {
  id: string;
  name?: string;
  contextWindow?: number;
}

/**
 * The unified adapter contract. `stream` returns an async iterable of
 * canonical `StreamEvent`s and terminates with exactly one `done` or `error`
 * event. `signal` aborts the underlying request.
 */
export interface ProviderAdapter {
  readonly id: string;
  stream(req: ChatRequest, signal: AbortSignal): AsyncIterable<StreamEvent>;
  listModels?(): Promise<ModelInfo[]>;
}

/** Parse and validate an unknown value as a {@link ModelConfig}. Throws on failure. */
export function parseModelConfig(value: unknown): ModelConfig {
  return modelConfigSchema.parse(value);
}
