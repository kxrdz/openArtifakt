# Proposal

## Why

Steps 1–7 produced a working engine and interface, but every conversation and artifact history lives only in the server process's memory: reloading the page loses everything, artifact versions can be listed but not diffed or reverted, there is no way to change provider/model/approval-mode without restarting the server, and edits the agent made cannot be undone. Persistence, versions/diff/revert, undo and settings are the remaining v0.1 capabilities (§1, §6, §8, §11), and together they turn a demo into a tool a developer can actually live in.

## What Changes

- **SQLite persistence** (`apps/server/src/db`): a `better-sqlite3` database at `~/.openartifact/data.db` with a migration runner, storing conversations, messages (canonical `Message` format), artifacts and their versions, the tool-call log with approval decisions, and non-secret settings. A repository interface keeps the storage engine swappable so `node:sqlite` can back the same interface if the native build fails (§11).
- **Restore on load**: the server persists every conversation turn as it streams and exposes history endpoints (`GET /api/conversations`, `GET /api/conversations/:id`); the web client loads the conversation list on startup and restores a conversation's messages, tool-call log and artifact versions when opened. Reloading restores conversations and artifact histories (§12.8 acceptance criterion).
- **Settings drawer** (`apps/web/src/components/settings`): a drawer (already a status-bar seam) covering provider, model, base URL, API-key reference (masked, never the key), context window, and approval mode. A `GET/PUT /api/settings` pair persists non-secret settings server-side; the server applies them live (approval mode and provider/model affect subsequent turns).
- **Versions, diff, revert** (`apps/web`): a version dropdown in the artifact panel to select any stored version, a Monaco diff editor to diff any two versions, and a **Revert** action that copies an older version's content forward as a new version — history is never deleted.
- **Undo this turn** (`apps/server` + `apps/web`): the server wires the already-built pre-mutation snapshot seam with real conversation/turn ids, an undo endpoint restores the turn's snapshots (in reverse order, deleting files the turn created), and the chat surface gains an "Undo this turn" action.

## Capabilities

### New Capabilities

- `persistence`: SQLite storage of conversations, messages (canonical format), artifacts and versions, the tool-call log (including approval decisions) and non-secret settings, with migrations from day one and the restore-on-reload history endpoints.
- `settings`: the settings drawer and settings API — provider, model, base URL, key reference (masked), context window, capability flags and approval mode — persisted server-side, never exposing secrets, and applied live to subsequent turns.

### Modified Capabilities

- `artifact-rendering`: the artifact panel gains a version dropdown, diffing between any two versions, and revert that appends a new version instead of deleting history.
- `chat-server`: the server snapshots every file before a mutation under the real conversation/turn ids and exposes an "undo this turn" endpoint that restores those snapshots.
- `chat-ui`: the chat surface gains an "Undo this turn" action and the status-bar settings trigger opens the settings drawer.

## Impact

- `apps/server`: new `db/` (migrations, repository, connection) and `routes/` additions — `GET/PUT /api/settings`, `GET /api/conversations`, `GET /api/conversations/:id`, `POST /api/conversations/:id/undo`; the chat route persists messages/artifacts/tool-call log as it streams; `createAgentRuntime`/`buildConversation` pass a real `SnapshotLocation` (conversation + turn ids).
- `apps/web`: new `components/settings/` drawer; the artifact panel gains the version dropdown, diff and revert; the chat store gains history loading and undo actions; a `lib/history.ts` client for the conversation endpoints; Monaco is added as a locally-bundled, lazily-loaded dependency for the diff editor.
- `packages/core`: the snapshot mechanism is extended so undo can also remove files the turn created (currently only pre-existing files are snapshotted); no change to the adapter or loop APIs otherwise.
- `packages/shared`: wire types for settings, conversation summaries and the history response are added so server and web share one contract.
- `e2e`: a persistence/settings/undo spec (reload restores history; settings persist; undo restores a file) plus screenshots of the settings drawer, the diff view and the version dropdown.
