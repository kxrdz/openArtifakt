# Contributing to OpenArtifact

OpenArtifact is an open-source, provider-agnostic coding agent. This file is the developer-facing counterpart to the user-facing `README.md`: it covers the workflow the project itself is built with, so your changes land the same way every other change does. The product rationale is in `PRODUCT.md`; the visual system is in `DESIGN.md`; the full specification is `docs/SPEC.md`.

## Prerequisites

- **Node.js 20+** — 22 LTS is the pinned runtime (`.nvmrc`). `nvm use` or `fnm use` to match.
- **pnpm 9+** — the workspace pins `pnpm@9.15.4` (`packageManager` in `package.json`); enable it with `corepack enable`.
- **Playwright browsers** — needed for e2e and screenshots: `pnpm exec playwright install`.
- **Git** — the workflow below is branch- and commit-based; there is no flat patch path.
- On **Windows**, use WSL2; the tool execution layer assumes a POSIX shell.

```bash
git clone <this-repo> open-artifact
cd open-artifact
corepack enable
pnpm install
```

## Workflow: one branch per feature, one commit per task, OpenSpec throughout

The build is driven by `AGENTS.md` and `docs/SPEC.md`. The spec's §12 lists ten **features** (steps); each is planned as an OpenSpec change on its own branch, and each **task** inside that change is one commit. `docs/PROGRESS.md` is the source of truth for what is done and what is next.

- **Feature** = one step in §12 → branch `feature/N-<slug>` (e.g. `feature/1-scaffold`) and OpenSpec change `N-<slug>` (e.g. `1-scaffold`).
- **Task** = one `- [ ]` item in the change's `tasks.md` → exactly one commit, `feat(N-<slug>): <summary>`.

### Feature lifecycle

1. From `main`, create the branch: `git checkout -b feature/N-<slug>`.
2. Plan the feature with the `openspec-propose` skill (or `openspec new change`), which writes `proposal.md`, the spec delta, `design.md` and `tasks.md`. Break the feature into small, independently committable tasks.
3. Implement tasks one per iteration with the `openspec-apply-change` skill.
4. When every task is ticked and `pnpm check` is green, run `openspec archive` (the `openspec-archive-change` skill), merge the branch into `main`, tick the step in `docs/PROGRESS.md`, add a Log entry, and commit on `main`.

### Task lifecycle (one iteration = one commit)

1. Ensure you are on `feature/N-<slug>` (create it from `main` if this is a new feature).
2. Implement exactly the next unchecked task in `tasks.md` (use the `openspec-apply-change` skill).
3. Run `pnpm check` (and `pnpm design:check` after any UI change). Fix every failure.
4. Tick the task (`- [ ]` → `- [x]`) and commit: `git commit -m "feat(N-<slug>): <task summary>"`.

A commit that leaves `pnpm check` red is never merged. Work one task per commit, and keep each commit focused and bisectable.

## Commands

All commands run from the repo root. See `package.json` for the exact scripts.

| Command | What it runs |
|---|---|
| `pnpm dev` | Starts the server and web client together (server on `127.0.0.1:4318`) |
| `pnpm build` | Builds the web client and vendors the sandbox dependencies |
| `pnpm check` | The full gate: typecheck, lint, unit tests, `design:check`, and e2e (Playwright + axe) |
| `pnpm typecheck` | `tsc --noEmit` across every workspace package |
| `pnpm lint` | ESLint across every workspace package |
| `pnpm test` | Vitest unit/integration tests |
| `pnpm design:check` | The Impeccable detector over `apps/web/src` |
| `pnpm e2e` | Playwright + axe suite (the only e2e assertion in `pnpm check`) |
| `pnpm screenshots` | Captures the key screens into `docs/screenshots/` (own Playwright project; not run by `pnpm check`) |
| `pnpm smoke --provider <id>` | One real streaming request against `openai-compatible` \| `anthropic` \| `gemini` \| `ollama` (or `all`). Reads keys from `.env`; skips providers without a key |

`pnpm check` is the merge gate: it must be green before every commit.

## The Impeccable rule for UI changes

Every UI change in `apps/web` must pass the design-system detector. Before editing any `apps/web/src` component:

1. Load the Impeccable skill (`.pi/skills/impeccable`).
2. Make the change using design tokens from `tokens.css` — a hard-coded color or font size in a component is a bug, not a style choice.
3. Run `pnpm design:check` after every UI change.

`design:check` findings count as failing tests. The design system itself is specified in `DESIGN.md`; the detector enforces it mechanically.

## Decision log convention

Every non-obvious decision is recorded in `docs/DECISIONS.md`, one entry each:

> **Decision**: the choice and why. *Alternatives considered and why they were rejected.*

Entries use the format `**<Decision>**: <reason>. *<alternatives>.*`. The rule is **never ask, decide**: if a requirement is ambiguous, choose the simplest option that satisfies it, record the decision, and continue. The log is also where you record trade-offs the spec forced (e.g. the runtime system prompt, adapter quirks, or a rejected approach), so a future contributor can revisit a decision deliberately instead of re-deriving it.

## Running and verifying

- **Key-free verification:** `OPENARTIFACT_FAKE_PROVIDER=1 pnpm dev` replays a scripted conversation against a seeded temp workspace — no API key, no network. This is what e2e and screenshots use.
- **Real requests:** set a provider key in the environment (see `README.md` → Provider setup) or run `pnpm smoke --provider <id>`, which reads `.env`.
- **Before merging** a feature: `pnpm check` green, all `tasks.md` boxes ticked, the OpenSpec change archived, and the step ticked in `docs/PROGRESS.md`.

## Commit review

A pre-commit hook (`.githooks/pre-commit`, enabled via `core.hooksPath .githooks`) checks the quality of staged changes with Jev before committing and blocks if quality is below acceptable (score < 2.0) or if changes are flagged as blocking or high-risk security. It fails open on a missing key; bypass with `JEV_REVIEW_BYPASS=1` or `git commit --no-verify`.

A pre-push hook (`.githooks/pre-push`, enabled via `core.hooksPath .githooks`) runs a Jev review over the commits about to be pushed and blocks on a blocking or high-risk-security judgment. It fails open on a missing key; bypass with `JEV_REVIEW_BYPASS=1` or `git push --no-verify`.
