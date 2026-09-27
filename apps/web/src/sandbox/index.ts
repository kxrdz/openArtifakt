/**
 * Sandbox preview runtime (§6, §12.7): the srcdoc template + import map, the
 * postMessage error/console bridge, and the React/HTML preview frames. React
 * and HTML previews render in `<iframe sandbox="allow-scripts">` (never
 * `allow-same-origin`), one iframe per artifact whose srcdoc is replaced on
 * update, communicating with the parent only through validated `postMessage`.
 */
export { ReactPreview } from "./ReactPreview";
export type { ReactPreviewProps } from "./ReactPreview";
export { HtmlPreview } from "./HtmlPreview";
export type { HtmlPreviewProps } from "./HtmlPreview";
export { PreviewFrame } from "./PreviewFrame";
export { useSandboxBridge } from "./bridge";
export type {
  SandboxBridgeState,
  SandboxError,
  SandboxLog,
  SandboxMessage,
} from "./bridge";
export {
  SANDBOX_ATTRIBUTES,
  TAILWIND_RUNTIME_URL,
  VENDORED_SPECIFIERS,
  VENDOR_IMPORTS,
  buildImportMap,
  buildPreviewDocument,
  buildReactModuleScript,
  injectSandboxBridge,
} from "./template";
