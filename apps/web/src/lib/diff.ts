/**
 * Small, dependency-free helpers for the approval cards (feature 6.1).
 *
 * The approval flow shows the exact change a write tool will make. `edit_file`
 * supplies a before/after string pair, so a full diff library would be
 * overkill: a common-prefix/suffix trim is enough to produce an honest,
 * readable diff for the small edits the agent makes. Both helpers are pure so
 * they stay unit-testable without a DOM.
 */

/** One rendered diff line, tagged for coloring. */
export interface DiffLine {
  type: "context" | "added" | "removed";
  text: string;
}

/**
 * Diff two strings line-by-line using a common-prefix/suffix trim.
 *
 * Lines shared at the start and end become `context`; the changed middle is
 * split into `removed` (old) then `added` (new). This is deterministic and
 * matches how an exact-string replace reads, without pulling in a diff engine.
 */
export function lineDiff(oldText: string, newText: string): DiffLine[] {
  const oldLines = oldText.split("\n");
  const newLines = newText.split("\n");

  let start = 0;
  while (
    start < oldLines.length &&
    start < newLines.length &&
    oldLines[start] === newLines[start]
  ) {
    start += 1;
  }

  let oldEnd = oldLines.length;
  let newEnd = newLines.length;
  while (oldEnd > start && newEnd > start && oldLines[oldEnd - 1] === newLines[newEnd - 1]) {
    oldEnd -= 1;
    newEnd -= 1;
  }

  const lines: DiffLine[] = [];
  const oldAt = (i: number): string => oldLines[i] ?? "";
  const newAt = (i: number): string => newLines[i] ?? "";
  for (let i = 0; i < start; i += 1) lines.push({ type: "context", text: oldAt(i) });
  for (let i = start; i < oldEnd; i += 1) lines.push({ type: "removed", text: oldAt(i) });
  for (let i = start; i < newEnd; i += 1) lines.push({ type: "added", text: newAt(i) });
  for (let i = newEnd; i < newLines.length; i += 1) lines.push({ type: "context", text: newAt(i) });
  return lines;
}

/** A truncated string plus whether truncation happened. */
export interface TruncatedText {
  text: string;
  truncated: boolean;
}

/**
 * Cap a long string for display, keeping the head and tail so the most useful
 * parts (first and last lines) survive, with an explicit marker in between.
 */
export function truncateText(text: string, max: number): TruncatedText {
  if (text.length <= max) return { text, truncated: false };

  const marker = "\n… content truncated …\n";
  if (max <= marker.length + 1) {
    // Cap too small to keep head + tail + marker: keep a plain ellipsis head.
    return { text: `${text.slice(0, Math.max(0, max - 1))}…`, truncated: true };
  }

  const budget = max - marker.length;
  const headLen = Math.ceil(budget / 2);
  const tailLen = budget - headLen;
  return {
    text: `${text.slice(0, headLen)}${marker}${text.slice(text.length - tailLen)}`,
    truncated: true,
  };
}
