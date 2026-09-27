# persistence Specification

## Purpose
Persists conversations, messages, artifacts and their versions, the tool-call log, and non-secret settings in a local SQLite database, and restores them on reload so a developer's history survives restarts.

## Requirements

### Requirement: Conversations and messages are persisted

The system SHALL store every conversation and its messages in the canonical message format, writing each message (and its tool-call parts) as the conversation streams, and SHALL restore them exactly on load.

#### Scenario: A completed turn survives a server restart
- **WHEN** a conversation has completed a turn and the server restarts
- **THEN** the conversation and all of its messages, including tool-call results, are restored with their original content and order

#### Scenario: Messages are written as they stream
- **WHEN** a turn is in flight
- **THEN** the user message and the growing assistant message are persisted incrementally, not only at the end of the turn

### Requirement: Artifacts and versions are persisted

The system SHALL persist each artifact a conversation produced together with every version of its content, and SHALL restore the full version list (never just the latest version) on load.

#### Scenario: Version history survives a reload
- **WHEN** an artifact has accumulated multiple versions and the app reloads
- **THEN** all versions of the artifact are restored in order, with their identifiers and titles intact

### Requirement: The tool-call log is persisted

The system SHALL persist the tool-call log for each conversation, including each call's tool name, arguments, result and the user's approval decision when one was required.

#### Scenario: Approval decisions are recorded
- **WHEN** a user approves or rejects a tool call
- **THEN** the decision is stored with the tool-call record and restored with the conversation

### Requirement: Non-secret settings are persisted

The system SHALL persist settings that are not secrets (provider, model, base URL, key-reference name, context window, capability flags and approval mode), and SHALL never store API key values in the database.

#### Scenario: Settings survive a restart
- **WHEN** a user changes an approval mode or provider setting
- **THEN** the setting is stored and applied again after a server restart

#### Scenario: Secrets are never persisted
- **WHEN** settings are saved
- **THEN** no API key value is written to the settings store, only the name of the reference that holds it

### Requirement: History is exposed and restored on reload

The system SHALL expose the persisted history to the web client — a list of conversations and, for a chosen conversation, its messages, artifact versions and tool-call log — so reloading the app restores conversations and artifact histories.

#### Scenario: Reload restores the conversation list
- **WHEN** the web client loads with conversations already persisted
- **THEN** the conversation list is shown and selecting one restores its messages and artifact versions
