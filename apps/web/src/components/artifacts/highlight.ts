/**
 * Syntax highlighting for the CodeViewer (§12.7, design decision 9).
 *
 * Highlights with shiki, bundled locally and code-split via a dynamic import
 * (the full language set is heavy, so it must never sit on the chat's critical
 * path). The theme is shiki's CSS-variables theme: it emits
 * `var(--color-code-*)` references that resolve against the aliases declared in
 * `styles/tokens.css`, so highlights recolor with light/dark automatically
 * (no literal colors in JS). Unknown languages fall back to plain text.
 */

import type { BundledLanguage, Highlighter } from "shiki";

/** The theme name created below (also passed to `codeToHtml`). */
const THEME_NAME = "openartifact";

/** One highlighter per app lifetime; the full bundle is loaded lazily. */
let highlighterPromise: Promise<Highlighter> | null = null;

function getHighlighter(): Promise<Highlighter> {
  if (highlighterPromise === null) {
    highlighterPromise = (async () => {
      const { createHighlighter, createCssVariablesTheme } = await import("shiki");
      const theme = createCssVariablesTheme({
        name: THEME_NAME,
        variablePrefix: "--color-code-",
      });
      return createHighlighter({ langs: [], themes: [theme] });
    })();
  }
  return highlighterPromise;
}

/** Map a MIME type or common alias to shiki's grammar id. */
const MIME_TO_LANG: Record<string, string> = {
  "image/svg+xml": "xml",
  "application/xml": "xml",
  "text/xml": "xml",
  "text/html": "html",
  "application/json": "json",
  "text/javascript": "javascript",
  "application/javascript": "javascript",
  "text/typescript": "typescript",
  "application/typescript": "typescript",
  "text/css": "css",
  "text/markdown": "markdown",
  "text/x-python": "python",
  "text/x-shellscript": "shellscript",
};

/** Normalize an artifact `language` attribute to a shiki grammar id. */
export function normalizeLanguage(language: string | undefined): string {
  if (language === undefined || language.trim() === "") return "text";
  const trimmed = language.trim().toLowerCase();
  return MIME_TO_LANG[trimmed] ?? trimmed;
}

/**
 * Highlight `code` as `language`, falling back to plain text for a grammar
 * shiki does not know. Resolves to shiki's HTML (`<pre class="shiki">…`).
 */
export async function highlightCode(code: string, language: string | undefined): Promise<string> {
  const highlighter = await getHighlighter();

  let lang = normalizeLanguage(language);
  try {
    if (!highlighter.getLoadedLanguages().includes(lang)) {
      // `lang` comes from an arbitrary artifact `language` attribute, so it is
      // wider than shiki's bundled-language union. The cast is safe: an
      // unknown grammar throws here and falls back to plain text below.
      await highlighter.loadLanguage(lang as BundledLanguage);
    }
  } catch {
    // Unknown grammar (or an unsupported alias): plain text, never a blank box.
    lang = "text";
    if (!highlighter.getLoadedLanguages().includes(lang)) {
      await highlighter.loadLanguage(lang as BundledLanguage);
    }
  }

  return highlighter.codeToHtml(code, { lang, theme: THEME_NAME });
}
