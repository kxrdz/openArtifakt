# Proposal

## Why

Steps 1–9 shipped every v0.1 capability, but the repository has no `README.md` and no `CONTRIBUTING.md`, and `.env.example` documents only the smoke-test keys, not the app's own configuration surface. A fresh clone today cannot reach a working chat by following the repo alone — the final acceptance criterion of §12.10. This step closes the gap so the project is self-explanatory to a new developer and satisfies the Definition of Done.

## What Changes

- **`README.md`** (new): what OpenArtifact is, its capabilities, a quickstart that reaches a working chat with no API key (the key-free `OPENARTIFACT_FAKE_PROVIDER=1` replay mode), provider setup for all four adapters (openai-compatible, anthropic, gemini, ollama) with the exact environment variables and where keys live, the security model, a screenshots gallery from `docs/screenshots/`, the root scripts, the project layout, and the license.
- **`CONTRIBUTING.md`** (new): prerequisites, the one-branch-per-feature / one-commit-per-task / OpenSpec workflow, how to run `pnpm check` / `pnpm design:check` / `pnpm screenshots`, the Impeccable design rule, and the decision-log convention.
- **`.env.example`** (refresh): keep the smoke keys and add the app's own `OPENARTIFACT_*` configuration variables (provider, model, base URL, approval mode, workspace root, context window, capability flags, fake-provider mode), each documented and defaulted, so one file explains both the server configuration and the smoke harness.
- **Verification**: walk the README quickstart end-to-end on a clean checkout (install, build, run the key-free mode, confirm `/health` and `/api/session` respond), confirm the screenshots referenced exist, and record the key-location decision in `docs/DECISIONS.md`.

## Capabilities

This is a documentation-only change: no spec-level behavior changes. `skip_specs: true` is set in `.openspec.yaml` (no delta specs are produced).

## Impact

- `README.md`, `CONTRIBUTING.md`, `.env.example` (repo root): new/updated documentation files.
- `docs/DECISIONS.md`: one entry recording that the server resolves API keys from the process environment (`process.env[apiKeyRef]`) rather than auto-loading `.env`, and that the README therefore documents `export`/sourcing `.env`.
- No application code, API, or dependency changes: this change only documents behavior that already ships.
