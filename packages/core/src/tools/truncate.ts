import type { ToolResult } from "./types";

/**
 * Tool-result truncation (§8 "Limits"). A result longer than the cap is kept
 * as head + tail with a `[... N lines truncated ...]` marker, so the model
 * still sees the start and the end of a large output.
 */

export const DEFAULT_TOOL_RESULT_CAP = 20_000;

/** Headroom reserved for the `[... N lines truncated ...]` marker line. */
const MARKER_RESERVE = 64;

/**
 * Cap `content` at about `maxChars`, keeping the head and tail lines and
 * inserting a `[... N lines truncated ...]` marker where `N` is the number of
 * lines dropped. A single over-long line (no newline boundaries to cut on) is
 * sliced by characters instead so its head and tail are preserved.
 */
export function truncateText(content: string, maxChars = DEFAULT_TOOL_RESULT_CAP): string {
  if (content.length <= maxChars) return content;

  const lines = content.split("\n");

  if (lines.length === 1) {
    const line = lines[0]!;
    const half = Math.max(1, Math.floor((maxChars - MARKER_RESERVE) / 2));
    const dropped = Math.max(0, line.length - half * 2);
    return `${line.slice(0, half)}\n[... ${dropped} characters truncated ...]\n${line.slice(-half)}`;
  }

  const half = Math.max(1, Math.floor((maxChars - MARKER_RESERVE) / 2));

  const head: string[] = [];
  let headChars = 0;
  let i = 0;
  while (i < lines.length && headChars + lines[i]!.length + 1 <= half) {
    head.push(lines[i]!);
    headChars += lines[i]!.length + 1;
    i += 1;
  }

  const tail: string[] = [];
  let tailChars = 0;
  let j = lines.length - 1;
  while (j >= i && tailChars + lines[j]!.length + 1 <= half) {
    tail.unshift(lines[j]!);
    tailChars += lines[j]!.length + 1;
    j -= 1;
  }

  const truncated = lines.length - head.length - tail.length;
  return [...head, `[... ${truncated} lines truncated ...]`, ...tail].join("\n");
}

/** Apply the central cap to a {@link ToolResult}. */
export function truncateResult(
  result: ToolResult,
  maxChars = DEFAULT_TOOL_RESULT_CAP,
): ToolResult {
  return { ...result, content: truncateText(result.content, maxChars) };
}
