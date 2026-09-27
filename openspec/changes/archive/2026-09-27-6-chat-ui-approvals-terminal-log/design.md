# Design

## Context

The engine (types, parser, adapters, agent loop, security) and the design foundation are complete. The server (`apps/server/src/app.ts`) is Hono with `/health` + static serving; the web app is the empty shell from step 5. Two constraints shape this design:

- `packages/core` and `packages/shared` are source-only (exports point at `src/index.ts`, extensionless imports, bundler resolution). The server currently uses NodeNext + `tsc` emit, which cannot consume them (verified: TS2835/TS2305).
- The web app must never import `packages/core` — core's tool modules import `node:*` and would break the browser build. Wire types shared by server and web therefore live in `packages/shared`.

## Goals / Non-Goals

**Goals:**

- A working chat loop over HTTP: send a message, watch it stream, approve/reject tool calls, stream command output, and Stop.
- Key-free, network-free operation via a scripted fake provider so e2e and the UI run anywhere.
- A designed chat surface (messages, tool cards, approval cards, terminal log, status) built on the existing tokens — no new visual language.
- The non-negotiable §9 server security (loopback bind, session token, Host/Origin rejection).

**Non-Goals:**

- Persistence (SQLite, reload-restore), settings drawer, artifacts/rendering, versions/diff/revert, undo — features 7–8.
- Command palette and the final accessibility/harden pass — feature 9.
- CSP hardening beyond a baseline header (final pass in feature 9).

## Decisions

### 1. Server consumes `packages/*` as TypeScript source, run via `tsx`

The server's NodeNext/`tsc`-emit setup cannot resolve source-only packages. Switch `apps/server/tsconfig.json` to `module: ESNext` + `moduleResolution: Bundler`, change `start` to `tsx src/index.ts`, and change `build` to `tsc --noEmit` (typecheck-only; `tsx` runs the server in dev and in the e2e webServer). Add `@openartifact/core`/`@openartifact/shared` as `workspace:*` deps and an `exports`/`main` to `packages/core/package.json` (mirroring `shared`).

- Alternative: give `shared`/`core` real `dist/` builds with `.js` extensions and consume compiled output — more moving parts (prebuild ordering, dual dev/prod resolution) for no gain in a local-first tool. `tsx` is already a dev dependency.

### 2. Wire types live in `packages/shared/src/chat.ts`

`AgentState`, the client-facing chat event union, and the approval-decision request/response schemas are defined once in `shared` (zod-validated) and consumed by both the server (serialization/parsing) and the web client. Core's internal `AgentState` union stays where it is (7 strings); the server passes it through unchanged, and the shared schema asserts the same shape. This keeps `core` out of the browser while giving both sides one contract.

### 3. Chat transport is SSE-over-fetch (POST) with a separate decision endpoint

`POST /api/chat` streams `text/event-stream` (`event:`/`data:` lines) for the loop's events; the client reads it with `fetch` + `ReadableStream` (EventSource is GET-only and can't carry the POST body). Approval decisions go back over `POST /api/chat/:conversationId/approval`, which resolves the pending `approvalHandler` promise for that call. Stop is `POST /api/chat/:conversationId/stop`, calling `AgentLoop.cancel()`.

- One `AgentLoop` per conversation (it owns history); a conversation registry maps id → loop + pending approvals. A second turn on a running conversation is rejected with a clear error.
- Command output streams as a dedicated `command_output` event wired to the loop's `onCommandOutput`.

### 4. Session token as httpOnly cookie + `/api/session` bootstrap

At startup the server generates a random token. In production the HTML response sets it; the web client also calls `GET /api/session` on load (proxied in dev), which sets the cookie and returns the approval mode/fake flag. Every other `/api/*` requires the cookie. `Host` must be a loopback host and a present `Origin` must be a loopback origin (any loopback port, so the Vite dev proxy works).

- Alternative considered: token in the URL query (`?token=…`). Rejected — leaks into history/logs; a cookie is SameSite-scoped and httpOnly.

### 5. Fake provider is a server-side scripted adapter over a seeded temp workspace

`OPENARTIFACT_FAKE_PROVIDER=1` selects a scripted `ProviderAdapter` (built on the same canonical `StreamEvent` vocabulary as `packages/core/test/fake-provider.ts`, but living in the server so it can stream slowly for Stop). It replays: streaming text → `edit_file` (needs approval) → `execute_command` (needs approval) → final answer, plus a slow-streaming turn for the Stop test. The workspace is a `mkdtemp` dir seeded with `notes.txt` so the scripted edit has a real target. Real tools run against it, so the loop's genuine edit/command path is exercised.

### 6. Approval card diffs are minimal old/new, not a Monaco diff

`edit_file`/`write_file` cards show the target path and a two-tone block (removed lines red, added lines green) derived from `oldString`/`newString`. The Monaco diff editor arrives with version diffing in feature 8; a lightweight diff keeps this feature self-contained and avoids pulling a heavy editor in early.

### 7. Vite dev proxy forwards `/api`

`apps/web/vite.config.ts` proxies `/api` to `http://127.0.0.1:4318` so the client always uses same-origin relative URLs and the session cookie/Host-Origin checks behave identically in dev and production.

## Risks / Trade-offs

- [Server runs via `tsx` in "production"] → acceptable for a local-first single-user tool (loopback only, one process); `tsc --noEmit` still typechecks every build, and the e2e webServer runs the same `tsx` path.
- [Fake provider shares shape but not code with the core test fake] → the two are small and serve different hosts (test vs. server); a comment links them. If drift appears, extract a shared fixture later.
- [In-memory conversation registry is lost on restart] → intentional: persistence is feature 8; the registry is the clean seam to swap for SQLite.
- [SSE-over-fetch parser is hand-rolled] → kept minimal (split on blank-line-delimited `event:`/`data:` blocks); covered by a unit test.
