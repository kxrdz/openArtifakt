# Design

## Context

Features 1–3 delivered the monorepo, the canonical `Message`/`StreamEvent` vocabulary (`packages/shared`), the incremental `StreamParser`, and the four `ProviderAdapter`s behind `createProviderAdapter` (`packages/core/src/providers`). `packages/core` is still React/Hono/DOM-free and has only `zod` + `@openartifact/shared` as runtime deps. Nothing consumes the adapters yet. This change builds the first consumer: the agent loop, the seven tools it calls, and the security rules every tool must pass through. Motivation and requirements: proposal.md and specs/tools, specs/security, specs/agent-loop.

Constraints that shape the approach:

- `packages/core` stays free of React/Hono/DOM; Node built-ins (`node:fs`, `node:child_process`, `node:path`) are allowed and needed.
- `pnpm check` must stay green after every task.
- The acceptance test in SPEC §12.4 must be an integration test with a **scripted fake provider** (no network).
- Strict TS with `noUncheckedIndexedAccess`, `verbatimModuleSyntax` (type-only imports).

## Goals / Non-Goals

**Goals:**

- Seven tools with one zod schema each, an approval category, and a pure, unit-testable executor.
- A security layer (`path jail`, `.git` write guard, secret-file rules, `sudo` rule) used by *every* tool, not bolted on per-tool.
- An agent loop that is an explicit state machine and an async generator of events a host (server, CLI, test) can consume.
- A versioned runtime system prompt with a snapshot test.
- An integration test proving read → edit → execute-tests → final answer in a temp dir, escape rejection, and cancel-keeps-history.

**Non-Goals:**

- The HTTP server, approvals UI, terminal log, and persistence (features 6/8). The loop exposes an `ApprovalHandler` seam the server will later drive over HTTP; for now a test/scripted handler plugs in.
- Artifact rendering and Mermaid (feature 7). The loop treats model text as opaque text and does not parse artifacts itself.
- Real ripgrep as a hard dependency: `search_code` uses `rg` when present and a JS walk-and-regex fallback otherwise.

## Decisions

- **Tool contract.** A tool is `{ name, description, parameters: ZodType, approval: "read" | "write" | "command", execute(args, ctx) }`. `ToolDefinition` (feature 3) is derived from `name`/`description`/`parameters`; the executor receives a `ToolContext { workspaceRoot, signal, snapshot, onStdout }`. The result is `{ content: string, isError?: boolean }`, truncated centrally to the cap (head+tail with a `[... N lines truncated ...]` marker). _Alternative: class hierarchy per tool — unnecessary ceremony._
- **One approval category enum drives mode decisions.** Reads are auto; writes are auto only in `auto-edit`/`full-auto`; commands are auto only in `full-auto`. The security layer can force approval regardless of mode (`secret-read`, `sudo`). A single `resolveApproval(tool, args, mode, security)` returns `{ needsApproval, reason }`, so the loop has one place to look. _Alternative: per-tool booleans scattered across executors (drift risk)._
- **Path jail as the single gate.** `security/path-jail.ts` exposes `resolveWithinWorkspace(root, userPath)` → real canonical path or a `PathJailError`. It uses `fs.realpath` on the resolved candidate and checks prefix containment after both are realpathed, so `..` traversal *and* symlink escapes are both rejected. A companion `assertWritablePath` additionally denies anything under `<root>/.git/`. Every tool that touches the filesystem resolves through these helpers first. _Alternative: `path.relative` string checks only — misses symlinks, which §12.4 explicitly tests._
- **Secret files are a policy, not a tool.** `security/secrets.ts` provides `isSecretPath(p)` matching `.env*`, `*.pem`, `*.key`, `id_rsa*` (basename match). `read_file` consults it and marks the read as requiring approval even in Full auto; the loop returns `"cancelled by user"` or the approval note when rejected, so history stays valid. _Alternative: a dedicated `read_secret` tool — worse UX; a single `read_file` with a forced-approval flag matches §9._
- **Agent loop is an async generator with an injected `ApprovalHandler`.** `AgentLoop.run(userText): AsyncIterable<AgentEvent>` yields a discriminated union (`state`, `text`, `tool_start`, `tool_result`, `approval_request`, `approval_decision`, `done`, `error`). The loop owns the message history and the `AbortController`; the host drives approval by resolving the handler's promise (in tests a scripted handler, later the server's HTTP endpoint). _Alternative: callback-heavy EventEmitter — harder to test deterministically._
- **History shape.** The loop keeps `messages: Message[]` (canonical format). Each model turn: build `ChatRequest { model, messages: [system, ...history], tools }`, stream events, accumulate `text` into an assistant `text` part and `tool_call_*` into `tool_call` parts. When a tool call ends, the loop runs (or awaits approval for) the tool, appends a `tool` message whose `tool_result` part carries `{ callId, content, isError }`, then continues. Every `tool_call` therefore gets a `tool_result` before the next request — including `"cancelled by user"` on cancel/reject/timeout. _Alternative: append results to the assistant message — breaks the canonical `tool` role §3 defines._
- **Cancellation.** One `AbortSignal` threads through provider requests and the child-process kill. `execute_command` spawns with `detached: true` and kills the whole process group (`process.kill(-pid, "SIGKILL")`) on timeout/abort, so descendants die too. The loop catches `AbortError`/`signal.aborted`, marks pending tool results cancelled, emits `cancelled`, and stops cleanly. _Alternative: `tree-kill` dependency — not needed; process-group kill is sufficient on POSIX (the spec targets Node 20+ on the user's machine)._
- **Context manager.** `agent/context.ts` estimates tokens (`ceil(len/4)` for text, provider `usage` when present) and, above 75 % of `contextWindow`, compacts: it first stubs tool results older than the latest turn (head+tail stub `[output of "cmd" removed — N lines, exit code C]`), never touching the system prompt or the latest user message; if still over the threshold it asks the provider for a summary of the earlier turns (a small helper that calls `provider.stream` once) and replaces them with a synthetic user message carrying the summary. Unit tests cover threshold math and stubbing; summarization is exercised with the fake provider. _Alternative: truncation only — drops signal the spec explicitly forbids._
- **`execute_command` streams output.** The tool accepts an `onOutput(chunk)` callback (test/loop observe streaming) and returns the combined, truncated output plus exit code. Timeout default 120 s is a loop option the tool receives via `ctx.timeoutMs`. _Alternative: buffer-only — loses the "stream to the UI" requirement in §8._
- **Snapshots.** `tools/snapshot.ts` writes the pre-mutation content to `<snapshotRoot>/<conversation>/<turn>/<counter>_<basename>.before` before `edit_file`/`write_file` mutate. The loop binds `snapshotRoot`/`conversationId`/`turnId` into the `ToolContext`; tests point it at a temp dir. Undo UI is feature 8; this feature only guarantees the snapshot exists. _Alternative: in-memory snapshots — lost on restart, contrary to §8's path._
- **`glob` is implemented in-package** (`*`, `**`, `?`) rather than pulling `fast-glob`/`tinyglobby`, keeping deps minimal and behavior deterministic; it reuses the path jail for the walk root. `search_code` tries `rg --json` when a `findRipgrep` option resolves, else a JS regex walk with a result cap.
- **System prompt is versioned and pure.** `prompts/system.ts` exports `SYSTEM_PROMPT_VERSION` and `buildSystemPrompt(opts)` (workspace root, OS, shell, date, approval mode, `nativeTools`), returning a string; a snapshot test pins the template so edits are deliberate. The fallback tool protocol section is included only when `nativeTools` is false.
- **Fake provider for tests.** `test/fake-provider.ts` (test-only, not exported from the package index) implements `ProviderAdapter.stream` by inspecting `req.messages` and yielding a scripted `StreamEvent[]`, plus a `ScriptedTurn[]` DSL so the integration test can script read → edit → execute → answer deterministically.

## Risks / Trade-offs

- [Symlink/jail edge cases on real filesystems] → tests create real temp dirs and real symlinks (`fs.symlink`) to prove escape rejection; `resolveWithinWorkspace` realpaths *both* sides before comparing.
- [Process-group kill is POSIX-only] → acceptable: the spec's target is a Node 20+ local server on the user's machine; Windows-specific kill is out of scope for v0.1.
- [Token estimation is approximate] → the estimate is a conservative upper bound (char/4 + per-message overhead) and only triggers *compaction*, never drops data silently; provider `usage` refines it when present.
- [Summarization adds a model round-trip] → it runs only after stubbing fails to get under the threshold, and is skipped when the provider errors; history degrades to stubbed form rather than failing.
- [Scripted integration test can drift from real providers] → the loop consumes only the canonical `StreamEvent` union (already fuzz-tested in feature 2 and adapter-tested in feature 3), so the scripted provider exercises the same contract a real one does.

## Migration Plan

- No data or config migration. New modules in `packages/core`; `src/index.ts` re-exports `agent`, `tools`, `security`, `prompts`. Rollback is a revert of the feature branch.

## Open Questions

_None._
