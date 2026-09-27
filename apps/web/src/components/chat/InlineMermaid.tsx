import { useEffect, useState } from "react";
import type { ReactNode } from "react";

import { useActiveTheme } from "../../hooks/useTheme";
import { useArtifactStore } from "../../artifacts";
import { renderMermaid, toRenderError } from "../artifacts/mermaid";
import type { MermaidRenderError } from "../artifacts/mermaid";
import { MermaidError } from "../artifacts/MermaidViewer";
import { Button, PanelRightIcon } from "../ui";

/**
 * Inline Mermaid diagram (§12.7, "Inline Mermaid").
 *
 * Renders a complete ```mermaid fence in place of the literal fence inside an
 * assistant message. Rendering is debounced 300 ms and only ever happens for
 * complete blocks (the message layer passes complete fences here and keeps
 * still-open fences literal), so a diagram is never re-rendered on every
 * token. Colors come from the active theme's design tokens via the shared
 * {@link renderMermaid} helper, and a parse failure shows the source with the
 * error and offending line instead of crashing the message list. "Open in
 * panel" lifts the source into a Mermaid artifact in the artifact panel.
 */

/** Render debounce (§12.7, "Mermaid freezes": 300 ms, complete blocks only). */
const DEBOUNCE_MS = 300;

export interface InlineMermaidProps {
  /** The raw Mermaid source inside a complete ```mermaid fence. */
  source: string;
  /** Title used when the diagram is lifted into the artifact panel. */
  title?: string;
}

export function InlineMermaid({ source, title }: InlineMermaidProps) {
  const theme = useActiveTheme();
  const liftToArtifact = useArtifactStore((state) => state.liftToArtifact);
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<MermaidRenderError | null>(null);

  useEffect(() => {
    let cancelled = false;
    setSvg(null);
    setError(null);

    const timer = window.setTimeout(() => {
      void renderMermaid(source, theme)
        .then((rendered) => {
          if (!cancelled) setSvg(rendered);
        })
        .catch((reason: unknown) => {
          if (!cancelled) setError(toRenderError(reason));
        });
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [source, theme]);

  const openInPanel = () => liftToArtifact(source, title);

  let body: ReactNode;
  if (error !== null) {
    body = (
      <div className="h-52 overflow-hidden">
        <MermaidError source={source} message={error.message} line={error.line} />
      </div>
    );
  } else if (svg !== null) {
    body = (
      <div
        role="img"
        aria-label="Mermaid diagram"
        className="overflow-x-auto"
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    );
  } else {
    // While the debounce/render runs, show the raw source so the message
    // keeps its size and never appears empty.
    body = (
      <pre className="overflow-x-auto whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-text-secondary">
        {source}
      </pre>
    );
  }

  return (
    <figure className="my-2 overflow-hidden rounded-lg border border-border bg-bg-elevated">
      <figcaption className="flex h-8 shrink-0 items-center justify-between gap-2 border-b border-border px-3">
        <span className="text-xs font-medium text-text-muted">Diagram</span>
        <Button
          size="sm"
          variant="ghost"
          icon={<PanelRightIcon className="h-3.5 w-3.5" />}
          onClick={openInPanel}
        >
          Open in panel
        </Button>
      </figcaption>
      <div className="p-3">{body}</div>
    </figure>
  );
}
