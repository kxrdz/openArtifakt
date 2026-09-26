/**
 * Provider adapter layer public surface.
 *
 * The adapters themselves (openai-compatible, anthropic, gemini, ollama) and
 * the retry/fallback/factory helpers land in tasks 2–4; this index exposes the
 * contract and request types first so downstream modules can depend on a
 * stable surface.
 */
export * from "./fallback";
export * from "./retry";
export * from "./schemas";
export * from "./types";
