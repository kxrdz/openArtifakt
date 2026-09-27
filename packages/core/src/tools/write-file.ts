import { promises as fs } from "node:fs";
import * as path from "node:path";
import { z } from "zod";

import { assertWritablePath, resolveWithinWorkspace, resolveWorkspaceRoot } from "../security/path-jail";
import { snapshotBeforeMutation } from "./snapshot";
import { defineTool } from "./types";

/**
 * `write_file` (§8). Creates a file or fully rewrites an existing one. Parent
 * directories are created as needed. An existing file is snapshotted before it
 * is overwritten, and a new file is recorded with a `.created` marker, so a
 * later "Undo this turn" can restore or delete it.
 */
export const writeFileTool = defineTool({
  name: "write_file",
  description:
    "Create a new file or fully rewrite an existing one with the given content. " +
    "Prefer edit_file for small changes to existing files.",
  parameters: z.object({
    path: z.string().min(1).describe("File path relative to the workspace root"),
    content: z.string().describe("Full content to write"),
  }),
  approval: "write",
  async execute(args, ctx) {
    try {
      const realRoot = await resolveWorkspaceRoot(ctx.workspaceRoot);
      const target = await resolveWithinWorkspace(ctx.workspaceRoot, args.path);
      assertWritablePath(realRoot, target);

      const snapshot = await snapshotBeforeMutation(ctx, target);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, args.content, "utf8");

      const verb = snapshot?.kind === "created" ? "Created" : "Wrote";
      return { content: `${verb} "${args.path}" (${args.content.length} characters)` };
    } catch (err) {
      return { content: err instanceof Error ? err.message : String(err), isError: true };
    }
  },
});
