import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

import { useActiveTheme } from "../../hooks/useTheme";
import { copyText } from "../../lib/clipboard";
import { downloadText, downloadUrl } from "../../lib/download";
import { Badge, Button, cn, IconButton } from "../ui";
import { CheckIcon, CopyIcon, DownloadIcon, ResetIcon, ZoomInIcon, ZoomOutIcon } from "../ui";
import {
  mermaidToPngDataUrl,
  renderMermaid,
  toRenderError,
  type MermaidRenderError,
} from "./mermaid";

/**
 * Mermaid artifact viewer (§12.7, "Mermaid").
 *
 * Renders a Mermaid diagram with the shared {@link renderMermaid} helper
 * (strict security, parse-before-render, token-derived colors). The toolbar
 * offers zoom, pan (drag on the diagram), reset view, copy SVG, and download
 * as SVG/PNG. A parse failure renders the source with the error message and
 * the offending line highlighted — never a crash.
 */

export interface MermaidViewerProps {
  /** The artifact source: the raw Mermaid diagram text. */
  code: string;
  /** Artifact title, used for the download filename. */
  title?: string;
}

/** Turn a title into a safe download filename stem. */
function filenameStem(title: string | undefined): string {
  const stem = (title ?? "diagram").toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return stem.replace(/^-+|-+$/g, "") || "diagram";
}

const MIN_SCALE = 0.25;
const MAX_SCALE = 4;
const ZOOM_STEP = 1.25;

/** Drag state for panning the diagram with a pointer. */
interface DragState {
  startX: number;
  startY: number;
  originX: number;
  originY: number;
}

export function MermaidViewer({ code, title }: MermaidViewerProps) {
  const theme = useActiveTheme();
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<MermaidRenderError | null>(null);
  const [copied, setCopied] = useState(false);
  const [exportingPng, setExportingPng] = useState(false);
  const [pngError, setPngError] = useState<string | null>(null);
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragRef = useRef<DragState | null>(null);

  useEffect(() => {
    let cancelled = false;
    setSvg(null);
    setError(null);
    setPngError(null);
    setScale(1);
    setPan({ x: 0, y: 0 });
    renderMermaid(code, theme)
      .then((rendered) => {
        if (!cancelled) setSvg(rendered);
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(toRenderError(reason));
      });
    return () => {
      cancelled = true;
    };
  }, [code, theme]);

  const zoomIn = () => setScale((current) => Math.min(MAX_SCALE, current * ZOOM_STEP));
  const zoomOut = () => setScale((current) => Math.max(MIN_SCALE, current / ZOOM_STEP));
  const resetView = () => {
    setScale(1);
    setPan({ x: 0, y: 0 });
  };

  async function copySvg() {
    if (svg === null) return;
    const ok = await copyText(svg);
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    }
  }

  function downloadSvg() {
    if (svg === null) return;
    downloadText(`${filenameStem(title)}.svg`, svg, "image/svg+xml");
  }

  async function downloadPng() {
    if (svg === null || exportingPng) return;
    setExportingPng(true);
    setPngError(null);
    try {
      const dataUrl = await mermaidToPngDataUrl(svg);
      downloadUrl(`${filenameStem(title)}.png`, dataUrl);
    } catch {
      setPngError("The diagram could not be exported as PNG.");
    } finally {
      setExportingPng(false);
    }
  }

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    dragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      originX: pan.x,
      originY: pan.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (drag === null) return;
    setPan({
      x: drag.originX + (event.clientX - drag.startX),
      y: drag.originY + (event.clientY - drag.startY),
    });
  }

  function onPointerEnd() {
    dragRef.current = null;
  }

  const canTransform = svg !== null && error === null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-9 shrink-0 items-center justify-between gap-2 border-b border-border px-3">
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate text-xs font-medium text-text-muted">Mermaid</span>
          {error !== null && <Badge tone="danger">Syntax error</Badge>}
        </span>
        <div className="flex items-center gap-1">
          <IconButton
            aria-label="Zoom out"
            size="sm"
            icon={<ZoomOutIcon className="h-3.5 w-3.5" />}
            onClick={zoomOut}
            disabled={!canTransform}
          />
          <IconButton
            aria-label="Zoom in"
            size="sm"
            icon={<ZoomInIcon className="h-3.5 w-3.5" />}
            onClick={zoomIn}
            disabled={!canTransform}
          />
          <IconButton
            aria-label="Reset view"
            size="sm"
            icon={<ResetIcon className="h-3.5 w-3.5" />}
            onClick={resetView}
            disabled={!canTransform}
          />
          <span aria-hidden="true" className="mx-1 h-4 w-px bg-border" />
          <Button
            size="sm"
            variant="ghost"
            icon={copied ? <CheckIcon className="h-3.5 w-3.5" /> : <CopyIcon className="h-3.5 w-3.5" />}
            onClick={() => void copySvg()}
            disabled={svg === null}
          >
            {copied ? "Copied" : "Copy SVG"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={downloadSvg}
            disabled={svg === null}
          >
            SVG
          </Button>
          <Button
            size="sm"
            variant="ghost"
            loading={exportingPng}
            icon={<DownloadIcon className="h-3.5 w-3.5" />}
            onClick={() => void downloadPng()}
            disabled={svg === null}
          >
            PNG
          </Button>
        </div>
      </div>

      {pngError !== null && (
        <p className="shrink-0 border-b border-border bg-danger-bg px-3 py-1.5 text-xs text-danger">
          {pngError}
        </p>
      )}

      <div className="min-h-0 flex-1 overflow-hidden bg-bg-sunken">
        {error !== null ? (
          <MermaidError source={code} message={error.message} line={error.line} />
        ) : (
          <div
            className="h-full w-full cursor-grab active:cursor-grabbing"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerEnd}
            onPointerCancel={onPointerEnd}
          >
            <div
              role="img"
              aria-label="Mermaid diagram"
              className="origin-top-left"
              style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})` }}
              dangerouslySetInnerHTML={{ __html: svg ?? "" }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Mermaid syntax-error state (§12.7, "invalid Mermaid shows an inline error").
 *
 * Shows the error message above the raw source with the offending line
 * highlighted. Exported separately so the error presentation is unit-testable
 * without loading mermaid.
 */
export interface MermaidErrorProps {
  /** The raw diagram source, shown for the user to fix. */
  source: string;
  /** The parse/render error message. */
  message: string;
  /** The offending 1-based line, or undefined when unknown. */
  line?: number;
}

export function MermaidError({ source, message, line }: MermaidErrorProps) {
  const lines = source.split("\n");
  return (
    <div className="flex h-full min-h-0 flex-col">
      <p className="shrink-0 border-b border-border bg-danger-bg px-3 py-1.5 font-mono text-xs text-danger">
        {message}
      </p>
      <div className="min-h-0 flex-1 overflow-auto py-2 font-mono text-sm leading-normal">
        {lines.map((text, index) => {
          const lineNumber = index + 1;
          const offending = line !== undefined && lineNumber === line;
          return (
            <div
              key={lineNumber}
              data-line-number={lineNumber}
              data-offending={offending || undefined}
              className={cn(
                "border-l-2 px-3",
                offending ? "border-danger bg-danger-bg" : "border-transparent",
              )}
            >
              <span className="mr-4 inline-block w-8 select-none text-right text-text-faint">
                {lineNumber}
              </span>
              <span className="whitespace-pre">{text === "" ? " " : text}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
