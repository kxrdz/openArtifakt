# Progress

Status: IN PROGRESS

Tick each step when its acceptance criteria in docs/SPEC.md §12 pass and it is committed.

## Workflow
- **Feature** = one step below → git branch `feature/N-<slug>` + OpenSpec change `N-<slug>`.
- **Task** = one `- [ ]` item in the change's `tasks.md` → one git commit (`feat(N-<slug>): <summary>`).
- Plan a feature with `openspec-propose`, implement tasks with `openspec-apply-change`, finish with `openspec-archive-change`, then merge the branch into `main`.
- **Current feature/branch:** `feature/7-artifact-renderers-mermaid` — change `7-artifact-renderers-mermaid` planned (proposal, specs, design, tasks committed); tasks not yet started.

- [x] 1. Scaffold
- [x] 2. Shared types + stream parser
- [x] 3. Provider adapters
- [x] 4. Agent loop, tools, security layer
- [x] 5. Design foundation (Impeccable)
- [x] 6. Chat UI, approvals, terminal log
- [ ] 7. Artifact renderers + Mermaid
- [ ] 8. Versions, diff, revert, undo, settings, persistence
- [ ] 9. Final design pass (Impeccable)
- [ ] 10. Docs

## Blocked
<!-- One entry per blocker: what is blocked, why, and the exact command or action a human must take. -->
_None yet._

## Next
<!-- If a step is only partly done, write exactly what remains here for the next iteration. -->
_On `feature/7-artifact-renderers-mermaid`, run `openspec-apply-change` for change `7-artifact-renderers-mermaid` and implement the next unchecked task in its `tasks.md`. 1.1 and 1.2 are done: the parser lives in `packages/shared` (core re-exports it) and gained an `incomplete` flag on `mermaid_close`; the web artifact model is in `apps/web/src/artifacts/` (`parseDocument` folds parser events into text/mermaid blocks + artifacts keyed by identifier with a `versions` list, and `useArtifactStore` derives them from the last assistant message and tracks the selection). 2.1 is done: `scripts/vendor.mjs` builds a single esbuild `splitting:true` bundle into `apps/web/public/vendor/` (react, react-dom, react/jsx-runtime, lucide-react, recharts share one React instance via a shared chunk; `@tailwindcss/browser` copied verbatim), wired into `apps/web`'s `build`, and the server serves `/vendor/*` with `Access-Control-Allow-Origin: *` (dev `public/vendor`, prod `dist/vendor`; unit test asserts `react.js` → 200 + CORS). Next is 2.2 (sandbox runtime: srcdoc template + import map, postMessage error/console bridge, `ReactPreview` via sucrase and `HtmlPreview`). One commit per task; `pnpm check` green before each commit._

## Log
<!-- One line per completed step: date, step, short summary. -->
- 2026-09-27, step 1 (Scaffold): pnpm monorepo with strict TS, ESLint/Prettier, Vitest, Playwright+axe e2e, Hono server + Vite web, `design:check` wired into `check`, and GitHub Actions CI. `pnpm dev` starts both apps; `pnpm check` is green end-to-end.
- 2026-09-27, step 2 (Shared types + stream parser): canonical message model and `StreamEvent` union with zod schemas in `packages/shared`; a character-level `StreamParser` in `packages/core` that streams text, parses `<artifact>` blocks (split tags, raw content, unknown types, kebab-case ids, incomplete-close), keeps tags literal inside fences, renders `mermaid` fences, and parses the fallback `<tool_call>` protocol. A fuzz test over six static fixtures (`packages/core/test/fixtures/`) asserts identical normalized event sequences for whole, every-single-split, one-char-at-a-time, and seeded random multi-split feedings.
- 2026-09-27, step 3 (Provider adapters): `ProviderAdapter` contract and `createProviderAdapter` factory in `packages/core/src/providers`; four adapters (openai-compatible, anthropic, gemini, ollama) all emitting the canonical `StreamEvent` union — parallel tool calls, capability-flag fallback through the StreamParser, per-provider schema conversion, and retry with backoff/`Retry-After`. Offline fixture tests over the shared scenario matrix, and a `pnpm smoke --provider <id>` harness that skips providers without a key.
- 2026-09-27, step 5 (Design foundation): indigo-tinted light+dark design tokens as CSS variables mapped 1:1 into the Tailwind theme (`:root` dark, `[data-theme="light"]` override, theme bootstrap before paint), self-hosted IBM Plex Sans/Mono (no runtime CDN), token-only UI primitives (Button, IconButton, Badge, StatusDot, Kbd, Spinner, shared focus ring), and the empty workspace shell (status bar, resizable chat/artifact split with a keyboard-operable divider, collapsible terminal log, empty states, <900 px full-screen artifact sheet). `DESIGN.md` records the system; `pnpm design:check` passes with no hard-coded colors/font sizes. A dedicated `e2e/screenshots.spec.ts` + `pnpm screenshots` (own Playwright project, so it never runs under `pnpm check`) captures the shell into `docs/screenshots/` at 1440×900 and 390×844 in both themes.
- 2026-09-27, step 6 (Chat UI, approvals, terminal log): the full chat surface on the design system — `ChatContainer`/`MessageItem` (streamed text, auto-scroll that pauses on manual scroll), `Composer` (Send/Stop, keyboard-operable), `ToolCallCard` (running/awaiting/done/error) and `ApprovalCard` (diff for edits, editable command + working directory for commands, reject-with-note), a streaming `TerminalLog`, and the store-wired `StatusBar` (agent state always visible). A key-free `OPENARTIFACT_FAKE_PROVIDER=1` replay mode (scripted adapter over a seeded temp workspace) powers e2e and screenshots without any key; `e2e/chat.spec.ts` covers a full fake conversation (approve edit, reject command, final answer, Stop) and `pnpm screenshots` now captures the empty shell, a streaming conversation, a pending approval and the populated terminal log in both themes/viewports. `pnpm check` green end-to-end.
- 2026-09-27, step 4 (Agent loop, tools, security layer): the seven §8 tools (`read_file`, `list_directory`, `glob`, `search_code`, `edit_file`, `write_file`, `execute_command`) with zod schemas and approval categories; a realpath path jail rejecting `..`/symlink escapes plus `.git/` write denial and secret-file/`sudo` rules; an explicit state machine with 50-iteration / 120 s timeout / ~20k-char cap / 3-identical-failure limits, context stubbing above 75 % of window, ask/auto-edit/full-auto approval and cancel-keeps-history; a versioned snapshot-tested system prompt; and an orchestrating `AgentLoop` async generator, proven by a scripted `FakeProvider` integration test (read → edit → execute-tests → final answer in a temp dir, escape rejection, cancel mid-command leaves valid history). `pnpm check` green end-to-end.
