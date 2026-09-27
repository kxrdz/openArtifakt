---
target: apps/web/src (all workspace surfaces)
total_score: 33
max_score: 40
na_heuristics: ""
p0_count: 1
p1_count: 2
p2_count: 2
date: 2026-09-27
---

# Impeccable critique — OpenArtifact workspace (feature 9, task 5.1)

Method: dual-agent (A: design review · B: detector/browser evidence), both run as isolated sub-agents.

> Caveat on evidence: both sub-agents ran on a model without image vision, so
> "browser evidence" was derived from (a) the deterministic detector
> (`pnpm design:check`), (b) full source review of every surface, (c) computed
> WCAG contrast ratios from the token HSL values, and (d) ImageMagick metadata
> of the 52 Playwright screenshots. No pixel-level visual inspection occurred;
> this is recorded so later passes re-verify visually.

---

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Transport errors collapse to a bare "Error" dot; `chatStore.error` is written but never rendered |
| 2 | Match System / Real World | 4 | Plain voice, real tool names in mono, "Run edited command"; no mascot/hype |
| 3 | User Control and Freedom | 4 | Undo turn, non-destructive version revert, Stop, reject-with-note, Escape everywhere |
| 4 | Consistency and Standards | 3 | `SettingsDrawer` + mobile sheet bypass the shared `Dialog` (no focus trap); `versionSelectClass` duplicated |
| 5 | Error Prevention | 4 | Exact diff/command + editable command + cwd before approve |
| 6 | Recognition Rather Than Recall | 3 | Icon-only status-bar triggers rely on `title`; approve/reject shortcuts invisible in context |
| 7 | Flexibility and Efficiency of Use | 3 | `Alt+A`/`Alt+R` suppressed while focus is in the composer — dead at the moment they matter |
| 8 | Aesthetic and Minimalist Design | 4 | Disciplined indigo-tinted tokens, 4 px grid, anti-patterns honored |
| 9 | Help Recognize/Diagnose/Recover | 2 | Chat/transport error message never surfaced; Mermaid/diff/settings errors are exemplary |
| 10 | Help and Documentation | 3 | Good empty-state + settings guidance; no in-flow hint for approval mode/history |
| **Total** | | **33 / 40** | **Good** |

## Design Specificity Verdict

**LLM assessment:** The surface layer is genuinely authored — `tokens.css` is a
real system (indigo-tinted neutrals, self-hosted IBM Plex, 4 px grid, status
colors reserved for meaning) and the code honors it (no hard-coded colors or
font sizes found in primitives/shell). Dark-mode contrast is excellent
(body 15.9:1, status colors ≥ 6:1). The risk surface (`ApprovalCard`/
`ToolCallCard`) is the product's soul and it is strong. But the **information
architecture is category-interchangeable**: top status bar → scrolling chat →
composer → collapsible terminal on the left, artifact panel on the right, is
the default "AI chat with a side panel" template. The three glanceability
questions PRODUCT.md demands — doing / waiting / changed — are answered by
scattered dots and badges, not a designed status narrative; "what changed" has
no dedicated surface at all (buried in a scrollback "Undo this turn" and an
unlabeled terminal).

**Deterministic scan:** `pnpm design:check` (`impeccable detect --json
apps/web/src`) exited **0** with an empty findings array — zero
detector findings across the whole tree. The detector is clean.

**Visual evidence:** degraded (see caveat). Image metadata confirms all 52
screenshots are real, correctly-sized renders (1440×900 / 390×844), dark/light
luminance is correct except the expected "bright" artifact-preview captures
(React/HTML/versions render light content inside a dark UI). One flag worth a
human glance: `mermaid-error-dark-desktop.png` is bright (mean luminance
33 752) where `artifact-mermaid-dark-desktop.png` is dark (4 019) — the inline
Mermaid error state may be a light surface in dark mode; **not visually
confirmed**.

## Overall Impression

A disciplined, well-tokened foundation with a genuinely excellent approval
surface and a real command/keyboard layer — but the frame is generic and the
highest-stakes keyboard path (approve/reject) is broken, and failures are
silent. The biggest opportunity is making status and errors first-class:
"what changed" and "what went wrong" should be as glanceable as the agent
state already is.

## What's Working

1. **The approval/risk surface (`ApprovalCard` + `ToolCallCard`)** — exact named
   action, editable command with `cwd`, line diff colored by status tokens,
   reject-with-note, truncation notices. Trust through transparency, not euphemized.
2. **Token discipline is real** — semantic names everywhere, zero hard-coded
   colors/font sizes in primitives and shell, full 12–30 px scale mapped into
   Tailwind, dark contrast genuinely AA.
3. **The command registry (`commands.ts`)** — one declarative source shared by
   global shortcuts and the palette, with editable-safe suppression,
   physical-key matching for Alt-chords on macOS, and a keyboard-operable
   split divider. Real keyboard-first infrastructure.

## Priority Issues

### [P0] Approve/Reject shortcuts are dead exactly when they are needed
- **What:** `isEditableSafeShortcut()` in `commands.ts` returns `false` for any
  `alt`/`shift` chord, so `Alt+A` (approve) and `Alt+R` (reject) are suppressed
  while focus is inside an editable target. `Composer.submit()` does not blur
  the textarea, so after `Mod+Enter` sends, focus stays in the composer through
  streaming into the pending approval.
- **Why it matters:** The one high-stakes interaction is unreachable by keyboard
  at the moment it appears. A user pressing `Alt+A` sees nothing, then may press
  `Escape` — bound to **Stop** — cancelling the turn.
- **Fix:** Exempt approve/reject from editable suppression when
  `availability.hasApproval` is true, and/or blur the composer on send.
- **Suggested command:** harden

### [P1] Chat/transport error messages are never shown
- **What:** `chatStore` writes `state.error` on `send`/`stop`/`decide`/`undoTurn`,
  but no component reads it; `StatusBar` renders only the word "Error".
- **Why it matters:** Violates the PRODUCT voice ("errors say what happened and
  what to do next"). A failed provider call shows zero diagnostic.
- **Fix:** Render `state.error` as a dismissible `role="alert"` banner with the
  message and a retry/next-step affordance.
- **Suggested command:** clarify

### [P1] Light-theme status badge text sits below AA
- **What:** `Badge` tones `success`/`warning`/`running` render status text on the
  12%-alpha `-bg` wash. Measured from the light tokens: `running` 3.80:1 on its
  wash (4.44:1 even on white), `warning` 3.89:1, `success` 4.29:1 — all under
  4.5:1 for the 12 px normal text these badges use. Dark mode passes.
- **Why it matters:** "Running" and "Waiting for approval" are the two most
  safety-relevant states; they become hard to read in the first-class light
  theme.
- **Fix:** Darken the light `--color-success`/`-warning`/`-running` text tokens
  (or lighten their washes) until each hits ≥ 4.5:1 on both page and elevated
  surfaces.
- **Suggested command:** colorize

### [P2] Two of three overlays leak focus
- **What:** `CommandPalette` uses the shared `Dialog` (trap + restore), but
  `SettingsDrawer` and the mobile artifact sheet in `WorkspaceShell` hand-roll
  `role="dialog" aria-modal="true"` with only an Escape listener — Tab walks
  out into the underlying page.
- **Why it matters:** Focus containment is broken for settings (the one place a
  keyboard/SR user configures providers) and the entire mobile artifact panel.
- **Fix:** Route both through the `Dialog` primitive.
- **Suggested command:** harden

### [P2] No live-region announcements for streamed content
- **What:** The conversation list and `TerminalLog` have no `aria-live` and no
  `role="log"`; the only live region is the status dot.
- **Why it matters:** A screen-reader user gets silence while text, code and
  command output stream.
- **Fix:** `role="log"` + `aria-live="polite"` on the message list; a throttled
  polite log on the terminal.
- **Suggested command:** adapt

## Persona Red Flags

**Alex (power user):** `Alt+A`/`Alt+R` dead while focus is in the composer
(P0); `Escape` overloaded as Stop with no non-destructive "defer"; `jumpToArtifactPanel`
uses a brittle `querySelector('[aria-label="Artifacts"] button')`; no `Kbd`
hint near the approval card.

**Sam (keyboard/SR):** streaming conversation and terminal are silent (no
live region); transport errors never announced; light-theme badge text under
AA; no focus trap in settings drawer/mobile sheet; the only `h1` is the brand
mark (no heading for the conversation region or artifact panel); input borders
(`border-border`) are ~1.3:1 against the background — below the 3:1 UI-component
boundary in WCAG 1.4.11.

**Riley (edge cases):** artifact switcher titles truncate at `max-w-[12rem]`
with no tooltip (unrecoverable long names); expanding a huge `ToolCallCard`
result dumps ~4000 chars with no max-height/scroll; `TerminalLog` is a fixed
128 px well that crowds the composer at 390 px and grows unbounded; refresh
mid-approval strands the pending approval (reset to `null`, no recovery
guidance); `CodeViewer` renders full shiki HTML with no virtualization; chat and
artifact empty states are near-identical twins.

## Minor Observations

- Theme toggle (palette command) flips `data-theme` but never writes
  `localStorage["openartifact-theme"]` — theme is lost on reload.
- `versionSelectClass` copy-pasted between `ArtifactPanel` and `VersionDiff`.
- "Revert" (copy-forward, non-destructive) reads as destructive; only the
  tooltip explains it.
- "Cancelled" uses the same neutral tone as "Idle".
- `ConversationMenu` shows title + relative time only (no model/turn count/preview).
- Icon-button `title` tooltips are the only mouse discoverability; absent on touch.
- No copy affordance on terminal log or conversation prose.
- No composer character limit/count.
- Mermaid toolbar (6 controls) and the version/diff row are dense h-9 strips.

## Detector / evidence appendix (Assessment B)

- `pnpm design:check` → `impeccable detect --json apps/web/src`: **exit 0, `[]`** (clean).
- 52 screenshots verified present and non-blank (desktop 1440×900, mobile 390×844;
  dark/light luminance correct; artifact-preview captures intentionally bright).
- Flagged for a human glance: `mermaid-error-dark-desktop.png` bright vs
  `artifact-mermaid-dark-desktop.png` dark (see Design Specificity).
- False positives: none (detector emitted zero findings).

## Questions to Consider

- Should "approve" be a global keystroke, or should it require deliberate focus
  on the card (arrow to it, read the diff, then Enter) — trading speed for safety?
- If the wordmark were removed, would the interface still read as OpenArtifact
  rather than "any coding chat app"?
- Does "what changed" deserve a persistent status-bar chip (e.g. "3 files changed · turn 4")?

---

Questions skipped: unattended run (never ask the user; decisions recorded in
docs/DECISIONS.md).
