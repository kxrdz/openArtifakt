import { z } from "zod";

/**
 * Settings wire types (§12.8, "Settings drawer").
 *
 * The non-secret server settings a developer can view and edit: provider,
 * model, base URL, the API-key reference (a name, never a key), context
 * window, capability flags and approval mode. The server persists these and
 * the web settings drawer edits them; keys themselves never cross the wire or
 * touch storage (§9).
 *
 * `providerIdSchema`, `providerCapabilitiesSchema` and `approvalModeSchema`
 * mirror the identically-named schemas in `packages/core` (`providers/types.ts`
 * and `agent/approval.ts`) so the two sides share one contract; the browser
 * imports them from here without pulling in `@openartifact/core`.
 */

/** Provider ids the adapter layer supports (§4). Mirrors `core`'s enum. */
export const providerIdSchema = z.enum([
  "openai-compatible",
  "anthropic",
  "gemini",
  "ollama",
]);
export type ProviderId = z.infer<typeof providerIdSchema>;

/** Capability flags an adapter branches on (§4). Mirrors `core`'s schema. */
export const providerCapabilitiesSchema = z.object({
  /** Whether the provider/model supports native function/tool calling. */
  nativeTools: z.boolean(),
  /** Whether tool-call arguments are streamed incrementally. */
  streamingToolArgs: z.boolean(),
  /** Whether the provider/model accepts image input. */
  vision: z.boolean(),
});
export type ProviderCapabilities = z.infer<typeof providerCapabilitiesSchema>;

/** Approval modes the user can select (§8). Mirrors `core`'s `APPROVAL_MODES`. */
export const approvalModeSchema = z.enum(["ask", "auto-edit", "full-auto"]);
export type ApprovalMode = z.infer<typeof approvalModeSchema>;

/**
 * The editable, non-secret settings (§12.8). `apiKeyRef` is the name of the
 * env var / config entry holding the key — never the key value — and is `null`
 * when the provider needs no key (e.g. a local Ollama server).
 */
export const settingsSchema = z.object({
  provider: providerIdSchema,
  model: z.string().min(1),
  baseUrl: z.string().min(1),
  apiKeyRef: z.string().min(1).nullable(),
  approvalMode: approvalModeSchema,
  contextWindow: z.number().int().positive(),
  capabilities: providerCapabilitiesSchema,
});
export type Settings = z.infer<typeof settingsSchema>;

/** Parse and validate an unknown value as {@link Settings}. Throws on failure. */
export function parseSettings(value: unknown): Settings {
  return settingsSchema.parse(value);
}

/** Type guard for {@link Settings}. */
export function isSettings(value: unknown): value is Settings {
  return settingsSchema.safeParse(value).success;
}
