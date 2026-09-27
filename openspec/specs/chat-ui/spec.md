# chat-ui Specification

## Purpose
Defines the web chat surface built on the design system: the message list with streamed text, the composer with Send/Stop, tool-call and approval cards, the streaming terminal log, and the always-visible agent state.

## Requirements

### Requirement: Message list

The system SHALL render the conversation as a scrollable list of user and assistant messages, with assistant content updated in place as deltas stream in, and SHALL pause auto-scroll while the user has scrolled up. Assistant content SHALL be parsed: inline ```mermaid fences render as diagrams and `<artifact>` blocks are lifted into the artifact panel instead of appearing as literal tags, so the message shows only prose and inline diagrams.

#### Scenario: Streamed text renders live
- **WHEN** the agent streams text deltas
- **THEN** the latest assistant message grows in place without scroll jumps, until the turn ends

#### Scenario: Auto-scroll pauses on manual scroll
- **WHEN** the user scrolls up while a turn is streaming
- **THEN** the list does not auto-scroll until the user scrolls back to the bottom

#### Scenario: Artifact content lifts into the panel
- **WHEN** an assistant message contains an `<artifact>` block
- **THEN** the message shows no literal artifact tags and the artifact appears in the panel

#### Scenario: Inline Mermaid renders in the message
- **WHEN** an assistant message contains a complete ```mermaid fence
- **THEN** the message renders the diagram inline rather than the literal fence text

### Requirement: Composer

The system SHALL provide a composer with a text input, a Send action and a Stop action; while a turn is running the Send action is replaced by Stop, and the composer is fully keyboard-operable.

#### Scenario: Send starts a turn
- **WHEN** the user submits a non-empty message
- **THEN** a user message appears and the agent turn starts

#### Scenario: Stop cancels a running turn
- **WHEN** the user activates Stop while a turn is running
- **THEN** the turn is cancelled and the composer returns to the Send state

### Requirement: Agent state at a glance

The system SHALL show the current agent state (idle, streaming, awaiting_approval, executing_tool, done, error, cancelled) at all times in the status bar, with a distinct appearance for each.

#### Scenario: State always visible
- **WHEN** the agent loop changes state
- **THEN** the status bar reflects the new state immediately

### Requirement: Tool-call cards

The system SHALL render each tool call as a card naming the tool and its arguments, with a status (running, done, error) that updates as the tool completes.

#### Scenario: Tool card shows result
- **WHEN** a tool call completes
- **THEN** its card shows a done or error status and the tool result is available

### Requirement: Approval cards

The system SHALL render approval requests as cards that show a diff for edits and writes, and the full command plus working directory for commands, with Approve, Reject-with-note and (for commands) Edit-command controls.

#### Scenario: Edit approval shows a diff
- **WHEN** an `edit_file` or `write_file` requires approval
- **THEN** the card shows the proposed change as a diff

#### Scenario: Command approval shows command and directory
- **WHEN** an `execute_command` requires approval
- **THEN** the card shows the full command and working directory, and allows editing the command before approving

#### Scenario: Reject with a note
- **WHEN** the user rejects an approval with a note
- **THEN** the note is sent back to the model and the tool does not run

### Requirement: Terminal log

The system SHALL show a collapsible terminal log that streams command output (stdout and stderr) as it arrives and shows each command's start and exit status.

#### Scenario: Output streams into the log
- **WHEN** the agent runs a command
- **THEN** its stdout/stderr appear in the terminal log as they are produced

### Requirement: Undo this turn control

The system SHALL offer an "Undo this turn" action in the chat surface for completed turns that changed files, and SHALL reflect the undo outcome to the user.

#### Scenario: Undo is offered after a turn that changed files
- **WHEN** a turn completed and changed one or more files
- **THEN** an "Undo this turn" action is available and, when used, reports whether the files were restored

### Requirement: Settings trigger opens the drawer

The system SHALL open the settings drawer from the status-bar settings control, and SHALL close it on Escape or an explicit close action.

#### Scenario: Open and close settings
- **WHEN** the user activates the settings control
- **THEN** the settings drawer opens, and Escape or the close action closes it
