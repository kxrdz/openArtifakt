/**
 * Token-derived Monaco theme for the diff editor (task 7.2).
 *
 * Monaco's color parser only understands hex, `rgb()` and named keywords —
 * the design tokens are `hsl(…)` strings — so `cssColorToMonaco` converts
 * token values into Monaco-parseable hex. Everything here is pure (module
 * types only, no runtime import of Monaco) so the mapping is unit-testable
 * in Node, mirroring how the shiki and Mermaid themes are built from tokens.
 */

import type * as monacoApi from "monaco-editor";

/** The token values the diff editor's theme and typography are built from. */
export interface DiffThemeTokens {
  /** Code surface (`--color-bg-elevated`, matching the Code viewer). */
  background: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  textFaint: string;
  accent: string;
  accentHover: string;
  success: string;
  successBg: string;
  warning: string;
  danger: string;
  dangerBg: string;
  border: string;
  selection: string;
  /** Resolved monospace font stack (`--font-mono`). */
  fontFamily: string;
  /** The code font size in px (derived from `--text-sm`). */
  fontSizePx: number;
}

/**
 * Convert a CSS color into a form Monaco can parse.
 *
 * Handles the token formats (`hsl(H S% L%)` and `hsl(H S% L% / A)`, plus the
 * legacy comma forms) and passes already-parseable values (`#…`, `rgb()`)
 * through. Returns null for anything else so callers can skip the color and
 * let Monaco fall back to its base theme.
 */
export function cssColorToMonaco(color: string): string | null {
  const trimmed = color.trim();
  if (trimmed === "") return null;
  if (trimmed.startsWith("#") || trimmed.startsWith("rgb")) return trimmed;

  const match = trimmed.match(
    /^hsla?\(\s*(-?[\d.]+)(?:deg)?[,\s]+(-?[\d.]+)%[,\s]+(-?[\d.]+)%(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/i,
  );
  if (match === null) return null;

  const hue = Number(match[1]);
  const saturation = Number(match[2]) / 100;
  const lightness = Number(match[3]) / 100;
  let alpha = 1;
  const rawAlpha = match[4];
  if (rawAlpha !== undefined) {
    alpha = rawAlpha.endsWith("%")
      ? Number(rawAlpha.slice(0, -1)) / 100
      : Number(rawAlpha);
  }
  if (
    !Number.isFinite(hue) ||
    !Number.isFinite(saturation) ||
    !Number.isFinite(lightness) ||
    !Number.isFinite(alpha)
  ) {
    return null;
  }

  // CSS Color 4 hue-to-RGB (https://www.w3.org/TR/css-color-4/#hsl-to-rgb).
  const channel = (offset: number): number => {
    const k = (((offset + hue / 30) % 12) + 12) % 12;
    const a = saturation * Math.min(lightness, 1 - lightness);
    return lightness - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
  };
  const byte = (value: number): string =>
    Math.round(Math.min(1, Math.max(0, value)) * 255)
      .toString(16)
      .padStart(2, "0");

  const hex = `#${byte(channel(0))}${byte(channel(8))}${byte(channel(4))}`;
  const clampedAlpha = Math.min(1, Math.max(0, alpha));
  return clampedAlpha >= 1 ? hex : `${hex}${byte(clampedAlpha)}`;
}

/** Build the standalone diff-editor theme from token values (pure). */
export function buildDiffThemeData(
  tokens: DiffThemeTokens,
  base: monacoApi.editor.BuiltinTheme,
): monacoApi.editor.IStandaloneThemeData {
  // Skip unparseable values entirely so Monaco keeps its base-theme fallback.
  const color = (value: string): string | undefined => cssColorToMonaco(value) ?? undefined;
  const rule = (
    token: string,
    value: string,
  ): monacoApi.editor.ITokenThemeRule | null =>
    color(value) === undefined ? null : { token, foreground: color(value) };

  // Token colors mirror the shiki CSS-variables mapping in tokens.css.
  const rules = [
    rule("comment", tokens.textMuted),
    rule("keyword", tokens.accent),
    rule("string", tokens.success),
    rule("number", tokens.warning),
    rule("regexp", tokens.warning),
    rule("constant", tokens.warning),
    rule("type", tokens.text),
    rule("type.identifier", tokens.accentHover),
    rule("identifier", tokens.text),
    rule("variable", tokens.text),
    rule("variable.predefined", tokens.textSecondary),
    rule("function", tokens.accentHover),
    rule("parameter", tokens.textSecondary),
    rule("delimiter", tokens.textMuted),
    rule("tag", tokens.accent),
    rule("attribute.name", tokens.warning),
    rule("attribute.value", tokens.success),
    rule("metatag", tokens.textMuted),
  ].filter((entry): entry is monacoApi.editor.ITokenThemeRule => entry !== null);

  const colors: monacoApi.editor.IColors = {};
  const setColor = (id: string, value: string): void => {
    const converted = color(value);
    if (converted !== undefined) colors[id] = converted;
  };

  setColor("editor.background", tokens.background);
  setColor("editor.foreground", tokens.text);
  setColor("editorLineNumber.foreground", tokens.textFaint);
  setColor("editorLineNumber.activeForeground", tokens.textMuted);
  setColor("editor.selectionBackground", tokens.selection);
  setColor("editor.inactiveSelectionBackground", tokens.selection);
  setColor("editorGutter.background", tokens.background);
  setColor("editorWidget.background", tokens.background);
  setColor("editorWidget.border", tokens.border);
  setColor("editorOverviewRuler.border", tokens.border);
  setColor("diffEditor.border", tokens.border);
  setColor("diffEditor.insertedTextBackground", tokens.successBg);
  setColor("diffEditor.removedTextBackground", tokens.dangerBg);
  setColor("diffEditor.insertedLineBackground", tokens.successBg);
  setColor("diffEditor.removedLineBackground", tokens.dangerBg);
  setColor("diffEditor.insertedCodeBackground", tokens.successBg);
  setColor("diffEditor.removedCodeBackground", tokens.dangerBg);

  return { base, inherit: true, rules, colors };
}

/**
 * Read the diff theme's token values from the document root.
 *
 * The values are re-read whenever the theme is (re)applied so flipping
 * `data-theme` recolors the editor, exactly like the other token-derived
 * viewers. Browser-only by design — never call this from Node tests.
 */
export function readDiffThemeTokens(
  root: Element = document.documentElement,
): DiffThemeTokens {
  const style = getComputedStyle(root);
  const read = (name: string): string => style.getPropertyValue(name).trim();
  // `--text-sm` is rem-based; resolve it against the root font size so
  // Monaco (which takes a px number) tracks the token, not a literal.
  const rootPx = Number.parseFloat(style.fontSize) || 16;
  const textSmRem = Number.parseFloat(read("--text-sm")) || 0.8125;
  return {
    background: read("--color-bg-elevated"),
    text: read("--color-text"),
    textSecondary: read("--color-text-secondary"),
    textMuted: read("--color-text-muted"),
    textFaint: read("--color-text-faint"),
    accent: read("--color-accent"),
    accentHover: read("--color-accent-hover"),
    success: read("--color-success"),
    successBg: read("--color-success-bg"),
    warning: read("--color-warning"),
    danger: read("--color-danger"),
    dangerBg: read("--color-danger-bg"),
    border: read("--color-border"),
    selection: read("--color-selection"),
    fontFamily: read("--font-mono"),
    fontSizePx: Math.round(textSmRem * rootPx),
  };
}
