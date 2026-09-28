# Design

## Context

The server entry point is `apps/server/src/index.ts`. When running `pnpm dev`, `pnpm --filter @openartifact/server dev` runs with `process.cwd()` set to `apps/server`, whereas the primary development `.env` resides at the repository root. Node.js >= 20.6.0 natively provides `process.loadEnvFile(path?: string)`. This function parses environment files and populates `process.env` without overwriting existing variables. Currently, `loadConfig()` reads `process.env` directly at server boot, requiring developers to pre-load `.env` via shell commands.

## Goals / Non-Goals

**Goals:**
- Automatically locate and load `.env` on server startup without requiring third-party libraries or manual shell exports.
- Look for `.env` in `process.cwd()` and traverse ancestor directories up to the monorepo/git root so running from `apps/server` finds the repo-level `.env`.
- Preserve pre-existing environment variables already defined in `process.env`.
- Gracefully tolerate missing `.env` files (e.g. CI environments, container environments, key-free fake-provider mode).
- Provide unit tests verifying resolution, precedence, and missing-file handling.

**Non-Goals:**
- Runtime file watching or dynamic hot-reloading of `.env` changes without process restart.
- Mutating or writing `.env` files via server APIs.
- Replacing external secret managers or cloud vault integrations.

## Decisions

### Decision: Built-in `process.loadEnvFile` over external dependencies (`dotenv`)
- **Choice**: Use Node.js's native `process.loadEnvFile` API.
- **Reason**: The project targets Node >= 20, where `process.loadEnvFile` is natively available. It avoids adding extra npm dependencies and fulfills the requirement of native loading.
- **Alternatives**: Using `dotenv` or custom line-by-line parsing. Custom parsing is prone to edge-case bugs with multi-line values or comments; `dotenv` adds an unnecessary dependency.

### Decision: Upward directory traversal for file discovery
- **Choice**: Check `process.cwd()/.env` first. If absent, search upward parent directories until a `.env` is found, stopping at the filesystem root or a boundary containing `.git` or `package.json` with workspaces. Also support an explicit `OPENARTIFACT_ENV_FILE` override if set.
- **Reason**: In pnpm monorepo scripts (`pnpm --filter @openartifact/server dev`), `cwd` is `apps/server`, but the `.env` file typically lives at the workspace root. Walking up ensures `.env` is discovered regardless of how the server process is launched.
- **Alternatives**: Hardcoding `path.resolve(process.cwd(), "../../.env")`, which breaks when running from the repo root or standalone deployments.

### Decision: Module structure (`apps/server/src/env.ts`)
- **Choice**: Place the loader logic in `apps/server/src/env.ts` as `autoLoadEnv(options?: { cwd?: string; envPath?: string })` and call it at the very start of `apps/server/src/index.ts`.
- **Reason**: Keeps file resolution and environment loading cleanly separated from configuration parsing (`config.ts`) and server wiring (`index.ts`), making it straightforward to test with mock directories.
- **Alternatives**: Inlining into `apps/server/src/index.ts` (harder to test directly) or embedding into `loadConfig()` (which is called in multiple test suites with fake environments).

## Risks / Trade-offs

- [Older Node.js versions without `process.loadEnvFile`] → Package engines require Node >= 20; guard with `typeof process.loadEnvFile === "function"` or graceful fallback if needed.
- [Unintended loading in isolated test suites] → `autoLoadEnv` is only called explicitly at process startup (`src/index.ts`), not inside pure functions like `loadConfig(env)`. Tests calling `loadConfig({})` continue to receive only the environment passed to them.
