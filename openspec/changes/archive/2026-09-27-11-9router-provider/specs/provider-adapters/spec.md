# Spec Delta

## MODIFIED Requirements

### Requirement: Unified adapter contract

Every provider adapter SHALL expose a stable `id` and a `stream(request, signal)` operation that yields the canonical `StreamEvent` union defined by the shared model, and SHALL terminate every stream with exactly one terminal event (`done` or `error`).

#### Scenario: Adapter identity

- **WHEN** a consumer asks an adapter for its identifier
- **THEN** it returns one of `openai-compatible`, `anthropic`, `gemini`, `ollama`, or `9router`

#### Scenario: Terminal event

- **WHEN** a stream finishes normally or fails
- **THEN** exactly one terminal event (`done` or `error`) is emitted as the final event

### Requirement: Capability-driven behavior

Adapters SHALL branch on declared capability flags (`nativeTools`, `streamingToolArgs`, `vision`) rather than on scattered provider-name checks, so a new provider is supported by configuring its capabilities.

#### Scenario: No name-based branching

- **WHEN** an adapter must choose between native and fallback tool handling
- **THEN** the decision is driven solely by the configured capabilities, never by comparing the provider id

#### Scenario: Gateway preset reuses an adapter

- **WHEN** a provider id such as `9router` is configured whose wire protocol is OpenAI-compatible
- **THEN** it resolves to the OpenAI-compatible adapter with its own defaults (base URL, key reference, model) and requires no new adapter code
