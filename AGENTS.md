# OpenArtifact: agent instructions (loaded automatically by Pi)

The full specification is `docs/SPEC.md`. Read it completely before starting. Re-read the relevant section before each step.

## Key files
- `docs/PROGRESS.md`: the source of truth for what is done and what is blocked. Read it first; if steps are ticked, you are resuming.
- `docs/DECISIONS.md`: log every non-obvious decision here (one entry each: decision, reason, alternatives).
- `PRODUCT.md`: product context for all design work.
- `DESIGN.md`: the visual system (created in step 5).

## Rules
- This is an unattended run. Never ask questions: decide, record the decision, continue.
- After every step: run `pnpm check`, fix failures, update `docs/PROGRESS.md`, commit.
- Load the `impeccable` skill (`.pi/skills/impeccable`) before any UI work in `apps/web`. Run `pnpm design:check` after every UI change; findings count as failing tests.
- Never commit `.env` or secrets. Never use `sudo`. Never read `.env` yourself; scripts load it.
- You run in a loop of fresh sessions. The repo is your only memory: do one step per iteration, then update `docs/PROGRESS.md` (tick, Log, Next) and commit before stopping.
- Keep context small: use `rg`, read line ranges, and trim long output with `tail`.

## Commands (available after step 1)
- `pnpm dev`: start server + web
- `pnpm check`: typecheck, lint, tests, e2e, design check
- `pnpm design:check`: Impeccable detector on apps/web/src
- `pnpm screenshots`: capture key screens into docs/screenshots/
- `pnpm smoke --provider <id>`: one real request against a provider (needs a key in .env)
