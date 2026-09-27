---
target: apps/web/src (all workspace surfaces)
method: impeccable audit (technical quality check across a11y, performance,
  theming, responsive, implementation integrity)
detector: impeccable detect --json apps/web/src  →  exit 0, [] (clean)
date: 2026-09-27
---

# Impeccable audit — OpenArtifact workspace (feature 9, task 6.1)

A code-level technical audit, run after the critique (task 5.1) and before the
harden/onboard/polish fix passes. It re-checks every measurable dimension of
`apps/web/src` against the §7 keyboard/a11y/responsive contract. Findings are
severity-tagged (P0–P3) and cross-referenced to the fix task that owns them;
every finding is verified against source, the deterministic detector, or a
computed WCAG contrast ratio (script `contrast.mjs` over the token HSL values).

Evidence note (same caveat as the critique): this run is source + detector +
computed-contrast based; pixel inspection of screenshots is deferred to the
screenshots pass (task 11.2).

---

## Audit Health Score

| # | Dimension | Score | Key Finding |
|---|-----------|-------|-------------|
| 1 | Accessibility | 2 | Light-theme status badge text 3.63–4.07:1 (< 4.5:1) and form borders ~1.3:1 (< 3:1 non-text) |
| 2 | Performance | 3 | Terminal/message lists re-render wholesale per streamed chunk; Monaco/mermaid already lazy/debounced |
| 3 | Responsive Design | 3 | Fixed 128 px terminal well crowds the composer at 390 px; 6 px split divider target |
| 4 | Theming | 4 | Detector clean; every renderer (mermaid/monaco/shiki) is token-derived and re-themes live |
| 5 | Implementation Integrity | 3 | `chatStore.error` never rendered; two overlays bypass the shared `Dialog`; `versionSelectClass` duplicated |
| **Total** | | **15/20** | **Good** (address the two weak dimensions: a11y and responsiveness) |

---

## Implementation Integrity Verdict

**Pass** — the implementation expresses a coherent, product-specific system.
`tokens.css` is a real, single-sourced design system (indigo-tinted neutrals,
self-hosted IBM Plex, 4 px grid, status colors reserved for meaning), and the
deterministic detector (`impeccable detect --json apps/web/src`) exits **0 with
an empty findings array** — zero hard-coded colors or font sizes in any
component. The command registry (`commands.ts`) is one declarative source
shared by the global shortcut layer and the palette, and the approval surface
(`ApprovalCard`) is genuinely strong (exact diff/command + editable command +
cwd). The failures are isolated issues — a silent transport error, two
hand-rolled modal shells, one duplicated style constant — not systemic drift.

---

## Executive Summary

- **Audit Health Score: 15/20 (Good)**
- **Total issues found: 16** — 1 P0, 3 P1, 6 P2, 6 P3.
- **Top critical issues:**
  1. [P0] Approve/Reject shortcuts are suppressed while focus is in the composer — dead exactly when an approval is pending.
  2. [P1] Light-theme `success`/`warning`/`running` badge text sits at 3.63–4.07:1, under the 4.5:1 AA floor.
  3. [P1] Form/control borders (`--color-border` vs background) measure ~1.3:1, under WCAG 1.4.11's 3:1 non-text floor.
  4. [P1] `chatStore.error` is written on every transport failure but never rendered — failures are silent.
- **Recommended next steps:** harden (7.1) → colorize + clarify (7.1/9.1) → adapt (9.1) → polish (9.1), then re-run this audit.

---

## Detailed Findings by Severity

### [P0] Approve/Reject shortcuts are dead while focus is in the composer
- **Location:** `apps/web/src/components/command/commands.ts` (`isEditableSafeShortcut`), `Composer.tsx` (`submit()` keeps focus in the textarea).
- **Category:** Accessibility (keyboard).
- **Impact:** After `Mod+Enter` sends, focus remains in the composer through streaming into the pending approval; the global `Alt+A`/`Alt+R` bindings are suppressed by the editable guard, so the single highest-stakes interaction cannot be reached without a mouse. A user pressing `Escape` (Stop) can then cancel the turn.
- **WCAG/Standard:** WCAG 2.1.1 (Keyboard).
- **Recommendation:** Exempt approve/reject from editable suppression when `availability.hasApproval` is true, and/or blur the composer on send. Owned by **harden (task 7.1)** — carried from the critique, still present in code.
- **Suggested command:** harden.

### [P1] Light-theme status badge text below 4.5:1
- **Location:** `apps/web/src/styles/tokens.css` (light `--color-success`/`-warning`/`-running`), `components/ui/Badge.tsx`.
- **Category:** Accessibility (contrast).
- **Impact:** `success`/`warning`/`running` badges render 12 px status text on their 12 %-alpha washes. Measured from the light tokens: success **4.07:1**, warning **3.69:1**, running **3.63:1** — all under AA for normal text. "Running" and "Waiting for approval" are the two most safety-relevant states.
- **WCAG/Standard:** WCAG 1.4.3 (Contrast, minimum, AA).
- **Recommendation:** Darken the light status text tokens (or lighten the washes) until each hits ≥ 4.5:1 on both `--color-bg` and `--color-bg-elevated`.
- **Suggested command:** colorize.

### [P1] Non-text contrast: control borders below 3:1
- **Location:** `tokens.css` (`--color-border`), used by the composer textarea, every `<select>`, cards and the split divider.
- **Category:** Accessibility (non-text contrast).
- **Impact:** `--color-border` against `--color-bg` measures **1.29:1** (light) and **1.36:1** (dark); against elevated surfaces ~1.3:1. Text inputs and selects are identifiable almost entirely by their border (their `bg-sunken` is within ~1.1:1 of the page background), so the boundary fails the 3:1 floor for UI components.
- **WCAG/Standard:** WCAG 1.4.11 (Non-text Contrast, AA).
- **Recommendation:** Strengthen `--color-border`/`--color-border-strong` (or add a distinct input fill) until the component boundary reaches ≥ 3:1 in both themes, while keeping the "calm dense" look.
- **Suggested command:** colorize (token change).

### [P1] Transport/chat errors are never rendered
- **Location:** `store/chatStore.ts` (`error` set on send/stop/decide/undo failures), `components/shell/StatusBar.tsx` (renders only the literal word "Error" from `agentState`).
- **Category:** Implementation Integrity.
- **Impact:** A failed provider call, rejected approval POST or failed stop shows zero diagnostic — the user sees "Error" with no message and no next step, violating the PRODUCT voice ("errors say what happened and what to do next").
- **WCAG/Standard:** — (product/voice + WCAG 3.3.1 error identification).
- **Recommendation:** Render `state.error` as a dismissible `role="alert"` banner with the message and a clear next action.
- **Suggested command:** clarify (then polish).

### [P2] Two of three overlays bypass the shared Dialog (no focus trap)
- **Location:** `components/settings/SettingsDrawer.tsx` and the mobile artifact sheet in `components/shell/WorkspaceShell.tsx` hand-roll `role="dialog" aria-modal="true"` with only an Escape listener; only `CommandPalette` uses `components/ui/Dialog.tsx`.
- **Category:** Accessibility (keyboard).
- **Impact:** Tab walks out of the settings drawer (the one place a keyboard/SR user configures providers) and out of the entire mobile artifact panel into the underlying page.
- **WCAG/Standard:** WCAG 2.1.2 (No Keyboard Trap) / 2.4.3 (Focus Order).
- **Recommendation:** Route both through the `Dialog` primitive (focus trap + restore + reduced-motion come free).
- **Suggested command:** harden.

### [P2] No live-region announcements for streamed content
- **Location:** `components/chat/ChatContainer.tsx` (`aria-label="Conversation"`, no live region), `components/shell/TerminalLog.tsx` (no `role="log"`).
- **Category:** Accessibility (ARIA).
- **Impact:** A screen-reader user gets silence while text, code and command output stream; the only live region is the status dot.
- **WCAG/Standard:** WCAG 4.1.3 (Status Messages) / ARIA `role="log"` + `aria-live="polite"`.
- **Recommendation:** `role="log"` + `aria-live="polite"` on the message list; a throttled polite log on the terminal.
- **Suggested command:** adapt.

### [P2] Theme preference is not persisted
- **Location:** `components/shell/WorkspaceShell.tsx` (`toggleTheme()` flips `data-theme` only), `index.html` (reads `localStorage["openartifact-theme"]`, which is never written).
- **Category:** Implementation Integrity.
- **Impact:** The palette's "Toggle theme" is lost on reload — the inline bootstrap always falls back to dark because nothing ever writes the key.
- **Recommendation:** Write `localStorage["openartifact-theme"]` in `toggleTheme()`.
- **Suggested command:** polish.

### [P2] Split-pane divider has a ~6 px pointer target
- **Location:** `components/shell/SplitPane.tsx` (`w-1.5` divider, `touch-none`).
- **Category:** Responsive Design.
- **Impact:** The draggable separator is 6 px wide (below WCAG 2.5.8's 24 px minimum), so it is hard to grab by mouse and near-impossible by touch; it is keyboard-operable (arrows/Home/End) but the pointer path is the primary one.
- **WCAG/Standard:** WCAG 2.5.8 (Target Size, Minimum, AA).
- **Recommendation:** Widen the hit area (e.g. a transparent 12–16 px gutter with the 1 px visual line centred) without changing the visual.
- **Suggested command:** adapt.

### [P2] Terminal log and expanded tool results re-render wholesale with no scroll clamp
- **Location:** `components/shell/TerminalLog.tsx` (maps every line to a `<span key={index}>` and re-renders all of them on each appended chunk), `components/chat/ToolCallCard.tsx` (expanded result is a 4000-char `<pre>` with no max-height).
- **Category:** Performance.
- **Impact:** Streamed command output grows the span list and re-renders it linearly per chunk (jank on long builds); an expanded tool result dumps up to 4000 chars into the card without an internal scroll, pushing the conversation out of view. Bounded in practice by the ~20k-char tool-result cap, so not blocking.
- **Recommendation:** Give the expanded tool result a `max-h` + `overflow-y-auto` and an expand/collapse toggle (harden, 7.1); consider a content-visibility/virtualization pass for the terminal later.
- **Suggested command:** harden (clamp) → optimize (later).

### [P2] Artifact switcher titles truncate with no tooltip
- **Location:** `components/shell/ArtifactPanel.tsx` (`max-w-[12rem] truncate` on the switcher button, no `title`).
- **Category:** Responsive Design.
- **Impact:** A long artifact title is clipped at 12 rem with no way to read the full name.
- **Recommendation:** Add a `title` attribute (or a visible `truncate` with `title`) to the switcher entries.
- **Suggested command:** harden.

### [P3] `versionSelectClass` copy-pasted between ArtifactPanel and VersionDiff
- **Location:** `components/shell/ArtifactPanel.tsx` and `components/artifacts/VersionDiff.tsx` (identical `cn(...)` constant).
- **Category:** Implementation Integrity.
- **Impact:** Two sources for one control style will drift; flagged by the critique and still present.
- **Recommendation:** Extract one shared constant (e.g. in `components/ui/` or a `selectStyles` helper).
- **Suggested command:** polish.

### [P3] `jumpToArtifactPanel` uses a brittle selector
- **Location:** `components/shell/WorkspaceShell.tsx` (`document.querySelector('[aria-label="Artifacts"] button')`).
- **Category:** Implementation Integrity.
- **Impact:** The focus target depends on the exact `aria-label`/DOM shape of `ArtifactPanel`; any rename silently breaks the command.
- **Recommendation:** Expose a focus handle from `ArtifactPanel` (mirroring `ComposerHandle`) instead of querying by label.
- **Suggested command:** polish.

### [P3] ConversationMenu lacks arrow-key navigation / focus-on-open
- **Location:** `components/shell/ConversationMenu.tsx` (`role="menu"` with `role="menuitem"` buttons, no focus move on open, no arrow-key handling).
- **Category:** Accessibility.
- **Impact:** Tab reaches the menu items but Arrow keys do not (ARIA menu authoring practice); focus is not moved into the menu on open, so a keyboard user has to Tab through the status bar first.
- **Recommendation:** Move focus to the first item on open and add Up/Down/Home/End handling.
- **Suggested command:** adapt.

### [P3] "Revert" reads as destructive
- **Location:** `components/shell/ArtifactPanel.tsx` (Revert button; the action is copy-forward, non-destructive).
- **Category:** Implementation Integrity (copy).
- **Impact:** A button labeled "Revert" implies rollback/undo; only the tooltip explains it copies a version forward as a new one, which never deletes history.
- **Recommendation:** Clarify the copy ("Restore this version" / "Use this version") or pair the label with an explanatory hint.
- **Suggested command:** clarify.

### [P3] MermaidViewer toolbar is a dense h-9 strip
- **Location:** `components/artifacts/MermaidViewer.tsx` (zoom ×3, divider, Copy SVG, SVG, PNG in one row).
- **Category:** Responsive Design.
- **Impact:** Six controls in a single 36 px row are tight at 390 px inside the full-screen sheet; flagged by the critique, verify overflow in the screenshots pass.
- **Recommendation:** Confirm it fits at 390 px (task 11.2); if it crowds, collapse copy/download into fewer controls.
- **Suggested command:** adapt.

---

## Patterns & Systemic Issues

- **Two hand-rolled modal shells** (`SettingsDrawer`, mobile sheet) duplicate only part of `Dialog`'s behaviour — the same "write a role=dialog + Escape listener" pattern twice, both missing the focus trap. One primitive now exists; the fix is adoption, not a third copy.
- **Contrast is dark-first.** The dark theme is AA throughout (body 15.9:1, status colors ≥ 6:1), but the light theme's semantic *text* tokens (status) and *border* tokens were tuned without re-checking against their 12 %-alpha washes. The fix is token-only — no component changes.
- **Streaming lists re-render wholesale** (terminal spans, message list) — the app is correct but pays O(n) per appended chunk. Acceptable for v0.1's bounded outputs; worth a virtualization pass later.

## Positive Findings

- **Detector clean** — `impeccable detect --json apps/web/src` exits 0 with `[]`; zero hard-coded colors/font sizes across 90+ source files.
- **Token discipline is real and complete** — semantic names only, dark + light palettes, and mermaid, Monaco and shiki are all *derived from the live document tokens* (no JS palettes), so every renderer re-themes in place on a `data-theme` flip.
- **Lazy, offline, bounded** — Monaco is locally bundled and dynamically imported only when the diff view opens; mermaid is debounced 300 ms and parse-before-render; artifact/sandbox deps are vendored (no CDN).
- **Keyboard-first infrastructure is genuine** — one command registry drives both global shortcuts and the palette; the split divider is a keyboard-operable `role="separator"`; the palette has a real focus trap + focus restore.
- **The approval surface is exemplary** — exact diff/command, editable command with cwd, reject-with-note, non-destructive undo and version revert.
- **An axe assertion already exists** (`e2e/smoke.spec.ts` asserts zero serious/critical on load) — task 11.1 will extend it to every screenshot screen.

---

## Recommended Actions (priority order)

1. **[P0] harden**: exempt approve/reject from the editable guard while an approval is pending (and blur the composer on send).
2. **[P1] colorize**: darken light `--color-success`/`-warning`/`-running` text (and strengthen `--color-border`/`-strong`) to AA on their washes.
3. **[P1] clarify**: render `chatStore.error` as a dismissible `role="alert"` banner with the message and next step.
4. **[P2] harden**: route `SettingsDrawer` and the mobile sheet through the shared `Dialog`; clamp expanded tool results with a max-height + toggle; add tooltips to truncated switcher titles.
5. **[P2] adapt**: add `role="log"`/`aria-live` to the conversation and terminal; widen the split-divider hit area; give `ConversationMenu` arrow-key nav + focus-on-open.
6. **[P2] polish**: persist the theme to `localStorage`; dedupe `versionSelectClass`; replace the brittle `querySelector` focus target; clarify the "Revert" label.
7. **polish** (final): one consistency sweep after 1–6, then re-run `pnpm design:check` and `pnpm e2e`.

> These map one-to-one onto the change's remaining tasks (7.1 harden, 8.1 onboard,
> 9.1 polish); re-run `/impeccable audit` after the fixes to see the score improve.
