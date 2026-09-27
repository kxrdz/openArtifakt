# Spec Delta

## MODIFIED Requirements

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
