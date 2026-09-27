import { useEffect, useRef, useState } from "react";

import type * as monacoApi from "monaco-editor";

import type { ArtifactVersion } from "../../artifacts";
import { useActiveTheme } from "../../hooks/useTheme";
import { Spinner, cn, focusRing } from "../ui";
import { readDiffThemeTokens } from "./monacoTheme";
import {
  defaultDiffPair,
  monacoLanguage,
  resolveDiffPair,
  withVersionPick,
  type VersionPair,
} from "./versionDiff";

/**
 * The version diff view (§6, "Diff between any two versions uses the Monaco
 * diff editor"; task 7.2).
 *
 * Two selects pick the versions to compare; the older one is always the diff
 * base (left) and the newer one the modified side (right), with both
 * versions identified. Monaco is loaded lazily on first mount — locally
 * bundled with its editor worker, read-only, and themed from the design
 * tokens (see `monacoSetup.ts` / `monacoTheme.ts`). The version-pair
 * selection rules live in `versionDiff.ts` so they stay unit-testable
 * without the editor.
 */

export interface VersionDiffProps {
  /** Every stored version of the artifact, in order. */
  versions: ArtifactVersion[];
  /** The artifact's code language (e.g. `tsx`, `html`); diffed as plaintext
   *  when unmapped. */
  language?: string;
  /** Artifact title, used to label the version selects. */
  title?: string;
  /**
   * A version the user pinned in the version dropdown, used to seed the
   * initial pair (that version against the latest).
   */
  preferredVersion?: number;
}

/** Version-dropdown control styling, shared with the artifact panel. */
const versionSelectClass = cn(
  "h-7 rounded-md border border-border bg-bg-sunken px-1.5 font-sans text-xs font-medium text-text",
  focusRing,
);

/** The content of one stored version (empty string when it vanished). */
function versionContent(
  versions: readonly ArtifactVersion[],
  version: number,
): string {
  return (
    versions.find((candidate) => candidate.version === version)?.content ?? ""
  );
}

export function VersionDiff({
  versions,
  language,
  title,
  preferredVersion,
}: VersionDiffProps) {
  const theme = useActiveTheme();
  const [pair, setPair] = useState<VersionPair | null>(() =>
    defaultDiffPair(versions, preferredVersion),
  );

  // Keep the pair valid when the version list changes: streaming appends new
  // versions (an explicit pair stays put), a re-parse can prune the selected
  // ones (fall back to the default pair).
  useEffect(() => {
    setPair((current) =>
      current === null
        ? defaultDiffPair(versions, preferredVersion)
        : resolveDiffPair(current, versions),
    );
  }, [versions, preferredVersion]);

  const monacoLanguageId = monacoLanguage(language);
  const originalContent =
    pair === null ? "" : versionContent(versions, pair.original);
  const modifiedContent =
    pair === null ? "" : versionContent(versions, pair.modified);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const setupRef = useRef<Awaited<typeof import("./monacoSetup")> | null>(null);
  const editorRef = useRef<monacoApi.editor.IStandaloneDiffEditor | null>(null);
  const modelsRef = useRef<{
    original: { dispose(): void };
    modified: { dispose(): void };
  } | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  // Mount: lazily load Monaco (locally bundled, offline workers) and create
  // the read-only, token-themed diff editor. Unmount: dispose it all.
  useEffect(() => {
    let cancelled = false;
    import("./monacoSetup")
      .then((module) => {
        if (cancelled || containerRef.current === null) return;
        module.applyDiffEditorTheme();
        const tokens = readDiffThemeTokens();
        const editor = module.monaco.editor.createDiffEditor(
          containerRef.current,
          {
            readOnly: true,
            originalEditable: false,
            renderSideBySide: true,
            automaticLayout: true,
            renderOverviewRuler: false,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            fontFamily: tokens.fontFamily,
            fontSize: tokens.fontSizePx,
          },
        );
        editorRef.current = editor;
        setupRef.current = module;
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
      editorRef.current?.dispose();
      editorRef.current = null;
      setupRef.current = null;
      modelsRef.current?.original.dispose();
      modelsRef.current?.modified.dispose();
      modelsRef.current = null;
    };
  }, []);

  // Contents/language: swap in fresh models whenever the selected pair or
  // the artifact language changes. Old models are disposed after the swap.
  useEffect(() => {
    const module = setupRef.current;
    const editor = editorRef.current;
    if (module === null || editor === null) return;
    const previous = modelsRef.current;
    const originalModel = module.monaco.editor.createModel(
      originalContent,
      monacoLanguageId,
    );
    const modifiedModel = module.monaco.editor.createModel(
      modifiedContent,
      monacoLanguageId,
    );
    modelsRef.current = { original: originalModel, modified: modifiedModel };
    editor.setModel({ original: originalModel, modified: modifiedModel });
    previous?.original.dispose();
    previous?.modified.dispose();
  }, [status, originalContent, modifiedContent, monacoLanguageId]);

  // Theme: re-define the token-derived theme (the tokens have already
  // re-resolved by the time this effect runs) and re-apply it.
  useEffect(() => {
    if (status !== "ready") return;
    setupRef.current?.applyDiffEditorTheme();
  }, [status, theme]);

  const latest = latestVersion(versions);
  const pick = (side: "original" | "modified", version: number) => {
    if (pair === null) return;
    setPair(withVersionPick(pair, side, version, versions));
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Diff header: the two compared versions, both identified. */}
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border px-3">
        <span className="text-xs font-medium text-text-muted">Diff</span>
        <select
          aria-label={`Older version of ${title ?? "artifact"}`}
          title="Older version (diff base)"
          className={versionSelectClass}
          value={pair?.original ?? ""}
          disabled={pair === null}
          onChange={(event) => pick("original", Number(event.target.value))}
        >
          {versions.map((candidate) => (
            <option key={candidate.version} value={candidate.version}>
              v{candidate.version}
              {candidate.version === latest ? " (latest)" : ""}
            </option>
          ))}
        </select>
        <span aria-hidden="true" className="text-xs text-text-faint">
          →
        </span>
        <select
          aria-label={`Newer version of ${title ?? "artifact"}`}
          title="Newer version (diff target)"
          className={versionSelectClass}
          value={pair?.modified ?? ""}
          disabled={pair === null}
          onChange={(event) => pick("modified", Number(event.target.value))}
        >
          {versions.map((candidate) => (
            <option key={candidate.version} value={candidate.version}>
              v{candidate.version}
              {candidate.version === latest ? " (latest)" : ""}
            </option>
          ))}
        </select>
      </div>

      <div className="relative min-h-0 flex-1 bg-bg-elevated">
        {status === "error" ? (
          <div className="flex h-full items-center justify-center p-6">
            <p className="max-w-sm text-center text-sm text-text-secondary">
              The diff editor could not be loaded. Reload the page and try
              again.
            </p>
          </div>
        ) : (
          <>
            <div
              ref={containerRef}
              aria-label={`Version diff, v${pair?.original ?? ""} to v${pair?.modified ?? ""}`}
              className="h-full w-full"
            />
            {status === "loading" && (
              <div className="absolute inset-0 flex items-center justify-center gap-2 bg-bg-elevated text-sm text-text-secondary">
                <Spinner size="sm" />
                Loading diff editor
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/** The latest version number in the list, for the "(latest)" marker. */
function latestVersion(versions: readonly ArtifactVersion[]): number | undefined {
  return versions[versions.length - 1]?.version;
}
