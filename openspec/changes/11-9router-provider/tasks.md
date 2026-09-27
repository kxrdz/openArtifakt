# Tasks

## 1. Provider id and wiring

- [x] 1.1 Add `9router` to `providerIdSchema` in `packages/core/src/providers/types.ts` and `packages/shared/src/settings.ts`, map it to `createOpenAiCompatibleAdapter` in `factory.ts`, and add the `9router` defaults row + `isProviderReady` case in `apps/server/src/config.ts` — verify `pnpm check` is green (typecheck enforces the exhaustive switch and `Record<ProviderId, ProviderDefaults>`).
- [x] 1.2 Update the provider-id enumerations in `packages/core/src/providers/factory.test.ts` and `packages/shared/src/persistence.test.ts`, add a config test asserting the `9router` defaults and a factory test asserting `9router` resolves to the openai-compatible adapter — verify the provider test suites pass.

## 2. Smoke harness

- [x] 2.1 Add `9router` to the `scripts/smoke.mjs` provider registry (key ref `NINEROUTER_KEY`, base URL `http://localhost:20128/v1`, default model) and verify `pnpm smoke --provider 9router` prints the skip message when `NINEROUTER_KEY` is unset and `--help` lists `9router`.

## 3. Documentation

- [ ] 3.1 Document the `9router` preset in `.env.example` (provider id, `NINEROUTER_KEY`, base URL, model override note) and `README.md` (add `9router` to the provider list with the one-liner setup) and verify the documented env vars match `PROVIDER_DEFAULTS`.
