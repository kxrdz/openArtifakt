# Design

## Context

The web app already ships every surface (see `DESIGN.md` and the `design-foundation`, `chat-ui`, `artifact-rendering`, `settings` specs): an indigo-tinted token system in `apps/web/src/styles/tokens.css` consumed through Tailwind, shared primitives in `apps/web/src/components/ui/`, and a workspace shell that composes the chat, terminal, artifact panel and settings drawer. The composer is keyboard-operable and the settings drawer opens from the status bar, but there is no global shortcut layer, no command palette, no dialog/overlay primitive, and no hardening against long paths / huge outputs / overflowing text. The Impeccable final pass (§7, §12.9) has not yet been run.

## Goals / Non-Goals

**Goals:**
- One declarative command registry that drives both global shortcuts and the command palette, so the two cannot drift.
- A dialog/overlay primitive (focus trap, Escape-to-close, scrim from `--color-scrim`, `prefers-reduced-motion`) reused by the palette, the settings drawer and the full-screen artifact sheet.
- Global shortcuts for the full keyboard-first list in §7, with visible `Kbd` hints and focus rings.
- Edge-case resilience: long paths truncate, huge outputs clamp with a marker and stay scrollable, errors wrap, nothing pushes the page wide.
- A single pass through critique → audit → harden → onboard → polish, with findings fixed or recorded in `docs/DECISIONS.md`.

**Non-Goals:**
- No rebinding UI / per-user shortcut customization in v0.1 (a single default map is enough; the registry leaves room for it later).
- No new runtime dependencies: the palette filter and focus trap are hand-rolled (offline-first, lean bundle).
- No restyle of generated artifacts (they stay in their sandbox, per §7).
- No server / `packages/core` / `packages/shared` changes.

## Decisions

1. **Single command registry.** `apps/web/src/components/command/commands.ts` declares each command as `{ id, label, hint?, shortcut?, run, when? }`. `useKeyboardShortcuts` binds the `shortcut` entries on a window-level `keydown` (capture phase); `CommandPalette` renders the same registry with fuzzy filtering. Rationale: one source of truth prevents shortcut/palette drift; alternatives (separate maps) historically diverge.

2. **Default key map** (Mod = Meta on macOS, Ctrl elsewhere; both are matched):
   - `Mod+K` command palette · `Mod+Enter` send · `Escape` stop/close-overlay · `Alt+A` approve · `Alt+R` reject (first pending) · `Mod+\` toggle artifact panel · `Mod+J` toggle terminal log · `Mod+,` open settings · `Mod+I` focus chat input.
   Rationale: conventional, non-conflicting within the app; browser-chrome collisions (`Mod+J`, `Mod+,`) are suppressed with `preventDefault`. Recorded in `docs/DECISIONS.md`.

3. **Input-field guard.** The global handler ignores every binding except `Escape` and `Mod+K` while focus is inside a text input, textarea, or contenteditable, so typing `a`, `r`, `\` etc. never triggers an action. Rationale: shortcuts must not fire mid-composition.

4. **Approve/reject target the oldest pending approval.** When several approval cards are open, `Alt+A`/`Alt+R` act on the first (topmost) pending one; the card is highlighted so the target is unambiguous. Rationale: deterministic, visible; alternatives (require focus) break the "no mouse" promise.

5. **Dialog/overlay primitive.** A `Dialog` component in `components/ui/` provides a scrim (`--color-scrim`), focus trap (Tab cycles within, focus restored on close), Escape-to-close, and a `data-reduced-motion`-aware fade/slide that collapses to a no-op under `prefers-reduced-motion`. The palette and settings drawer adopt it so modal behavior is identical everywhere.

6. **Fuzzy filter is a small subsequence matcher** (case-insensitive, with per-command keyword aliases) rather than a library. Rationale: zero deps, offline, ~40 lines; the command set is small.

7. **Hardening uses Tailwind utilities + existing tokens, not new CSS.** `truncate` + `title` for paths, `min-w-0` on flex children to enable truncation, `break-words`/`break-all` for errors and commands, `max-h` + `overflow-y-auto` + an "expand" toggle for huge tool/terminal output (reusing the core `[... N lines truncated ...]` marker semantics), and `overflow-hidden` guards on panes. New tokens are added only when a genuinely reusable value is missing (per `DESIGN.md` "How to add a color or size").

8. **The five passes are run as ordered tasks, not one amorphous sweep.** `critique` and `audit` are assessment tasks (critique uses two isolated sub-agents per the Impeccable invariant; findings persisted to `.impeccable/critique/`); `harden`, `onboard`, `polish` are fix tasks driven by those findings plus §7's specific list (long paths, huge outputs, errors, text overflow, first-run/no-provider/no-workspace states). `DESIGN.md` is updated last so it documents what actually shipped.

## Risks / Trade-offs

- [Browser shortcut collisions (`Mod+J` downloads, `Mod+,` preferences, `Mod+I` italic/inspect)] → always `preventDefault()` on handled bindings; document the map in `DESIGN.md`.
- [A global listener intercepting keys while a user is typing] → the input-field guard (decision 3) plus per-binding `when` conditions; covered by unit tests that assert shortcuts are inert in inputs.
- [Huge-output clamping could hide information a developer needs] → clamp with a clear marker and an explicit expand/collapse toggle, never a silent truncation.
- [Critique sub-agents may be unavailable in a later loop iteration] → the Impeccable critique reference permits a clearly-bannered single-context degraded run; the banner and findings still get recorded.
- [Design fixes touching many files in one pass could churn] → each fix task is scoped to its findings and committed separately; `pnpm check` runs after every task, so regressions surface immediately.

## Migration Plan

No data or API changes. The dialog primitive is additive; existing drawers/sheets adopt it without behavior change. Shortcuts and the palette are additive; existing Enter/Escape behavior in the composer and drawers is preserved. Rollback is a clean `git revert` of the feature branch.

## Critique snapshot (task 5.1)

The Impeccable critique ran dual-agent (design review + detector/evidence) and
persisted the full report to `.impeccable/critique/openartifact-workspace.md`.
Design health score **33/40 (Good)**; `pnpm design:check` is clean (zero detector
findings). Priority issues and their planned disposition (fix in this feature's
later tasks, or explicitly deferred — see `docs/DECISIONS.md`):

1. **[P0]** Approve/reject shortcuts (`Alt+A`/`Alt+R`) are suppressed while focus
   is in the composer, so they are dead at the moment an approval is pending →
   **fix in harden (7.1)**.
2. **[P1]** `chatStore.error` is never rendered — transport failures show only
   the word "Error" → **fix in polish (9.1)**.
3. **[P1]** Light-theme status badge text (`running`/`warning`/`success`) sits
   below 4.5:1 on its `-bg` wash → **fix in harden/polish (token change)**.
4. **[P2]** `SettingsDrawer` and the mobile artifact sheet bypass the shared
   `Dialog` (no focus trap) → **fix in harden (7.1)**.
5. **[P2]** No `aria-live`/`role="log"` on the streaming conversation and
   terminal log → **fix in polish (9.1)**.

Deferred with reason (recorded in `docs/DECISIONS.md`): `ConversationMenu`
metadata, terminal/conversation copy affordance, composer character limit,
`CodeViewer` virtualization, refresh-mid-approval recovery (needs server change),
and touch tooltips.
