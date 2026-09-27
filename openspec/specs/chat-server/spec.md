# chat-server Specification

## Purpose
Defines the local HTTP transport that turns the agent loop into a usable chat server: the runtime wiring, the streaming chat endpoint, approval decisions, stop, command-output streaming, session security, and the key-free fake-provider replay mode.

## Requirements

### Requirement: Chat stream endpoint

The system SHALL expose an endpoint that accepts a user message, runs the agent loop against the configured provider and tools, and streams the loop's events (state changes, text deltas, tool starts/results, approval requests and decisions, done/error) to the client over a server-sent-event-style stream.

#### Scenario: Full turn streams to the client
- **WHEN** a client posts a user message to the chat endpoint
- **THEN** the client receives the state, text, tool and done events in the order the loop produced them

#### Scenario: Streaming text arrives progressively
- **WHEN** the provider emits text deltas during a turn
- **THEN** each delta is forwarded to the client as it arrives, without waiting for the end of the turn

### Requirement: Approval decision round-trip

The system SHALL pause the loop when a tool requires approval, forward the request to the client, and resume only when the client submits a decision — approve, edit-command, or reject-with-note.

#### Scenario: Approved tool runs
- **WHEN** the client approves an approval request
- **THEN** the tool runs with its original (or edited) arguments and its result is returned to the model

#### Scenario: Rejected tool does not run
- **WHEN** the client rejects an approval request with a note
- **THEN** the tool does not run and the note is returned to the model as the tool result

### Requirement: Stop

The system SHALL provide an endpoint that cancels the in-flight turn, propagating the abort to the provider request and running child processes, and SHALL end the stream with a cancelled stop reason.

#### Scenario: Stop cancels a running turn
- **WHEN** the client requests stop while a turn is running
- **THEN** the stream ends with a cancelled stop reason and history remains valid

### Requirement: Command output streaming

The system SHALL forward a running command's stdout/stderr to the client as it arrives, identifying the stream.

#### Scenario: Command output streams
- **WHEN** the agent runs an `execute_command` tool
- **THEN** the client receives stdout/stderr chunks as they are produced, before the command's final result

### Requirement: Session security

The system SHALL bind to the loopback interface only, generate a random session token at startup, issue it to the UI as an httpOnly cookie, require it on every API request, and reject requests whose `Host` or `Origin` is not the local UI.

#### Scenario: Token required
- **WHEN** an API request arrives without the session token
- **THEN** the server rejects it with an unauthorized response

#### Scenario: Non-loopback host rejected
- **WHEN** a request's `Host` header is not a loopback host
- **THEN** the server rejects it, protecting against DNS rebinding

#### Scenario: Foreign origin rejected
- **WHEN** a request carries an `Origin` that is not the local UI
- **THEN** the server rejects it, protecting against cross-site request forgery

### Requirement: Fake provider mode

The system SHALL, when `OPENARTIFACT_FAKE_PROVIDER=1` is set, run a scripted provider that replays a fixed fixture conversation — streaming text, an edit requiring approval, a command requiring approval, a final answer, and a slow-streaming turn for Stop — against a seeded temporary workspace, so the full product works without any API key or network access.

#### Scenario: Fake conversation replays deterministically
- **WHEN** the server starts in fake-provider mode and the client sends a message
- **THEN** the scripted turns replay in order, driving the same approvals and final answer every time

#### Scenario: Fake mode needs no key
- **WHEN** fake-provider mode is enabled
- **THEN** no API key or network access is required for a conversation to run

### Requirement: Provider configuration

The system SHALL assemble a working agent loop from configuration: provider id, model, base URL, API-key reference, approval mode and workspace root, with the seven tools registered and the versioned runtime system prompt injected.

#### Scenario: Real provider wiring
- **WHEN** a provider id, model and key reference are configured
- **THEN** the chat server runs the loop through the matching provider adapter

#### Scenario: Defaults apply when unset
- **WHEN** configuration fields are omitted
- **THEN** sensible defaults (ask approval mode, workspace root, model) are used
