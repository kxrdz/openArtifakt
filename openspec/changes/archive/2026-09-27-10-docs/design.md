# Design

## Context

The codebase is complete (steps 1–9 archived) and the only missing piece is documentation. The facts the docs must encode are already settled in the code: the server binds `127.0.0.1:4318`, proxies to the Vite dev server at `127.0.0.1:5173` in dev and serves `apps/web/dist` in production; a random session token is issued per startup; `GET /api/session` reports `providerReady`/`workspaceRoot`; the config surface is the `OPENARTIFACT_*` env vars validated in `apps/server/src/config.ts`; keys are resolved from `process.env[apiKeyRef]` (never `.env` auto-loading, never the browser); and `OPENARTIFACT_FAKE_PROVIDER=1` runs the scripted, key-free replay against a seeded temp workspace. The screenshots live in `docs/screenshots/` (56 files: every key screen × {dark,light} × {desktop 1440×900, mobile 390×844}).

## Goals / Non-Goals

**Goals:**
- A README whose quickstart reaches a working chat with **zero secrets** (the fake-provider path first, then Ollama, then cloud providers), so the §12.10 "fresh clone reaches a working chat by following only the README" criterion is met by the primary path.
- One authoritative source per concern: README = user-facing; CONTRIBUTING = developer workflow; `.env.example` = the full config/key surface, commented.
- Accuracy over aspiration: the docs describe what the server actually does (keys from the environment, not `.env`), even where that is less convenient than auto-loading.

**Non-Goals:**
- No code changes: the docs document shipped behavior. In particular, no `.env` auto-loading is added to the server, and no new config file mechanism is introduced.
- No re-derivation of the design system (that lives in `DESIGN.md`); the README links to it.
- No marketing copy or trademark usage (per PRODUCT.md voice and the §13 trademark rule).

## Decisions

1. **`skip_specs: true`** — this is a pure documentation change with no spec-level behavior change, so no delta specs are produced (per the spec-driven schema's rule that docs-only changes opt out of specs rather than invent requirements).

2. **Quickstart leads with the key-free fake-provider path** (`OPENARTIFACT_FAKE_PROVIDER=1 pnpm dev`), because it satisfies "working chat" with no key, no network and no external service, and it is the same mode the e2e suite and screenshots already exercise. Real-provider paths (Ollama, then cloud) follow. Rationale: the acceptance criterion must hold for the common fresh-clone case; a path that needs a paid key first would fail it.

3. **The README documents that keys live in the process environment** (`export OPENAI_API_KEY=…` or `set -a; source .env; set +a`), not that `.env` is auto-loaded — because `apps/server/src/index.ts`/`config.ts` read `process.env[apiKeyRef]` and no dotenv loader runs at server startup. `.env` is auto-loaded only by `pnpm smoke` and `scripts/jev-review.mjs`. Recorded in `docs/DECISIONS.md`. Rationale: accurate docs beat convenient-but-false ones; a reader who follows the docs exactly gets a working chat.

4. **`.env.example` is restructured into two clearly labelled groups** — "Server configuration (`OPENARTIFACT_*`)" and "Provider keys (`*_API_KEY`) + `pnpm smoke`". The `OPENARTIFACT_*` block lists every env var `config.ts` reads, with its default and meaning, so the example doubles as the configuration reference. Rationale: one file should explain the whole surface the user must set, not just the smoke harness.

5. **Screenshots are embedded as a markdown gallery** using relative paths to `docs/screenshots/*.png`, one representative capture per surface (shell, streaming, approval, each artifact type, Mermaid error, settings drawer, command palette) in dark and light, with the mobile captures noted rather than duplicated inline. Rationale: shows the product without bloating the README; the files are already committed.

6. **CONTRIBUTING documents the build's own loop convention** (one branch `feature/N-<slug>` per feature, one commit per task, OpenSpec propose→apply→archive, tick `docs/PROGRESS.md`) so a human contributor follows the same model the autonomous loop uses, plus the test/design-check/screenshot commands and the decision-log rule.

## Risks / Trade-offs

- [The README's real-provider path requires exporting a key, which some users find surprising after seeing `.env`] → the README states the env-var requirement explicitly and shows the `source .env` one-liner; `pnpm smoke` (which does read `.env`) is called out separately so the distinction is unambiguous.
- [Docs drift from the code later] → the quickstart verification task (4) walks the fake-provider path on a clean checkout and re-checks the referenced commands/screenshots against the actual repo, and `pnpm check` runs before archive.
- [56 screenshots could make the gallery unmaintainable] → the README links only a representative subset and points at `docs/screenshots/` for the full set.
- [No `.env` auto-loading could be seen as a defect rather than a documented behavior] → the decision is recorded in `docs/DECISIONS.md` with the reason, so a future change can revisit it deliberately.
