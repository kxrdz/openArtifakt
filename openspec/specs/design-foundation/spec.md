# design-foundation Specification

## Purpose
Defines OpenArtifact's visual foundation: the design-token system (light and dark), self-hosted fonts, shared UI primitives, and the empty workspace shell with resizable panes and responsive behavior.

## Requirements

### Requirement: Design tokens as CSS variables

The system SHALL define all color, type, spacing, radius, elevation and motion values as CSS custom properties in `apps/web/src/styles/tokens.css`, with complete light and dark palettes, and SHALL consume them through the Tailwind config so components reference semantic names rather than raw colors or sizes.

#### Scenario: No hard-coded colors
- **WHEN** any component in `apps/web/src` sets a color, background or font size
- **THEN** it references a token (or a Tailwind class mapped to a token) and no raw color or font-size value appears outside `tokens.css`

#### Scenario: Light and dark palettes
- **WHEN** the active theme is switched between light and dark
- **THEN** every token resolves to a value from the corresponding palette and text meets WCAG 2.2 AA contrast in both themes

#### Scenario: Semantic states
- **WHEN** the UI shows success, warning, danger or running status
- **THEN** it uses the dedicated semantic tokens rather than ad-hoc colors

### Requirement: Self-hosted fonts

The system SHALL serve fonts from `apps/web/public/fonts/` via `@font-face` rules and MUST NOT load any font from a CDN or remote origin at runtime.

#### Scenario: Offline fonts
- **WHEN** the app is loaded with no network access
- **THEN** all fonts render from the local `public/fonts/` files

#### Scenario: Sans and mono roles
- **WHEN** text is UI copy
- **THEN** it uses the sans font token; when it is code, a path, or terminal output, it uses the mono font token

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

### Requirement: Workspace shell

The system SHALL render an empty workspace shell with a chat pane on the left, an artifact panel on the right separated by a resizable split, a top status bar, a collapsible terminal log, a settings trigger, and empty states for the chat and artifact panel.

#### Scenario: Resizable split
- **WHEN** the user drags the split divider
- **THEN** the chat and artifact panes resize proportionally and the divider shows an active state

#### Scenario: Narrow screens
- **WHEN** the viewport is narrower than 900 px
- **THEN** the artifact panel becomes a full-screen sheet opened from the chat rather than a side-by-side pane

#### Scenario: Empty states
- **WHEN** there is no conversation and no artifact
- **THEN** the shell shows an empty chat state and an empty artifact state

### Requirement: Theme switching

The system SHALL render in a default dark theme and SHALL support switching to light theme by setting a theme attribute on the document root, without reloading.

#### Scenario: Default dark
- **WHEN** the app loads with no stored preference
- **THEN** it renders in dark mode

#### Scenario: Theme attribute switch
- **WHEN** the document root's theme attribute is changed to light or dark
- **THEN** all tokens and surfaces update immediately without a reload

### Requirement: Screenshot capture

The system SHALL provide a `pnpm screenshots` script that captures the shell at 1440×900 and 390×844 in both light and dark themes into `docs/screenshots/`.

#### Scenario: Capture matrix
- **WHEN** `pnpm screenshots` runs
- **THEN** `docs/screenshots/` contains a screenshot for each of the two viewport sizes in each theme

### Requirement: Design system documentation

The system SHALL document the visual system — surfaces, tokens, typography, motion, and accessibility rules — in `DESIGN.md`, covering every shipped surface (workspace shell, chat, tool and approval cards, terminal log, artifact panel with versions and diff, settings drawer, command palette, empty and error states) and the hardened edge-case and keyboard-shortcut rules.

#### Scenario: Documented system
- **WHEN** a developer opens `DESIGN.md`
- **THEN** it describes the surfaces, the token contract, the font roles, and the accessibility, motion, keyboard and edge-case rules

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
