/**
 * Artifact renderers (§6, §12.7).
 *
 * The SVG and Code viewers render inline in the artifact panel (they do not run
 * model output in an iframe — SVG is DOMPurify-sanitized and code is
 * shiki-highlighted). React and HTML previews live in `sandbox/` because they
 * need the isolated iframe runtime.
 */
export { SvgViewer } from "./SvgViewer";
export type { SvgViewerProps } from "./SvgViewer";
export { VersionDiff } from "./VersionDiff";
export type { VersionDiffProps } from "./VersionDiff";
export {
  defaultDiffPair,
  monacoLanguage,
  orderedPair,
  resolveDiffPair,
  versionNumbers,
  withVersionPick,
} from "./versionDiff";
export type { DiffableVersion, VersionPair } from "./versionDiff";
export { buildDiffThemeData, cssColorToMonaco } from "./monacoTheme";
export type { DiffThemeTokens } from "./monacoTheme";
export { CodeViewer } from "./CodeViewer";
export type { CodeViewerProps } from "./CodeViewer";
export { MermaidViewer } from "./MermaidViewer";
export { MermaidError } from "./MermaidViewer";
export type { MermaidViewerProps, MermaidErrorProps } from "./MermaidViewer";
export {
  buildThemeVariables,
  mermaidErrorLine,
  mermaidToPngDataUrl,
  MermaidRenderError,
  readMermaidTokens,
  renderMermaid,
  toRenderError,
} from "./mermaid";
export type { MermaidThemeTokens } from "./mermaid";
export { highlightCode, normalizeLanguage } from "./highlight";
export { sanitizeSvg, svgDimensions, svgToPngDataUrl, PNG_MAX_DIMENSION } from "./svg";
