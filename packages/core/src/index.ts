/**
 * OpenArtifact core package.
 *
 * This is the home of the provider adapters, the incremental stream parser,
 * the agent loop, the tool implementations, the security layer and the runtime
 * system prompt. It must stay free of React, Hono and DOM dependencies so a
 * future CLI can reuse it. The real modules land in features 2–4; until then
 * this placeholder keeps the workspace wired together.
 */
export const CORE_VERSION = "0.1.0";

export * from "./parser";
export * from "./providers";
export * from "./security";
export * from "./tools";
export * from "./agent";
export * from "./prompts";
