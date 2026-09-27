import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { IconButton, XIcon } from "../ui";
import { ArtifactEmptyState, ArtifactPanel } from "./ArtifactPanel";
import { ChatPane } from "./ChatPane";
import { SplitPane } from "./SplitPane";
import { StatusBar } from "./StatusBar";

/** Below this width the artifact panel becomes a full-screen sheet (§6/§7). */
const SHEET_BREAKPOINT = "(min-width: 900px)";

/**
 * The empty workspace shell: top status bar, resizable chat/artifact split on
 * desktop, a full-screen artifact sheet on narrow screens, and empty states for
 * both panes. Features 6–9 drop their content into these seams.
 */
export function WorkspaceShell() {
  const isDesktop = useMediaQuery(SHEET_BREAKPOINT);
  const [sheetOpen, setSheetOpen] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // Growing back to desktop dismisses the sheet.
  useEffect(() => {
    if (isDesktop) setSheetOpen(false);
  }, [isDesktop]);

  // Move focus to the sheet's close control when it opens.
  useEffect(() => {
    if (!isDesktop && sheetOpen) closeButtonRef.current?.focus();
  }, [isDesktop, sheetOpen]);

  function onSheetKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      setSheetOpen(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <StatusBar />

      <main className="flex min-h-0 flex-1">
        {isDesktop ? (
          <SplitPane left={<ChatPane />} right={<ArtifactPanel />} />
        ) : (
          <ChatPane onOpenPanel={() => setSheetOpen(true)} />
        )}
      </main>

      {!isDesktop && sheetOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Artifact panel"
          onKeyDown={onSheetKeyDown}
          className="fixed inset-0 z-50 flex flex-col bg-bg"
        >
          <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-3">
            <h2 className="text-sm font-semibold text-text">Artifacts</h2>
            <IconButton
              ref={closeButtonRef}
              className="ml-auto"
              aria-label="Close artifact panel"
              icon={<XIcon className="h-4 w-4" />}
              onClick={() => setSheetOpen(false)}
            />
          </div>
          <div className="flex min-h-0 flex-1 flex-col">
            <ArtifactEmptyState />
          </div>
        </div>
      )}
    </div>
  );
}
