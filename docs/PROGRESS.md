# Progress

Status: IN PROGRESS

Tick each step when its acceptance criteria in docs/SPEC.md §12 pass and it is committed.

## Workflow
- **Feature** = one step below → git branch `feature/N-<slug>` + OpenSpec change `N-<slug>`.
- **Task** = one `- [ ]` item in the change's `tasks.md` → one git commit (`feat(N-<slug>): <summary>`).
- Plan a feature with `openspec-propose`, implement tasks with `openspec-apply-change`, finish with `openspec-archive-change`, then merge the branch into `main`.
- **Current feature/branch:** `feature/5-design-foundation` (change `5-design-foundation`).

- [x] 1. Scaffold
- [x] 2. Shared types + stream parser
- [x] 3. Provider adapters
- [x] 4. Agent loop, tools, security layer
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
_Continue feature 5 on `feature/5-design-foundation`: tasks 1.1 (design tokens + Tailwind wiring + DESIGN.md) and 2.1 (self-hosted IBM Plex Sans + Mono woff2, `@font-face` rules, `--font-sans`/`--font-mono` tokens, no remote font URL) are done and committed. Next is task 3.1: create `apps/web/src/components/ui/` primitives built on the tokens — `Button` (variants, loading, disabled), `IconButton`, `Badge` (status variants), `StatusDot`, `Kbd`, `Spinner`, and a shared focus-visible ring — exported from `components/ui/index.ts`, plus a small screen to exercise them for the screenshots pass. Run `pnpm design:check` after the UI change._

## Log
<!-- One line per completed step: date, step, short summary. -->
- 2026-09-27, step 1 (Scaffold): pnpm monorepo with strict TS, ESLint/Prettier, Vitest, Playwright+axe e2e, Hono server + Vite web, `design:check` wired into `check`, and GitHub Actions CI. `pnpm dev` starts both apps; `pnpm check` is green end-to-end.
- 2026-09-27, step 2 (Shared types + stream parser): canonical message model and `StreamEvent` union with zod schemas in `packages/shared`; a character-level `StreamParser` in `packages/core` that streams text, parses `<artifact>` blocks (split tags, raw content, unknown types, kebab-case ids, incomplete-close), keeps tags literal inside fences, renders `mermaid` fences, and parses the fallback `<tool_call>` protocol. A fuzz test over six static fixtures (`packages/core/test/fixtures/`) asserts identical normalized event sequences for whole, every-single-split, one-char-at-a-time, and seeded random multi-split feedings.
- 2026-09-27, step 3 (Provider adapters): `ProviderAdapter` contract and `createProviderAdapter` factory in `packages/core/src/providers`; four adapters (openai-compatible, anthropic, gemini, ollama) all emitting the canonical `StreamEvent` union — parallel tool calls, capability-flag fallback through the StreamParser, per-provider schema conversion, and retry with backoff/`Retry-After`. Offline fixture tests over the shared scenario matrix, and a `pnpm smoke --provider <id>` harness that skips providers without a key.
- 2026-09-27, step 4 (Agent loop, tools, security layer): the seven §8 tools (`read_file`, `list_directory`, `glob`, `search_code`, `edit_file`, `write_file`, `execute_command`) with zod schemas and approval categories; a realpath path jail rejecting `..`/symlink escapes plus `.git/` write denial and secret-file/`sudo` rules; an explicit state machine with 50-iteration / 120 s timeout / ~20k-char cap / 3-identical-failure limits, context stubbing above 75 % of window, ask/auto-edit/full-auto approval and cancel-keeps-history; a versioned snapshot-tested system prompt; and an orchestrating `AgentLoop` async generator, proven by a scripted `FakeProvider` integration test (read → edit → execute-tests → final answer in a temp dir, escape rejection, cancel mid-command leaves valid history). `pnpm check` green end-to-end.
