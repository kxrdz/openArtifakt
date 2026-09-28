# Tasks

## 1. Native Environment Loader

- [x] 1.1 Implement `findEnvFile` and `autoLoadEnv` in `apps/server/src/env.ts` using Node.js's native `process.loadEnvFile` with ancestor directory traversal and precedence preservation, and verify with unit tests in `apps/server/src/env.test.ts` covering traversal, precedence, and missing file resilience via `pnpm --filter @openartifact/server test`.

## 2. Server Wiring and Documentation

- [ ] 2.1 Hook `autoLoadEnv()` into `apps/server/src/index.ts` at server startup prior to `loadConfig()`, update `README.md` and `docs/DECISIONS.md` to document native server `.env` auto-loading, and verify with `pnpm check`.
