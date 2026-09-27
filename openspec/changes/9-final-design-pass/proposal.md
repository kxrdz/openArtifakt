# Proposal

## Why

Steps 1–8 shipped every v0.1 capability, but the interface has not yet been subjected to the full Impeccable final pass (§7, §12.9): no systematic critique/audit/harden/onboard/polish has run across all surfaces, the keyboard-first promise is only partially met (send/stop are reachable, but there is no command palette and no global approve/reject/toggle-panel/focus-input shortcuts), and `DESIGN.md` predates the chat, artifacts, versions and settings surfaces it now governs. This step is what turns a functional UI into a carefully designed, consistent, keyboard-operable product.

## What Changes

- **Final design pass** across every surface (workspace shell, chat, tool/approval cards, terminal log, artifact panel, settings drawer, empty/error states) in the Impeccable order: `critique` → `audit` → `harden` → `onboard` → `polish`. Fixes are recorded as tokens/components changes, never one-off colors or sizes; critique findings that are deliberately not fixed are logged in `docs/DECISIONS.md` with a reason.
- **Keyboard shortcuts** implemented globally and with visible focus: send, stop, approve, reject, toggle artifact panel, focus chat input, open the command palette, toggle the terminal log, and open settings — all working without a mouse, on desktop layouts.
- **Command palette** (`⌘K` / `Ctrl+K`): a keyboard-operable overlay listing every command and navigation target (new conversation, open settings, toggle panel, toggle theme, focus input, undo last turn, artifact/version jump), with fuzzy filtering, arrow-key navigation and visible focus.
- **Hardening** of the surfaces against real content: long file paths, huge tool outputs, multi-line errors, overflowing text, and the no-provider/no-workspace first-run state all render gracefully without breaking layout or hiding status.
- **`DESIGN.md` update** so the visual contract documents the surfaces actually shipped (chat, artifacts, versions, settings, palette, shortcuts) and the hardened rules.

## Capabilities

### New Capabilities

- `keyboard-shortcuts`: global keyboard shortcuts (send, stop, approve, reject, toggle panel, focus input, terminal log, settings) and a command palette reachable from anywhere, fully keyboard-operable with visible focus and `prefers-reduced-motion` respected.

### Modified Capabilities

- `design-foundation`: the UI-primitives requirement gains the dialog/overlay primitive the command palette and drawers share, keyboard hints (`Kbd`) are documented as a primitive, and a new hardening requirement makes edge-case content (long paths, huge outputs, errors, text overflow) a first-class part of the design contract; the design-system documentation requirement is updated to cover the final-pass rules.

## Impact

- `apps/web/src`: a new `components/command/` (palette + shortcut hook/binding) wired into the workspace shell and stores; `components/ui/` gains a `Dialog`/`Overlay` primitive; existing surfaces receive hardening/consistency fixes (clamping, `truncate`, `break-all`, `min-w-0`, overflow handling) and `Kbd` hints on shortcut-bearing actions; `DESIGN.md` is rewritten to match the shipped surfaces.
- `apps/web` tests: new unit tests for the shortcut hook/palette and the edge-case rendering fixes; the existing axe e2e suite gains coverage that every screenshot screen is scanned for serious/critical violations.
- `docs/screenshots/`: refreshed captures (every key screen, both themes, 1440×900 and 390×844) after the pass, including the command palette.
- `docs/DECISIONS.md`: critique findings that are intentionally not fixed, each with a reason.
- No server, `packages/core` or `packages/shared` changes: this is a client-side design and interaction pass only.
