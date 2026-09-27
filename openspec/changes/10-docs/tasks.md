# Tasks

## 1. README

- [x] 1.1 Write `README.md` at the repo root with: a one-paragraph product description (any provider, local agent loop with approvals, artifacts and live diagrams), a features list, a **Quickstart** whose primary path reaches a working chat with no key (`pnpm install`, `OPENARTIFACT_FAKE_PROVIDER=1 pnpm dev`, open `http://127.0.0.1:4318`), a **Provider setup** section covering all four adapters (openai-compatible, anthropic, gemini, ollama) with the exact `OPENARTIFACT_*` env vars, key placement (`export`/`source .env`, and the fact that `pnpm smoke` reads `.env` but the server reads the environment), a **Security model** section (loopback bind, session token, Host/Origin guards, path jail, secret-file rules, sandboxed iframes), a **Screenshots** gallery referencing committed files under `docs/screenshots/`, a root-scripts table, and the project layout. Verify the quickstart commands run as written and every screenshot path referenced exists on disk.

## 2. CONTRIBUTING

- [x] 2.1 Write `CONTRIBUTING.md` with: prerequisites, the one-branch-per-feature / one-commit-per-task / OpenSpec (propose→apply→archive) workflow, how to run `pnpm check` (typecheck/lint/unit/design/e2e), `pnpm design:check`, `pnpm screenshots` and `pnpm smoke --provider <id>`, the Impeccable rule for UI changes, and the `docs/DECISIONS.md` convention. Verify the commands it documents exist in `package.json` and the workflow matches `AGENTS.md`.

## 3. .env.example

- [ ] 3.1 Refresh `.env.example` into two labelled groups — **Server configuration** (`OPENARTIFACT_PROVIDER`, `OPENARTIFACT_MODEL`, `OPENARTIFACT_BASE_URL`, `OPENARTIFACT_API_KEY_REF`, `OPENARTIFACT_APPROVAL_MODE`, `OPENARTIFACT_WORKSPACE_ROOT`, `OPENARTIFACT_CONTEXT_WINDOW`, `OPENARTIFACT_NATIVE_TOOLS`, `OPENARTIFACT_STREAMING_TOOL_ARGS`, `OPENARTIFACT_VISION`, `OPENARTIFACT_FAKE_PROVIDER`, `PORT`) and **Provider keys + smoke** (the existing `*_API_KEY`/`OLLAMA_BASE_URL`/`TYPESAFE_API_KEY`) — each variable commented with its meaning and default, so the file doubles as the configuration reference. Verify every `OPENARTIFACT_*` name matches `apps/server/src/config.ts` (`ENV`) and the existing smoke keys are preserved.

## 4. Verification and decision log

- [ ] 4.1 Walk the README quickstart end-to-end from a clean checkout (fresh `pnpm install`, then the key-free `OPENARTIFACT_FAKE_PROVIDER=1` start) and confirm `/health` and `/api/session` respond with a working session; confirm `pnpm check` stays green after the docs land; and add a `docs/DECISIONS.md` entry recording that API keys are read from the process environment (`process.env[apiKeyRef]`), not auto-loaded from `.env`. Verify `pnpm check` is green and the decision entry is present.
