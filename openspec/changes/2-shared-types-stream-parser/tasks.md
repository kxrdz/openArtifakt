# Tasks

## 1. Shared canonical model

- [x] 1.1 Add the canonical message model to `packages/shared` (`Role`, `ContentPart`, `Message` types plus zod schemas and a `parseMessage`/`parseContentPart` guard), re-export from `src/index.ts`, and add unit tests covering text, tool call, and tool result parts. Verify: `pnpm --filter @openartifact/shared test` passes and root `pnpm check` stays green.
- [x] 1.2 Add the canonical `StreamEvent` union (`text_delta`, `tool_call_start/delta/end`, `usage`, `done`, `error`) with zod schemas, re-export from `src/index.ts`, and add unit tests covering every variant including terminal `done`/`error`. Verify: `pnpm --filter @openartifact/shared test` passes and root `pnpm check` stays green.

## 2. Incremental stream parser

- [x] 2.1 Create `packages/core/src/parser` with the `ParserEvent` vocabulary and a `StreamParser` state machine that streams plain text immediately, keeps `artifact`/`tool_call` tags inside fenced code blocks literal, and emits `mermaid_open`/`mermaid_delta`/`mermaid_close` for `mermaid` fences. Add unit tests (text passthrough, fence literalism, mermaid fence). Verify: `pnpm --filter @openartifact/core test` passes and root `pnpm check` stays green.
- [ ] 2.2 Implement artifact parsing in the state machine: `artifact_open`/`artifact_delta`/`artifact_close` with split-tag reassembly, raw content, unknown-type preservation, kebab-case identifier generation from a missing title, and `artifact_close {incomplete: true}` on `end()`. Add unit tests for each edge case. Verify: `pnpm --filter @openartifact/core test` passes and root `pnpm check` stays green.
- [ ] 2.3 Implement the fallback `tool_call` protocol parsing (emit one `tool_call {name, args}` event for a complete `<tool_call name="...">…</tool_call>` block, emit as literal text on invalid JSON args, and keep it literal inside fences). Add unit tests. Verify: `pnpm --filter @openartifact/core test` passes and root `pnpm check` stays green.

## 3. Chunk-boundary fuzz test

- [ ] 3.1 Add static fixture responses to `packages/core/test/fixtures/` (prose with literal `<`, split artifact tags, artifact inside a fence, mermaid fence, fallback tool call, unclosed artifact) and a fuzz test that feeds each fixture whole, split at every boundary, and at deterministic random multi-split points, asserting the normalized event sequences are identical. Verify: `pnpm --filter @openartifact/core test` passes and root `pnpm check` stays green.
