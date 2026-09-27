# OpenArtifact — Design system

This document is the visual contract for the OpenArtifact interface. Features 6–9 build their surfaces on it; when a one-off color or size appears in a component, that is a bug — add a token, or reuse an existing one. The generated artifacts (React, HTML, SVG, Mermaid, code) render in their own sandbox and are **not** restyled by this system.

- **Mode:** Operate. A developer runs OpenArtifact for hours beside an editor and a terminal; the interface must be scanable, calm, and consistent — not decorative.
- **Identity:** a precise instrument for code. Indigo-tinted neutrals (never pure gray), one restrained indigo accent, status colors reserved for meaning, a clear type scale, and a 4 px spatial grid. OpenArtifact is its own product; it does not imitate any commercial AI tool's look.
- **Dark first, light equal.** Dark is the default (`:root`); light is a first-class override (`[data-theme="light"]`). Both must meet WCAG 2.2 AA.

## Surfaces

The app shell composes these surfaces (shaped per SPEC §7):

1. **Workspace shell** — the frame: top status bar, resizable split (chat left / artifact panel right), collapsible terminal log, settings trigger. Empty and error states are first-class, not afterthoughts.
2. **Chat pane** — the conversation, streamed text, tool-call and approval cards, inline Mermaid.
3. **Tool-call / approval cards** — named, risky actions with the exact diff or command; approve / reject / edit.
4. **Terminal log** — streaming command output; monospace; collapsible.
5. **Artifact panel** — Preview/Code tabs, artifact switcher, version dropdown, diff/revert.
6. **Settings drawer** — providers, models, key references, approval mode.
7. **Empty / error states** — the shell shows them before any conversation or artifact exists.

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

Contrast targets in **both** themes: body and secondary text ≥ 4.5:1; large/display text ≥ 3:1. Secondary text is tinted from the foreground hue — never a pure gray wash.

### Type

- **Sans** (`--font-sans`, IBM Plex Sans) for all UI copy.
- **Mono** (`--font-mono`, IBM Plex Mono) for code, file paths, and terminal output **only**.
- Scale (14 px base, dense but calm): `12 / 13 / 14 / 15 / 17 / 20 / 24 / 30` px (`--text-xs` … `--text-3xl`). Body measure 65–75 ch; headings balanced; weight and size steps are obvious. Tracking floor −0.01 em.

### Spacing, radius, elevation, motion

- **Spacing:** 4 px grid (`--space-1` … `--space-16`). Tight groups, generous separation; more space above a heading than below.
- **Radius:** `--radius-sm 4 / md 6 / lg 10 / xl 14 / full`.
- **Elevation:** `--shadow-1/2/3` — offset + soft blur only; no colored halos, no hard offset block shadows.
- **Motion:** one authored moment — exponential ease-out (`--ease-out`) at `--duration-fast/normal/slow`. `prefers-reduced-motion` collapses durations to ~0. No scattered entrance animations.

## Browser surfaces

Text selection, scrollbars, the caret, and focus rings are themed from the tokens (see the base layer in `tokens.css`). `:focus-visible` draws a 2 px accent outline with 2 px offset on every interactive element; keyboard operation must always be possible.

## Accessibility

- WCAG 2.2 AA contrast in both themes.
- Full keyboard operation: send, stop, approve/reject, toggle panel, command palette, focus input — all reachable and visible without a mouse.
- Zero serious or critical axe violations.

## Anti-patterns (do not)

- Gradient text, decorative glass/blur, colored 1px+ side borders, card-grid hero layouts, kicker labels, emoji as icons.
- Hard-coded color or font-size values in any component.
- Monospace as a "technical" costume outside code/paths/terminal.
- Soft-shadowed rounded rectangles standing in for real content.

## How to add a color or size

1. Add a token in `tokens.css` (both `:root` and `[data-theme="light"]` when themed).
2. Map it in `tailwind.config.js` under `theme.extend`.
3. Use the semantic class in the component.
4. Run `pnpm design:check` and `pnpm screenshots`; fix what the screenshots show.
