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
_Continue feature 3 on `feature/3-provider-adapters`: task 3.1 is done and committed (the `openai-compatible` adapter in `openai.ts` — a pure wire-format reducer accumulating `tool_calls[].function.arguments` by `index` for parallel calls, an incremental SSE decoder, a canonical→vendor request builder, and `createOpenAiCompatibleAdapter`, with five recorded fixtures under `test/fixtures/providers/openai/` covering plain text, one tool call, parallel tool calls, fragmented args, and an error mid-stream); next is task 3.2 (the `anthropic` adapter in `anthropic.ts`, handling `content_block_start`/`content_block_delta`/`content_block_stop`/`message_delta` with stop-reason mapping, plus recorded fixtures and the four shared scenarios)._

## Log
<!-- One line per completed step: date, step, short summary. -->
- 2026-09-27, step 1 (Scaffold): pnpm monorepo with strict TS, ESLint/Prettier, Vitest, Playwright+axe e2e, Hono server + Vite web, `design:check` wired into `check`, and GitHub Actions CI. `pnpm dev` starts both apps; `pnpm check` is green end-to-end.
- 2026-09-27, step 2 (Shared types + stream parser): canonical message model and `StreamEvent` union with zod schemas in `packages/shared`; a character-level `StreamParser` in `packages/core` that streams text, parses `<artifact>` blocks (split tags, raw content, unknown types, kebab-case ids, incomplete-close), keeps tags literal inside fences, renders `mermaid` fences, and parses the fallback `<tool_call>` protocol. A fuzz test over six static fixtures (`packages/core/test/fixtures/`) asserts identical normalized event sequences for whole, every-single-split, one-char-at-a-time, and seeded random multi-split feedings.
