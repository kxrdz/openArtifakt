You are one iteration of an autonomous build loop for OpenArtifact. You start with no memory; the repository is your memory.

1. Read `AGENTS.md`, `PRODUCT.md` and `docs/PROGRESS.md`. Then read section 0 of `docs/SPEC.md` and the sections relevant to your feature.
2. If `docs/PROGRESS.md` says `Status: DONE`, reply "Already done." and stop.
3. Work on exactly one **task** — the next unchecked task of the current **feature** (the next unchecked step in section 12, or whatever **Next** in `docs/PROGRESS.md` says remains).

## Branch and OpenSpec rules
- **One branch per feature.** Each step in §12 is a feature. Make sure you are on `feature/N-<slug>` (create it from `main` if it does not exist):
  `git checkout -b feature/N-<slug>`.
- **One OpenSpec change per feature.** If change `N-<slug>` does not exist yet, run the `openspec-propose` skill to create it (proposal, specs delta, design, tasks). Break the feature into small, independently committable tasks in `tasks.md`.
- **One commit per task.** Use the `openspec-apply-change` skill to implement exactly the next unchecked task, then tick it and commit with `feat(N-<slug>): <task summary>`.
- **Finish a feature** by running the `openspec-archive-change` skill, merging the branch into `main`, then ticking the step in `docs/PROGRESS.md`.
- For any UI work, load the impeccable skill first and run `pnpm design:check` after UI changes.

4. Before you stop, make sure of three things:
   - `pnpm check` is green, or each remaining failure is recorded under **Blocked** with its exact fix.
   - The task's checkbox in `tasks.md` is ticked; if the feature is complete, `docs/PROGRESS.md` is updated (step ticked, **Log** entry added, **Next** rewritten).
   - Everything is committed with git (one commit per task; the feature branch merged to `main` when done).

Never ask questions: decide, record the decision in `docs/DECISIONS.md`, and continue. Write `Status: DONE` only when section 14 of the spec is fully met.
