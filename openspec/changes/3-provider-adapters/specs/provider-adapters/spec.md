# Spec Delta

## Purpose

Defines the provider adapter layer that converts four vendor stream formats into the canonical `StreamEvent` vocabulary, so every consumer above the adapters speaks one provider-neutral language regardless of which model is used.

## ADDED Requirements

### Requirement: Unified adapter contract

Every provider adapter SHALL expose a stable `id` and a `stream(request, signal)` operation that yields the canonical `StreamEvent` union defined by the shared model, and SHALL terminate every stream with exactly one terminal event (`done` or `error`).

#### Scenario: Adapter identity

- **WHEN** a consumer asks an adapter for its identifier
- **THEN** it returns one of `openai-compatible`, `anthropic`, `gemini`, or `ollama`

#### Scenario: Terminal event

- **WHEN** a stream finishes normally or fails
- **THEN** exactly one terminal event (`done` or `error`) is emitted as the final event

### Requirement: Cross-provider event equivalence

For the same logical conversation turn, every adapter SHALL emit equivalent canonical events for the scenarios: plain text, a single tool call, parallel tool calls, and an error mid-stream, even though each vendor encodes these differently on the wire.

#### Scenario: Plain text

- **WHEN** any adapter streams a plain-text assistant response
- **THEN** it emits only `text_delta` events followed by a `done` event with an appropriate `stopReason`

#### Scenario: Single tool call

- **WHEN** any adapter streams a response that contains one tool call
- **THEN** it emits `tool_call_start`, zero or more `tool_call_delta`, and a `tool_call_end` whose `args` equals the parsed arguments

#### Scenario: Parallel tool calls

- **WHEN** any adapter streams a response that contains multiple tool calls
- **THEN** each call is emitted as its own `tool_call_start`/`tool_call_delta`/`tool_call_end` sequence keyed by the same call id, with each `args` correctly reassembled from its own fragments

#### Scenario: Error mid-stream

- **WHEN** an adapter encounters a provider error after streaming has begun
- **THEN** it emits an `error` event with a `retryable` flag and a `message` describing the failure, and does not silently retry

### Requirement: OpenAI-compatible adapter

The `openai-compatible` adapter SHALL speak the `/v1/chat/completions` streaming protocol, reassembling `tool_calls[].function.arguments` fragments by their `index`, and SHALL support parallel tool calls from a single response.

#### Scenario: Fragmented tool arguments

- **WHEN** a provider streams a tool call's `function.arguments` as several `delta` chunks on the same `index`
- **THEN** the adapter concatenates them in arrival order and emits a single `tool_call_end` with the complete parsed arguments

#### Scenario: Parallel calls by index

- **WHEN** a provider streams multiple tool calls distinguished by `index`
- **THEN** each index yields an independent `tool_call_start`/`tool_call_delta`/`tool_call_end` sequence

### Requirement: Anthropic adapter

The `anthropic` adapter SHALL speak the Messages API stream and SHALL translate `content_block_start`, `content_block_delta` (`text_delta` and `input_json_delta`), `content_block_stop`, and `message_delta` events into canonical events, sending tool results back as `tool_result` blocks inside a user message.

#### Scenario: Input JSON delta

- **WHEN** an `input_json_delta` arrives for a tool-use block
- **THEN** the adapter emits a `tool_call_delta` with that JSON fragment for the corresponding call id

#### Scenario: Stop reason mapping

- **WHEN** the stream reports an Anthropic stop reason such as `tool_use`, `end_turn`, or `max_tokens`
- **THEN** the adapter emits a `done` event with the corresponding canonical `stopReason`

### Requirement: Gemini adapter

The `gemini` adapter SHALL map Gemini `functionCall` and `functionResponse` parts into canonical tool-call and tool-result shapes, and SHALL convert tool JSON schemas into the subset of JSON Schema that Gemini accepts.

#### Scenario: Function call part

- **WHEN** a Gemini response contains a `functionCall` part
- **THEN** the adapter emits `tool_call_start` and a `tool_call_end` carrying the call's name and arguments

#### Scenario: Schema subset conversion

- **WHEN** a tool schema uses constructs Gemini does not accept
- **THEN** the adapter emits a Gemini-compatible schema (e.g. flattened to a `type: OBJECT` declaration without unsupported `additionalProperties` or `$schema` fields)

### Requirement: Ollama adapter

The `ollama` adapter SHALL speak the native `/api/chat` streaming protocol, SHALL use native tools when the model advertises tool support, and SHALL otherwise fall back to the text protocol.

#### Scenario: Native tool call

- **WHEN** an Ollama response contains a `tool_calls` field in a message
- **THEN** the adapter emits the corresponding `tool_call_start`/`tool_call_end` events with the call's name and arguments

### Requirement: Tool-call fallback

When a configured provider reports `capabilities.nativeTools` as false, the adapter SHALL route streamed text through the incremental stream parser so that `<tool_call name="...">…</tool_call>` blocks surface as canonical tool-call events, and SHALL ensure downstream consumers cannot tell which path was used.

#### Scenario: Fallback tool call

- **WHEN** a non-native-tools provider emits a well-formed `<tool_call>` block in its text
- **THEN** the adapter emits `tool_call_start`/`tool_call_delta`/`tool_call_end` events identical to a native tool call

### Requirement: Capability-driven behavior

Adapters SHALL branch on declared capability flags (`nativeTools`, `streamingToolArgs`, `vision`) rather than on scattered provider-name checks, so a new provider is supported by configuring its capabilities.

#### Scenario: No name-based branching

- **WHEN** an adapter must choose between native and fallback tool handling
- **THEN** the decision is driven solely by the configured capabilities, never by comparing the provider id

### Requirement: Retry with backoff

The adapter layer SHALL retry 429, 5xx, and network errors with exponential backoff and jitter, at most three times, honoring a `Retry-After` header when present, and SHALL NOT retry after any output has already been streamed to the consumer.

#### Scenario: Retryable failure before output

- **WHEN** a request fails with a 429 or 5xx before any event has been emitted
- **THEN** the adapter retries up to three times with increasing, jittered delay and honors `Retry-After`

#### Scenario: No retry after partial output

- **WHEN** a request fails after at least one event has been emitted
- **THEN** the adapter surfaces an `error` event immediately and does not retry

### Requirement: Offline fixture tests

Adapter unit tests SHALL run entirely against recorded fixture streams and SHALL never make network requests, proving the four adapters produce equivalent canonical events for the shared scenario matrix.

#### Scenario: Fixture-driven assertions

- **WHEN** the adapter test suite runs
- **THEN** each adapter is exercised with recorded fixtures for plain text, one tool call, parallel tool calls, and an error mid-stream, without any network access

### Requirement: Smoke harness

A `smoke` command SHALL run one real request against a named provider using keys from the environment, and SHALL skip with a clear message any provider for which no key is configured.

#### Scenario: Missing key skip

- **WHEN** `pnpm smoke --provider <id>` is run for a provider without a configured key
- **THEN** the command prints a clear skip message and exits without making a request
