# Tasks

## 1. Design tokens

- [x] 1.1 Write `apps/web/src/styles/tokens.css` with the full light+dark token set (semantic color roles incl. success/warning/danger/running and soft badge variants, type scale, spacing, radius, elevation, motion, focus ring) as CSS custom properties — `:root` holds dark values, `[data-theme="light"]` overrides — and map them into `tailwind.config.js` (colors, fontFamily, fontSize, borderRadius, boxShadow, spacing, transitionDuration/timingFunction) so components consume `var(--…)`-backed semantic names. Add the theme bootstrap to `apps/web/index.html` (inline script sets `data-theme` from `localStorage`/`prefers-color-scheme`, default dark). Write the first full cut of `DESIGN.md` (surfaces, token table, font roles, motion + accessibility rules). Verify: `pnpm design:check` passes and `rg` shows no raw color/font-size literals in `apps/web/src` outside `tokens.css`.

## 2. Self-hosted fonts

- [ ] 2.1 Vendor IBM Plex Sans (UI) and IBM Plex Mono (code/paths/terminal) woff2 files into `apps/web/public/fonts/` and add `@font-face` rules + `--font-sans`/`--font-mono` tokens in `tokens.css` so Tailwind's `fontFamily` resolves them; confirm no remote font URL exists anywhere and the app renders both faces offline. Verify: `pnpm build` (web) succeeds, `pnpm design:check` passes. If the build machine cannot download fonts, record the blocker in `docs/PROGRESS.md` with the exact fix and fall back to a system stack behind `TODO(blocked)`.

## 3. UI primitives

- [ ] 3.1 Create `apps/web/src/components/ui/` primitives built on the tokens — `Button` (variants, loading, disabled), `IconButton`, `Badge` (status variants), `StatusDot`, `Kbd`, `Spinner`, and a shared focus-visible ring — all keyboard-operable with visible focus, and export them from a `components/ui/index.ts`; add a small `ui`-primitives screen used only for the screenshots pass (or exercise them in the shell). Verify: `pnpm design:check` passes, no hard-coded colors/font sizes.

## 4. Workspace shell

- [ ] 4.1 Replace `App.tsx` with the empty workspace shell: CSS-grid split pane (chat left / artifact panel right) with a drag-to-resize divider (pointer + arrow-key `role="separator"`), a top status bar (product mark, agent state, settings trigger), a collapsible terminal-log region, and empty states for chat and artifact panel; below 900 px the artifact panel becomes a full-screen sheet opened from the chat. Verify: `pnpm design:check` passes and `pnpm build` (web) typechecks.

## 5. Screenshots

- [ ] 5.1 Add a Playwright `e2e/screenshots.spec.ts` and a root `pnpm screenshots` script that serve the app, set `data-theme` per capture, and write `docs/screenshots/` at 1440×900 and 390×844 in both light and dark; confirm the images exist in both themes/viewports and `pnpm check` stays green.
