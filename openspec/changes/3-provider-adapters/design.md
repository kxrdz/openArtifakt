# Design

## Context

Feature 2 delivered the canonical `Message`/`StreamEvent` vocabulary (`packages/shared`) and the incremental `StreamParser` (`packages/core/src/parser`) that already emits fallback `<tool_call>` events. `packages/core` is still a near-empty package (`zod` only, no shared dependency). No server or agent-loop code consumes providers yet; this change builds the first consumer-facing layer in `packages/core/src/providers`. Motivation and requirements: see proposal.md and specs/provider-adapters/spec.md.

Constraints that shape the approach:

- `packages/core` must stay free of React/Hono/DOM (reusable by a future CLI).
- Tests must never hit the network (§4): recorded fixtures only.
- `pnpm check` must stay green after every task.
- Strict TS, zod 4.6.5 (which ships `toJSONSchema`), pnpm workspace linking.

## Goals / Non-Goals

**Goals:**

- One `ProviderAdapter` contract and one `createProviderAdapter(config)` factory that hides vendor differences behind capability flags.
- Four adapters emitting the canonical `StreamEvent` union, validated by zod.
- A shared, testable retry helper that is safe under streaming (no retry after first emit).
- A fixture/expectation framework that proves cross-provider equivalence with zero network.
- A `pnpm smoke` harness for real, key-gated requests.

**Non-Goals:**

- The agent loop, tool implementations, approval flow, and persistence (feature 4+). The adapters consume a `ToolDefinition[]` shape that feature 4 will populate.
- The actual `@google/genai` HTTP dependency is avoided by recording Gemini's wire format as fixtures and parsing it ourselves with a small event reducer, so unit tests and typechecking need no network and no heavyweight client. (The smoke harness uses the real `@google/genai` client only when a key is present.)
- No UI, no settings drawer wiring; the smoke script is the only CLI surface.

## Decisions

- **Adapter output is a normalized async generator of `StreamEvent`.** Each adapter is an `async function*` taking `ChatRequest` + `AbortSignal`. The shared contract is `ProviderAdapter { id; stream; listModels? }`. `createProviderAdapter(config: ModelConfig)` returns the right adapter and wires retry + fallback around the vendor-specific core. _Alternative: class hierarchy (more ceremony, no benefit at this size)._
- **`ChatRequest` lives in `providers/types.ts` and reuses `Message` from `@openartifact/shared`.** `ChatRequest = { model, messages: Message[], tools?: ToolDefinition[], temperature?, maxTokens?, signal? }`. The adapter converts canonical `Message` parts to vendor request bodies. `packages/core` adds `@openartifact/shared` as a workspace dependency.
- **`ToolDefinition` wraps a zod schema** (`{ name, description?, parameters: ZodType }`) and is converted with zod's built-in `z.toJSONSchema`, then post-processed per provider: OpenAI/Gemini/Ollama strip the `$schema` key and `additionalProperties:false` (some providers reject both); Gemini is further reduced to the accepted subset (`type: OBJECT`, string enum for `type`, no unions-of-objects at the top level). One `schemas.ts` module holds these converters so each is a pure, unit-tested function. _Alternative: add `zod-to-json-schema` (redundant with zod 4's built-in)._
- **Capability flags drive everything.** `ProviderCapabilities = { nativeTools, streamingToolArgs, vision }`. The factory wraps the vendor core with a `withFallbackTools` decorator when `nativeTools` is false: it collects `text_delta` events and pipes them through the feature-2 `StreamParser`, translating `tool_call` parser events into `tool_call_start/delta/end`. There is no `if (id === "ollama")` branching inside adapters. _Alternative: per-provider fallback code (duplication; violates §4)._
- **Vendor cores parse recorded wire formats, not live HTTP.** Each vendor has a `*SseParser`/`*EventReducer` module (`openai.ts`, `anthropic.ts`, `gemini.ts`, `ollama.ts`) that consumes a stream of vendor events (for tests, an array read from a fixture file; for smoke, the live fetch body) and yields `StreamEvent[]`. This keeps the parsing logic identical in test and production. _Alternative: mock `fetch` (works but couples tests to transport plumbing rather than wire format)._
- **Streaming semantics per vendor:**
  - OpenAI: `choices[].delta` may carry `content` and/or `tool_calls[]` with `index`. Accumulate `function.arguments` per `(callId, index)`; emit `tool_call_start` on first sight, `tool_call_delta` per fragment, `tool_call_end` (with `JSON.parse`d args, falling back to `{}` + an `error` note on malformed JSON) at the end. Parallel calls = distinct indices.
  - Anthropic: `message_start`/`content_block_start` (capture block index→tool id/name), `content_block_delta` (`text_delta` → `text_delta`; `input_json_delta` → `tool_call_delta`), `content_block_stop` → `tool_call_end`, `message_delta` → `usage` + stop-reason mapping (`end_turn`→`end_turn`, `tool_use`→`tool_use`, `max_tokens`→`max_tokens`), `error` → `error`.
  - Gemini: each chunk has `candidates[].content.parts[]`; `text` parts → `text_delta`, `functionCall` parts → `tool_call_start` + `tool_call_end` (args already a JSON object), `usageMetadata` → `usage`, `finishReason` (`STOP`→`end_turn`, `MAX_TOKENS`→`max_tokens`, otherwise `end_turn`). Tool results are converted to `functionResponse` parts inside a user message on the next request.
  - Ollama: NDJSON lines `{done:false, message:{content, tool_calls[]}}` → text/tool events; final line `{done:true, ...}` → `done`. `tool_calls[].function.arguments` is a JSON object (not a fragment string) in native mode.
- **Tool results → request bodies.** A helper `messagesToVendorRequest(messages, capabilities)` converts the canonical message list for each vendor: OpenAI/Gemini use role `tool` messages / `functionResponse` parts; Anthropic requires `tool_result` content blocks inside a `user` message (the "unanswered tool call" pitfall). This helper is shared by the agent loop later.
- **Retry helper (`withRetry`).** A generic wrapper `withRetry(fn, opts)` implements exponential backoff + jitter, max 3 attempts, honoring `Retry-After` (seconds or HTTP date). The retry boundary is the whole request; because retry must never happen after partial output, the wrapper aborts retry if `fn` has already produced any event, by counting yields and surfacing `error` immediately on a later failure. _Alternative: retry inside each adapter (spread, easy to get wrong)._
- **Fixtures are recorded vendor JSON/SSE transcripts** under `packages/core/test/fixtures/providers/<vendor>/<scenario>.<json|txt>`, each paired with an expected `StreamEvent[]`. A shared scenario matrix (`plain-text`, `single-tool-call`, `parallel-tool-calls`, `error-mid-stream`) is asserted across all four adapters, plus vendor-specific edge fixtures (fragmented OpenAI args, Anthropic `input_json_delta`, Gemini `functionCall`, Ollama NDJSON). Fixtures are generated once by hand from the documented wire formats and committed; no network in CI.
- **Smoke script (`scripts/smoke.mjs`).** Reads `.env` (never logs values), maps `--provider <id>` to a key + base URL, constructs a `ModelConfig`, calls `createProviderAdapter(...).stream(...)` with a tiny "say hi" prompt, and prints the received events. Skips cleanly when the key is absent. Gemini uses `@google/genai` (added as a `packages/core` dependency) only in the smoke path; it is dynamically imported so fixture tests never load it.
- **`@google/genai` as an optional/development dependency.** The library is large and pulls transitive deps; because only the smoke path needs it, it is declared as a `devDependency` of `packages/core` and `scripts/smoke.mjs` dynamic-imports it. TypeScript typechecks the smoke script via the root `tsc`, which includes `packages/core`; the adapter's Gemini core does not import it. _Alternative: hand-rolled REST for smoke (more code, drift from the official client)._

## Risks / Trade-offs

- [Gemini's exact streaming chunk shape varies by `@google/genai` version] → fixtures encode a specific, documented shape and the reducer only depends on `candidates[].content.parts`/`usageMetadata`/`finishReason`; smoke verifies against the real client.
- [Some OpenAI-compatible providers do not stream tool args or reject `tool_choice`/parallel calls] → capability flags + tolerant parsing (a tool call whose `arguments` arrive only in the final message still works; `tool_choice` is omitted entirely by default).
- [Malformed tool-call JSON from a vendor] → `JSON.parse` guarded; on failure emit the raw text as `text_delta` and mark the call args `{}` so the stream never throws and history stays valid.
- [Retry must not duplicate output] → retry wraps only the pre-emission request; the first emitted event flips a latch that converts any subsequent failure into an immediate `error`.
- [Fallback parser re-emits text] → `withFallbackTools` buffers text only as far as the parser needs (it delegates to `StreamParser`, which already holds back minimal suffixes) and forwards plain `text` events unchanged, so prose latency is unaffected.
- [Anthropic tool results must be user-message `tool_result` blocks] → a dedicated request-body converter centralizes this invariant and is unit-tested.

## Migration Plan

- No data or config migration: adapters are new, unused modules. `packages/core` gains a workspace dependency on `@openartifact/shared` and (dev) `@google/genai`; `pnpm install` updates the lockfile. Rollback is a revert of the feature branch.

## Open Questions

_None._
