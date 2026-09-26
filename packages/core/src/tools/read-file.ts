import { promises as fs } from "node:fs";
import { z } from "zod";

import { resolveWithinWorkspace } from "../security/path-jail";
import { truncateResult } from "./truncate";
import { defineTool } from "./types";

/** Read a file, converting common fs failures into clear, user-facing errors. */
async function readFileAsText(target: string, displayPath: string): Promise<string> {
  let raw: string;
  try {
    raw = await fs.readFile(target, "utf8");
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") throw new Error(`File not found: ${displayPath}`, { cause: err });
    if (code === "EISDIR") throw new Error(`"${displayPath}" is a directory, not a file`, {
      cause: err,
    });
    throw err;
  }
  return raw;
}

/**
 * `read_file` (§8). Reads a workspace file (relative path, resolved through
 * the path jail) and returns its content with 1-indexed line numbers, so the
 * model can refer back to exact lines. `startLine`/`endLine` restrict the
 * output to a slice, clamped to the file's bounds.
 */
export const readFileTool = defineTool({
  name: "read_file",
  description:
    "Read a file from the workspace and return its content with line numbers. " +
    "Optionally restrict the output to a line range with startLine/endLine (1-indexed, inclusive).",
  parameters: z.object({
    path: z.string().min(1).describe("File path relative to the workspace root"),
    startLine: z.number().int().positive().optional().describe("First line to return (1-indexed)"),
    endLine: z.number().int().positive().optional().describe("Last line to return (inclusive)"),
  }),
  approval: "read",
  async execute(args, ctx) {
    try {
      const target = await resolveWithinWorkspace(ctx.workspaceRoot, args.path);
      const raw = await readFileAsText(target, args.path);

      // Split into lines, dropping the single trailing empty string a final
      // newline produces (an empty file has zero lines).
      let lines = raw.split("\n");
      if (lines.length > 0 && lines[lines.length - 1] === "") lines = lines.slice(0, -1);

      const total = lines.length;
      if (total === 0) return { content: "(empty file)" };

      const start = Math.max(1, args.startLine ?? 1);
      const end = Math.min(total, args.endLine ?? total);

      if (start > end) {
        return {
          content: `(requested range starts at line ${args.startLine} but the file has ${total} lines)`,
        };
      }

      const width = String(end).length;
      const selected = lines.slice(start - 1, end).map((text, i) => {
        const n = start + i;
        return `${String(n).padStart(width, " ")}|${text}`;
      });

      return truncateResult({ content: selected.join("\n") });
    } catch (err) {
      return { content: err instanceof Error ? err.message : String(err), isError: true };
    }
  },
});
