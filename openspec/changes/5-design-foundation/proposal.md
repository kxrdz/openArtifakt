# Proposal

## Why

Steps 1–4 delivered the engine: canonical types, a fuzz-tested stream parser, four provider adapters, and an agent loop with tools and security. The web app is still a scaffold placeholder. Before any chat, approvals, terminal log or artifacts can be built on top, the interface needs a visual foundation — the design tokens, self-hosted fonts and UI primitives every later feature consumes — plus the empty workspace shell those features live in. This is the step where OpenArtifact gets its own identity instead of looking like a generic AI template (SPEC §7, PRODUCT.md).

## What Changes

- Add **design tokens** as CSS custom properties in `apps/web/src/styles/tokens.css`, with full **light and dark** palettes (tinted neutrals, clear semantic colors for success/warning/danger/running), a type scale, spacing, radius, elevation and motion. Tokens are consumed by the Tailwind config; components reference semantic names, never raw colors or sizes.
- **Self-host fonts** under `apps/web/public/fonts/` (no font CDN at runtime) with `@font-face` rules and `--font-sans` / `--font-mono` tokens.
- Add **UI primitives** in `apps/web/src/components/ui/` (button, icon button, badge, status dot, kbd, spinner, focus-visible ring) built on the tokens, keyboard-operable with visible focus rings.
- Build the **empty workspace shell**: a resizable split pane (chat left, artifact panel right), a top status bar, a collapsible terminal log, a settings trigger, and empty states — collapsing to a full-screen artifact sheet below 900 px.
- Write **`DESIGN.md`** documenting the visual system (surfaces, tokens, typography, motion, accessibility rules) so features 6–9 build on it.
- Add the **`pnpm screenshots`** script (Playwright) that captures the shell at 1440×900 and 390×844 in both themes into `docs/screenshots/`.

## Capabilities

### New Capabilities

- `design-foundation`: the design-token system (light + dark), self-hosted fonts, the shared UI primitives, and the empty workspace shell with resizable panes and responsive behavior — including the `pnpm screenshots` capture script and the no-hard-coded-colors rule.

### Modified Capabilities

_None._

## Impact

- `apps/web`: new `src/styles/tokens.css` (replaces the placeholder), self-hosted fonts in `public/fonts/`, new `src/components/ui/` and shell components, rewritten `src/App.tsx`; `tailwind.config.js` maps tokens to the Tailwind theme; `index.html` gains the theme bootstrap.
- Root `package.json`: new `screenshots` script; `e2e/` gains a screenshots spec/runner.
- New root file `DESIGN.md` (the visual system contract for features 6–9).
- No changes to `packages/core`, `packages/shared` or the server; the shell is a static, token-driven UI with no backend dependency.
