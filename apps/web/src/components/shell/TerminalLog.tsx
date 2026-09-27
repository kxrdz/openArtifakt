import { useLayoutEffect, useRef, useState } from "react";
import type { UIEvent } from "react";

import { useChatStore } from "../../store/chatStore";
import { ChevronDownIcon, cn, focusRing, TerminalIcon } from "../ui";

/** Distance from the bottom (px) below which the log counts as pinned. */
const BOTTOM_THRESHOLD = 24;

/**
 * Collapsible terminal log, pinned to the bottom of the chat pane (§12.6,
 * "Terminal log"). Streams command stdout/stderr as it arrives from the loop,
 * in monospace with stderr tinted; auto-scrolls while the user stays at the
 * bottom and pauses the moment they scroll up.
 */
export function TerminalLog() {
  const lines = useChatStore((state) => state.terminalLines);
  const [open, setOpen] = useState(true);
  const [pinned, setPinned] = useState(true);
  const bodyRef = useRef<HTMLPreElement>(null);

  function onScroll(event: UIEvent<HTMLPreElement>) {
    const element = event.currentTarget;
    const atBottom =
      element.scrollHeight - element.scrollTop - element.clientHeight < BOTTOM_THRESHOLD;
    if (atBottom !== pinned) setPinned(atBottom);
  }

  // Keep the newest output in view while pinned; runs before paint so streamed
  // chunks never cause a visible jump.
  useLayoutEffect(() => {
    const element = bodyRef.current;
    if (element && open && pinned) {
      element.scrollTop = element.scrollHeight;
    }
  }, [lines, open, pinned]);

  return (
    <section aria-label="Terminal log" className="shrink-0 border-t border-border bg-bg-sunken">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className={cn(
          "flex h-9 w-full items-center gap-2 px-3 text-xs font-medium text-text-secondary transition-colors duration-fast hover:bg-bg-hover hover:text-text",
          focusRing,
        )}
      >
        <TerminalIcon className="h-3.5 w-3.5" />
        Terminal log
        {!open && lines.length > 0 && (
          <span className="text-text-muted">{lines.length} lines</span>
        )}
        <ChevronDownIcon
          className={cn(
            "ml-auto h-4 w-4 transition-transform duration-fast ease-out",
            open ? "rotate-0" : "-rotate-90",
          )}
        />
      </button>

      {open && (
        <pre
          ref={bodyRef}
          onScroll={onScroll}
          className="h-32 overflow-auto whitespace-pre-wrap break-words border-t border-border px-3 py-2 font-mono text-xs leading-normal text-text-secondary"
        >
          {lines.length === 0 ? (
            <span className="text-text-muted">No command output yet.</span>
          ) : (
            lines.map((line, index) => (
              <span key={index} className={line.stream === "stderr" ? "text-danger" : undefined}>
                {line.text}
              </span>
            ))
          )}
        </pre>
      )}
    </section>
  );
}
