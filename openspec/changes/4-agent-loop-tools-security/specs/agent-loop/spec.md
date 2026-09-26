# Spec Delta

## Purpose

Defines the local agent loop that orchestrates tools against a provider: its state machine, limits, cancellation, context management, approval flow, undo support, and runtime system prompt.

## ADDED Requirements

### Requirement: Agent state machine

The system SHALL model the agent loop as an explicit state machine `idle → streaming → awaiting_approval → executing_tool → streaming → … → done | error | cancelled` and expose the current state at all times.

#### Scenario: State progression
- **WHEN** a user turn runs read → edit → execute → final answer
- **THEN** the loop transitions through streaming, executing_tool and done in order

#### Scenario: Error state
- **WHEN** the provider request fails irrecoverably
- **THEN** the loop ends in the error state

### Requirement: Iteration and timeout limits

The system SHALL enforce a maximum of 50 model iterations per user turn, a default 120-second timeout for `execute_command`, and a stop when the same tool call with identical arguments fails 3 times.

#### Scenario: Iteration cap
- **WHEN** a turn exceeds 50 model iterations
- **THEN** the loop stops with an error describing the limit

#### Scenario: Identical-failure stop
- **WHEN** the same tool call with identical arguments fails 3 times
- **THEN** the loop stops and surfaces the failure to the user

### Requirement: Cancellation

The system SHALL abort via `AbortSignal`, propagated to the provider request and to running child processes, while keeping history valid so every `tool_call` has a matching `tool_result`.

#### Scenario: Cancel mid-command
- **WHEN** the user cancels while a command is running
- **THEN** the process tree is killed and the command's `tool_call` receives a `tool_result` of `"cancelled by user"`

#### Scenario: History stays valid after cancel
- **WHEN** a turn is cancelled after a tool call was issued
- **THEN** every `tool_call` in history has a corresponding `tool_result`

### Requirement: Context management

The system SHALL track token usage and, above 75 % of the context window, first replace old tool results with stubs and then summarize older turns, never dropping the system prompt or the latest user message.

#### Scenario: Tool-result stubbing
- **WHEN** estimated usage exceeds 75 % of the context window
- **THEN** old tool results are replaced with short stubs such as `[output of "pnpm test" removed — 412 lines, exit code 1]`

#### Scenario: Turn summarization
- **WHEN** stubbing is not enough and usage remains above the threshold
- **THEN** older turns are summarized with the model before the next request

### Requirement: Approval flow

The system SHALL support three approval modes — ask (default), auto-edit, and full auto — and expose an approval request with a diff for edits and the full command plus working directory for commands.

#### Scenario: Ask mode
- **WHEN** approval mode is ask
- **THEN** reads run automatically and edits, writes and commands request approval

#### Scenario: Auto-edit mode
- **WHEN** approval mode is auto-edit
- **THEN** edits and writes run automatically and commands request approval

#### Scenario: Full auto mode
- **WHEN** approval mode is full auto
- **THEN** everything runs automatically, with a persistent warning banner in the UI

#### Scenario: Approve
- **WHEN** the user approves an approval request
- **THEN** the tool runs and its result is returned to the model

#### Scenario: Reject with a note
- **WHEN** the user rejects an approval request with a note
- **THEN** the note is returned to the model as the tool result and the tool does not run

#### Scenario: Edit the command
- **WHEN** the user edits a command before approving
- **THEN** the edited command is the one that runs

### Requirement: Undo

The system SHALL snapshot every file before the agent changes it, stored under `~/.openartifact/snapshots/<conversation>/<turn>/`, so a turn can be undone.

#### Scenario: Snapshot before mutation
- **WHEN** a tool is about to change a file
- **THEN** a snapshot of the prior content is written before the mutation

### Requirement: Runtime system prompt

The system SHALL send a versioned runtime system prompt covering working style, artifact syntax, React constraints, artifact design quality, diagrams, untrusted content, and — only when native tools are off — the fallback tool protocol, with workspace root, OS, shell, current date and approval mode injected at runtime.

#### Scenario: Prompt versioning
- **WHEN** the prompt module is loaded
- **THEN** it carries a version and a snapshot test asserts its content

#### Scenario: Fallback protocol only when needed
- **WHEN** the provider lacks native tool support
- **THEN** the prompt includes the fallback tool protocol; otherwise it is omitted
