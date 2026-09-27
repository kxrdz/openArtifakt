/**
 * Monaco setup for the version diff editor (task 7.2).
 *
 * This module is browser-only and heavy: it is always loaded through a
 * dynamic `import("./monacoSetup")` from `VersionDiff`, so the main bundle
 * never pays for it and only the diff view does.
 *
 * Everything is bundled locally (no CDN loader like `@monaco-editor/react`):
 * the editor API plus the diff-editor contribution and a small set of
 * read-only navigation contributions, the lightweight Monarch grammars for
 * the §6 artifact languages (no language-service workers — the diff editor
 * is read-only), and the editor worker as a Vite `?worker` chunk.
 */

import * as monaco from "monaco-editor/editor/editor.api.js";

// Editor contributions the read-only diff editor needs (the curated
// equivalent of the full entry's contribution list).
import "monaco-editor/editor/browser/widget/diffEditor/diffEditor.contribution.js";
import "monaco-editor/editor/contrib/bracketMatching/browser/bracketMatching.js";
import "monaco-editor/editor/contrib/contextmenu/browser/contextmenu.js";
import "monaco-editor/editor/contrib/find/browser/findController.js";
import "monaco-editor/editor/contrib/folding/browser/folding.js";

// Lightweight Monarch grammars (tokenization only — no workers beyond the
// editor worker). Anything not listed here diffs as plaintext (see
// `monacoLanguage` in versionDiff.ts).
import "monaco-editor/languages/definitions/css/register.js";
import "monaco-editor/languages/definitions/html/register.js";
import "monaco-editor/languages/definitions/javascript/register.js";
import "monaco-editor/languages/definitions/markdown/register.js";
import "monaco-editor/languages/definitions/python/register.js";
import "monaco-editor/languages/definitions/shell/register.js";
import "monaco-editor/languages/definitions/sql/register.js";
import "monaco-editor/languages/definitions/typescript/register.js";
import "monaco-editor/languages/definitions/xml/register.js";
import "monaco-editor/languages/definitions/yaml/register.js";

import EditorWorker from "monaco-editor/editor/editor.worker?worker";

import {
  buildDiffThemeData,
  readDiffThemeTokens,
} from "./monacoTheme";

/** The name under which the token-derived theme is registered. */
export const DIFF_EDITOR_THEME = "openartifact-diff";

/** Configure the worker environment once. The workers are bundled locally,
 *  so the diff editor works fully offline. */
let environmentReady = false;
function ensureEnvironment(): void {
  if (environmentReady) return;
  environmentReady = true;
  globalThis.MonacoEnvironment = {
    getWorker: () => new EditorWorker(),
  };
}

/** The active theme's Monaco base (dark is the default, like everywhere). */
function builtinBase(): monaco.editor.BuiltinTheme {
  return document.documentElement.getAttribute("data-theme") === "light"
    ? "vs"
    : "vs-dark";
}

/**
 * (Re)define the token-derived theme and apply it.
 *
 * Called on mount and again whenever `data-theme` flips — token values are
 * re-read from the document root, so the diff editor recolors with the rest
 * of the interface. Idempotent and cheap enough to call per theme change.
 */
export function applyDiffEditorTheme(): void {
  ensureEnvironment();
  monaco.editor.defineTheme(
    DIFF_EDITOR_THEME,
    buildDiffThemeData(readDiffThemeTokens(), builtinBase()),
  );
  monaco.editor.setTheme(DIFF_EDITOR_THEME);
}

export { monaco };
