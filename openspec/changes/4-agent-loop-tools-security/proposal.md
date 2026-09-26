# Proposal

## Why

The adapters from feature 3 can stream any provider into the canonical `StreamEvent` vocabulary, but nothing yet turns those events into action. The product's second pillar is a local agent loop that reads, edits and runs code in a workspace, with every risky action visible and approvable. That loop is also where the non-negotiable security guarantees live (path jail, secret-file rules), so it must land before any UI can drive it.

## What Changes

- Add the **tools layer** in `packages/core/src/tools/`: the seven spec'd tools (`read_file`, `list_directory`, `glob`, `search_code`, `edit_file`, `write_file`, `execute_command`), each with a zod schema, an approval policy, and a pure, unit-tested executor. Read-only tools run without approval; edits, writes and commands ask by default.
- Add the **security layer** in `packages/core/src/security/`: a path jail that resolves real paths and rejects `..` traversal, symlink escapes and writes inside `.git/`; secret-file detection (`.env*`, `*.pem`, `*.key`, `id_rsa*`) that forces approval even in Full auto; and a rule that `sudo` is never auto-approved.
- Add the **agent loop** in `packages/core/src/agent/`: an explicit state machine (`idle → streaming → awaiting_approval → executing_tool → … → done | error | cancelled`), a context manager (token tracking, 75 %-of-window compaction via tool-result stubs then turn summarization), the configurable limits (50 iterations, 120 s command timeout, ~20 000-char tool-result cap with head/tail truncation, 3 identical-failure stop), cancellation that keeps history valid, and the approval modes (ask / auto-edit / full auto).
- Add the **runtime system prompt** in `packages/core/src/prompts/system.ts` (versioned, snapshot-tested) so models know how to work, when to emit artifacts, and the fallback tool protocol when native tools are off.
- Add an **integration test** that drives a scripted fake provider through read → edit → execute-tests → final answer inside a temp directory, proves path/symlink escapes are rejected, and proves cancelling mid-command leaves a valid history.

## Capabilities

### New Capabilities

- `tools`: the seven tool definitions (zod schemas, approval policies) and their filesystem/shell executors, with output caps and file snapshots before mutation.
- `security`: the path jail, secret-file rules, and command-safety rules that every tool goes through.
- `agent-loop`: the state machine, context manager, limits, cancellation, approval flow and runtime system prompt that orchestrate the tools against a provider.

### Modified Capabilities

_None._

## Impact

- `packages/core`: new `src/tools/`, `src/security/`, `src/agent/` and `src/prompts/` modules; `src/index.ts` re-exports them. No new third-party runtime dependencies (tools use `node:fs`, `node:child_process`; glob is implemented in-package).
- `packages/core/test/`: new integration test with a scripted fake provider and temp-directory fixtures; unit tests for the jail, secrets and tool executors.
- No server, web or persistence changes yet; feature 6 becomes the first host that drives the loop over HTTP and renders approvals.
