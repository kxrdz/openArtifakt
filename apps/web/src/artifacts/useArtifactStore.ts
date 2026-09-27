import { create } from "zustand";

import { useChatStore } from "../store/chatStore";
import type { ChatMessage } from "../store/chatStore";
import { parseDocument } from "./parseDocument";
import type { Artifact } from "./parseDocument";

/**
 * Artifact store (§12.7, design decision 3).
 *
 * Artifact state lives in its own Zustand store, separate from the chat
 * transport reducer: it derives the artifact list (and the open artifact id)
 * from the last assistant message's accumulated text and re-derives whenever
 * that message grows. The artifact switcher and panel read only this store, so
 * feature 8 can add version selection/diff/revert here without touching the
 * chat transport.
 *
 * Inline diagrams can also be lifted into the panel ("Open in panel"); those
 * user-lifted artifacts are kept separate from the conversation-derived ones
 * so a re-parse of the chat content never drops them, and merged into the
 * single `artifacts` list the panel reads.
 */

export interface ArtifactStore {
  /** Artifacts in panel order (conversation-derived, then user-lifted). */
  artifacts: Artifact[];
  /** The identifier currently open in the panel, or null when none. */
  selectedId: string | null;
  /** Open an artifact in the panel. */
  selectArtifact: (identifier: string) => void;
  /** Re-derive artifacts from an assistant message's accumulated text. */
  updateFromContent: (content: string) => void;
  /** Lift an inline diagram into the panel as a Mermaid artifact. */
  liftToArtifact: (source: string, title?: string) => void;
}

/** The full store shape: the public surface plus the two source lists. */
interface ArtifactStoreState extends ArtifactStore {
  /** Artifacts parsed from the conversation content (no lifted ones). */
  derived: Artifact[];
  /** User-lifted artifacts (inline diagrams opened in the panel). */
  lifted: Artifact[];
}

/** The Mermaid artifact type (§6, artifact types). */
const MERMAID_TYPE = "application/vnd.mermaid";

/** Merge the two source lists in panel order (derived first). */
function mergeArtifacts(derived: Artifact[], lifted: Artifact[]): Artifact[] {
  return lifted.length === 0 ? derived : [...derived, ...lifted];
}

/** Monotonic counter for lifted-diagram identifiers (never reused). */
let liftCounter = 0;

/** A unique identifier for a lifted diagram, avoiding any taken identifier. */
function nextLiftIdentifier(taken: ReadonlySet<string>): string {
  for (;;) {
    liftCounter += 1;
    const identifier = `inline-mermaid-${liftCounter}`;
    if (!taken.has(identifier)) return identifier;
  }
}

/** The content of the most recent assistant message (empty when none yet). */
function lastAssistantContent(messages: ChatMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message !== undefined && message.role === "assistant") return message.content;
  }
  return "";
}

/** Create an artifact store (injectable in tests, like `createChatStore`). */
export function createArtifactStore() {
  return create<ArtifactStoreState>()((set) => ({
    artifacts: [],
    derived: [],
    lifted: [],
    selectedId: null,

    selectArtifact: (identifier) => set({ selectedId: identifier }),

    updateFromContent: (content) => {
      const document = parseDocument(content);
      set((state) => {
        const derived = document.artifacts;
        const artifacts = mergeArtifacts(derived, state.lifted);
        const stillPresent =
          state.selectedId !== null &&
          artifacts.some((artifact) => artifact.identifier === state.selectedId);
        const selectedId = stillPresent
          ? state.selectedId
          : (artifacts[0]?.identifier ?? null);
        return { derived, artifacts, selectedId };
      });
    },

    liftToArtifact: (source, title) => {
      set((state) => {
        const taken = new Set(state.artifacts.map((artifact) => artifact.identifier));
        const trimmedTitle = title?.trim();
        const artifact: Artifact = {
          identifier: nextLiftIdentifier(taken),
          title: trimmedTitle ? trimmedTitle : "Inline diagram",
          artifactType: MERMAID_TYPE,
          versions: [{ version: 1, content: source, incomplete: false }],
          incomplete: false,
        };
        const lifted = [...state.lifted, artifact];
        return {
          lifted,
          artifacts: mergeArtifacts(state.derived, lifted),
          selectedId: artifact.identifier,
        };
      });
    },
  }));
}

/** The app-wide artifact store. */
export const useArtifactStore = createArtifactStore();

// Keep the store derived from the chat store: whenever the message list changes
// (the only way assistant text can change), re-derive from the last assistant
// message. The store is created once, so this subscription runs once.
useChatStore.subscribe((state, previous) => {
  if (state.messages === previous.messages) return;
  useArtifactStore.getState().updateFromContent(lastAssistantContent(state.messages));
});
