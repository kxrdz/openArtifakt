# Tasks

## 1. Persistence foundation (SQLite + migrations + repository)

- [x] 1.1 Add `better-sqlite3` to `apps/server` and build `apps/server/src/db/`: a connection wrapper, a numbered migration runner with `migrations/001_init.sql` (tables `conversations`, `messages`, `artifacts`, `artifact_versions`, `tool_calls`, `settings`), and a `Repository` interface with a `better-sqlite3` implementation. Verify `pnpm --filter @openartifact/server typecheck` and a Vitest that migrates a temp database and round-trips one conversation, message, artifact version, tool call and settings row.
- [x] 1.2 Add a repository factory that selects `better-sqlite3` and falls back to `node:sqlite` behind the same `Repository` interface when the native import throws (per §11). Verify a unit test that the factory falls back when the better-sqlite3 import fails, plus a schema test against `node:sqlite` when the runtime exposes it (skipped otherwise).

## 2. Shared wire types

- [x] 2.1 Add `settings`, `conversation summary` and `history` (messages + artifact versions + tool-call log) types with zod schemas to `packages/shared` and export them from `index.ts`. Verify `pnpm --filter @openartifact/shared test` and `pnpm --filter @openartifact/shared typecheck`.

## 3. Settings server

- [x] 3.1 Add `GET/PUT /api/settings` routes backed by the settings repository, with the API-key reference stored by name only (never the key), and live-apply the saved provider/model/approval-mode/context-window/capabilities to the active server config so the next conversation uses them. Verify a server unit test (routes read/write settings, reject an unknown provider, and the next conversation picks up a changed approval mode) and `pnpm --filter @openartifact/server typecheck`.

## 4. Persistence wiring + history endpoints

- [x] 4.1 Persist the user message, streamed assistant messages, artifact versions (derived from the accumulated assistant text via the shared parser) and the tool-call log (with approval decisions) from `streamTurn`, and add `GET /api/conversations` + `GET /api/conversations/:id` history endpoints. Verify a server unit test that a scripted fake-provider turn writes rows and the history endpoints return them, plus `pnpm --filter @openartifact/server typecheck`.

## 5. Restore on load (web)

- [x] 5.1 Add `apps/web/src/lib/history.ts` and extend the chat store + artifact store to load the conversation list on startup and restore a selected conversation's messages, tool-call log and artifact versions. Verify web unit tests (a stored history hydrates the stores, including multi-version artifacts) and `pnpm --filter @openartifact/web build`.

## 6. Settings drawer

- [x] 6.1 Build the `SettingsDrawer` component (provider, model, base URL, masked key-reference, context window, approval mode; fake-provider flag read-only), add a settings client, and wire the status-bar trigger to open/close it (Escape and close action dismiss it). Verify web unit tests, `pnpm design:check` and `pnpm --filter @openartifact/web build`.

## 7. Versions, diff and revert

- [x] 7.1 Add a version dropdown to the artifact panel that selects any stored version and renders its content, showing the version number and a "latest" marker. Verify a web unit test and `pnpm design:check`.
- [x] 7.2 Add a locally-bundled, lazily-loaded Monaco diff editor (`VersionDiff`) that diffs any two selected versions read-only, themed from the design tokens, with workers configured for offline use. Verify a web unit test for the version-pair selection logic, `pnpm --filter @openartifact/web build`, and `pnpm design:check`.
- [x] 7.3 Add a revert action to the artifact store and panel that appends the older version's content as a new version, never deleting history. Verify a web unit test (revert appends; all prior versions remain) and `pnpm design:check`.

## 8. Undo (snapshots + endpoint)

- [ ] 8.1 Extend `packages/core/src/tools/snapshot.ts` to also record files a turn creates (a `.created` marker when the target did not exist) and return the recorded kind, updating `write_file`/`edit_file` accordingly. Verify the updated snapshot unit tests pass.
- [ ] 8.2 Wire a real `SnapshotLocation` (snapshot root + conversation id + turn id) through `createAgentRuntime`/`buildConversation`, and add `POST /api/conversations/:id/undo` that restores a completed turn's snapshots in reverse order (copy `.before` back, delete `.created` targets) then removes the turn's snapshot directory. Verify a server unit test that undo restores an edited file and removes a created file in a temp workspace.

## 9. Undo UI

- [ ] 9.1 Add an "Undo this turn" action to the chat surface for completed turns that changed files, wired to the undo endpoint, with a clear outcome message. Verify a web unit test and `pnpm design:check`.

## 10. e2e + screenshots

- [ ] 10.1 Add `e2e/persistence-settings-undo.spec.ts` (reload restores the conversation list and artifact versions; a settings change persists; undo restores a file) using the key-free fake provider. Verify `pnpm e2e`.
- [ ] 10.2 Extend `e2e/screenshots.spec.ts` to capture the settings drawer, the version dropdown and the diff view in both themes and viewports, confirm `pnpm screenshots` writes them to `docs/screenshots/`, and verify `pnpm check` stays green end-to-end.
