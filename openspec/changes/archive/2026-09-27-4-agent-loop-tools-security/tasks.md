# Tasks

## 1. Security layer

- [x] 1.1 Create `packages/core/src/security/path-jail.ts` (`resolveWithinWorkspace` realpath-based containment check, `assertWritablePath` with `.git/` denial, `PathJailError`) and `packages/core/src/security/secrets.ts` (`isSecretPath` matching `.env*`, `*.pem`, `*.key`, `id_rsa*`), export both from a new `security/index.ts` and wire it into `src/index.ts`; add unit tests proving `..` traversal, symlink escape, `.git/` write denial and secret basename matching. Verify: `pnpm --filter @openartifact/core test` passes and root `pnpm check` stays green.

## 2. Tools

- [x] 2.1 Create `packages/core/src/tools/` with the tool contract (`Tool`, `ToolContext`, `ToolResult`, approval categories), the result-cap truncation helper (head+tail with a `[... N lines truncated ...]` marker), and a `ToolRegistry`; export from a `tools/index.ts` and `src/index.ts`; add unit tests for the truncation helper and registry lookup. Verify: `pnpm --filter @openartifact/core test` passes and root `pnpm check` stays green.
- [x] 2.2 Implement `read_file`, `list_directory` (`.gitignore`-respecting), `glob` (`*`/`**`/`?`), and `search_code` (ripgrep-if-present with a JS regex fallback) as registry tools, each routing through the path jail; add unit tests for line numbers, depth limits, `.gitignore` exclusion, glob patterns, regex results capping and missing-file/invalid-regex errors. Verify: `pnpm --filter @openartifact/core test` passes and root `pnpm check` stays green.
- [x] 2.3 Implement `edit_file` (exact-string replace with helpful not-found/not-unique errors and `replaceAll`) and `write_file`, plus the pre-mutation snapshot helper writing to `<snapshotRoot>/<conversation>/<turn>/`; add unit tests for single replace, not-found, ambiguous (no replaceAll), replace-all, create/rewrite and snapshot creation. Verify: `pnpm --filter @openartifact/core test` passes and root `pnpm check` stays green.
- [x] 2.4 Implement `execute_command` (shell spawn, stdout/stderr streaming callback, default 120 s timeout, process-group kill on timeout/abort, exit code + truncated combined output); add unit tests for exit code, output capture, timeout kill and streaming. Verify: `pnpm --filter @openartifact/core test` passes and root `pnpm check` stays green.

## 3. Agent loop

- [x] 3.1 Create `packages/core/src/agent/` with the state machine, loop options/limits (50-iteration cap, 3 identical-failure stop) and the context manager (token estimation, 75 %-of-window stubbing that never drops the system prompt or latest user message); add unit tests for state transitions, iteration cap, identical-failure detection, token estimation and stubbing. Verify: `pnpm --filter @openartifact/core test` passes and root `pnpm check` stays green.
- [x] 3.2 Add the approval flow (ask/auto-edit/full-auto resolution, secret-read and sudo forced approval, approve/reject-with-note/edit-command decisions) and cancellation (abort propagation, every `tool_call` gets a `tool_result`, cancelled tool results are `"cancelled by user"`); add unit tests for mode resolution and cancel-keeps-history. Verify: `pnpm --filter @openartifact/core test` passes and root `pnpm check` stays green.
- [x] 3.3 Create `packages/core/src/prompts/system.ts` with a versioned `buildSystemPrompt` (working style, artifact syntax, React constraints, design quality, diagrams, untrusted content, runtime-injected workspace/OS/shell/date/approval-mode, fallback protocol only when `nativeTools` is false); add a snapshot test pinning the template. Verify: `pnpm --filter @openartifact/core test` passes and root `pnpm check` stays green.

## 4. Integration

- [x] 4.1 Add `packages/core/test/fake-provider.ts` (test-only scripted `ProviderAdapter`) and an integration test that runs read → edit → execute-tests → final answer in a temp directory, proves `..`/symlink escapes are rejected, and proves cancelling mid-command leaves a valid history; confirm `src/index.ts` re-exports `agent`, `tools`, `security` and `prompts`. Verify: `pnpm --filter @openartifact/core test` passes and root `pnpm check` stays green end-to-end.
