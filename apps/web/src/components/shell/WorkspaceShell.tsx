import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";

import { useArtifactStore } from "../../artifacts";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { lastUndoableTurn } from "../../lib/undo";
import { useChatStore } from "../../store/chatStore";
import {
  buildCommands,
  CommandPalette,
  useKeyboardShortcuts,
} from "../command";
import type { ComposerHandle } from "../chat/Composer";
import { IconButton, XIcon } from "../ui";
import { SettingsDrawer } from "../settings/SettingsDrawer";
import { ArtifactPanel } from "./ArtifactPanel";
import { ChatPane } from "./ChatPane";
import { SplitPane } from "./SplitPane";
import { StatusBar } from "./StatusBar";

/** Below this width the artifact panel becomes a full-screen sheet (§6/§7). */
const SHEET_BREAKPOINT = "(min-width: 900px)";

/** Flip the `data-theme` attribute on <html>; the token CSS and every
 * theme-aware renderer (mermaid, monaco, shiki) follow it in place. */
function toggleTheme() {
  const root = document.documentElement;
  root.setAttribute(
    "data-theme",
    root.getAttribute("data-theme") === "light" ? "dark" : "light",
  );
}

/**
 * The workspace shell: top status bar, resizable chat/artifact split on
 * desktop (collapsible via `Mod+\`), a full-screen artifact sheet on narrow
 * screens, the settings drawer, the command palette, and the global shortcut
 * layer that drives them all from one command registry (§12.9).
 */
export function WorkspaceShell() {
  const isDesktop = useMediaQuery(SHEET_BREAKPOINT);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(true);
  const [terminalOpen, setTerminalOpen] = useState(true);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const composerRef = useRef<ComposerHandle | null>(null);

  // Cheap boolean selectors: the shell re-renders only when availability
  // actually flips, not on every streamed text delta.
  const isSending = useChatStore((state) => state.isSending);
  const hasApproval = useChatStore((state) => state.pendingApproval !== null);
  const hasUndoableTurn = useChatStore(
    (state) => lastUndoableTurn(state.messages) !== null,
  );

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

  const togglePanel = useCallback(() => {
    if (isDesktop) setPanelOpen((value) => !value);
    else setSheetOpen((value) => !value);
  }, [isDesktop]);

  const commands = useMemo(
    () =>
      buildCommands(
        {
          send: () => composerRef.current?.submit(),
          stop: () => useChatStore.getState().stop(),
          approve: () =>
            void useChatStore.getState().decide({ kind: "approve" }),
          reject: () =>
            void useChatStore.getState().decide({ kind: "reject", note: "" }),
          toggleArtifactPanel: togglePanel,
          toggleTerminalLog: () => setTerminalOpen((value) => !value),
          openSettings: () => setSettingsOpen(true),
          toggleTheme,
          newConversation: () => {
            useChatStore.getState().reset();
            useArtifactStore.getState().clear();
          },
          undoLastTurn: () => {
            // Recompute at run time so the command never holds a stale turn.
            const turn = lastUndoableTurn(useChatStore.getState().messages);
            if (turn !== null) {
              void useChatStore.getState().undoTurn(turn).catch(() => {
                /* the per-turn undo action surfaces the error */
              });
            }
          },
          focusChatInput: () => composerRef.current?.focus(),
          jumpToArtifactPanel: () => {
            if (isDesktop) {
              setPanelOpen(true);
              document
                .querySelector<HTMLButtonElement>('[aria-label="Artifacts"] button')
                ?.focus();
            } else {
              setSheetOpen(true);
            }
          },
        },
        { sending: isSending, hasApproval, hasUndoableTurn },
      ),
    [isDesktop, isSending, hasApproval, hasUndoableTurn, togglePanel],
  );

  // A modal (palette, settings drawer, sheet) captures the keyboard: global
  // workflow shortcuts are suppressed and Escape dismisses the top overlay.
  const modalOpen = paletteOpen || settingsOpen || sheetOpen;
  useKeyboardShortcuts(commands, { enabled: !modalOpen });

  return (
    <div className="flex h-full flex-col">
      <StatusBar
        onOpenPanel={isDesktop ? undefined : () => setSheetOpen(true)}
        onTogglePanel={isDesktop ? togglePanel : undefined}
        panelOpen={panelOpen}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <main className="flex min-h-0 flex-1">
        {isDesktop ? (
          panelOpen ? (
            <SplitPane
              left={
                <ChatPane
                  composerHandleRef={composerRef}
                  terminalOpen={terminalOpen}
                  onToggleTerminal={() => setTerminalOpen((value) => !value)}
                />
              }
              right={<ArtifactPanel />}
            />
          ) : (
            <ChatPane
              composerHandleRef={composerRef}
              terminalOpen={terminalOpen}
              onToggleTerminal={() => setTerminalOpen((value) => !value)}
            />
          )
        ) : (
          <ChatPane
            onOpenPanel={() => setSheetOpen(true)}
            composerHandleRef={composerRef}
            terminalOpen={terminalOpen}
            onToggleTerminal={() => setTerminalOpen((value) => !value)}
          />
        )}
      </main>

      <CommandPalette commands={commands} onOpenChange={setPaletteOpen} />

      {settingsOpen && <SettingsDrawer onClose={() => setSettingsOpen(false)} />}

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
            <ArtifactPanel />
          </div>
        </div>
      )}
    </div>
  );
}
