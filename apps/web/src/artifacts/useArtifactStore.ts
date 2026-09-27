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
 */

export interface ArtifactStore {
  /** Artifacts in first-appearance order, keyed by identifier. */
  artifacts: Artifact[];
  /** The identifier currently open in the panel, or null when none. */
  selectedId: string | null;
  /** Open an artifact in the panel. */
  selectArtifact: (identifier: string) => void;
  /** Re-derive artifacts from an assistant message's accumulated text. */
  updateFromContent: (content: string) => void;
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
  return create<ArtifactStore>()((set) => ({
    artifacts: [],
    selectedId: null,

    selectArtifact: (identifier) => set({ selectedId: identifier }),

    updateFromContent: (content) => {
      const document = parseDocument(content);
      set((state) => {
        const stillPresent =
          state.selectedId !== null &&
          document.artifacts.some((artifact) => artifact.identifier === state.selectedId);
        const selectedId = stillPresent
          ? state.selectedId
          : (document.artifacts[0]?.identifier ?? null);
        return { artifacts: document.artifacts, selectedId };
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
