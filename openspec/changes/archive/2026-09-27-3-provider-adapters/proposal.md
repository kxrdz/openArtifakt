# Proposal

## Why

OpenArtifact's whole point is "any provider": a developer brings their own model (hosted API or local Ollama) and talks to it through one interface. Everything downstream — the agent loop, persistence, and the UI — already speaks the canonical `Message`/`StreamEvent` vocabulary from feature 2, but nothing can yet turn a raw HTTP/SSE response from a specific vendor into those events. Without the adapter layer there is no conversation at all, so it lands next.

## What Changes

- Add a `ProviderAdapter` contract in `packages/core/src/providers`: `id`, `stream(req, signal): AsyncIterable<StreamEvent>`, and optional `listModels()`, plus the request/config types it depends on (`ChatRequest`, `ModelConfig`, `ProviderCapabilities`, `ToolDefinition`, `ModelInfo`).
- Implement four adapters that all emit the exact canonical `StreamEvent` union:
  - `openai-compatible` (`/v1/chat/completions`), accumulating streamed `tool_calls[].function.arguments` by index and supporting parallel tool calls;
  - `anthropic` (Messages API) handling `content_block_start`/`content_block_delta`/`content_block_stop`/`message_delta`;
  - `gemini` (`@google/genai`) mapping `functionCall`/`functionResponse` parts and converting tool schemas to the subset Gemini accepts;
  - `ollama` (native `/api/chat`) using native tools when the model supports them.
- Add a capability-flag-driven fallback: when `nativeTools` is false, the adapter feeds text deltas through the feature-2 `StreamParser` so `<tool_call>` blocks surface as `tool_call_start/delta/end` events — the agent loop never learns which path was used.
- Convert zod tool schemas to each provider's JSON-schema dialect once (using zod's built-in `toJSONSchema`), and branch on capability flags rather than provider-name checks.
- Add retry/backoff (429/5xx/network, max 3, honoring `Retry-After`, jittered) that never silently retries after partial output has streamed.
- Add recorded SSE fixture streams per provider under `packages/core/test/fixtures/providers/` and unit tests proving all four adapters emit equivalent canonical events for: plain text, one tool call, parallel tool calls, and an error mid-stream. Tests never touch the network.
- Add a `pnpm smoke --provider <id>` script that runs one real request per provider using keys from `.env` and skips (with a clear message) any provider without a key.

## Capabilities

### New Capabilities

- `provider-adapters`: the unified adapter layer that converts four vendor stream formats (openai-compatible, anthropic, gemini, ollama) into the canonical `StreamEvent` vocabulary, including native-tool support, the text-protocol fallback, schema conversion, retry behavior, and the smoke harness.

### Modified Capabilities

_None._

## Impact

- `packages/core`: new `src/providers/` module (types, four adapters, schema conversion, retry helper, and a `createProviderAdapter` factory); `src/index.ts` re-exports it. Adds `@openartifact/shared` as a workspace dependency (already carries `Message`/`StreamEvent`); no new third-party runtime deps beyond `@google/genai` for Gemini.
- `packages/core/test/fixtures/providers/`: recorded SSE/JSON fixture streams per provider plus a shared scenario matrix.
- Root `package.json`: new `smoke` script; new `scripts/smoke.mjs`; `.env.example` already lists the provider keys.
- No server, web, agent-loop, or UI behavior changes yet; feature 4 (agent loop) becomes the first consumer of `ProviderAdapter`.
