# Spec Delta

## Purpose

Renders Mermaid diagrams inline in the chat message stream, from fenced ```mermaid blocks the model emits, so small diagrams appear next to the prose that explains them.

## ADDED Requirements

### Requirement: Inline Mermaid rendering

The system SHALL render ```mermaid fenced blocks in assistant messages as inline diagrams, rendering only complete blocks debounced by 300 ms (never on every token).

#### Scenario: Complete fence renders inline
- **WHEN** an assistant message contains a complete ```mermaid fence
- **THEN** the block renders as a diagram in place of the literal fence, after the debounce

#### Scenario: Incomplete fence stays literal
- **WHEN** a ```mermaid fence is still streaming and not yet closed
- **THEN** it is not rendered as a diagram until the fence is complete

### Requirement: Inline diagram errors do not crash the message list

The system SHALL show a Mermaid syntax error inline as the source with the error message and the offending line highlighted, and the message list SHALL keep rendering.

#### Scenario: Invalid diagram shows inline error
- **WHEN** a complete ```mermaid block fails to parse
- **THEN** the message shows the diagram source with the error and offending line, and the rest of the conversation still renders

### Requirement: Inline diagrams follow the active theme

The system SHALL derive the inline diagram's colors from the active theme's design tokens, so diagrams match light and dark mode.

#### Scenario: Theme switch recolors diagrams
- **WHEN** the active theme changes
- **THEN** inline diagrams re-render with colors matching the new theme

### Requirement: Open inline diagram in the panel

The system SHALL provide an "Open in panel" action on an inline diagram that lifts it into a Mermaid artifact in the artifact panel.

#### Scenario: Lift a diagram into the panel
- **WHEN** the user activates "Open in panel" on an inline diagram
- **THEN** a Mermaid artifact with that source appears in the panel
