# Tasks

## 1. Command registry and shortcut hook

- [ ] 1.1 Add `apps/web/src/components/command/commands.ts` (a declarative command registry: `{ id, label, hint?, shortcut?, run, when? }`) and a `useKeyboardShortcuts` hook that binds shortcuts on a window-level keydown with Mod detection (Meta on macOS, Ctrl elsewhere), an input-field guard (only `Escape` and `Mod+K` fire inside text inputs/contenteditables), and `preventDefault()` on handled bindings. Verify web unit tests (hook fires commands, ignores keys inside inputs, Escape always works) and `pnpm --filter @openartifact/web build`.

## 2. Dialog/overlay primitive

- [ ] 2.1 Add a `Dialog`/`Overlay` primitive to `apps/web/src/components/ui/` with a scrim (`--color-scrim`), focus trap (Tab cycles within, focus restored on close), Escape-to-close, and `prefers-reduced-motion` handling. Verify web unit tests (focus trapped, Escape closes, focus restored) plus `pnpm design:check` and `pnpm --filter @openartifact/web build`.

## 3. Command palette

- [ ] 3.1 Build `CommandPalette` on the Dialog primitive and the command registry, with fuzzy filtering, arrow-key navigation, Enter to run, Escape to close, and a visible focus ring; open it with `Mod+K`. Verify web unit tests (filter, navigate, run, close) plus `pnpm design:check` and `pnpm --filter @openartifact/web build`.

## 4. Wire global shortcuts into the shell

- [ ] 4.1 Wire the registry into the workspace shell and stores: send (`Mod+Enter`), stop (`Escape`), approve/reject (`Alt+A`/`Alt+R`, oldest pending approval), toggle artifact panel (`Mod+\`), toggle terminal log (`Mod+J`), open settings (`Mod+,`), focus chat input (`Mod+I`), with `Kbd` hints on the corresponding controls. Verify web unit tests plus `pnpm design:check` and `pnpm --filter @openartifact/web build`.

## 5. Critique pass

- [ ] 5.1 Run the Impeccable critique across all workspace surfaces (two isolated sub-agents: design review and detector/browser evidence), persist the snapshot under `.impeccable/critique/`, and record every intentionally-unfixed finding in `docs/DECISIONS.md` with a reason. Verify the critique snapshot file exists and the priority issues are enumerated in the change notes.

## 6. Audit pass

- [ ] 6.1 Run the Impeccable audit across a11y, performance, theming, responsive and implementation-integrity, and record the findings (severity-tagged) alongside the critique snapshot. Verify an audit summary enumerating P0/P1 issues is written and `pnpm design:check` reflects any detector findings.

## 7. Harden surfaces

- [ ] 7.1 Harden surfaces against edge-case content: long file paths truncate with an ellipsis and a `title`, huge tool/terminal outputs clamp with a visible marker and an expand/collapse toggle, error and rejection text wraps, and `min-w-0`/overflow guards keep every surface from pushing the page wide. Verify web unit tests for the clamping/truncation behavior plus `pnpm design:check` and `pnpm --filter @openartifact/web build`.

## 8. Onboard (first-run states)

- [ ] 8.1 Polish the first-run / no-provider / no-workspace states: the empty chat and artifact states explain what will appear and the next action, and a missing provider shows a clear path into settings to configure one. Verify web unit tests plus `pnpm design:check` and `pnpm --filter @openartifact/web build`.

## 9. Polish pass

- [ ] 9.1 Polish cross-surface consistency (spacing, hierarchy, focus, status readability, copy) to close the remaining critique/audit priority issues, and remove debug output, dead code and unused styles. Verify `pnpm design:check`, `pnpm --filter @openartifact/web build`, and web unit tests stay green.

## 10. Update DESIGN.md

- [ ] 10.1 Rewrite `DESIGN.md` to document every shipped surface (workspace shell, chat, tool/approval cards, terminal log, artifact panel with versions and diff, settings drawer, command palette, empty/error states) plus the keyboard-shortcut map and hardened edge-case rules. Verify the document covers each surface named in the design-foundation documentation requirement.

## 11. e2e and screenshots

- [ ] 11.1 Extend e2e so axe runs on every screenshot screen (empty, streaming, pending approval, each artifact type, Mermaid error, settings drawer, command palette) and asserts zero serious or critical violations. Verify `pnpm e2e`.
- [ ] 11.2 Refresh `pnpm screenshots` to capture the command palette and any changed surfaces in both themes at 1440×900 and 390×844, and verify `pnpm check` stays green end-to-end (typecheck, lint, unit, design:check, e2e).
