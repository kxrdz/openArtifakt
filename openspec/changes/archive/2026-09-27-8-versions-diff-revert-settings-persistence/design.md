# Design

## Context

Steps 1–7 left the server with an in-memory `ConversationRegistry` (`apps/server/src/routes/chat.ts`) and no persistence; the artifact panel (`apps/web/src/components/shell/ArtifactPanel.tsx`) already holds a full version list per artifact but offers no way to select/diff/revert versions; the status bar has a settings seam (`onOpenSettings`) that is not wired; and the core snapshot mechanism (`packages/core/src/tools/snapshot.ts`) is built and unit-tested but not connected to real conversation/turn ids, and it does not record files a turn *created* (only pre-existing files get a `.before` copy). `packages/shared` already owns the canonical `Message` model and the `ChatEvent` wire union. See proposal.md for motivation.

## Goals / Non-Goals

**Goals**
- Persist and restore conversations, messages, artifact versions and the tool-call log in SQLite behind a swappable repository interface.
- Make settings (provider/model/key-reference/approval mode/context window/capabilities) editable in a drawer, persisted, and applied live.
- Add version selection, Monaco diff and revert to the artifact panel.
- Wire real per-turn snapshots and an "Undo this turn" endpoint + UI.
- Keep `pnpm check` green throughout; each task commits independently.

**Non-Goals**
- No multi-user accounts, cloud sync, or encryption at rest.
- No secrets in the DB or the browser; keys stay in env/config file, referenced by name.
- No rewriting of the provider adapters or the agent loop's message handling.
- Monaco is used for the diff editor only; the code viewer stays on shiki.

## Decisions

### 1. Storage: `better-sqlite3` behind a repository interface
- **Choice**: `apps/server/src/db/` with a `Database` connection wrapper, a numbered migration runner (`migrations/001_init.sql`, …), and a `Repository` interface (`saveConversation`, `saveMessage`, `saveArtifactVersion`, `saveToolCall`, `listConversations`, `getConversation`, `getSettings`, `saveSettings`, …). All call sites use the interface; the `better-sqlite3` implementation is the default.
- **Why**: the spec (§11) requires better-sqlite3 with migrations "from day one" and a `node:sqlite` fallback behind the same interface if the native build fails. An interface isolates the swap.
- **Alternatives**: an ORM (overkill, adds a dependency and hides SQL); a JSON file store (no transactions/querying, loses artifact-version indexing).

### 2. Data model: one row per version, messages as JSON
- **Choice**: `conversations(id, title, created_at)`, `messages(conversation_id, seq, role, parts_json, created_at)`, `artifacts(conversation_id, identifier, title, type, language, created_at)` + `artifact_versions(artifact_id, version, content, incomplete, created_at)` (UNIQUE(artifact_id, version)), `tool_calls(conversation_id, call_id, name, args_json, result, is_error, decision_json)`, and `settings(key, value_json)` (single-row or keyed).
- **Why**: artifact versions are append-only with a stable (identifier, version) key, mirroring the web model (`parseDocument.ts`); messages are stored as the canonical `Message.parts` JSON, so restore is a direct `parseMessage`.
- **Alternatives**: one artifacts row per version (denormalized, harder to key); storing messages as prose text (loses tool-call structure).

### 3. Persistence is written from the chat transport, not the loop
- **Choice**: `routes/chat.ts`'s `streamTurn` persists the user message before streaming and, for each loop event (`text`, `tool_start`, `tool_result`, `approval_request`/`approval_decision`, `done`), appends/updates the stored messages and tool-call log. Artifact versions are derived by feeding the accumulated assistant text through `parseDocument` on the server (reusing `@openartifact/shared`'s parser) so persisted artifacts match exactly what the web renders.
- **Why**: the loop is transport-agnostic and must not know about SQLite; the server already observes every event. Deriving artifacts from text keeps one source of truth (the assistant text) instead of re-emitting artifact events from the loop.
- **Alternatives**: emit artifact events from the loop (couples the loop to rendering concerns); a background writer that dumps the loop's `messages` at the end (loses mid-turn durability).

### 4. Settings: non-secret JSON, key by reference, applied live
- **Choice**: `GET/PUT /api/settings` reads/writes the non-secret fields. `apiKeyRef` is stored as the env/config-entry *name*; the actual key is resolved server-side from `process.env[apiKeyRef]` (or `~/.openartifact/config.json`, mode `600`). The UI renders `apiKeyRef` (or a masked `••••` when a key is present). On `PUT`, the server mutates the active `ServerConfig` so the next `buildConversation` uses the new provider/model/approval-mode; the fake-provider flag is read-only in the drawer.
- **Why**: keys never cross the wire or touch SQLite (§9). Live-apply avoids a restart and matches "settings drawer covers … approval mode" (§12.8).
- **Alternatives**: persist only via env vars (no live apply); store keys in the DB (violates §9).

### 5. Diff editor: locally-bundled, lazily-loaded Monaco
- **Choice**: add `monaco-editor` (no CDN). The `VersionDiff` component dynamic-imports Monaco and its editor/diff workers via Vite `?worker`/`new Worker(new URL(...))`, and is mounted only when the user opens the diff view, so the main bundle stays lean. The diff view is read-only, themed from the design tokens.
- **Why**: the spec mandates "the Monaco diff editor" (§6); bundling locally preserves offline/local-first and avoids the `@monaco-editor/react` CDN loader.
- **Alternatives**: `@monaco-editor/react` (loads from CDN by default → breaks offline); a hand-rolled unified diff (not the Monaco editor the spec asks for). A lightweight unified-diff fallback is retained for unit tests of the diff *logic* so the heavy editor stays out of Vitest/jsdom.

### 6. Undo: extend snapshots to record created files, restore in reverse
- **Choice**: extend `snapshot.ts` so `snapshotBeforeMutation` also writes a zero-length `N_<basename>.created` marker when the target did not exist before the write, and returns the recorded kind so the undo path can distinguish overwrite vs create. The server passes a real `SnapshotLocation` (`snapshotRoot = ~/.openartifact/snapshots`, `conversationId`, `turnId = <seq>` per `loop.run` call) into `createAgentRuntime`/`buildConversation`. `POST /api/conversations/:id/undo?turn=<n>` restores the turn's snapshots in reverse counter order (copy `.before` back; delete `.created` targets), then removes that turn's snapshot directory.
- **Why**: the existing snapshot seam is already plumbed through `ToolContext` and `AgentLoop`; only the wiring and the created-file marker were missing. Reverse order is required because the same file can be mutated multiple times in one turn.
- **Alternatives**: filesystem diffs after the turn (fragile); git-based undo (assumes a repo); per-file `.undo` journaling outside the snapshot root (duplicates the existing mechanism).

### 7. Shared wire types live in `packages/shared`
- **Choice**: add `settings` (settings object + schema), `conversation summary` and `history` (a conversation's messages/artifacts/tool-call log) types + zod schemas to `packages/shared` so server and web share one contract, mirroring the existing `chat.ts` pattern.
- **Why**: matches the established architecture (§2/§3) and keeps the browser from importing `@openartifact/core`.

## Risks / Trade-offs

- **`better-sqlite3` native build failure** → the `node:sqlite` fallback sits behind the same `Repository` interface; if neither works, record under Blocked in `docs/PROGRESS.md` with the exact fix (as §11 prescribes).
- **Monaco bundle size / worker setup** → lazy dynamic import + local workers; only the diff view pays the cost. If worker wiring proves brittle under Vite 7, fall back to a read-only `monaco.editor.createDiffEditor` with `monaco-editor/esm/vs/editor/editor.worker?worker` and verify in e2e.
- **Mid-turn durability** → each event persists synchronously in `streamTurn`'s event loop (writes are small); a crash mid-turn restores the last persisted state, which is acceptable (the loop owns in-flight correctness).
- **Settings live-apply races** → an in-flight turn keeps its conversation's provider/approval-mode snapshot; changed settings apply to the next conversation/turn, avoiding mid-turn reconfiguration.
- **Undo of a running turn** → undo is offered only for completed turns (the turn id is final once `done` is emitted), so there is no snapshot directory churn mid-turn.
