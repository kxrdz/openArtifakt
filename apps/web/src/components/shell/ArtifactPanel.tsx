import { useState } from "react";

import { useArtifactStore } from "../../artifacts";
import type { Artifact, ArtifactVersion } from "../../artifacts";
import { CodeViewer, MermaidViewer, SvgViewer } from "../artifacts";
import { HtmlPreview, ReactPreview } from "../../sandbox";
import { Badge, Button, cn, focusRing, PanelRightIcon, StatusDot } from "../ui";

/**
 * The artifact panel (§12.7, "Artifact panel with switcher and tabs").
 *
 * Reads the artifact store, shows one entry per artifact identifier (with its
 * title), and renders the selected artifact through the type dispatch below.
 * Preview/Code tabs split the visual render from the raw source; while an
 * artifact is still streaming the Code tab updates live and the Preview is
 * deferred until it closes (so a partial React component or Mermaid diagram is
 * never compiled/rendered on every token). The version dropdown selects any
 * stored version — pinning an older one never removes the newer ones, and
 * selecting the latest returns to following it as versions arrive.
 */

/** Empty artifact state, shared by the desktop side-by-side panel and the
 * narrow-screen sheet. */
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

const REACT_TYPE = "application/vnd.react";
const HTML_TYPE = "text/html";
const SVG_TYPE = "image/svg+xml";
const MERMAID_TYPE = "application/vnd.mermaid";
const CODE_TYPE = "application/vnd.code";

/** The five known artifact types that have a visual preview tab. */
function hasPreview(artifact: Artifact): boolean {
  return (
    artifact.artifactType === REACT_TYPE ||
    artifact.artifactType === HTML_TYPE ||
    artifact.artifactType === SVG_TYPE ||
    artifact.artifactType === MERMAID_TYPE
  );
}

/** The language for the Code tab, defaulted per known type. */
function codeLanguage(artifact: Artifact): string | undefined {
  switch (artifact.artifactType) {
    case REACT_TYPE:
      return artifact.language ?? "tsx";
    case HTML_TYPE:
      return "html";
    case SVG_TYPE:
      return "xml";
    case MERMAID_TYPE:
      return artifact.language ?? "mermaid";
    case CODE_TYPE:
      return artifact.language;
    default:
      // Unknown type → rendered as a code artifact (§6, "Unknown types").
      return artifact.language;
  }
}

/**
 * The version to render: the pinned one when the user selected it, otherwise
 * the latest (which keeps following new versions while streaming).
 */
function resolveVersion(
  artifact: Artifact,
  pinned: number | undefined,
): ArtifactVersion {
  // The parser always creates at least one version; the fallback keeps the
  // type honest if an empty list ever slips through.
  const latest =
    artifact.versions[artifact.versions.length - 1] ?? {
      version: 1,
      content: "",
      incomplete: artifact.incomplete,
    };
  const chosen =
    pinned === undefined
      ? undefined
      : artifact.versions.find((version) => version.version === pinned);
  return chosen ?? latest;
}

type Tab = "preview" | "code";

/** Type dispatch: known types to their viewer, unknown types to Code. */
function ArtifactContent({
  artifact,
  version,
  tab,
}: {
  artifact: Artifact;
  version: ArtifactVersion;
  tab: Tab;
}) {
  const code = version.content;

  if (tab === "code") {
    return <CodeViewer code={code} language={codeLanguage(artifact)} />;
  }

  switch (artifact.artifactType) {
    case REACT_TYPE:
      return <ReactPreview code={code} title={artifact.title} />;
    case HTML_TYPE:
      return <HtmlPreview code={code} title={artifact.title} />;
    case SVG_TYPE:
      return <SvgViewer code={code} title={artifact.title} />;
    case MERMAID_TYPE:
      return <MermaidViewer code={code} title={artifact.title} />;
    default:
      return <CodeViewer code={code} language={codeLanguage(artifact)} />;
  }
}

/** Version-dropdown control styling, consistent with the settings fields. */
const versionSelectClass = cn(
  "h-7 rounded-md border border-border bg-bg-sunken px-1.5 font-sans text-xs font-medium text-text",
  focusRing,
);

/**
 * The desktop artifact panel: an artifact switcher over Preview/Code tabs and
 * the active renderer (or the empty state before the first artifact).
 */
export function ArtifactPanel() {
  const artifacts = useArtifactStore((state) => state.artifacts);
  const selectedId = useArtifactStore((state) => state.selectedId);
  const selectArtifact = useArtifactStore((state) => state.selectArtifact);
  const versionSelections = useArtifactStore((state) => state.versionSelections);
  const selectVersion = useArtifactStore((state) => state.selectVersion);
  const [tab, setTab] = useState<Tab>("preview");

  const selected =
    artifacts.find((artifact) => artifact.identifier === selectedId) ??
    artifacts[0] ??
    null;

  if (selected === null) {
    return <ArtifactEmptyState />;
  }

  const version = resolveVersion(
    selected,
    versionSelections[selected.identifier],
  );
  const latestVersion = selected.versions[selected.versions.length - 1];
  const viewingLatest = version.version === latestVersion?.version;

  const previewAvailable = hasPreview(selected);
  // Preview is deferred while the *viewed* version is streaming: the Code tab
  // updates live and the preview builds once the artifact closes (§6/§12.7).
  // Older versions are always complete, so they preview even while a newer
  // version streams.
  const effectiveTab: Tab =
    tab === "preview" && previewAvailable && !version.incomplete
      ? "preview"
      : "code";

  return (
    <div className="flex h-full flex-col">
      {/* Artifact switcher — one entry per identifier, in first-appearance order. */}
      <div
        role="group"
        aria-label="Artifacts"
        className="flex h-9 shrink-0 items-center gap-1 overflow-x-auto border-b border-border px-2"
      >
        {artifacts.map((artifact) => {
          const active = artifact.identifier === selected.identifier;
          return (
            <button
              key={artifact.identifier}
              type="button"
              aria-pressed={active}
              className={cn(
                "flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors duration-fast",
                focusRing,
                active
                  ? "bg-bg-hover text-text"
                  : "text-text-secondary hover:bg-bg-hover hover:text-text",
              )}
              onClick={() => selectArtifact(artifact.identifier)}
            >
              {artifact.incomplete && (
                <StatusDot
                  tone="running"
                  pulse
                  className="h-1.5 w-1.5"
                />
              )}
              <span className="max-w-[12rem] truncate">{artifact.title}</span>
            </button>
          );
        })}
      </div>

      {/* Preview/Code tabs, the version dropdown, and the streaming badge. */}
      <div className="flex h-9 shrink-0 items-center gap-1 border-b border-border px-3">
        {previewAvailable && (
          <Button
            size="sm"
            variant={effectiveTab === "preview" ? "secondary" : "ghost"}
            aria-pressed={effectiveTab === "preview"}
            disabled={version.incomplete}
            title={
              version.incomplete
                ? "Builds once the artifact finishes streaming"
                : undefined
            }
            onClick={() => setTab("preview")}
          >
            Preview
          </Button>
        )}
        <Button
          size="sm"
          variant={effectiveTab === "code" ? "secondary" : "ghost"}
          aria-pressed={effectiveTab === "code"}
          onClick={() => setTab("code")}
        >
          Code
        </Button>
        {/* Version dropdown (§12.8): any stored version; the latest is marked
            and follows new versions until an older one is pinned. */}
        <select
          aria-label={`Version of ${selected.title}`}
          title="Artifact version"
          className={cn(versionSelectClass, "ml-auto")}
          value={version.version}
          onChange={(event) =>
            selectVersion(selected.identifier, Number(event.target.value))
          }
        >
          {selected.versions.map((candidate) => (
            <option key={candidate.version} value={candidate.version}>
              v{candidate.version}
              {candidate.version === latestVersion?.version ? " (latest)" : ""}
            </option>
          ))}
        </select>
        {!viewingLatest && <Badge tone="neutral">Viewing older version</Badge>}
        {version.incomplete && (
          <Badge tone="running">
            <StatusDot tone="running" pulse className="h-1.5 w-1.5" />
            Streaming
          </Badge>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        <ArtifactContent artifact={selected} version={version} tab={effectiveTab} />
      </div>
    </div>
  );
}
