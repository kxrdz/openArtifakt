# Design

## Context

Steps 1–4 are done: the monorepo is scaffolded (strict TS, ESLint/Prettier, Vitest, Playwright + axe), and `packages/core` + `packages/shared` deliver the canonical message model, the stream parser, the four provider adapters, and the agent loop with tools and security. `apps/web` is a single placeholder `App.tsx` rendering a `<h1>`, with an empty `styles/tokens.css`, a default `tailwind.config.js` (`extend: {}`), and `apps/web` depending only on `react`/`react-dom`. `pnpm design:check` runs `impeccable detect --json apps/web/src` (exit 2 = findings). Motivation and requirements: proposal.md and specs/design-foundation.

Constraints that shape the approach:

- This is the **design foundation** step: features 6–9 build every surface on top of it, so the token contract and primitives must be stable and semantic from day one.
- `PRODUCT.md` fixes the audience (developers, long sessions, split attention, glanceability), the constraints (local-first, self-hosted fonts, dark-mode-first, WCAG 2.2 AA, React 18 + Tailwind + CSS-variable tokens), and the voice (plain, calm, no hype, no emoji in chrome).
- `SPEC §7` defines the surfaces to shape: workspace shell, chat pane, tool-call/approval cards, terminal log, artifact panel, settings drawer, empty/error states.
- `pnpm check` must stay green after every task; `pnpm design:check` runs the Impeccable detector, and the craft floor (`.pi/skills/impeccable/reference/craft-floor.md`) bans generic "AI app" habits (gradient text, card-grid hero layouts, decorative glass, hard offset shadows, gray-on-gray text, emoji-as-icons).
- No hard-coded colors or font sizes outside `tokens.css`.

## Goals / Non-Goals

**Goals:**

- A complete token system (color light+dark, type, spacing, radius, elevation, motion) as CSS variables, mapped 1:1 into the Tailwind theme so every component writes semantic classes (`bg-bg`, `text-text-secondary`, `border-border`) and nothing hard-codes a color.
- Self-hosted fonts (sans for UI, mono for code/paths/terminal) with no runtime CDN.
- A small set of genuinely shared UI primitives with visible focus, disabled/loading states, and token-only styling.
- The empty workspace shell (resizable split, status bar, terminal log, settings trigger, empty states) that features 6–9 drop their content into.
- `DESIGN.md` as the durable visual-system contract, and a `pnpm screenshots` script for visual verification in both themes and viewports.

**Non-Goals:**

- Chat messages, tool/approval cards, terminal *content*, artifact renderers, settings *content*, versions/diff/undo (features 6–8). The shell exposes empty regions and seams for them, not their logic.
- A settings/theme-toggle UI: theme switching is via the document-root `data-theme` attribute only (feature 8 adds the control).
- Zustand stores or server wiring: the shell is statically themed for this step.
- Restyling user-generated artifacts (SPEC §7: Impeccable governs the app chrome, not the sandboxed artifacts).

## Decisions

- **Mode is Operate, not Persuade.** This is a tool the user runs for hours beside an editor and terminal. The visual world prioritizes scanability, calm, and consistency over expression. Brand shows in precise details — token tint, type, focus ring, motion — not in decorative flourishes. _Alternative: a bolder "product page" look — wrong register for a dense tool._
- **Visual world: a quiet, "instrument" aesthetic.** Dark-mode-first, near-black indigo-tinted neutrals, one restrained indigo accent, semantic colors only for status. The identity is "a precise instrument for code," expressed through tinted neutrals (never pure gray), a clear type scale, and a consistent 4 px spatial grid. Nothing imitates a commercial AI product's look. _Alternative: teal/emerald "terminal green" cliché, or a high-chroma gradient brand — both read as generic AI/terminal theming._
- **Tokens are CSS variables consumed by Tailwind, not Tailwind-config values.** `tokens.css` owns `--color-*`, `--text-*`, `--space-*`, `--radius-*`, `--shadow-*`, `--duration-*`; `tailwind.config.js` maps semantic names to `var(--…)` so theme switching is a one-attribute change (`data-theme`) with zero config rebuild. _Alternative: two Tailwind configs or `dark:` variants everywhere — harder to verify "no hard-coded colors" and to add themes later._
- **Semantic token naming, two layers.** A palette layer (`--color-*` raw values per theme) and a semantic layer (`--color-bg`, `--color-bg-elevated`, `--color-text`, `--color-text-secondary`, `--color-accent`, `--color-success/-warning/-danger/-running` plus soft `-bg` badge variants). Components use only the semantic layer. _Alternative: a single layer of `--surface-1..n` — the status/semantic axis needs named roles anyway._
- **Tinted neutrals with an indigo cast.** Neutrals are HSL values tilted toward indigo (e.g. dark bg ≈ `hsl(222 24% 6%)`), so "gray" text on "gray" surfaces never reads flat; secondary text is tinted from the foreground hue, never pure gray (craft-floor rule). Contrast targets ≥4.5:1 for body/secondary text in both themes. _Alternative: pure neutral grays — fails the craft floor's "never gray" rule and looks like a default template._
- **Theme mechanism = `data-theme` on `<html>`.** `:root` holds the **dark** values (dark is the default and first-class), `[data-theme="light"]` overrides. A tiny inline bootstrap in `index.html` sets the attribute before paint to avoid a flash: a stored `localStorage` preference wins, otherwise it defaults to **dark** (PRODUCT: dark first-class). The settings drawer (feature 8) persists the choice. _Alternative: class `theme-dark`/`theme-light` — attribute is self-describing and easier for the screenshot script to set; keying off `prefers-color-scheme` instead — conflicts with the spec's explicit "default dark" requirement._
- **Fonts: IBM Plex Sans (UI) + IBM Plex Mono (code/paths/terminal).** Both are SIL OFL (self-hostable, no CDN), pair as a family, and have the calm, precise character a developer tool needs without aping another AI product's face. Files are vendored into `apps/web/public/fonts/` (woff2 subsets) and referenced by `@font-face`. `--font-sans` and `--font-mono` tokens feed Tailwind's `fontFamily`. _Alternative: Inter (ubiquitous/featureless) or JetBrains Mono (strong code face but a branded name); IBM Plex gives identity without losing legibility in long sessions._
- **Type scale: dense but calm, 14 px base.** A developer tool runs dense content; base UI text is 14 px with a slightly taller 1.6 line-height, a `--text-xs`(12)/`--text-sm`(13) micro tier for metadata and status, and display sizes capped well below the 6rem floor. Mono is reserved for code, paths and terminal output only (PRODUCT constraint). _Alternative: 16 px base — friendlier but wastes the density this audience already works in._
- **Elevation = offset + soft blur, never a colored halo.** `--shadow-1/2/3` are the only shadow tokens, used for the settings drawer, popovers and the raised artifact panel on mobile. The split divider uses a border + hover accent, not a shadow. _Alternative: heavy neobrutalist offsets — wrong register for this product._
- **Motion: one authored moment.** One `--ease-out` exponential cubic-bezier and three durations (`--duration-fast/normal/slow`) tokenize motion; the only entrance animation this step ships is the panel/sheet transition, and `prefers-reduced-motion` collapses durations to 0. _Alternative: per-component keyframes scattered around — drift risk the detector won't catch._
- **Focus ring is a token.** `--ring-focus` is a two-layer ring (background gap + accent) applied via a shared `focus-visible` utility, so keyboard focus is visible everywhere without per-component CSS. _Alternative: browser default outline — fails the "visible focus" requirement and the "browser surfaces" craft-floor check._
- **Primitives are a minimal, semantic set.** `Button` (variant/loading/disabled), `IconButton`, `Badge` (status variants), `StatusDot` (running/idle/error pulse), `Kbd`, `Spinner`, and a `focus-visible` ring helper. Each is a few lines over the tokens; no headless-UI dependency is introduced yet (approval/dialog primitives arrive when features 6/8 need them). _Alternative: pull Radix/headless now — premature for the shell, adds deps before the API is known._
- **Shell layout = CSS grid with a drag-to-resize divider, not a lib.** The split pane is a grid (`grid-cols-[minmax(0,1fr)_auto]`) whose left track width is a state variable driven by a `pointerdown`/`pointermove` divider (keyboard-accessible via arrow keys + `role="separator"` with `aria-orientation`). Below 900 px a media query turns the artifact panel into a fixed full-screen sheet. No `react-resizable-panels` dependency: the requirement is one divider, and a lib would add surface area we don't need yet. _Alternative: `react-resizable-panels` — solid, but heavier than one divider justifies at this step._
- **Screenshots = a dedicated Playwright spec that drives the dev server.** `pnpm screenshots` runs `e2e/screenshots.spec.ts` against a built or dev server, sets `data-theme` per capture, sizes the viewport to 1440×900 and 390×844, and writes `docs/screenshots/<name>-<theme>-<viewport>.png`. It does not run under `pnpm check` (it is a capture tool, not an assertion); the axe e2e suite remains the assertion path. _Alternative: fold captures into `pnpm e2e` — couples a slow, environment-dependent capture to CI._
- **`DESIGN.md` is written from the tokens, not before them.** The change's `design.md` (this file) is the plan; the repo's `DESIGN.md` is produced in the tokens task (1.1) and is the contract features 6–9 read. It records surfaces, the token table, font roles, motion and accessibility rules. _Alternative: write DESIGN.md first and derive tokens — risks documenting values that don't survive implementation._

## Risks / Trade-offs

- [Font files must be vendored, not CDN-referenced] → the fonts task downloads woff2 files once (dev-time) and commits them under `public/fonts/`; if the build machine has no network, that task records a `TODO(blocked)` and falls back to a system font stack, and the blocker is logged in `PROGRESS.md` with the exact fix.
- [Contrast of the "muted" tier on tinted backgrounds] → the muted tier is checked against 4.5:1 in both themes during the tokens task; values are nudged up rather than waived.
- [Resizable divider without a lib] → the divider is a few dozen lines with pointer + keyboard handling; the screenshot pass and a later e2e assertion cover it.
- [Screenshots depend on Playwright browsers being installed] → `pnpm check`'s e2e already requires them, so the build machine is known to have them; the script documents that requirement.
- [Theme flash before the bootstrap runs] → an inline script in `<head>` sets `data-theme` before first paint.

## Migration Plan

- No data or config migration. `tokens.css` is rewritten in place; `tailwind.config.js` gains token mappings; `App.tsx` is replaced by the shell; `index.html` gains the theme bootstrap. Rollback is a revert of the feature branch.

## Open Questions

_None._
