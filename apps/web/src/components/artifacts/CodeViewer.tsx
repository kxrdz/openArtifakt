import { useEffect, useState } from "react";

import { copyText } from "../../lib/clipboard";
import { Button, CopyIcon } from "../ui";
import { highlightCode, normalizeLanguage } from "./highlight";

/**
 * Code artifact viewer (§12.7, "Code").
 *
 * Highlights the source with shiki (themed from the design tokens via the
 * CSS-variables theme), picking the grammar from the artifact's `language`
 * attribute and falling back to plain text for unknown grammars. The raw
 * source stays untouched for the copy button, which always copies exactly what
 * the model produced.
 */

export interface CodeViewerProps {
  /** The artifact source. */
  code: string;
  /** Declared `language` attribute (e.g. `tsx`, `python`); optional. */
  language?: string;
}

export function CodeViewer({ code, language }: CodeViewerProps) {
  const [html, setHtml] = useState("");
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setHtml("");
    setFailed(false);
    highlightCode(code, language)
      .then((result) => {
        if (!cancelled) setHtml(result);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [code, language]);

  async function copy() {
    const ok = await copyText(code);
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-9 shrink-0 items-center justify-between gap-2 border-b border-border px-3">
        <span className="truncate text-xs font-medium text-text-muted">
          {normalizeLanguage(language)}
        </span>
        <Button
          size="sm"
          variant="ghost"
          icon={<CopyIcon className="h-3.5 w-3.5" />}
          onClick={() => void copy()}
        >
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {failed ? (
          <pre className="whitespace-pre-wrap break-words p-4 font-mono text-sm leading-normal text-text">
            {code}
          </pre>
        ) : (
          <div
            // The highlighted markup is shiki-generated (escaped source + span
            // colors via CSS variables); safe to inline.
            dangerouslySetInnerHTML={{ __html: html }}
            className="[&_pre]:m-0 [&_pre]:min-h-full [&_pre]:p-4 [&_pre]:font-mono [&_pre]:text-sm [&_pre]:leading-normal [&_code]:font-mono [&_code]:text-sm"
          />
        )}
      </div>
    </div>
  );
}
