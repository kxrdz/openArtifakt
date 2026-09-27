# Design

## Context

The provider layer already supports four adapters behind a single `ProviderAdapter` contract. 9Router is OpenAI-compatible (`/v1/chat/completions`, `Authorization: Bearer`), so it needs no new wire-parsing code — only a provider id, a defaults row, and a factory mapping. The one place a provider name is inspected is the factory's selection switch; all behavior (native vs. fallback tools, retry) is driven by capability flags. Two `providerIdSchema` enums must stay in lockstep: `packages/core/src/providers/types.ts` (server/runtime) and `packages/shared/src/settings.ts` (browser). See proposal.md for motivation.

## Goals / Non-Goals

**Goals:**
- `OPENARTIFACT_PROVIDER=9router` + (optionally) `NINEROUTER_KEY` fully wires a working chat loop with sane defaults.
- 9Router behaves exactly like the `openai-compatible` adapter it reuses, including retry/fallback decorators.
- A keyless local 9Router (auth disabled) reports `providerReady: true`, matching `ollama`'s treatment.

**Non-Goals:**
- No support for 9Router's non-chat endpoints (image, TTS, STT, embeddings, web search/fetch).
- No new adapter file or wire-format parser.
- No model-id discovery (`/v1/models`) UI; the default model is overridable via `OPENARTIFACT_MODEL`.

## Decisions

- **Reuse `createOpenAiCompatibleAdapter` via a new `case "9router"`** rather than a distinct adapter, because the wire protocol is identical. The exhaustive switch then forces every future provider-id addition to be handled explicitly.
- **Defaults row**: base URL `http://localhost:20128/v1` (the adapter appends `/chat/completions`); key ref `NINEROUTER_KEY`; default model `cc/claude-sonnet-4-5`; context window `200_000`; capabilities `{ nativeTools: true, streamingToolArgs: true, vision: false }`. `vision: false` mirrors the openai-compatible adapter, which does not send image parts. The model id is dynamic per 9Router install, so the default is documented as "override with a `data[].id` from `/v1/models`".
- **Treat `9router` as ready without a key** in `isProviderReady` (alongside `ollama`), because 9Router auth is optional and the adapter omits the `Authorization` header when `NINEROUTER_KEY` is unset. Alternatives: require the key (would wrongly block the keyless local default) or add a new `requireApiKey` flag (not worth it for one preset).
- **Add `9router` to the `pnpm smoke` registry** with the same key ref and defaults, so `pnpm smoke --provider 9router` works and skips cleanly when `NINEROUTER_KEY` is unset.

## Risks / Trade-offs

- **Default model may not exist for a given install** (9Router model ids depend on connected providers) → 400 "Invalid model format"; documented, and `OPENARTIFACT_MODEL`/`/v1/models` is the escape hatch.
- **`providerReady: true` when the gateway needs a key** → request-time 401 instead of an onboarding nudge; acceptable because the common local default is keyless, and the 401 surfaces in the terminal log with a clear message.
- **Two enum mirrors drift** → the shared test that parses every provider id, plus the exhaustive factory switch and `Record<ProviderId, ProviderDefaults>` type, fail `pnpm check` if either side is missed.
