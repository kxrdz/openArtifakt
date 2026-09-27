# Progress

Status: IN PROGRESS

Tick each step when its acceptance criteria in docs/SPEC.md §12 pass and it is committed.

## Workflow
- **Feature** = one step below → git branch `feature/N-<slug>` + OpenSpec change `N-<slug>`.
- **Task** = one `- [ ]` item in the change's `tasks.md` → one git commit (`feat(N-<slug>): <summary>`).
- Plan a feature with `openspec-propose`, implement tasks with `openspec-apply-change`, finish with `openspec-archive-change`, then merge the branch into `main`.
- **Next feature:** step 9 (Final design pass, Impeccable) on branch `feature/9-final-design-pass` + OpenSpec change `9-final-design-pass` (planned; tasks 1.1–11.2 pending).

- [x] 1. Scaffold
- [x] 2. Shared types + stream parser
- [x] 3. Provider adapters
- [x] 4. Agent loop, tools, security layer
- [x] 5. Design foundation (Impeccable)
- [x] 6. Chat UI, approvals, terminal log
- [x] 7. Artifact renderers + Mermaid
- [x] 8. Versions, diff, revert, undo, settings, persistence
- [ ] 9. Final design pass (Impeccable)
- [ ] 10. Docs

## Blocked
<!-- One entry per blocker: what is blocked, why, and the exact command or action a human must take. -->
_None yet._

## Next
<!-- If a step is only partly done, write exactly what remains here for the next iteration. -->
Step 8 is complete and merged. Step 9 (final design pass, Impeccable) is in progress on branch `feature/9-final-design-pass` (OpenSpec change `9-final-design-pass`). Tasks 1.1–4.1 (command registry, Dialog primitive, CommandPalette, shell wiring) and 5.1 (critique, snapshot at `.impeccable/critique/openartifact-workspace.md`, 33/40) are done. Run `openspec-apply-change` for `9-final-design-pass` and implement the remaining tasks one commit each, in order: 6.1 audit, 7.1 harden, 8.1 onboard, 9.1 polish, 10.1 rewrite `DESIGN.md`, 11.1–11.2 e2e + screenshots. The Impeccable skill is not installed in this repo; its `reference/*.md` docs are read from a sibling checkout (see DECISIONS.md).

## Log
<!-- One line per completed step: date, step, short summary. -->
- 2026-09-27, step 1 (Scaffold): pnpm monorepo with strict TS, ESLint/Prettier, Vitest, Playwright+axe e2e, Hono server + Vite web, `design:check` wired into `check`, and GitHub Actions CI. `pnpm dev` starts both apps; `pnpm check` is green end-to-end.
- 2026-09-27, step 2 (Shared types + stream parser): canonical message model and `StreamEvent` union with zod schemas in `packages/shared`; a character-level `StreamParser` in `packages/core` that streams text, parses `<artifact>` blocks (split tags, raw content, unknown types, kebab-case ids, incomplete-close), keeps tags literal inside fences, renders `mermaid` fences, and parses the fallback `<tool_call>` protocol. A fuzz test over six static fixtures (`packages/core/test/fixtures/`) asserts identical normalized event sequences for whole, every-single-split, one-char-at-a-time, and seeded random multi-split feedings.
- 2026-09-27, step 3 (Provider adapters): `ProviderAdapter` contract and `createProviderAdapter` factory in `packages/core/src/providers`; four adapters (openai-compatible, anthropic, gemini, ollama) all emitting the canonical `StreamEvent` union — parallel tool calls, capability-flag fallback through the StreamParser, per-provider schema conversion, and retry with backoff/`Retry-After`. Offline fixture tests over the shared scenario matrix, and a `pnpm smoke --provider <id>` harness that skips providers without a key.
- 2026-09-27, step 5 (Design foundation): indigo-tinted light+dark design tokens as CSS variables mapped 1:1 into the Tailwind theme (`:root` dark, `[data-theme="light"]` override, theme bootstrap before paint), self-hosted IBM Plex Sans/Mono (no runtime CDN), token-only UI primitives (Button, IconButton, Badge, StatusDot, Kbd, Spinner, shared focus ring), and the empty workspace shell (status bar, resizable chat/artifact split with a keyboard-operable divider, collapsible terminal log, empty states, <900 px full-screen artifact sheet). `DESIGN.md` records the system; `pnpm design:check` passes with no hard-coded colors/font sizes. A dedicated `e2e/screenshots.spec.ts` + `pnpm screenshots` (own Playwright project, so it never runs under `pnpm check`) captures the shell into `docs/screenshots/` at 1440×900 and 390×844 in both themes.
- 2026-09-27, step 6 (Chat UI, approvals, terminal log): the full chat surface on the design system — `ChatContainer`/`MessageItem` (streamed text, auto-scroll that pauses on manual scroll), `Composer` (Send/Stop, keyboard-operable), `ToolCallCard` (running/awaiting/done/error) and `ApprovalCard` (diff for edits, editable command + working directory for commands, reject-with-note), a streaming `TerminalLog`, and the store-wired `StatusBar` (agent state always visible). A key-free `OPENARTIFACT_FAKE_PROVIDER=1` replay mode (scripted adapter over a seeded temp workspace) powers e2e and screenshots without any key; `e2e/chat.spec.ts` covers a full fake conversation (approve edit, reject command, final answer, Stop) and `pnpm screenshots` now captures the empty shell, a streaming conversation, a pending approval and the populated terminal log in both themes/viewports. `pnpm check` green end-to-end.
- 2026-09-27, step 7 (Artifact renderers + Mermaid): the artifact panel renders all five types — a sandboxed React preview (sucrase transpile + import map + vendored ESM + Tailwind runtime, no `allow-same-origin`, `postMessage`-only error bridge), a sandboxed HTML preview, a DOMPurify-sanitized SVG viewer with SVG/PNG export, a themed Mermaid viewer (strict init, parse-before-render, unique ids, token-derived colors, zoom/pan/copy/download) and a shiki-highlighted Code viewer with copy — plus inline ```mermaid diagrams in chat (300 ms debounce, complete blocks only, inline syntax error with offending line, "Open in panel"). The `StreamParser` moved into `packages/shared` (core re-exports it) and the server serves the sandbox deps under `/vendor` with CORS; a mobile "Open artifact panel" toggle in the status bar opens the full-screen sheet once messages exist. `e2e/artifacts.spec.ts` proves every type renders, the sandbox blocks `window.parent.document`, and the invalid fence shows a line-numbered inline error; `pnpm screenshots` captures each type + the Mermaid error in both themes at 1440×900 and 390×844. `pnpm check` green end-to-end.
- 2026-09-27, step 4 (Agent loop, tools, security layer): the seven §8 tools (`read_file`, `list_directory`, `glob`, `search_code`, `edit_file`, `write_file`, `execute_command`) with zod schemas and approval categories; a realpath path jail rejecting `..`/symlink escapes plus `.git/` write denial and secret-file/`sudo` rules; an explicit state machine with 50-iteration / 120 s timeout / ~20k-char cap / 3-identical-failure limits, context stubbing above 75 % of window, ask/auto-edit/full-auto approval and cancel-keeps-history; a versioned snapshot-tested system prompt; and an orchestrating `AgentLoop` async generator, proven by a scripted `FakeProvider` integration test (read → edit → execute-tests → final answer in a temp dir, escape rejection, cancel mid-command leaves valid history). `pnpm check` green end-to-end.
- 2026-09-27, step 8 (Versions, diff, revert, undo, settings, persistence): SQLite persistence via `better-sqlite3` with a `node:sqlite` fallback behind one repository interface and numbered migrations; canonical `settings`/`history` wire types in `packages/shared`; `GET/PUT /api/settings` (masked key references, live-applied) and `GET /api/conversations` + `GET /api/conversations/:id`; turn persistence writing messages, artifact versions (shared parser) and the tool-call log with approval decisions; restore-on-load in the web stores; a `SettingsDrawer`; an artifact version dropdown, a lazily-loaded local Monaco diff view and a revert action that appends a new version without deleting history; per-turn file snapshots + `POST /api/conversations/:id/undo` with an "Undo this turn" chat action; and e2e + screenshots covering reload/versions/settings/undo and the settings drawer, version dropdown and diff view in both themes/viewports. `pnpm check` green end-to-end.
