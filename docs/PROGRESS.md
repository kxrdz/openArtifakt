# Progress

Status: IN PROGRESS

Tick each step when its acceptance criteria in docs/SPEC.md §12 pass and it is committed.

## Workflow
- **Feature** = one step below → git branch `feature/N-<slug>` + OpenSpec change `N-<slug>`.
- **Task** = one `- [ ]` item in the change's `tasks.md` → one git commit (`feat(N-<slug>): <summary>`).
- Plan a feature with `openspec-propose`, implement tasks with `openspec-apply-change`, finish with `openspec-archive-change`, then merge the branch into `main`.
- **Current feature/branch:** `feature/3-provider-adapters` (change `3-provider-adapters`).

- [x] 1. Scaffold
- [x] 2. Shared types + stream parser
- [ ] 3. Provider adapters
- [ ] 4. Agent loop, tools, security layer
- [ ] 5. Design foundation (Impeccable)
- [ ] 6. Chat UI, approvals, terminal log
- [ ] 7. Artifact renderers + Mermaid
- [ ] 8. Versions, diff, revert, undo, settings, persistence
- [ ] 9. Final design pass (Impeccable)
- [ ] 10. Docs

## Blocked
<!-- One entry per blocker: what is blocked, why, and the exact command or action a human must take. -->
_None yet._

## Next
<!-- If a step is only partly done, write exactly what remains here for the next iteration. -->
_Continue feature 3 on `feature/3-provider-adapters`: tasks 3.1–3.4 (all four adapters) are done and committed. Task 3.4 added `ollama.ts` — an NDJSON reducer over native `/api/chat` that maps `message.content` to `text_delta`, native `message.tool_calls[].function` to `tool_call_start`/`tool_call_end` (arguments arrive as a complete object, synthesized `call_<n>` id), the final `done:true` line's `done_reason` (`tool_calls`→`tool_use`, `length`→`max_tokens`, else `end_turn`) and `prompt_eval_count`/`eval_count` to a single `usage`+`done`, a streamed `error` field to an `error` event, plus `role:"tool"` request conversion with call-id→name recovery and Ollama-dialect schema conversion, with five recorded fixtures under `test/fixtures/providers/ollama/` (including truncated-stream final-line handling). Next is task 4.1 (the `createProviderAdapter` factory in `factory.ts`, wiring adapter selection + `withFallbackTools` + `withRetry` around capability flags) and then 4.2 (the `scripts/smoke.mjs` harness + root `smoke` script)._

## Log
<!-- One line per completed step: date, step, short summary. -->
- 2026-09-27, step 1 (Scaffold): pnpm monorepo with strict TS, ESLint/Prettier, Vitest, Playwright+axe e2e, Hono server + Vite web, `design:check` wired into `check`, and GitHub Actions CI. `pnpm dev` starts both apps; `pnpm check` is green end-to-end.
- 2026-09-27, step 2 (Shared types + stream parser): canonical message model and `StreamEvent` union with zod schemas in `packages/shared`; a character-level `StreamParser` in `packages/core` that streams text, parses `<artifact>` blocks (split tags, raw content, unknown types, kebab-case ids, incomplete-close), keeps tags literal inside fences, renders `mermaid` fences, and parses the fallback `<tool_call>` protocol. A fuzz test over six static fixtures (`packages/core/test/fixtures/`) asserts identical normalized event sequences for whole, every-single-split, one-char-at-a-time, and seeded random multi-split feedings.
