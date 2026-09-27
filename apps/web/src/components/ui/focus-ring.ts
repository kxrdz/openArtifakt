/**
 * Shared focus-visible ring.
 *
 * The class lives in `styles/tokens.css` (`@layer components`) and draws a
 * two-layer ring — a background gap + the accent color — from the `--ring-focus`
 * token. Interactive primitives opt in by adding this class; every other
 * focusable element keeps the global `:focus-visible` outline in the base layer.
 */
export const focusRing = "focus-ring";
