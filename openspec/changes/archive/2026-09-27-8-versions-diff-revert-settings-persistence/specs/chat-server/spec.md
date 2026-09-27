# Spec Delta

## ADDED Requirements

### Requirement: Per-turn file snapshots

The system SHALL snapshot every file before a tool mutates it, storing each snapshot under the conversation and turn it belongs to, and SHALL record files the turn created so undo can remove them.

#### Scenario: Snapshot before a mutation
- **WHEN** a tool is about to edit or write a file
- **THEN** the file's prior content is saved under the conversation and turn ids before the write happens

### Requirement: Undo this turn

The system SHALL expose an undo action that restores the files changed by a turn to their pre-turn state — restoring overwritten files in reverse order and deleting files the turn created — and SHALL make it available to the client per completed turn.

#### Scenario: Undo restores an edited file
- **WHEN** the user undoes a turn that edited a file
- **THEN** the file is restored to its content before the turn

#### Scenario: Undo removes a created file
- **WHEN** the user undoes a turn that created a new file
- **THEN** the created file is removed
