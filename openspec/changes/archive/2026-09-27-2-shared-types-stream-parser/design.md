# Design

## Context

The scaffold is done and `pnpm check` is green. `packages/shared` and `packages/core` are placeholders (`SHARED_VERSION`, `CORE_VERSION` exports with trivial tests). No provider, agent, or UI code exists yet. This change adds the first real modules: the canonical message model (§3) and the incremental stream parser (§5). Both must stay free of React, Hono, and DOM dependencies so a future CLI can reuse them. Motivation and requirements: see proposal.md and specs/.

## Goals / Non-Goals

**Goals:**

- A single, zod-validated message/event vocabulary in `packages/shared` used by everything later.
- A dependency-free, deterministic, character-level parser in `packages/core/src/parser` with a tiny push API.
- Chunk-boundary invariance verified by a fuzz test over fixtures.

**Non-Goals:**

- No provider adapters yet — the parser emits its own event vocabulary, which adapters (feature 3) will map to `StreamEvent`.
- No versioning/dedup of artifact identifiers — that is a conversation-layer concern. The parser only reports the identifier; downstream code turns a repeated identifier into a new version.
- No markdown rendering, sandboxing, or UI — later features.

## Decisions

- **Push API (`push(chunk): ParserEvent[]`, `end(): ParserEvent[]`)** rather than an async generator. Synchronous, allocation-light, trivially testable, and adapters can `for await` over it by wrapping. _Alternative: AsyncIterable generator (complicates the state machine and fuzz testing)._
- **Character-level state machine with explicit states** (`TEXT`, `TAG_OPEN`, `IN_OPEN_TAG`, `ARTIFACT_BODY`, `TOOL_CALL_BODY`, `FENCE`, `FENCE_BODY`), not regexes over an accumulated buffer (§5 forbids regex-over-buffer). Tags are recognized by scanning for `<` and buffering only from `<` until the tag closes (`>`), so `<arti` + `fact ...>` reassembles correctly. _Alternative: token-level parser (overkill; the grammar is flat)._
- **Minimal suffix hold-back.** The buffer holds at most the current incomplete tag (from the last `<` that could start an `artifact`/`tool_call`/`/artifact`/`/tool_call`/`mermaid` fence marker) plus a short fence lookahead; all confirmed text is emitted immediately, so text and artifact content stream without delay.
- **Fence handling.** The parser tracks fenced code blocks (backtick runs of 3+). Any `<artifact>`/`</artifact>`/`<tool_call>` inside a fence is literal text. A fence whose language is `mermaid` emits `mermaid_open`/`mermaid_delta`/`mermaid_close`; other fences stream as plain text. Inline code (single/double backticks) is not tracked structurally — only fence-level literalism is required by §5, and an inline `` `<artifact>` `` appears only inside a line where the tag is not a block tag; the parser emits it as text because it is not a complete, well-formed block tag on its own. _Alternative: full CommonMark tokenizer (far beyond scope; §5 only requires fence literalism)._
- **Artifact content is raw.** While inside an artifact, content is forwarded verbatim as `artifact_delta`; no nested tag or markdown interpretation.
- **Unknown types preserved.** `artifact_open` carries the declared `type` unchanged; the UI decides to render unknown types as code. The parser does not enumerate known types.
- **Missing identifier → slugify the title.** Kebab-case, lowercase, `[^a-z0-9]+` → `-`; falls back to `artifact` when the title is empty. _Alternative: random id (non-deterministic; breaks fuzz invariance)._
- **Unclosed artifacts.** `end()` flushes a trailing `artifact_close {incomplete: true}` (and `mermaid_close` for an open fence) so the UI can badge it.
- **Fallback `tool_call` args parsed with `JSON.parse` + zod.** The `<tool_call name="...">…</tool_call>` body is expected to be a JSON object. If it is not a valid object, the whole block is emitted as literal text (never a crash, never a half-event). _Alternative: emit an error event (worse: a model's prose mention of the protocol would poison the stream)._
- **`zod` added to both packages.** `shared` exposes the schemas; `core` uses it only to validate fallback args (and later tool schemas). Pinned exact (`-E`) per scaffold convention.
- **Fuzz invariance is compared on a normalized sequence.** §5 also mandates minimal-buffering streaming, which makes the physical boundaries of `text`/`artifact_delta`/`mermaid_delta` events depend on chunking. The fuzz test therefore merges adjacent text-bearing events of the same type/identifier before comparing, then asserts the merged sequences are identical for whole-input, every-single-split, and random multi-split feedings. Open/close events are never split and compare directly. _Alternative: literal object equality (impossible under the streaming requirement)._
- **Fixtures as inline string constants in `packages/core/test/fixtures/`** (plain `.txt` bodies plus a `.json` list where useful). They are static so no network is involved.

## Risks / Trade-offs

- [The tag/hold-back scanner could mis-handle a literal `<` in prose (e.g. `a < b`)] → the scanner only enters tag mode when the characters after `<` plausibly start an artifact/tool-call tag name; otherwise `<` is emitted as text. Covered by a fuzz fixture.
- [Fence detection must not trigger on backtick runs inside artifact bodies] → artifact bodies bypass fence/tag scanning entirely (raw mode), so a code fence inside an artifact is just artifact content.
- [Mermaid language casing (`Mermaid`, `MERMAID`)] → language is lowercased before comparison.
- [A very long unclosed tag buffered at end of stream] → `end()` flushes the buffered suffix as text so no content is lost.
