# Spec Delta

## Purpose

Defines OpenArtifact's keyboard-first operation: global shortcuts for the chat and approval workflow and a command palette that reaches every command and navigation target without a mouse.

## ADDED Requirements

### Requirement: Command palette

The system SHALL provide a command palette opened with `Ctrl/Cmd+K` (and closed with Escape or an explicit close action) that lists every command and navigation target — send/stop, approve, reject, toggle artifact panel, toggle terminal log, open settings, toggle theme, focus chat input, new conversation, undo last turn, and jump to an artifact or version — with fuzzy text filtering, arrow-key navigation, Enter to run, and a visible focus ring on the active item.

#### Scenario: Palette opens and closes from anywhere
- **WHEN** the user presses `Ctrl/Cmd+K` while the workspace is focused
- **THEN** the palette overlay opens with the command list, and Escape or the close action dismisses it

#### Scenario: Palette filters and runs a command
- **WHEN** the user types into the palette and presses Enter on a highlighted item
- **THEN** the command or navigation target runs and the palette closes

#### Scenario: Palette is keyboard navigable
- **WHEN** the user presses the Up/Down arrow keys in the palette
- **THEN** the highlighted item moves and shows a visible focus ring without a mouse

### Requirement: Global chat and approval shortcuts

The system SHALL provide global keyboard shortcuts for the core workflow that work without the mouse and regardless of where focus currently is inside the app (except when a text field is actively capturing the key): send the composed message, stop a running turn, approve the pending approval, reject the pending approval, toggle the artifact panel, toggle the terminal log, open settings, and focus the chat input.

#### Scenario: Shortcuts drive the workflow
- **WHEN** a turn is running and the user presses the stop shortcut
- **THEN** the turn is cancelled exactly as if the Stop button were activated

#### Scenario: Approve and reject without a mouse
- **WHEN** an approval is pending and the user presses the approve or reject shortcut
- **THEN** the approval resolves (approve or reject-with-no-note) exactly as its card buttons do

#### Scenario: Panel and log toggles
- **WHEN** the user presses the toggle-artifact-panel or toggle-terminal-log shortcut
- **THEN** the corresponding pane or log opens or closes, with visible feedback

#### Scenario: Focus chat input
- **WHEN** the user presses the focus-chat-input shortcut
- **THEN** the composer input receives keyboard focus with a visible focus ring

### Requirement: Keyboard hints

The system SHALL surface each shortcut on the control it triggers (as a `Kbd` hint) and in the command palette, so a user can discover shortcuts from the interface rather than from documentation.

#### Scenario: Hints are visible
- **WHEN** a control has an associated shortcut
- **THEN** the control shows its key binding as a keyboard hint

### Requirement: Shortcuts respect reduced motion and modal state

The system SHALL respect `prefers-reduced-motion` when opening and closing the palette and SHALL NOT trigger shortcuts while a modal drawer or the palette itself is open except for the shortcuts those surfaces define (Escape closes the top-most overlay).

#### Scenario: Reduced motion
- **WHEN** the user has `prefers-reduced-motion` enabled and opens or closes the palette
- **THEN** the palette appears and disappears without motion animation

#### Scenario: Modal capture
- **WHEN** a modal (settings drawer or palette) is open
- **THEN** global workflow shortcuts are suppressed and Escape dismisses the top-most overlay
