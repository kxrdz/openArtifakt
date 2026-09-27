import { useMemo, useState } from "react";

import { downloadText, downloadUrl } from "../../lib/download";
import { Button, DownloadIcon } from "../ui";
import { sanitizeSvg, svgToPngDataUrl } from "./svg";

/**
 * SVG artifact viewer (§12.7, "SVG").
 *
 * Sanitizes the raw SVG with DOMPurify's SVG profile before inlining it (so a
 * `<script>` never runs), and offers export as SVG (the sanitized source) and
 * as PNG (rasterized through a canvas with a size cap). The generated SVG is
 * shown as-is — the app does not restyle artifact content.
 */

export interface SvgViewerProps {
  /** The artifact source: raw SVG markup. */
  code: string;
  /** Artifact title, used for the download filename. */
  title?: string;
}

/** Turn a title into a safe download filename stem. */
function filenameStem(title: string | undefined): string {
  const stem = (title ?? "artifact").toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return stem.replace(/^-+|-+$/g, "") || "artifact";
}

export function SvgViewer({ code, title }: SvgViewerProps) {
  const sanitized = useMemo(() => sanitizeSvg(code), [code]);
  const [exportingPng, setExportingPng] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function exportSvg() {
    downloadText(`${filenameStem(title)}.svg`, sanitized, "image/svg+xml");
  }

  async function exportPng() {
    if (exportingPng) return;
    setExportingPng(true);
    setError(null);
    try {
      const dataUrl = await svgToPngDataUrl(sanitized);
      downloadUrl(`${filenameStem(title)}.png`, dataUrl);
    } catch {
      setError("The SVG could not be exported as PNG.");
    } finally {
      setExportingPng(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-9 shrink-0 items-center justify-between gap-2 border-b border-border px-3">
        <span className="truncate text-xs font-medium text-text-muted">SVG</span>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" onClick={exportSvg}>
            Export SVG
          </Button>
          <Button
            size="sm"
            variant="ghost"
            loading={exportingPng}
            icon={<DownloadIcon className="h-3.5 w-3.5" />}
            onClick={() => void exportPng()}
          >
            PNG
          </Button>
        </div>
      </div>

      {error !== null && (
        <p className="shrink-0 border-b border-border bg-danger-bg px-3 py-1.5 text-xs text-danger">
          {error}
        </p>
      )}

      <div className="min-h-0 flex-1 overflow-auto bg-bg-sunken p-4">
        {/* The sanitized markup is DOMPurify-cleaned SVG: safe to inline. */}
        <div
          aria-label="SVG preview"
          className="flex min-h-full items-center justify-center [&_svg]:max-w-full"
          dangerouslySetInnerHTML={{ __html: sanitized }}
        />
      </div>
    </div>
  );
}
