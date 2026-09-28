# Proposal

## Why

Currently, the server expects provider keys and configuration variables to be already present in `process.env` when it boots. Developers and operators must rely on shell wrappers (such as `set -a; source .env; set +a` or manual `export`) to load `.env` variables before running `pnpm dev` or launching the server. Auto-loading `.env` natively at server startup using Node's built-in capabilities eliminates configuration friction and makes starting the server seamless.

## What Changes

- Add native `.env` file discovery and loading at server boot using Node.js's built-in `process.loadEnvFile`.
- Support loading `.env` from `process.cwd()` and walking up directory trees to the repository/workspace root so running `pnpm dev` (where the server process runs with cwd `apps/server`) reliably loads the root `.env`.
- Ensure existing environment variables in `process.env` are preserved and take precedence over values defined in `.env`.
- Ensure a missing `.env` file is handled gracefully without errors or warnings.
- Wire native loading before server configuration (`loadConfig()`) is parsed.
- Update documentation and decisions (`README.md`, `docs/DECISIONS.md`) to reflect native `.env` auto-loading.

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `chat-server`: Add environment auto-loading requirement to server initialization so that `.env` is automatically loaded into `process.env` at startup.

## Impact

- Affected code: `apps/server/src/index.ts`, `apps/server/src/env.ts` (or `config.ts`), `apps/server/src/env.test.ts`.
- Documentation: `README.md` and `docs/DECISIONS.md`.
- Dependencies: None; uses Node.js's native `process.loadEnvFile` API.
