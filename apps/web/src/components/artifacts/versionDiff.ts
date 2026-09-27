/**
 * Version-pair selection logic for the diff view (task 7.2).
 *
 * These helpers are pure so the selection rules are unit-testable without
 * loading Monaco (which is browser-only and heavy — see `monacoSetup.ts`).
 * The panel keeps the *chosen* pair in state and uses these functions to
 * normalize and validate it against the artifact's current version list.
 */

/** A stored artifact version — only the number matters for pair selection. */
export interface DiffableVersion {
  version: number;
}

/**
 * An ordered pair of version numbers: `original` (left side of the diff) is
 * strictly older than `modified` (right side).
 */
export interface VersionPair {
  original: number;
  modified: number;
}

/** All version numbers, ascending (versions are append-only but the pair
 *  logic never assumes the input is pre-sorted). */
export function versionNumbers(versions: readonly DiffableVersion[]): number[] {
  return versions.map((version) => version.version).sort((a, b) => a - b);
}

/**
 * The default diff pair: the two most recent versions, older → newer.
 *
 * When `preferred` names a stored older version (e.g. the version pinned in
 * the version dropdown), the diff instead compares that version against the
 * latest — the "what changed since I pinned this?" view. Returns null when
 * there are fewer than two versions.
 */
export function defaultDiffPair(
  versions: readonly DiffableVersion[],
  preferred?: number,
): VersionPair | null {
  const numbers = versionNumbers(versions);
  if (numbers.length < 2) return null;
  const latest = numbers[numbers.length - 1];
  if (latest === undefined) return null;
  if (
    preferred !== undefined &&
    preferred !== latest &&
    numbers.includes(preferred)
  ) {
    return { original: preferred, modified: latest };
  }
  const previous = numbers[numbers.length - 2];
  return previous === undefined ? null : { original: previous, modified: latest };
}

/**
 * Normalize two picked version numbers into an ordered pair. The older one
 * always becomes `original` (diffs read top-down, old → new), so the two
 * selects can be swapped freely. Returns null when both sides pick the same
 * version (there is nothing to diff).
 */
export function orderedPair(a: number, b: number): VersionPair | null {
  if (!Number.isFinite(a) || !Number.isFinite(b) || a === b) return null;
  return a < b ? { original: a, modified: b } : { original: b, modified: a };
}

/**
 * Keep a pair valid against the current version list: both sides must still
 * exist and differ (a re-parse can prune versions). Falls back to the default
 * pair when the stored one no longer resolves.
 */
export function resolveDiffPair(
  pair: VersionPair,
  versions: readonly DiffableVersion[],
): VersionPair | null {
  const numbers = new Set(versionNumbers(versions));
  if (numbers.has(pair.original) && numbers.has(pair.modified)) {
    const normalized = orderedPair(pair.original, pair.modified);
    if (normalized !== null) return normalized;
  }
  return defaultDiffPair(versions);
}

/**
 * Re-pick one side of the pair (a `<select>` change).
 *
 * Picking a version that is already on the other side would leave both sides
 * equal, so the other side moves to the nearest remaining version —
 * preferring a newer one, falling back to the newest older one. Unknown
 * version numbers are ignored (the pair is returned unchanged).
 */
export function withVersionPick(
  pair: VersionPair,
  side: "original" | "modified",
  version: number,
  versions: readonly DiffableVersion[],
): VersionPair {
  const numbers = versionNumbers(versions);
  if (!numbers.includes(version)) return pair;
  const other = side === "original" ? pair.modified : pair.original;
  if (version === other) {
    const newer = numbers.find((candidate) => candidate > version);
    const older = [...numbers].reverse().find((candidate) => candidate < version);
    const candidate = newer ?? older;
    if (candidate === undefined) return pair;
    return { original: Math.min(version, candidate), modified: Math.max(version, candidate) };
  }
  return orderedPair(version, other) ?? pair;
}

/**
 * Map an artifact's code language onto a Monaco language id.
 *
 * Only the lightweight Monarch grammars bundled in `monacoSetup.ts` are
 * registered (no language-service workers — the diff editor is read-only),
 * so anything unmapped, including `mermaid`, falls back to plaintext.
 */
export function monacoLanguage(language: string | undefined): string {
  switch (language) {
    case "tsx":
    case "ts":
    case "typescript":
      return "typescript";
    case "jsx":
    case "js":
    case "mjs":
    case "cjs":
    case "javascript":
      return "javascript";
    case "html":
      return "html";
    case "xml":
    case "svg":
      return "xml";
    case "css":
      return "css";
    case "py":
    case "python":
      return "python";
    case "md":
    case "markdown":
      return "markdown";
    case "yaml":
    case "yml":
      return "yaml";
    case "sh":
    case "bash":
    case "zsh":
    case "shell":
      return "shell";
    case "sql":
      return "sql";
    default:
      return "plaintext";
  }
}
