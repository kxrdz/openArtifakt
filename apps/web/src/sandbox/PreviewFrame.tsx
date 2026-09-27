import { useRef, useState } from "react";

import { Badge, Button, IconButton, TerminalIcon, XIcon } from "../components/ui";
import { useSandboxBridge } from "./bridge";
import type { SandboxError, SandboxLog } from "./bridge";
import { SANDBOX_ATTRIBUTES } from "./template";

/**
 * The shared preview frame (§6, §12.7): one `<iframe sandbox="allow-scripts">`
 * whose `srcdoc` is replaced on every update (the iframe element itself is
 * never remounted), the postMessage bridge that accepts only this iframe's
 * messages, and the error/console surface below the preview.
 */

interface PreviewFrameProps {
  /** The full preview document (replaces the iframe's `srcdoc` on change). */
  srcdoc: string;
  /** Accessible iframe title. */
  title: string;
  /** Optional callback so a later feature can lift an error into a note. */
  onSendError?: (error: SandboxError) => void;
}

export function PreviewFrame({ srcdoc, title, onSendError }: PreviewFrameProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const bridge = useSandboxBridge(iframeRef, srcdoc);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <iframe
        ref={iframeRef}
        title={title}
        sandbox={SANDBOX_ATTRIBUTES}
        srcDoc={srcdoc}
        className="min-h-0 w-full flex-1 border-0 bg-bg-elevated"
      />
      {(bridge.errors.length > 0 || bridge.logs.length > 0) && (
        <PreviewConsole
          errors={bridge.errors}
          logs={bridge.logs}
          onClear={bridge.clear}
          onSendError={onSendError}
        />
      )}
    </div>
  );
}

/** Console-line count cap: console output can stream, the UI stays bounded. */
const MAX_LOG_LINES = 50;

function PreviewConsole({
  errors,
  logs,
  onClear,
  onSendError,
}: {
  errors: SandboxError[];
  logs: SandboxLog[];
  onClear: () => void;
  onSendError?: (error: SandboxError) => void;
}) {
  const [copied, setCopied] = useState(false);
  const latest = errors[errors.length - 1];

  function sendError() {
    if (latest === undefined) return;
    onSendError?.(latest);
    const text = latest.stack ? `${latest.message}\n\n${latest.stack}` : latest.message;
    navigator.clipboard
      ?.writeText(text)
      .then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => {
        // Clipboard unavailable (non-secure context): the callback still fired.
      });
  }

  return (
    <div className="flex shrink-0 flex-col gap-1 border-t border-border bg-bg-sunken px-3 py-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-text-muted">Preview output</span>
        <IconButton
          aria-label="Clear preview output"
          size="sm"
          variant="ghost"
          icon={<XIcon className="h-3.5 w-3.5" />}
          onClick={onClear}
        />
      </div>

      {latest !== undefined && (
        <div className="flex items-start gap-2">
          <Badge tone="danger" className="mt-0.5 shrink-0">
            Error
          </Badge>
          <span className="min-w-0 flex-1 truncate text-xs text-text-secondary">
            {latest.message}
          </span>
          <Button size="sm" variant="ghost" onClick={sendError}>
            {copied ? "Copied" : "Send error to agent"}
          </Button>
        </div>
      )}

      {latest?.stack !== undefined && (
        <details>
          <summary className="cursor-pointer text-xs text-text-muted">
            Stack trace
          </summary>
          <pre className="mt-1 whitespace-pre-wrap break-words rounded-md bg-bg p-2 font-mono text-xs text-text-secondary">
            {latest.stack}
          </pre>
        </details>
      )}

      {logs.length > 0 && (
        <details>
          <summary className="flex cursor-pointer items-center gap-1 text-xs text-text-muted">
            <TerminalIcon className="h-3.5 w-3.5" />
            Console ({logs.length})
          </summary>
          <ul className="mt-1 flex flex-col gap-0.5">
            {logs.slice(-MAX_LOG_LINES).map((line) => (
              <li key={line.id} className="break-words font-mono text-xs text-text-secondary">
                {line.message}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
