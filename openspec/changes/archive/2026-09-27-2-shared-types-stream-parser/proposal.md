# Proposal

## Why

OpenArtifact must talk to many LLM providers and render streamed Artifacts and Mermaid diagrams, but every layer downstream of the providers (the agent loop, persistence, and the web UI) needs a single, provider-neutral way to describe messages and a reliable way to turn raw model output into structured stream events. Without those two pieces every later feature would invent its own shapes and re-parse the same XML, so they land first, right after the scaffold.

## What Changes

- Add the canonical message model to `packages/shared`: `Role`, `ContentPart` (text, tool call, tool result), `Message`, and `StreamEvent` (text delta, tool-call lifecycle, usage, done, error), each with a zod schema for runtime validation and sharing between server and web.
- Add an incremental, character-level stream parser to `packages/core/src/parser` that converts raw text deltas into structured events: `text`, `artifact_open`/`artifact_delta`/`artifact_close`, `mermaid_open`/`mermaid_delta`/`mermaid_close`, and fallback `tool_call`.
- Enforce the artifact grammar (`<artifact identifier type title language>…</artifact>`), keep tags inside fenced/inline code literal, treat artifact content as raw text, flag unknown types and missing identifiers, and emit `artifact_close {incomplete: true}` for unclosed artifacts.
- Add fixture-driven unit tests plus a mandatory chunk-boundary fuzz test proving that any splitting of the input yields the exact same event sequence.

## Capabilities

### New Capabilities

- `shared-types`: the provider-neutral message and stream-event model plus zod schemas shared by the server and web client.
- `stream-parser`: the incremental parser that turns raw streamed text into text, artifact, Mermaid, and fallback tool-call events.

### Modified Capabilities

_None._

## Impact

- `packages/shared`: new `src/messages.ts` and `src/events.ts` (or a single model module) exporting the types and zod schemas; `src/index.ts` re-exports them. Adds `zod` as a dependency.
- `packages/core`: new `src/parser/` module with the state machine; `src/index.ts` re-exports the parser. Adds `zod` (for the fallback tool-call args, validated lazily) and the shared package as a dependency.
- No server, web, or e2e behavior changes yet; later features consume these exports.
