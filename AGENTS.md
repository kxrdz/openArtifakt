# OpenArtifact: agent instructions (loaded automatically by Pi)

The full specification is `docs/SPEC.md`. Read it completely before starting. Re-read the relevant section before each step.

## Key files
- `docs/PROGRESS.md`: the source of truth for what is done and what is blocked. Read it first; if steps are ticked, you are resuming.
- `docs/DECISIONS.md`: log every non-obvious decision here (one entry each: decision, reason, alternatives).
- `PRODUCT.md`: product context for all design work.
- `DESIGN.md`: the visual system (created in step 5).

## Workflow: one branch per feature, one commit per task, OpenSpec throughout

The spec §12 lists 10 **features** (its steps). Each feature is one OpenSpec change on its own git branch; each **task** inside that change is one commit.

- **Feature** = one step in §12 / `docs/PROGRESS.md` → branch `feature/N-<slug>` (e.g. `feature/1-scaffold`) and OpenSpec change `N-<slug>` (e.g. `1-scaffold`).
- **Task** = one `- [ ]` item in the change's `tasks.md` → exactly one commit.
- **OpenSpec skills** (`.pi/skills/openspec-*`): `propose` to plan a feature, `apply` to implement its tasks, `archive` to finish and sync specs, `update`/`sync-specs`/`explore` as needed.

**Feature lifecycle:**
1. From `main`, create the branch: `git checkout -b feature/N-<slug>`.
2. Run the `openspec-propose` skill to create change `N-<slug>` (proposal.md, `specs/.../spec.md`, design.md, tasks.md). Break the feature into small, independently committable tasks.
3. Implement the tasks one per iteration (see task lifecycle).
4. When every task is ticked and `pnpm check` is green, run `openspec-archive-change` (syncs delta specs into `openspec/specs/`), merge the branch into `main`, tick the step in `docs/PROGRESS.md`, add a Log entry, update Next, and commit.

**Task lifecycle (one iteration, one commit):**
1. Ensure you are on `feature/N-<slug>` (create it from `main` if this is a new feature).
2. Run the `openspec-apply-change` skill for change `N-<slug>` and implement exactly the next unchecked task.
3. Run `pnpm check` (and `pnpm design:check` after any UI change). Fix failures.
4. Tick the task in `tasks.md` (`- [ ]` → `- [x]`) and commit: `git commit -m "feat(N-<slug>): <task summary>"`.
5. Stop. The next iteration continues with the next task on the same branch.

## Rules
- This is an unattended run. Never ask questions: decide, record the decision, continue.
- Run `pnpm check`, fix failures, then commit — at least one commit per task, never a commit that leaves `pnpm check` red.
- Load the `impeccable` skill (`.pi/skills/impeccable`) before any UI work in `apps/web`. Run `pnpm design:check` after every UI change; findings count as failing tests.
- Never commit `.env` or secrets. Never use `sudo`. Never read `.env` yourself; scripts load it.
- You run in a loop of fresh sessions. The repo is your only memory: do one task per iteration, then update `docs/PROGRESS.md` (tick, Log, Next) and commit before stopping.
- Keep context small: use `rg`, read line ranges, and trim long output with `tail`.

## Commands (available after step 1)
- `pnpm dev`: start server + web
- `pnpm check`: typecheck, lint, tests, e2e, design check
- `pnpm design:check`: Impeccable detector on apps/web/src
- `pnpm screenshots`: capture key screens into docs/screenshots/
- `pnpm smoke --provider <id>`: one real request against a provider (needs a key in .env)
