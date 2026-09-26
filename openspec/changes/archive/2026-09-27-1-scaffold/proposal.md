# Proposal

## Why

OpenArtifact is a greenfield local-first coding assistant. Nothing is built yet: there is no monorepo, no TypeScript toolchain, no server, and no web client. Before any feature can be implemented or verified, the repository needs a working scaffold that both developers and CI can rely on.

## What Changes

- Set up a pnpm monorepo with `apps/server`, `apps/web`, `packages/core`, `packages/shared`, and an `e2e/` suite.
- Add strict TypeScript everywhere, plus ESLint (flat config) and Prettier.
- Add Vitest for unit tests and Playwright + `@axe-core/playwright` for e2e and accessibility.
- Add the root scripts `dev`, `check`, `design:check`, `screenshots`, and `smoke`.
- Scaffold a Hono server that binds to `127.0.0.1` only and serves the built web client.
- Add a GitHub Actions CI workflow that runs `pnpm check`.
- Add the MIT `LICENSE`.

## Capabilities

### New Capabilities

- `scaffold`: the build/tooling foundation — a pnpm monorepo whose `dev` script runs the server and web app together, whose `check` script verifies typecheck, lint, unit tests, e2e and design checks, and whose server binds to loopback and serves the web build.

### Modified Capabilities

_None._

## Impact

- Creates the repository root files: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, ESLint/Prettier configs, `LICENSE`, and `.github/workflows/ci.yml`.
- Creates the four workspace packages (`apps/server`, `apps/web`, `packages/core`, `packages/shared`) with pinned dependencies.
- No existing code, APIs, or systems are affected (greenfield).
