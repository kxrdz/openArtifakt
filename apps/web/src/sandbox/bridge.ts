import { useEffect, useState } from "react";
import type { RefObject } from "react";

/**
 * Parent side of the sandbox postMessage bridge (§6, §12.7).
 *
 * The preview iframe posts `{ __openartifact: true, kind, message, stack?,
 * level? }` messages (see {@link RUNTIME_BRIDGE_SOURCE}); this hook accepts a
 * message only when `event.source` is the artifact iframe's `contentWindow` —
 * never from any other frame — and folds it into an error list and a console
 * log. The lists reset whenever the iframe's content (the `resetKey`) changes,
 * so a new artifact version starts with a clean slate.
 */

/** A message posted by the sandbox runtime. */
export interface SandboxMessage {
  __openartifact: true;
  kind: "runtime-error" | "unhandled-rejection" | "console";
  message: string;
  stack?: string;
  level?: "log" | "info" | "warn" | "error";
}

/** A captured runtime error (or unhandled rejection). */
export interface SandboxError {
  id: string;
  kind: "runtime-error" | "unhandled-rejection";
  message: string;
  stack?: string;
}

/** One captured console line. */
export interface SandboxLog {
  id: string;
  level: "log" | "info" | "warn" | "error";
  message: string;
}

/** The state a preview component renders from. */
export interface SandboxBridgeState {
  errors: SandboxError[];
  logs: SandboxLog[];
  clear: () => void;
}

let idCounter = 0;

function nextId(): string {
  idCounter += 1;
  return `sandbox-${idCounter}-${Date.now().toString(36)}`;
}

/** True for a well-formed bridge message (the only shape this hook accepts). */
function isSandboxMessage(data: unknown): data is SandboxMessage {
  return (
    typeof data === "object" &&
    data !== null &&
    (data as { __openartifact?: unknown }).__openartifact === true &&
    typeof (data as { kind?: unknown }).kind === "string" &&
    typeof (data as { message?: unknown }).message === "string"
  );
}

/**
 * Attach the bridge to one iframe.
 *
 * @param iframeRef a ref to the preview iframe.
 * @param resetKey  the iframe's current content (srcdoc); errors and logs clear
 *                  whenever it changes.
 */
export function useSandboxBridge(
  iframeRef: RefObject<HTMLIFrameElement | null>,
  resetKey: string,
): SandboxBridgeState {
  const [errors, setErrors] = useState<SandboxError[]>([]);
  const [logs, setLogs] = useState<SandboxLog[]>([]);

  // New content → a new run → clear the previous run's output.
  useEffect(() => {
    setErrors([]);
    setLogs([]);
  }, [resetKey]);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      const iframe = iframeRef.current;
      // Only accept messages from the artifact iframe, never from any other
      // window (a stray `postMessage` from elsewhere must be ignored).
      if (iframe === null || event.source !== iframe.contentWindow) return;
      if (!isSandboxMessage(event.data)) return;

      if (event.data.kind === "console") {
        setLogs((previous) => [
          ...previous,
          {
            id: nextId(),
            level: event.data.level ?? "log",
            message: event.data.message,
          },
        ]);
        return;
      }

      setErrors((previous) => [
        ...previous,
        {
          id: nextId(),
          kind: event.data.kind,
          message: event.data.message,
          ...(event.data.stack !== undefined ? { stack: event.data.stack } : {}),
        },
      ]);
    }

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [iframeRef]);

  return {
    errors,
    logs,
    clear: () => {
      setErrors([]);
      setLogs([]);
    },
  };
}
