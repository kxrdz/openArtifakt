import type { StreamEvent } from "@openartifact/shared";

import { createAnthropicAdapter } from "./anthropic";
import { withFallbackTools } from "./fallback";
import { createGeminiAdapter } from "./gemini";
import { createOllamaAdapter } from "./ollama";
import { createOpenAiCompatibleAdapter } from "./openai";
import { withRetry, type RetryOptions } from "./retry";
import type { ChatRequest, ModelConfig, ProviderAdapter, ProviderId } from "./types";

/**
 * Adapter factory (§4, "capability-driven behavior").
 *
 * `createProviderAdapter(config)` selects the vendor adapter for a
 * `ModelConfig`, resolves its secret from the referenced env var, and wraps
 * the raw stream with the two shared decorators:
 *
 * - `withRetry` around the whole request (429/5xx/network backoff, never after
 *   partial output), and
 * - `withFallbackTools` around the emitted events when
 *   `config.capabilities.nativeTools` is false, so a non-tool-capable model's
 *   `<tool_call>` blocks surface as the same canonical tool-call events as
 *   native tool use.
 *
 * The only place a provider name is inspected is the single selection switch
 * below; every *behavioral* branch (native vs. fallback tool handling) is
 * driven by the declared capability flags, never by the provider id.
 */

export interface CreateProviderAdapterOptions {
  /** Secret override for `config.apiKeyRef`; when omitted the ref is resolved from the environment. */
  apiKey?: string;
  /** Injectable fetch for tests; defaults to the global fetch. */
  fetchImpl?: typeof fetch;
  /** Retry-policy overrides (injected by tests to control timing and randomness). */
  retry?: Omit<RetryOptions, "signal">;
  /** Resolve an `apiKeyRef` to a secret (default reads `process.env[ref]`). */
  resolveApiKey?: (ref: string) => string | undefined;
}

/** Default secret resolution: read the referenced env var, treating "" as absent. */
function resolveFromEnv(ref: string): string | undefined {
  const value = process.env[ref];
  return value === undefined || value === "" ? undefined : value;
}

/** Select and configure the vendor adapter for a provider id. */
function selectAdapter(
  config: ModelConfig,
  options: { apiKey: string | undefined; fetchImpl: typeof fetch },
): ProviderAdapter {
  const { apiKey, fetchImpl } = options;
  const { baseUrl, headers } = config;

  switch (config.provider) {
    case "openai-compatible":
    case "9router":
      // 9Router is an OpenAI-compatible gateway (optional Bearer auth), so it
      // reuses the openai-compatible adapter with its own defaults.
      return createOpenAiCompatibleAdapter({ baseUrl, apiKey, headers, fetchImpl });
    case "anthropic":
      return createAnthropicAdapter({ baseUrl, apiKey, headers, fetchImpl });
    case "gemini":
      return createGeminiAdapter({ baseUrl, apiKey, headers, fetchImpl });
    case "ollama":
      // Ollama is local and unauthenticated; it takes no apiKey.
      return createOllamaAdapter({ baseUrl, headers, fetchImpl });
    default: {
      const exhaustive: ProviderId = config.provider;
      throw new Error(`Unsupported provider: ${String(exhaustive)}`);
    }
  }
}

/** Create a fully wired adapter for a {@link ModelConfig}. */
export function createProviderAdapter(
  config: ModelConfig,
  options: CreateProviderAdapterOptions = {},
): ProviderAdapter {
  const {
    apiKey: apiKeyOverride,
    fetchImpl = fetch,
    retry = {},
    resolveApiKey = resolveFromEnv,
  } = options;

  const apiKey =
    apiKeyOverride ?? (config.apiKeyRef ? resolveApiKey(config.apiKeyRef) : undefined);

  const base = selectAdapter(config, { apiKey, fetchImpl });

  return {
    id: config.provider,
    async *stream(req: ChatRequest, signal: AbortSignal): AsyncIterable<StreamEvent> {
      // The retry boundary is the whole request; the fallback decorator then
      // rewrites the emitted text for non-native-tool providers.
      yield* withFallbackTools(
        withRetry(() => base.stream(req, signal), { ...retry, signal }),
        { nativeTools: config.capabilities.nativeTools },
      );
    },
    ...(base.listModels ? { listModels: base.listModels } : {}),
  };
}
