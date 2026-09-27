# Spec Delta

## ADDED Requirements

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
