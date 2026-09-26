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
_Continue feature 3 on `feature/3-provider-adapters`: tasks 3.1 (openai-compatible), 3.2 (anthropic), and 3.3 (gemini) are done and committed. Task 3.3 added `gemini.ts` — a reducer over `candidates[].content.parts[]` that maps `text` parts to `text_delta`, `functionCall` parts to `tool_call_start`/`tool_call_end` (args already an object, correlation id preserved or synthesized `call_<n>`), `usageMetadata` to a single `usage` event, and `finishReason` (`MAX_TOKENS`→`max_tokens`, else `end_turn`), plus `functionResponse`-in-user-message request conversion (with call-id→name recovery) and Gemini-subset schema conversion, with four recorded fixtures under `test/fixtures/providers/gemini/`. Next is task 3.4 (the `ollama` adapter in `ollama.ts`, over native `/api/chat` NDJSON with native tool calls and final-line handling, plus recorded fixtures and the four shared scenarios)._

## Log
<!-- One line per completed step: date, step, short summary. -->
- 2026-09-27, step 1 (Scaffold): pnpm monorepo with strict TS, ESLint/Prettier, Vitest, Playwright+axe e2e, Hono server + Vite web, `design:check` wired into `check`, and GitHub Actions CI. `pnpm dev` starts both apps; `pnpm check` is green end-to-end.
- 2026-09-27, step 2 (Shared types + stream parser): canonical message model and `StreamEvent` union with zod schemas in `packages/shared`; a character-level `StreamParser` in `packages/core` that streams text, parses `<artifact>` blocks (split tags, raw content, unknown types, kebab-case ids, incomplete-close), keeps tags literal inside fences, renders `mermaid` fences, and parses the fallback `<tool_call>` protocol. A fuzz test over six static fixtures (`packages/core/test/fixtures/`) asserts identical normalized event sequences for whole, every-single-split, one-char-at-a-time, and seeded random multi-split feedings.
