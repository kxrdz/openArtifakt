# Spec Delta

## Purpose

Defines the incremental parser that turns raw streamed model text into structured text, artifact, Mermaid, and fallback tool-call events.

## ADDED Requirements

### Requirement: Incremental text streaming

The parser SHALL emit a `text` event for ordinary prose and SHALL hold back only the minimal ambiguous suffix at the end of the current buffer, so text streams without waiting for the full response.

#### Scenario: Prose passes through

- **WHEN** the parser receives a delta of plain text with no tags
- **THEN** it emits a `text` event containing that text

### Requirement: Artifact grammar

The parser SHALL recognize the `<artifact identifier="kebab-case-id" type="..." title="..." language="...">…</artifact>` grammar and SHALL emit `artifact_open`, `artifact_delta`, and `artifact_close` events, treating the content between the tags as raw text with no markdown interpretation and no nested tag handling.

#### Scenario: Complete artifact

- **WHEN** a complete artifact block streams through
- **THEN** the parser emits an `artifact_open` with its identifier, type, title, and optional language, one or more `artifact_delta` events carrying the raw content, and a matching `artifact_close`

#### Scenario: Unknown type

- **WHEN** an artifact declares a `type` that is not a known artifact type
- **THEN** the parser preserves the declared type on `artifact_open` so the UI can render it as a code artifact

#### Scenario: Missing identifier

- **WHEN** an artifact opens without an `identifier` attribute
- **THEN** the parser generates a kebab-case identifier from the title and uses it for the open and close events

### Requirement: Split tags

The parser SHALL correctly handle tags and attribute tokens split across chunk boundaries (for example `<arti` followed by `fact type="...">`), buffering the minimal ambiguous suffix and emitting everything else immediately.

#### Scenario: Tag split across chunks

- **WHEN** an opening tag is split across two or more deltas
- **THEN** the parser still emits exactly one `artifact_open` with the correct attributes

### Requirement: Code blocks stay literal

The parser SHALL treat `<artifact>` and `</artifact>` tags that appear inside fenced code blocks or inline code as literal text, because a model may be explaining the format, and SHALL only treat a fenced block with the `mermaid` language as a diagram.

#### Scenario: Artifact tag inside a code fence

- **WHEN** an `<artifact>` tag appears inside a fenced code block
- **THEN** the parser emits the tag as part of a `text` event and does not open an artifact

#### Scenario: Mermaid fence

- **WHEN** a fenced block is opened with the `mermaid` language
- **THEN** the parser emits `mermaid_open`, then `mermaid_delta` events, and `mermaid_close` when the fence ends

### Requirement: Incomplete artifacts

The parser SHALL emit `artifact_close` with `incomplete: true` when the stream ends while an artifact is still open, so the UI can show a warning badge.

#### Scenario: Unclosed artifact

- **WHEN** the stream ends inside an artifact
- **THEN** the parser emits `artifact_close` with `incomplete: true`

### Requirement: Fallback tool calls

The parser SHALL recognize the fallback tool-call protocol (`<tool_call name="...">…</tool_call>` containing a JSON argument object) and emit a `tool_call` event with the tool name and parsed arguments, without any other path needing to know the fallback was used.

#### Scenario: Fallback tool call

- **WHEN** the streamed text contains a complete fallback `tool_call` block
- **THEN** the parser emits a single `tool_call` event with the name and parsed JSON args

### Requirement: Chunk-boundary invariance

The parser SHALL produce the same final event sequence regardless of how the input is split into deltas: splitting a given input at every possible chunk boundary, and at random multi-split points, SHALL yield exactly the same events as feeding the whole input at once.

#### Scenario: Fuzz across chunk boundaries

- **WHEN** a fixture input is fed whole and also split at every boundary and at random boundaries
- **THEN** the resulting event sequences are identical
