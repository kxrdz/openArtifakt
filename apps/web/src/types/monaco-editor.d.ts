/**
 * Type shim for the curated Monaco import.
 *
 * `monacoSetup.ts` imports only the editor API and the lightweight Monarch
 * grammars from `monaco-editor/editor/editor.api.js` (not the full package
 * entry, which pulls in every language service). The package's exports map
 * has no `types` condition for that subpath, so this ambient declaration
 * re-exports the package's own types for it.
 */
declare module "monaco-editor/editor/editor.api.js" {
  export * from "monaco-editor";
}
