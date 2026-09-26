# Design

## Context

Greenfield repository. The only existing files are planning/agent files (`AGENTS.md`, `PRODUCT.md`, `docs/SPEC.md`, `docs/PROGRESS.md`, `docs/DECISIONS.md`), the Impeccable config, and the OpenSpec setup. Node 22 LTS and pnpm 9 are the runtime and package manager. Motivation is in proposal.md; requirements are in specs/scaffold/spec.md.

## Goals / Non-Goals

**Goals:**

- A reproducible pnpm monorepo with pinned dependency versions.
- Strict TypeScript, ESLint and Prettier configured once at the root and inherited by all workspaces.
- A `pnpm check` command that is green on a clean checkout and grows as later features add tests.
- A `pnpm dev` command that runs the server and web client together.
- A Hono server that binds to loopback and serves the web build, ready for later features.
- CI that mirrors the local `pnpm check`.

**Non-Goals:**

- No real features yet: the scaffold ships minimal placeholder modules for server, web, core, and shared (each with a trivial unit test), not the agent loop, adapters, artifacts, or design system.
- No SQLite, provider calls, or UI design work — those arrive in later steps.

## Decisions

- **pnpm workspaces with `packages/*` and `apps/*`**: matches the architecture in `docs/SPEC.md` §2 and lets `core`/`shared` stay free of React/Hono/DOM dependencies. _Alternative: npm workspaces (pnpm is specified and already installed)._
- **One shared `tsconfig.base.json` with `strict: true`, extended by each package**: single source of truth for compiler strictness. _Alternative: per-package full configs (drift risk)._
- **ESLint flat config (`eslint.config.js`) + `typescript-eslint`, Prettier with a root `.prettierrc`**: current standard for TS monorepos. _Alternative: eslintrc (deprecated in ESLint 9)._
- **Vitest for unit tests, with a per-workspace `test` script**: fast, TS-native, no build step. _Alternative: Jest (slower, needs ts-jest config)._
- **Root scripts use `pnpm -r --if-present` so `check` stays green as workspaces are added incrementally** and packages can omit steps they don't yet need. _Alternative: hardcoded per-package commands (break when a package is added)._
- **`dev` uses `concurrently` to run the web dev server and the Node server together**, and the server serves the Vite build in production but proxies to the Vite dev server during development. _Alternative: separate terminals (not "one command")._
- **Hono + `@hono/node-server`**: already specified in §2, minimal and TypeScript-native. _Alternative: Express/Fastify._
- **Playwright + `@axe-core/playwright` configured in a root `e2e/` dir**, wired into `check` with a web-server that builds and serves both apps so e2e runs against the real stack. _Alternative: run e2e only in CI (breaks "check is the single source of truth")._
- **`design:check` script = `npx impeccable detect --json apps/web/src`** (per §2), added to `check` once the web app exists; it exits 2 on findings so `check` fails. _Alternative: run it only in step 5+._
- **`.nvmrc` / `engines` pin Node >= 20**; pnpm version pinned via `packageManager` so Corepack picks the right one. _Alternative: no pinning (drift)._

## Risks / Trade-offs

- [Native toolchain for `better-sqlite3` is not needed yet, but later steps depend on it] → out of scope for scaffold; recorded in RUN.md and handled in step 8.
- [Pin exact versions via `pnpm add -E`] → avoids surprise upgrades; handled in each task.
- [Playwright browser download requires network on first install] → if it fails, record under Blocked and keep the rest of `check` green.
- [The Vite dev-server proxy vs. production static-serving split can drift] → the server reads `NODE_ENV` and serves `apps/web/dist` only when it exists, otherwise proxies to the Vite port.

## Migration Plan

Greenfield: no migration. Each task lands as a commit on `feature/1-scaffold`; the feature is archived and merged to `main` when `pnpm check` is green end-to-end.

## Open Questions

_None._
