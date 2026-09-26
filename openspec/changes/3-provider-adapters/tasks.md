# Tasks

## 1. Provider contract and schema conversion

- [x] 1.1 Add `@openartifact/shared` as a workspace dependency of `packages/core` and create `packages/core/src/providers/types.ts` with the adapter contract (`ProviderAdapter`), `ChatRequest`, `ModelConfig`, `ProviderCapabilities`, `ModelInfo`, and `ToolDefinition` (zod-schema wrapper); re-export from `src/index.ts` and `src/providers/index.ts`. Verify: `pnpm --filter @openartifact/core typecheck`, `lint`, and `test` pass and root `pnpm check` stays green.
- [ ] 1.2 Create `packages/core/src/providers/schemas.ts` converting a zod `ToolDefinition` to each provider's JSON-schema dialect (strip `$schema`/`additionalProperties` for OpenAI/Gemini/Ollama; reduce to the Gemini-accepted subset), with unit tests covering object/string/enum/number shapes and the Gemini subset. Verify: `pnpm --filter @openartifact/core test` passes and root `pnpm check` stays green.

## 2. Retry and fallback plumbing

- [ ] 2.1 Create `packages/core/src/providers/retry.ts` with a `withRetry` helper (exponential backoff + jitter, max 3 attempts, honor `Retry-After` seconds/date, and never retry after the wrapped stream has emitted any event), with unit tests for 429/5xx/network retry, `Retry-After`, and the no-retry-after-partial-output latch. Verify: `pnpm --filter @openartifact/core test` passes and root `pnpm check` stays green.
- [ ] 2.2 Create `packages/core/src/providers/fallback.ts` with a `withFallbackTools` decorator that routes `text_delta` events through the feature-2 `StreamParser` and emits `tool_call_start`/`tool_call_delta`/`tool_call_end` for `<tool_call>` blocks when `nativeTools` is false, with unit tests (plain text passthrough, one fallback call, malformed-JSON block stays literal). Verify: `pnpm --filter @openartifact/core test` passes and root `pnpm check` stays green.

## 3. The four adapters

- [ ] 3.1 Implement the `openai-compatible` adapter (`packages/core/src/providers/openai.ts`) accumulating `tool_calls[].function.arguments` by `index` and supporting parallel calls; add recorded fixtures under `packages/core/test/fixtures/providers/openai/` and tests for plain text, one tool call, parallel tool calls, fragmented args, and an error mid-stream. Verify: `pnpm --filter @openartifact/core test` passes and root `pnpm check` stays green.
- [ ] 3.2 Implement the `anthropic` adapter (`packages/core/src/providers/anthropic.ts`) handling `content_block_start`/`content_block_delta` (`text_delta`, `input_json_delta`)/`content_block_stop`/`message_delta`; add recorded fixtures under `packages/core/test/fixtures/providers/anthropic/` and tests for the four shared scenarios plus stop-reason mapping. Verify: `pnpm --filter @openartifact/core test` passes and root `pnpm check` stays green.
- [ ] 3.3 Implement the `gemini` adapter (`packages/core/src/providers/gemini.ts`) mapping `functionCall`/`functionResponse` parts and emitting usage/stop events; add recorded fixtures under `packages/core/test/fixtures/providers/gemini/` and tests for the four shared scenarios plus schema-subset conversion. Verify: `pnpm --filter @openartifact/core test` passes and root `pnpm check` stays green.
- [ ] 3.4 Implement the `ollama` adapter (`packages/core/src/providers/ollama.ts`) over native `/api/chat` NDJSON using native tools when supported; add recorded fixtures under `packages/core/test/fixtures/providers/ollama/` and tests for the four shared scenarios plus native tool-call and final-line handling. Verify: `pnpm --filter @openartifact/core test` passes and root `pnpm check` stays green.

## 4. Factory and smoke harness

- [ ] 4.1 Create `packages/core/src/providers/factory.ts` with `createProviderAdapter(config)` that selects the adapter, applies `withFallbackTools` when `nativeTools` is false and `withRetry`, and keeps capability flags as the only branch; add unit tests for selection and fallback wiring. Verify: `pnpm --filter @openartifact/core test` passes and root `pnpm check` stays green.
- [ ] 4.2 Add `scripts/smoke.mjs` and a root `smoke` script (`pnpm smoke --provider <id>`) that runs one real request per provider using `.env` keys and skips with a clear message when a key is absent; document the script in `.env.example` and verify `pnpm smoke --provider openai-compatible` prints a skip or a response without logging secrets. Verify: root `pnpm check` stays green.
