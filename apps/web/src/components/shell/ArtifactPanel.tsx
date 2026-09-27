import { PanelRightIcon } from "../ui";

/**
 * Empty artifact state, shared by the desktop side-by-side panel and the
 * narrow-screen sheet.
 */
export function ArtifactEmptyState() {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
      <span className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-bg-elevated text-text-muted">
        <PanelRightIcon className="h-5 w-5" />
      </span>
      <h2 className="text-md font-semibold text-text">No artifact open</h2>
      <p className="max-w-sm text-sm text-text-secondary">
        React, HTML, SVG, Mermaid and code output appear here with a version
        history you can diff and revert.
      </p>
    </div>
  );
}

/**
 * The desktop artifact panel: a slim header (switcher and version dropdown
 * arrive in features 7–8) over the empty state.
 */
export function ArtifactPanel() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-9 shrink-0 items-center border-b border-border px-3">
        <h2 className="text-xs font-medium text-text-secondary">Artifacts</h2>
      </div>
      <ArtifactEmptyState />
    </div>
  );
}
