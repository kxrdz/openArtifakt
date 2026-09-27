# OpenArtifact — Design system

This document is the visual contract for the OpenArtifact interface. Every shipped surface builds on it; when a one-off color or size appears in a component, that is a bug — add a token, or reuse an existing one. The generated artifacts (React, HTML, SVG, Mermaid, code) render in their own sandbox and are **not** restyled by this system.

- **Mode:** Operate. A developer runs OpenArtifact for hours beside an editor and a terminal; the interface must be scannable, calm, and consistent — not decorative.
- **Identity:** a precise instrument for code. Indigo-tinted neutrals (never pure gray), one restrained indigo accent, status colors reserved for meaning, a clear type scale, and a 4 px spatial grid. OpenArtifact is its own product; it does not imitate any commercial AI tool's look.
- **Dark first, light equal.** Dark is the default (`:root`); light is a first-class override (`[data-theme="light"]`). Both must meet WCAG 2.2 AA.

## Surfaces

The app shell composes these surfaces (shaped per SPEC §7):

1. **Workspace shell** — the frame: top status bar, resizable split (chat left / artifact panel right, collapsible via `Mod+\`), collapsible terminal log, settings trigger, and the global keyboard-shortcut layer. Empty and error states are first-class, not afterthoughts. On screens under 900 px the artifact panel becomes a full-screen sheet opened from the status bar.
2. **Chat pane** — the conversation (streamed text, auto-scroll that pauses on manual scroll), tool-call and approval cards, inline Mermaid, and a dismissible error banner. It also carries the first-run and no-provider onboard states.
3. **Tool-call / approval cards** — named, risky actions with the exact diff or command; approve / reject / reject-with-note / edit the command or working directory.
4. **Terminal log** — streaming command output; monospace; collapsible; announced as a live region.
5. **Artifact panel** — Preview/Code tabs, artifact switcher, version dropdown, diff (Monaco) and revert/restore, covering all five artifact types.
6. **Settings drawer** — providers, models, masked key references, approval mode; a dialog overlay with a focus trap.
7. **Command palette** — `Mod+K` overlay listing every command and navigation target, with fuzzy filtering, arrow-key navigation and visible focus; built on the shared dialog primitive.
8. **Empty / error states** — the shell shows them before any conversation or artifact exists, and when a provider is not yet ready (a path into settings).

### Primitives

Shared UI primitives live in `apps/web/src/components/ui/` and are the only building blocks surfaces may use: `Button`, `IconButton`, `Badge`, `StatusDot`, `Kbd` (keyboard hint), `Spinner`, `Dialog` (scrim + focus trap + Escape + reduced motion), the shared `focusRing`, and the shared `versionSelectClass` for native selects. Every primitive is keyboard-operable and shows a visible focus ring.

## Tokens

All tokens live in `apps/web/src/styles/tokens.css` and are consumed through the Tailwind theme (`tailwind.config.js`). Components reference **semantic names** (`bg-bg`, `text-text-secondary`, `border-border`, `accent`, `success`), never raw values.

### Color

Tinted neutrals carry an indigo cast (HSL hue ≈ 222–228). Semantic roles:

| Role | Use |
|---|---|
| `--color-bg` / `-elevated` / `-sunken` / `-hover` | App background, cards/panels, inputs, hover |
| `--color-border` / `-strong` | Hairlines, stronger dividers |
| `--color-text` / `-secondary` / `-muted` / `-faint` | Primary copy, supporting, metadata, disabled |
| `--color-accent` / `-hover` / `-fg` | Brand + primary actions; `-fg` is text on accent |
| `--color-success` / `-warning` / `-danger` / `-running` (+ `-bg`) | Status only; `-bg` is the soft badge wash |
| `--color-scrim` | Modal scrim behind drawers, sheets and the palette (translucent, per theme) |

Contrast targets in **both** themes: body and secondary text ≥ 4.5:1; large/display text ≥ 3:1; form/control borders ≥ 3:1 against their background (WCAG 1.4.11 non-text). Secondary text is tinted from the foreground hue — never a pure gray wash.

### Type

- **Sans** (`--font-sans`, IBM Plex Sans) for all UI copy.
- **Mono** (`--font-mono`, IBM Plex Mono) for code, file paths, and terminal output **only**.
- Scale (14 px base, dense but calm): `12 / 13 / 14 / 15 / 17 / 20 / 24 / 30` px (`--text-xs` … `--text-3xl`). Body measure 65–75 ch; headings balanced; weight and size steps are obvious. Tracking floor −0.01 em.

### Spacing, radius, elevation, motion

- **Spacing:** 4 px grid (`--space-1` … `--space-16`). Tight groups, generous separation; more space above a heading than below.
- **Radius:** `--radius-sm 4 / md 6 / lg 10 / xl 14 / full`.
- **Elevation:** `--shadow-1/2/3` — offset + soft blur only; no colored halos, no hard offset block shadows.
- **Motion:** one authored moment — exponential ease-out (`--ease-out`) at `--duration-fast/normal/slow`. `prefers-reduced-motion` collapses durations to ~0. No scattered entrance animations; overlays fade/slide unless reduced motion is set.

## Keyboard shortcuts

The command registry (`apps/web/src/components/command/commands.ts`) is the single source of truth: the global shortcut layer and the command palette both read the same list, so a binding and its palette entry can never drift. **Mod** is ⌘ on macOS and Ctrl elsewhere — both are matched, so every chord works on any platform.

| Shortcut | Action |
|---|---|
| `Mod+K` | Open the command palette (from anywhere) |
| `Mod+Enter` | Send the composed message |
| `Escape` | Stop a running turn; close the top-most overlay |
| `Alt+A` | Approve the oldest pending approval |
| `Alt+R` | Reject the oldest pending approval |
| `Mod+\` | Toggle the artifact panel (collapse desktop split / open narrow-screen sheet) |
| `Mod+J` | Toggle the terminal log |
| `Mod+,` | Open settings |
| `Mod+I` | Focus the chat input |

Rules:

- **Input-field guard.** While focus is inside a text input, textarea, or contenteditable, only `Escape` and `Mod+K` fire; everything else is suppressed so typing never triggers an action. The exception is `Alt+A`/`Alt+R`, which fire while an approval is pending (even right after `Mod+Enter` leaves focus in the composer), so the one high-stakes interaction is always reachable by keyboard.
- **Modal capture.** While a modal (command palette, settings drawer, full-screen artifact sheet) is open, global workflow shortcuts are suppressed and `Escape` dismisses the top-most overlay.
- **Discovery.** Every shortcut is surfaced on the control it triggers as a `Kbd` hint (icon-only status-bar controls carry it in their `title`), and in the command palette. Palette-only commands (toggle theme, new conversation, undo last turn, jump to the artifact panel) have no global chord.
- **Browser collisions.** Handled bindings call `preventDefault()` so `Mod+J`, `Mod+,` and `Mod+I` never trigger browser chrome.

## Edge-case resilience

Real content must never break layout or hide status (SPEC §12.9). These are contract rules, not optional polish:

- **Long paths** truncate with an ellipsis and a `title` (the shared `PathLine`), so a deep path stays identifiable without forcing a wider layout.
- **Huge tool output** clamps at 4000 chars with a head/tail truncation marker and an in-card "Show more / less" toggle that expands into a scroll well — never a silent truncation.
- **Terminal output** lives in a fixed-height scroll well with a header collapse; a single line is never truncated.
- **Errors and rejection notes** wrap (`break-words`/`break-all`) within their card and the offending detail stays readable.
- **Overflow is contained** per surface: `min-w-0` on flex columns plus `overflow-hidden` guards mean no unbreakable path, command, or output can push the page wide or clip state. Horizontal page scroll is never the answer.

## Browser surfaces

Text selection, scrollbars, the caret, and focus rings are themed from the tokens (see the base layer in `tokens.css`). `:focus-visible` draws a 2 px accent outline with 2 px offset on every interactive element; keyboard operation must always be possible. The split divider's drag handle extends into a transparent gutter (~26 px) so it meets the 24 px minimum pointer target without widening the visual line.

## Accessibility

- WCAG 2.2 AA contrast in both themes, including ≥ 3:1 non-text contrast on resting borders.
- Full keyboard operation: send, stop, approve/reject, toggle panel, toggle terminal log, command palette, focus input — all reachable and visible without a mouse.
- Overlays (palette, settings drawer, sheet) trap focus and restore it on close; `Escape` dismisses the top-most overlay.
- Streamed content is announced politely: the conversation list and terminal log carry `role="log"` + `aria-live="polite"`; errors render as a dismissible `role="alert"` banner.
- Zero serious or critical axe violations.
- `prefers-reduced-motion` collapses all animation and overlay transitions.

## Anti-patterns (do not)

- Gradient text, decorative glass/blur, colored 1px+ side borders, card-grid hero layouts, kicker labels, emoji as icons.
- Hard-coded color or font-size values in any component.
- Monospace as a "technical" costume outside code/paths/terminal.
- Soft-shadowed rounded rectangles standing in for real content.
- Silent truncation of content the user might need: clamp with a marker and an expand control.

## How to add a color or size

1. Add a token in `tokens.css` (both `:root` and `[data-theme="light"]` when themed).
2. Map it in `tailwind.config.js` under `theme.extend`.
3. Use the semantic class in the component.
4. Run `pnpm design:check` and `pnpm screenshots`; fix what the screenshots show.
