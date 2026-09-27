import { useState } from "react";

import { useArtifactStore } from "../../artifacts";
import type { Artifact } from "../../artifacts";
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
 * never compiled/rendered on every token).
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

/** The content of the latest version (always at least one version). */
function latestContent(artifact: Artifact): string {
  const version = artifact.versions[artifact.versions.length - 1];
  return version?.content ?? "";
}

type Tab = "preview" | "code";

/** Type dispatch: known types to their viewer, unknown types to Code. */
function ArtifactContent({ artifact, tab }: { artifact: Artifact; tab: Tab }) {
  const code = latestContent(artifact);

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

/**
 * The desktop artifact panel: an artifact switcher over Preview/Code tabs and
 * the active renderer (or the empty state before the first artifact).
 */
export function ArtifactPanel() {
  const artifacts = useArtifactStore((state) => state.artifacts);
  const selectedId = useArtifactStore((state) => state.selectedId);
  const selectArtifact = useArtifactStore((state) => state.selectArtifact);
  const [tab, setTab] = useState<Tab>("preview");

  const selected =
    artifacts.find((artifact) => artifact.identifier === selectedId) ??
    artifacts[0] ??
    null;

  if (selected === null) {
    return <ArtifactEmptyState />;
  }

  const previewAvailable = hasPreview(selected);
  // Preview is deferred while streaming: the Code tab updates live and the
  // preview builds once the artifact closes (§6/§12.7).
  const effectiveTab: Tab =
    tab === "preview" && previewAvailable && !selected.incomplete ? "preview" : "code";

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

      {/* Preview/Code tabs + the streaming badge. */}
      <div className="flex h-9 shrink-0 items-center gap-1 border-b border-border px-3">
        {previewAvailable && (
          <Button
            size="sm"
            variant={effectiveTab === "preview" ? "secondary" : "ghost"}
            aria-pressed={effectiveTab === "preview"}
            disabled={selected.incomplete}
            title={
              selected.incomplete
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
        {selected.incomplete && (
          <Badge tone="running" className="ml-auto">
            <StatusDot tone="running" pulse className="h-1.5 w-1.5" />
            Streaming
          </Badge>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        <ArtifactContent artifact={selected} tab={effectiveTab} />
      </div>
    </div>
  );
}
