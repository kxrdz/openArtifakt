import { create } from "zustand";

import { useChatStore } from "../store/chatStore";
import type { ChatMessage } from "../store/chatStore";
import { parseDocument } from "./parseDocument";
import type { Artifact, ArtifactVersion } from "./parseDocument";

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
  /**
   * Explicitly pinned version per artifact identifier. Absent (or pointing
   * at a version that no longer exists) means "follow the latest".
   */
  versionSelections: Record<string, number>;
  /** Open an artifact in the panel. */
  selectArtifact: (identifier: string) => void;
  /** Show a specific stored version; selecting the latest returns to
   * following it as new versions arrive. */
  selectVersion: (identifier: string, version: number) => void;
  /** Revert to an older version: copy its content forward as a new latest
   * version. History is never deleted (§6, "Revert creates a new version"). */
  revertVersion: (identifier: string, version: number) => void;
  /** Re-derive artifacts from an assistant message's accumulated text. */
  updateFromContent: (content: string) => void;
  /** Lift an inline diagram into the panel as a Mermaid artifact. */
  liftToArtifact: (source: string, title?: string) => void;
  /** Replace all artifacts with a restored conversation's persisted history. */
  restoreArtifacts: (artifacts: Artifact[]) => void;
  /** Clear every artifact (used by "new conversation"). */
  clear: () => void;
}

/** The full store shape: the public surface plus the source lists. */
interface ArtifactStoreState extends ArtifactStore {
  /** Artifacts parsed from the conversation content (no lifted ones). */
  derived: Artifact[];
  /** User-lifted artifacts (inline diagrams opened in the panel). */
  lifted: Artifact[];
  /** Recorded reverts per artifact identifier, oldest first. */
  reverts: Record<string, RevertEntry[]>;
}

/**
 * One recorded revert: the older content copied forward, and how many
 * derived versions existed when it was recorded. Derived versions only
 * append (each reuse of an identifier in the text appends one), so a revert
 * stays anchored after exactly those versions and later derived versions
 * land after it — the merged list preserves the true chronological order.
 */
interface RevertEntry {
  afterCount: number;
  content: string;
}

/** The Mermaid artifact type (§6, artifact types). */
const MERMAID_TYPE = "application/vnd.mermaid";

/** Merge the two source lists in panel order (derived first). */
function mergeArtifacts(derived: Artifact[], lifted: Artifact[]): Artifact[] {
  return lifted.length === 0 ? derived : [...derived, ...lifted];
}

/**
 * Interleave the recorded reverts into the derived version lists: each
 * revert is appended after the derived versions it was recorded behind,
 * and the merged list is renumbered 1..n. Derived versions keep streaming
 * updates (the entry objects are re-read on every merge), so a version
 * that is still being written stays live underneath an appended revert.
 */
function applyReverts(
  derived: Artifact[],
  reverts: Record<string, RevertEntry[]>,
): Artifact[] {
  const hasReverts = Object.values(reverts).some(
    (entries) => entries.length > 0,
  );
  if (!hasReverts) return derived;
  return derived.map((artifact) => {
    const entries = reverts[artifact.identifier];
    if (entries === undefined || entries.length === 0) return artifact;
    const versions: ArtifactVersion[] = [];
    let derivedIndex = 0;
    let version = 1;
    for (const entry of entries) {
      while (derivedIndex < entry.afterCount && derivedIndex < artifact.versions.length) {
        const source = artifact.versions[derivedIndex];
        if (source === undefined) break;
        versions.push({ ...source, version: version++ });
        derivedIndex += 1;
      }
      versions.push({ version: version++, content: entry.content, incomplete: false });
    }
    while (derivedIndex < artifact.versions.length) {
      const source = artifact.versions[derivedIndex];
      if (source === undefined) break;
      versions.push({ ...source, version: version++ });
      derivedIndex += 1;
    }
    return { ...artifact, versions };
  });
}

/**
 * Drop recorded reverts whose artifact no longer exists (e.g. after a
 * re-parse removed the artifact or "new conversation" cleared it).
 */
function pruneReverts(
  reverts: Record<string, RevertEntry[]>,
  artifacts: Artifact[],
): Record<string, RevertEntry[]> {
  let pruned: Record<string, RevertEntry[]> | null = null;
  for (const identifier of Object.keys(reverts)) {
    if (!artifacts.some((artifact) => artifact.identifier === identifier)) {
      pruned ??= { ...reverts };
      delete pruned[identifier];
    }
  }
  return pruned ?? reverts;
}

/**
 * Drop pinned versions whose artifact (or pinned version) no longer exists,
 * e.g. after a re-parse removed an artifact or "new conversation" cleared it.
 */
function pruneVersionSelections(
  selections: Record<string, number>,
  artifacts: Artifact[],
): Record<string, number> {
  let pruned: Record<string, number> | null = null;
  for (const [identifier, version] of Object.entries(selections)) {
    const artifact = artifacts.find(
      (candidate) => candidate.identifier === identifier,
    );
    const stillValid = artifact?.versions.some((v) => v.version === version);
    if (!stillValid) {
      pruned ??= { ...selections };
      delete pruned[identifier];
    }
  }
  return pruned ?? selections;
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

/**
 * The concatenation of every assistant message's content, in order.
 *
 * Artifacts are conversation-scoped: reusing an identifier in a later turn
 * appends a version. Concatenating — exactly as the server's persistence writer
 * does — lets the full version history (across turns and after a restore)
 * re-derive from the same text the server persisted, so the web and server
 * never disagree on versions.
 */
function allAssistantContent(messages: ChatMessage[]): string {
  let content = "";
  for (const message of messages) {
    if (message.role === "assistant") content += message.content;
  }
  return content;
}

/** Create an artifact store (injectable in tests, like `createChatStore`). */
export function createArtifactStore() {
  return create<ArtifactStoreState>()((set) => ({
    artifacts: [],
    derived: [],
    lifted: [],
    reverts: {},
    selectedId: null,
    versionSelections: {},

    selectArtifact: (identifier) => set({ selectedId: identifier }),

    selectVersion: (identifier, version) =>
      set((state) => {
        const artifact = state.artifacts.find(
          (candidate) => candidate.identifier === identifier,
        );
        const latest = artifact?.versions[artifact.versions.length - 1];
        if (artifact === undefined || latest === undefined) return state;
        const versionSelections = { ...state.versionSelections };
        if (version === latest.version) {
          // Picking the latest returns to following it (new versions take
          // over automatically, e.g. while streaming).
          delete versionSelections[identifier];
        } else if (artifact.versions.some((v) => v.version === version)) {
          versionSelections[identifier] = version;
        } else {
          return state;
        }
        return { versionSelections };
      }),

    revertVersion: (identifier, version) =>
      set((state) => {
        const artifact = state.artifacts.find(
          (candidate) => candidate.identifier === identifier,
        );
        const derivedArtifact = state.derived.find(
          (candidate) => candidate.identifier === identifier,
        );
        const latest = artifact?.versions[artifact.versions.length - 1];
        const target = artifact?.versions.find(
          (candidate) => candidate.version === version,
        );
        // Reverting the latest (or a missing identifier/version) is a no-op,
        // and only conversation-derived artifacts carry a revertable history.
        if (
          artifact === undefined ||
          derivedArtifact === undefined ||
          latest === undefined ||
          target === undefined ||
          target.version === latest.version
        ) {
          return state;
        }
        const reverts = {
          ...state.reverts,
          [identifier]: [
            ...(state.reverts[identifier] ?? []),
            {
              afterCount: derivedArtifact.versions.length,
              content: target.content,
            },
          ],
        };
        // The revert is the new latest; return to following the latest so the
        // panel shows the reverted content (and any later version takes over
        // when one arrives).
        const versionSelections = { ...state.versionSelections };
        delete versionSelections[identifier];
        return {
          reverts,
          artifacts: mergeArtifacts(
            applyReverts(state.derived, reverts),
            state.lifted,
          ),
          versionSelections,
        };
      }),

    updateFromContent: (content) => {
      const document = parseDocument(content);
      set((state) => {
        const derived = document.artifacts;
        const reverts = pruneReverts(state.reverts, derived);
        const artifacts = mergeArtifacts(applyReverts(derived, reverts), state.lifted);
        const stillPresent =
          state.selectedId !== null &&
          artifacts.some((artifact) => artifact.identifier === state.selectedId);
        const selectedId = stillPresent
          ? state.selectedId
          : (artifacts[0]?.identifier ?? null);
        const versionSelections = pruneVersionSelections(
          state.versionSelections,
          artifacts,
        );
        return { derived, reverts, artifacts, selectedId, versionSelections };
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
          artifacts: mergeArtifacts(
            applyReverts(state.derived, state.reverts),
            lifted,
          ),
          selectedId: artifact.identifier,
        };
      });
    },

    restoreArtifacts: (artifacts) =>
      set({
        derived: artifacts,
        lifted: [],
        // A restored conversation replays its persisted history; reverts
        // from the previously open conversation do not carry over.
        reverts: {},
        artifacts,
        selectedId: artifacts[0]?.identifier ?? null,
        // A restored conversation starts every artifact on its latest version.
        versionSelections: {},
      }),

    clear: () =>
      set({
        derived: [],
        lifted: [],
        reverts: {},
        artifacts: [],
        selectedId: null,
        versionSelections: {},
      }),
  }));
}

/** The app-wide artifact store. */
export const useArtifactStore = createArtifactStore();

// Keep the store derived from the chat store: whenever the message list changes
// (the only way assistant text can change), re-derive from the last assistant
// message. The store is created once, so this subscription runs once.
useChatStore.subscribe((state, previous) => {
  if (state.messages === previous.messages) return;
  useArtifactStore.getState().updateFromContent(allAssistantContent(state.messages));
});
