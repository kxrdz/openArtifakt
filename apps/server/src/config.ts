import { z } from "zod";

import {
  APPROVAL_MODES,
  type ApprovalMode,
  type ProviderCapabilities,
  type ProviderId,
  providerCapabilitiesSchema,
  providerIdSchema,
} from "@openartifact/core";

/**
 * Server configuration (§8/§9, "Provider configuration").
 *
 * The chat server's environment is validated here, once, at startup, so the
 * rest of the server can rely on a fully-formed {@link ServerConfig}. Provider
 * id, model, base URL, API-key reference and context window fall back to a
 * per-provider default table; approval mode defaults to `ask` (§8) and the
 * workspace root defaults to the directory the server was launched from.
 * The `fakeProvider` flag selects the key-free scripted replay mode (§12.6).
 */

/** Env var names, kept in one place so errors can name the exact variable. */
const ENV = {
  provider: "OPENARTIFACT_PROVIDER",
  model: "OPENARTIFACT_MODEL",
  baseUrl: "OPENARTIFACT_BASE_URL",
  apiKeyRef: "OPENARTIFACT_API_KEY_REF",
  approvalMode: "OPENARTIFACT_APPROVAL_MODE",
  workspaceRoot: "OPENARTIFACT_WORKSPACE_ROOT",
  contextWindow: "OPENARTIFACT_CONTEXT_WINDOW",
  nativeTools: "OPENARTIFACT_NATIVE_TOOLS",
  streamingToolArgs: "OPENARTIFACT_STREAMING_TOOL_ARGS",
  vision: "OPENARTIFACT_VISION",
  fakeProvider: "OPENARTIFACT_FAKE_PROVIDER",
} as const;

/** Per-provider defaults (model, base URL, key ref, window, capabilities). */
export interface ProviderDefaults {
  model: string;
  baseUrl: string;
  apiKeyRef: string | undefined;
  contextWindow: number;
  capabilities: ProviderCapabilities;
}

/**
 * Defaults mirror the adapter capabilities and the `pnpm smoke` registry so a
 * provider can be selected with a single env var and still be fully wired.
 */
export const PROVIDER_DEFAULTS: Record<ProviderId, ProviderDefaults> = {
  "openai-compatible": {
    model: "gpt-4o-mini",
    baseUrl: "https://api.openai.com/v1",
    apiKeyRef: "OPENAI_API_KEY",
    contextWindow: 128_000,
    capabilities: { nativeTools: true, streamingToolArgs: true, vision: false },
  },
  anthropic: {
    model: "claude-3-5-haiku-latest",
    baseUrl: "https://api.anthropic.com",
    apiKeyRef: "ANTHROPIC_API_KEY",
    contextWindow: 200_000,
    capabilities: { nativeTools: true, streamingToolArgs: true, vision: true },
  },
  gemini: {
    model: "gemini-2.0-flash",
    baseUrl: "https://generativelanguage.googleapis.com",
    apiKeyRef: "GEMINI_API_KEY",
    contextWindow: 1_048_576,
    capabilities: { nativeTools: true, streamingToolArgs: false, vision: true },
  },
  ollama: {
    model: "llama3.2",
    baseUrl: "http://127.0.0.1:11434",
    apiKeyRef: undefined,
    contextWindow: 8_192,
    capabilities: { nativeTools: true, streamingToolArgs: false, vision: false },
  },
  "9router": {
    model: "cc/claude-sonnet-4-5",
    baseUrl: "http://localhost:20128/v1",
    apiKeyRef: "NINEROUTER_KEY",
    contextWindow: 200_000,
    capabilities: { nativeTools: true, streamingToolArgs: true, vision: false },
  },
};

/**
 * Whether the configured provider can run without further setup (feature 9,
 * onboard pass). Fake replay mode works offline, ollama is local and
 * unauthenticated, and every other provider is ready when its referenced API
 * key is present in the server environment. The result is a non-secret boolean
 * the session route can share with the browser.
 */
export function isProviderReady(
  config: ServerConfig,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (config.fakeProvider) return true;
  // ollama and 9router are local gateways whose auth is optional: the adapter
  // omits the Authorization header when their key ref is unset, so they run
  // without a key.
  if (config.provider === "ollama" || config.provider === "9router") return true;
  if (config.apiKeyRef === undefined) return false;
  const key = env[config.apiKeyRef];
  return typeof key === "string" && key !== "";
}

/** The resolved, validated server configuration. */
export interface ServerConfig {
  provider: ProviderId;
  model: string;
  baseUrl: string;
  /** Name of an env var / config entry holding the key; never the key itself (§9). */
  apiKeyRef?: string;
  approvalMode: ApprovalMode;
  /** Absolute workspace root the agent's tools operate in. */
  workspaceRoot: string;
  contextWindow: number;
  capabilities: ProviderCapabilities;
  fakeProvider: boolean;
}

const serverConfigSchema = z.object({
  provider: providerIdSchema,
  model: z.string().min(1),
  baseUrl: z.string().min(1),
  apiKeyRef: z.string().min(1).optional(),
  approvalMode: z.enum(APPROVAL_MODES),
  workspaceRoot: z.string().min(1),
  contextWindow: z.number().int().positive(),
  capabilities: providerCapabilitiesSchema,
  fakeProvider: z.boolean(),
});

/** Read a non-empty string env var, or `undefined`. */
function readString(env: NodeJS.ProcessEnv, key: string): string | undefined {
  const value = env[key];
  return typeof value === "string" && value !== "" ? value : undefined;
}

/** Parse a boolean env var, throwing a clear error on a non-boolean value. */
function readBool(env: NodeJS.ProcessEnv, key: string): boolean | undefined {
  const raw = readString(env, key);
  if (raw === undefined) return undefined;
  const value = raw.trim().toLowerCase();
  if (value === "1" || value === "true" || value === "yes" || value === "on") return true;
  if (value === "0" || value === "false" || value === "no" || value === "off") return false;
  throw new Error(
    `Invalid boolean for ${key}: "${raw}" (expected 1/0, true/false, yes/no or on/off)`,
  );
}

/**
 * Load and validate the server configuration from `env`.
 *
 * @throws {@link Error} with a message naming the offending variable when the
 *   environment is invalid (so the server fails fast rather than half-wired).
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const providerRaw = readString(env, ENV.provider) ?? "openai-compatible";
  const provider = providerIdSchema.safeParse(providerRaw);
  if (!provider.success) {
    throw new Error(
      `Invalid ${ENV.provider} "${providerRaw}": expected one of ${Object.keys(PROVIDER_DEFAULTS).join(", ")}`,
    );
  }
  const defaults = PROVIDER_DEFAULTS[provider.data];

  const capabilities: ProviderCapabilities = {
    nativeTools:
      readBool(env, ENV.nativeTools) ?? defaults.capabilities.nativeTools,
    streamingToolArgs:
      readBool(env, ENV.streamingToolArgs) ?? defaults.capabilities.streamingToolArgs,
    vision: readBool(env, ENV.vision) ?? defaults.capabilities.vision,
  };

  const contextWindowRaw = readString(env, ENV.contextWindow);
  const contextWindow =
    contextWindowRaw === undefined ? defaults.contextWindow : Number(contextWindowRaw);

  const config = {
    provider: provider.data,
    model: readString(env, ENV.model) ?? defaults.model,
    baseUrl: readString(env, ENV.baseUrl) ?? defaults.baseUrl,
    apiKeyRef: readString(env, ENV.apiKeyRef) ?? defaults.apiKeyRef,
    approvalMode: readString(env, ENV.approvalMode) ?? "ask",
    workspaceRoot: readString(env, ENV.workspaceRoot) ?? process.cwd(),
    contextWindow,
    capabilities,
    fakeProvider: readBool(env, ENV.fakeProvider) ?? false,
  };

  const result = serverConfigSchema.safeParse(config);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid OpenArtifact configuration: ${issues}`);
  }
  return result.data;
}

/**
 * Mutable holder for the live server configuration (§12.8, "Settings").
 *
 * {@link loadConfig} freezes the environment into a {@link ServerConfig} at
 * startup; the settings routes must change provider, model, approval mode,
 * context window and capability flags *without a server restart*. Both the
 * settings routes and the chat routes share one {@link ActiveConfig}: the chat
 * registry reads it each time it creates a conversation, so a saved change
 * applies to the next turn.
 */
export class ActiveConfig {
  #config: ServerConfig;

  constructor(config: ServerConfig) {
    this.#config = config;
  }

  /** The currently-live configuration (a fresh object reference). */
  get(): ServerConfig {
    return this.#config;
  }

  /** Replace the live configuration wholesale. */
  set(config: ServerConfig): void {
    this.#config = config;
  }

  /** Merge a partial configuration over the live one and return the result. */
  update(partial: Partial<ServerConfig>): ServerConfig {
    this.#config = { ...this.#config, ...partial };
    return this.#config;
  }
}
