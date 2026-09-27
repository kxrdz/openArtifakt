# Spec Delta

## MODIFIED Requirements

### Requirement: UI primitives

The system SHALL provide shared UI primitives in `apps/web/src/components/ui/` (button, icon button, badge, status indicator, keyboard hint, spinner, focus ring, and a dialog/overlay with focus trap) built on the tokens, keyboard-operable, and with a visible focus ring.

#### Scenario: Keyboard focus visible
- **WHEN** a user moves focus with the keyboard to any interactive primitive
- **THEN** a visible focus ring is shown

#### Scenario: Disabled and loading states
- **WHEN** a primitive is disabled or busy
- **THEN** it renders a distinct disabled or loading appearance and is not activatable

#### Scenario: Dialog focus trap and dismiss
- **WHEN** a dialog or overlay (command palette, settings drawer, full-screen artifact sheet) is open
- **THEN** keyboard focus is trapped within it and Escape dismisses the top-most overlay

### Requirement: Design system documentation

The system SHALL document the visual system — surfaces, tokens, typography, motion, and accessibility rules — in `DESIGN.md`, covering every shipped surface (workspace shell, chat, tool and approval cards, terminal log, artifact panel with versions and diff, settings drawer, command palette, empty and error states) and the hardened edge-case and keyboard-shortcut rules.

#### Scenario: Documented system
- **WHEN** a developer opens `DESIGN.md`
- **THEN** it describes the surfaces, the token contract, the font roles, and the accessibility, motion, keyboard and edge-case rules

## ADDED Requirements

### Requirement: Edge-case resilience

The system SHALL render real-world edge-case content without breaking layout or hiding status: long file paths truncate with an ellipsis and stay identifiable, huge tool outputs are clamped with a clear truncation marker and remain navigable, error text wraps and stays readable, and overflow is contained within each surface rather than pushing the page wide or clipping state.

#### Scenario: Long paths and text overflow
- **WHEN** a file path, command, or message exceeds its container width
- **THEN** it truncates with an ellipsis or wraps within the container and never forces the page to scroll horizontally

#### Scenario: Huge outputs stay usable
- **WHEN** a tool result or terminal output is very large
- **THEN** the surface clamps it with a visible truncation marker and the user can still expand or scroll it

#### Scenario: Errors remain readable
- **WHEN** an error or rejection note is shown
- **THEN** the text wraps within its card and the offending detail is visible without overflow
