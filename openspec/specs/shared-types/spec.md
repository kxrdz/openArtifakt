# shared-types Specification

## Purpose
Defines the provider-neutral message and stream-event model shared by the server and the web client so every layer above the provider adapters speaks one vocabulary.

## Requirements

### Requirement: Canonical message model

The shared package SHALL define a provider-neutral message model consisting of a `Role` (`"system" | "user" | "assistant" | "tool"`), a `ContentPart` union (text, tool call, tool result), and a `Message` with an id, role, ordered parts, and a creation timestamp.

#### Scenario: Text part

- **WHEN** a message contains a `{ type: "text", text: "..." }` part
- **THEN** the part is valid and its text is preserved verbatim

#### Scenario: Tool call part

- **WHEN** a message contains a `{ type: "tool_call", id, name, args }` part
- **THEN** the part carries a unique call id, a tool name, and arbitrary args

#### Scenario: Tool result part

- **WHEN** a message contains a `{ type: "tool_result", callId, content }` part
- **THEN** the part references the originating call id and may carry an `isError` flag

### Requirement: Canonical stream events

The shared package SHALL define a `StreamEvent` union covering text deltas, tool-call lifecycle events (`tool_call_start`, `tool_call_delta`, `tool_call_end`), a `usage` event, a terminal `done` event with a `stopReason`, and an `error` event with a `retryable` flag.

#### Scenario: Terminal event

- **WHEN** a stream finishes normally
- **THEN** exactly one terminal event (`done` or `error`) is emitted, with a `stopReason` of `end_turn`, `tool_use`, `max_tokens`, or `cancelled`

### Requirement: Runtime validation schemas

The shared package SHALL provide zod schemas for the message model and stream events so both the server and the web client can validate inbound and outbound data at runtime.

#### Scenario: Round-trip validation

- **WHEN** a valid message or stream event is parsed with its schema
- **THEN** parsing succeeds and the parsed value matches the original
