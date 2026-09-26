# Tasks

## 1. Root tooling + shared package

- [x] 1.1 Create root workspace files (`package.json` with scripts and pinned devDependencies, `pnpm-workspace.yaml`, `tsconfig.base.json`, `eslint.config.js`, `.prettierrc`, `.prettierignore`, `.nvmrc`, `LICENSE`) and the `packages/shared` package skeleton (`package.json`, `tsconfig.json`, placeholder `src/index.ts`, trivial Vitest test). Verify: `pnpm install` succeeds and `pnpm check` passes (typecheck, lint, test over the shared package).

## 2. Core package

- [x] 2.1 Create `packages/core` (no React/Hono/DOM dependencies) with `package.json`, `tsconfig.json`, placeholder `src/index.ts`, and a trivial Vitest test. Verify: `pnpm --filter @openartifact/core test` passes and root `pnpm check` stays green.

## 3. Web app

- [ ] 3.1 Create `apps/web` Vite + React 18 + TypeScript + Tailwind scaffold (`index.html`, `vite.config.ts`, `tsconfig.json`, `src/main.tsx`, `src/App.tsx`, minimal `src/styles/tokens.css` placeholder) that builds to `dist/`. Verify: `pnpm --filter @openartifact/web build` succeeds and root `pnpm check` stays green.

## 4. Server app

- [ ] 4.1 Create `apps/server` Hono app (`package.json`, `tsconfig.json`, `src/index.ts`) that binds `127.0.0.1`, serves the web build (or proxies the Vite dev server in development), exposes `/health`, and wire `pnpm dev` to start both apps. Verify: `pnpm dev` starts both apps, `GET http://127.0.0.1:<port>/health` returns ok, and the server serves the built web index.

## 5. E2E + axe

- [ ] 5.1 Add Playwright + `@axe-core/playwright` with `e2e/playwright.config.ts` (webServer builds the web app and starts the server) and one smoke test asserting the page loads with zero axe serious/critical violations. Verify: `pnpm e2e` passes.

## 6. design:check + CI wiring

- [ ] 6.1 Add the `design:check` script (`impeccable detect --json apps/web/src`, with `impeccable` pinned as a devDependency), wire it and `e2e` into the root `check`, and add the GitHub Actions CI workflow running `pnpm check`. Verify: `pnpm check` passes end-to-end and the workflow YAML parses.
