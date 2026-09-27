import { useMemo } from "react";

import type { SandboxError } from "./bridge";
import { PreviewFrame } from "./PreviewFrame";
import { injectSandboxBridge } from "./template";

/**
 * HTML artifact preview (§6, §12.7).
 *
 * Renders the artifact's complete document as-is inside the sandbox, with the
 * runtime bridge injected after `<head>` so runtime errors and console output
 * still reach the parent. No import map or Tailwind runtime here: an HTML
 * artifact supplies its own markup and styles.
 */

export interface HtmlPreviewProps {
  /** The artifact source: a complete HTML document. */
  code: string;
  /** Accessible iframe title. */
  title?: string;
  /** Optional callback so a later feature can lift an error into a note. */
  onSendError?: (error: SandboxError) => void;
}

export function HtmlPreview({
  code,
  title = "HTML preview",
  onSendError,
}: HtmlPreviewProps) {
  const srcdoc = useMemo(() => injectSandboxBridge(code), [code]);

  return <PreviewFrame srcdoc={srcdoc} title={title} onSendError={onSendError} />;
}
