import { promises as fs } from "node:fs";
import { z } from "zod";

import { assertWritablePath, resolveWithinWorkspace, resolveWorkspaceRoot } from "../security/path-jail";
import { snapshotBeforeMutation } from "./snapshot";
import { defineTool } from "./types";

/** Read the file, mapping common fs failures to clear, user-facing errors. */
async function readForEdit(target: string, displayPath: string): Promise<string> {
  let raw: string;
  try {
    raw = await fs.readFile(target, "utf8");
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") throw new Error(`File not found: ${displayPath}`, { cause: err });
    if (code === "EISDIR")
      throw new Error(`"${displayPath}" is a directory, not a file`, { cause: err });
    throw err;
  }
  return raw;
}

/** Number of non-overlapping occurrences of `needle` in `haystack`. */
function countOccurrences(haystack: string, needle: string): number {
  let count = 0;
  let idx = haystack.indexOf(needle);
  while (idx !== -1) {
    count += 1;
    idx = haystack.indexOf(needle, idx + needle.length);
  }
  return count;
}

/** 1-indexed line numbers of the first `max` occurrences of `needle`. */
function occurrenceLines(haystack: string, needle: string, max = 5): number[] {
  const lines: number[] = [];
  let idx = haystack.indexOf(needle);
  while (idx !== -1 && lines.length < max) {
    lines.push(haystack.slice(0, idx).split("\n").length);
    idx = haystack.indexOf(needle, idx + needle.length);
  }
  return lines;
}

/** Trim and collapse whitespace so a `$`-free preview of `oldString` fits on one line. */
function preview(s: string, maxLen = 80): string {
  const flat = s.replace(/\s+/g, " ").trim();
  return flat.length > maxLen ? `${flat.slice(0, maxLen - 1)}…` : flat;
}

/**
 * `edit_file` (§8). Replaces an exact string in a workspace file. Fails with a
 * helpful message when `oldString` is absent or ambiguous (more than one
 * occurrence without `replaceAll`), leaving the file unchanged in both cases.
 * The file is snapshotted before any mutation for later undo.
 */
export const editFileTool = defineTool({
  name: "edit_file",
  description:
    "Replace an exact string in a file. Fails if `oldString` is not found, or if it occurs " +
    "more than once unless `replaceAll` is set. Use this for small, precise edits.",
  parameters: z.object({
    path: z.string().min(1).describe("File path relative to the workspace root"),
    oldString: z.string().min(1).describe("Exact text to replace"),
    newString: z.string().describe("Replacement text"),
    replaceAll: z
      .boolean()
      .optional()
      .describe("Replace every occurrence instead of failing on ambiguity"),
  }),
  approval: "write",
  async execute(args, ctx) {
    try {
      if (args.oldString === "") {
        return { content: "oldString must not be empty", isError: true };
      }

      const realRoot = await resolveWorkspaceRoot(ctx.workspaceRoot);
      const target = await resolveWithinWorkspace(ctx.workspaceRoot, args.path);
      assertWritablePath(realRoot, target);

      const raw = await readForEdit(target, args.path);
      const occurrences = countOccurrences(raw, args.oldString);

      if (occurrences === 0) {
        return {
          content:
            `oldString not found in "${args.path}" (no exact match for ` +
            `"${preview(args.oldString)}"). The file may have changed since it was read; ` +
            `re-read it first.`,
          isError: true,
        };
      }

      if (occurrences > 1 && !args.replaceAll) {
        const lines = occurrenceLines(raw, args.oldString).join(", ");
        return {
          content:
            `oldString is not unique in "${args.path}": it occurs ${occurrences} times ` +
            `(lines ${lines}). Add more surrounding context to make it unique, or set ` +
            `replaceAll to replace all ${occurrences} occurrences.`,
          isError: true,
        };
      }

      const updated = args.replaceAll
        ? raw.split(args.oldString).join(args.newString)
        : raw.replace(args.oldString, () => args.newString);

      await snapshotBeforeMutation(ctx, target);
      await fs.writeFile(target, updated, "utf8");

      const replaced = args.replaceAll ? occurrences : 1;
      return {
        content:
          `Replaced ${replaced} ${replaced === 1 ? "occurrence" : "occurrences"} in "${args.path}"`,
      };
    } catch (err) {
      return { content: err instanceof Error ? err.message : String(err), isError: true };
    }
  },
});
