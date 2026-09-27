import { useMemo } from "react";
import { transform } from "sucrase";

import type { SandboxError } from "./bridge";
import { PreviewFrame } from "./PreviewFrame";
import {
  buildCompileErrorScript,
  buildPreviewDocument,
  buildReactModuleScript,
} from "./template";

/**
 * React artifact preview (§6, §12.7).
 *
 * Transpiles the single-file TSX/JSX component in the browser with sucrase
 * (automatic JSX runtime, so the output imports `react/jsx-runtime`) and hands
 * it to {@link PreviewFrame}, which loads it in the sandbox via a blob URL and
 * the import map. A sucrase failure becomes a bridge error, so it surfaces in
 * the same place as runtime errors rather than crashing the panel.
 */

export interface ReactPreviewProps {
  /** The artifact source: a single-file React component with a default export. */
  code: string;
  /** Accessible iframe title. */
  title?: string;
  /** Optional callback so a later feature can lift an error into a note. */
  onSendError?: (error: SandboxError) => void;
}

export function ReactPreview({
  code,
  title = "React preview",
  onSendError,
}: ReactPreviewProps) {
  const srcdoc = useMemo(() => {
    let moduleScript: string;
    try {
      const transpiled = transform(code, {
        transforms: ["typescript", "jsx"],
        jsxRuntime: "automatic",
        production: true,
      }).code;
      moduleScript = buildReactModuleScript(transpiled);
    } catch (error) {
      moduleScript = buildCompileErrorScript(
        error instanceof Error ? error.message : String(error),
      );
    }
    return buildPreviewDocument({ moduleScript, tailwind: true });
  }, [code]);

  return <PreviewFrame srcdoc={srcdoc} title={title} onSendError={onSendError} />;
}
