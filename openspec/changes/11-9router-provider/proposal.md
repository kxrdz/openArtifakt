# Proposal

## Why

Users want to point OpenArtifact at [9Router](https://9router.com/) — a local/remote AI gateway that exposes an OpenAI-compatible `/v1/chat/completions` endpoint with optional `Authorization: Bearer` auth and dynamic model ids (e.g. `cc/claude-sonnet-4-5`). Today that requires hand-configuring the generic `openai-compatible` adapter with the right base URL, model id and key reference; a wrong or stale `OPENAI_API_KEY` produces the confusing 401 users report. A first-class `9router` preset makes it one env var and gives the right defaults for free.

## What Changes

- Add `9router` as a new provider id in both `providerIdSchema` enums (core and shared mirror).
- Add a `9router` entry to the server's `PROVIDER_DEFAULTS`: base URL `http://localhost:20128/v1`, key ref `NINEROUTER_KEY`, a Claude-Code default model, a 200k context window, and openai-compatible capabilities.
- Map `9router` to the existing `openai-compatible` adapter in the factory (9Router is OpenAI-compatible; no new adapter code).
- Treat `9router` as ready-without-a-key like `ollama`, since 9Router auth is optional (the `Authorization` header is simply omitted when `NINEROUTER_KEY` is unset).
- Add `9router` to the `pnpm smoke` provider registry and document it in `.env.example` and `README.md`.

## Capabilities

### New Capabilities

_(none)_

### Modified Capabilities

- `provider-adapters`: the "Adapter identity" scenario's provider-id list gains `9router`, and the capability-driven-behavior requirement is extended with a `9router` preset scenario (a provider id that reuses the OpenAI-compatible adapter via its declared capabilities).

## Impact

- `packages/core/src/providers/types.ts` — `providerIdSchema` gains `9router`.
- `packages/shared/src/settings.ts` — mirrored `providerIdSchema` gains `9router`.
- `packages/core/src/providers/factory.ts` — `selectAdapter` maps `9router` to `createOpenAiCompatibleAdapter`.
- `apps/server/src/config.ts` — `PROVIDER_DEFAULTS` and `isProviderReady` gain a `9router` case.
- `scripts/smoke.mjs` — provider registry gains `9router`.
- `.env.example`, `README.md` — documentation.
- Tests: provider-id enumerations in `factory.test.ts`, `packages/shared/src/persistence.test.ts`, plus a new config test for the `9router` defaults and a factory test for the adapter mapping.

No breaking changes; the new id is purely additive.
