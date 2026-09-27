# Tasks

## 1. Server runtime foundation

- [x] 1.1 Switch the server to consume `packages/*` source: set `apps/server/tsconfig.json` to `module: ESNext` + `moduleResolution: Bundler`, change `start` to `tsx src/index.ts` and `build` to `tsc --noEmit`, add `@openartifact/core` + `@openartifact/shared` as `workspace:*` deps, and add `exports`/`main` (→ `./src/index.ts`) to `packages/core/package.json`. Verify `pnpm --filter @openartifact/server typecheck` and `pnpm --filter @openartifact/server build` pass and the server still starts via `tsx src/index.ts`.
- [x] 1.2 Add `apps/server/src/config.ts` (zod-validated env config: provider, model, baseUrl, apiKeyRef, approval mode, workspace root, context window, capabilities, fake flag; defaults per §8/§9) and `apps/server/src/security.ts` (random session token, httpOnly cookie issue, loopback `Host`/`Origin` rejection, token guard). Verify the new unit tests (`config.test.ts`, `security.test.ts`) pass: defaults, fake flag, token rejection, non-loopback Host/foreign Origin rejection.
- [x] 1.3 Add `apps/server/src/agent/runtime.ts` that builds a runnable `AgentLoop` from config (`createProviderAdapter`, the seven registered tools, `buildSystemPrompt`, workspace root, snapshot location, `onCommandOutput`). Verify a unit test asserts the loop's provider id, tool registry size (7) and prompt injection without touching the network.

## 2. Fake provider mode

- [x] 2.1 Add `apps/server/src/fake/` — a scripted `ProviderAdapter` replaying a fixed fixture conversation (streaming text → `edit_file` needing approval → `execute_command` needing approval → final answer → slow-streaming turn for Stop) with per-turn delays, plus a seeded temp workspace (`notes.txt`). Verify a unit test replays the turns in order deterministically and yields text in multiple deltas.

## 3. Chat endpoints

- [x] 3.1 Add `apps/server/src/routes/chat.ts` with `POST /api/chat` (SSE stream of loop events), `POST /api/chat/:conversationId/approval` (approve/edit-command/reject resolves the pending approval), `POST /api/chat/:conversationId/stop` (cancels the turn), plus the conversation registry and command-output forwarding; wire `createApp` options (config, session token) and `/api/session`. Verify an integration test through `app.request()` with the fake provider covers approve-edit → reject-command → final answer, and a second test covers Stop.

## 4. Web chat store + SSE client

- [x] 4.1 Add `zustand` and `@openartifact/shared` to `apps/web`, add the shared wire types in `packages/shared/src/chat.ts` (agent state, chat event union, approval decision schemas), and add a Vite dev proxy for `/api`. Verify `pnpm --filter @openartifact/shared typecheck` and `pnpm --filter @openartifact/web typecheck` pass.
- [x] 4.2 Add `apps/web/src/lib/sse.ts` (SSE-over-fetch parser) and `apps/web/src/store/chatStore.ts` (messages, agent state, terminal output, pending approval, send/stop/decide actions). Verify unit tests cover parsing an SSE stream and the store's send → streaming → approval → decision → done transition.

## 5. Chat UI: messages, composer, status

- [x] 5.1 Build `ChatContainer`, `MessageItem` and `Composer` (send/stop, keyboard-operable) and wire `StatusBar` + `ChatPane` to the store so a conversation renders streamed messages and the state is always visible; auto-scroll pauses on manual scroll. Verify `pnpm design:check` passes and `pnpm build` (web) typechecks.

## 6. Tool-call cards, approval cards, terminal log

- [x] 6.1 Build `ToolCallCard` (name, args, running/done/error status), `ApprovalCard` (diff for edits/writes, full command + working directory + editable command for commands, reject-with-note) and wire `TerminalLog` to the streamed command output. Verify `pnpm design:check` passes and `pnpm build` (web) typechecks.

## 7. e2e + screenshots

- [x] 7.1 Set `OPENARTIFACT_FAKE_PROVIDER=1` (and the temp-workspace env) in the e2e webServer and add `e2e/chat.spec.ts` covering a full fake conversation — streaming text, an approved edit, a rejected command, the final answer, and Stop mid-stream. Verify `pnpm e2e` passes.
- [ ] 7.2 Extend `e2e/screenshots.spec.ts` to capture the streaming conversation, a pending approval card and the populated terminal log in both themes/viewports, and confirm `pnpm screenshots` writes them to `docs/screenshots/`. Verify `pnpm check` stays green end-to-end.
