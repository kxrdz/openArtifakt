# Proposal

## Why

Steps 1–5 built the engine (types, parser, adapters, agent loop, security) and the design foundation, but the web app is still an empty shell and the server only serves static files plus `/health`. There is no way to hold a conversation, approve a risky action, watch command output stream in, or Stop a turn — so none of the engine is usable from the product. This step wires the agent loop to a real HTTP transport and builds the chat, approval and terminal-log surfaces on the design system, with a key-free fake provider so the UI and e2e tests run without any API key.

## What Changes

- Add a **chat server transport** (`apps/server`): a runtime that assembles `createProviderAdapter` + the seven tools + the runtime system prompt into a working `AgentLoop` per conversation, and exposes `POST /api/chat` (SSE stream of the loop's events), an approval-decision endpoint, and a stop endpoint. Command stdout/stderr streams to the client as it arrives.
- Add a **fake-provider mode** (`OPENARTIFACT_FAKE_PROVIDER=1`): the server replays a scripted fixture conversation (streaming text, an `edit_file` that needs approval, an `execute_command` that gets rejected, a final answer, and a slow-streaming turn for Stop) in a seeded temp workspace, so the UI and e2e run without API keys.
- Add **local-server security** for the new HTTP surface (§9): bind to loopback only, a random session token issued to the UI (httpOnly cookie) and required on every API request, and rejection of requests whose `Host`/`Origin` is not the local UI.
- Add the **chat UI** (`apps/web`): message list with live streamed text, a composer with Send/Stop, tool-call cards, approval cards (diff for edits/writes, full command + working directory + editable command for commands, reject-with-note), a streaming terminal log, and the agent state always visible in the status bar.
- Add a **Zustand chat store** and an SSE-over-fetch client so the UI drives the loop and reflects its state.
- Add **e2e coverage** of a full fake conversation — an approved edit, a rejected command, and Stop — and extend the screenshots script to capture the streaming, approval and terminal-log surfaces.

## Capabilities

### New Capabilities

- `chat-server`: the local HTTP chat transport — the agent runtime wiring (config → provider adapter + tool registry + system prompt), the SSE chat stream, approval decision and stop endpoints, command-output streaming, the session-token + Host/Origin guard, and the `OPENARTIFACT_FAKE_PROVIDER=1` replay mode that works without API keys.
- `chat-ui`: the web chat surface — message list with streamed text, composer with Send/Stop, tool-call cards, approval cards (approve / reject-with-note / edit-command), the streaming terminal log, and the always-visible agent state.

### Modified Capabilities

_None._

## Impact

- `apps/server`: new `config`, `security`, `agent/runtime`, `fake` and `routes/chat` modules; `createApp` grows options and the API routes; tsconfig switches to bundler resolution and the server runs via `tsx` (source imports from `packages/*`), so it can consume `@openartifact/core` + `@openartifact/shared` as TypeScript source.
- `packages/core`: `package.json` gains an `exports`/`main` pointing at `src/index.ts` (no code change).
- `packages/shared`: new `chat.ts` wire types (agent state + chat events + approval decision) shared by server and web.
- `apps/web`: new `store/chatStore.ts` (Zustand), `lib/sse.ts`, `components/chat/*` (container, message item, composer, tool-call card, approval card); `TerminalLog` and `StatusBar` are wired to the store; Vite dev proxy forwards `/api` to the server. Adds `zustand` and `@openartifact/shared` dependencies.
- `e2e`: new `chat.spec.ts`; `playwright.config.ts` sets the fake-provider env for the e2e project; `screenshots.spec.ts` gains the new surfaces.
- No changes to the provider adapters, parser, or the tool implementations themselves.
