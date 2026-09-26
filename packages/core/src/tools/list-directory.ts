import * as path from "node:path";
import { z } from "zod";

import { resolveWithinWorkspace } from "../security/path-jail";
import { readdirSorted } from "./fs";
import { GitignoreMatcher, loadGitignore } from "./gitignore";
import { truncateResult } from "./truncate";
import { defineTool } from "./types";

const DEFAULT_DEPTH = 3;
const MAX_DEPTH = 20;

interface TreeNode {
  name: string;
  isDirectory: boolean;
  isSymbolicLink: boolean;
  children: TreeNode[] | null;
}

/** Render the tree as an indented listing: directories end with `/`, symlinks with `@`. */
function renderTree(rootLabel: string, nodes: TreeNode[]): string {
  const lines: string[] = [rootLabel];
  const visit = (node: TreeNode, level: number): void => {
    const indent = "  ".repeat(level);
    const suffix = node.isSymbolicLink ? "@" : node.isDirectory ? "/" : "";
    lines.push(`${indent}${node.name}${suffix}`);
    if (node.children) for (const child of node.children) visit(child, level + 1);
  };
  for (const node of nodes) visit(node, 1);
  return lines.join("\n");
}

/**
 * Collect the tree below `realDir`. `scopeRel` is `realDir`'s path relative to
 * the workspace root (`""` for the root), used to scope nested `.gitignore`
 * rules. `depth` is the number of entry levels to emit.
 */
async function collectTree(
  realDir: string,
  scopeRel: string,
  depth: number,
  matcher: GitignoreMatcher,
): Promise<TreeNode[]> {
  const lines = await loadGitignore(realDir);
  if (lines.length > 0) matcher.addScope(scopeRel, lines);

  const entries = await readdirSorted(realDir);
  const nodes: TreeNode[] = [];

  for (const entry of entries) {
    const rel = scopeRel === "" ? entry.name : `${scopeRel}/${entry.name}`;
    if (matcher.isIgnored(rel, entry.isDirectory)) continue;

    if (entry.isDirectory && depth > 1) {
      const children = await collectTree(path.join(realDir, entry.name), rel, depth - 1, matcher);
      nodes.push({ name: entry.name, isDirectory: true, isSymbolicLink: false, children });
    } else {
      nodes.push({
        name: entry.name,
        isDirectory: entry.isDirectory,
        isSymbolicLink: entry.isSymbolicLink,
        children: null,
      });
    }
  }

  return nodes;
}

/**
 * `list_directory` (§8). Returns an indented directory tree, respecting
 * `.gitignore` files at the workspace root and every directory it descends
 * into. `depth` caps how many entry levels are shown; symlinks are listed but
 * never followed.
 */
export const listDirectoryTool = defineTool({
  name: "list_directory",
  description:
    "List a directory tree from the workspace. Directories end with `/`, symlinks with `@`. " +
    "Respects `.gitignore` files. `depth` limits how many levels of entries are shown.",
  parameters: z.object({
    path: z.string().min(1).describe("Directory path relative to the workspace root"),
    depth: z
      .number()
      .int()
      .min(1)
      .max(MAX_DEPTH)
      .optional()
      .describe("Number of entry levels to show (default 3)"),
  }),
  approval: "read",
  async execute(args, ctx) {
    try {
      const realRoot = await resolveWithinWorkspace(ctx.workspaceRoot, args.path);
      const scopeRel = scopeRelFor(ctx.workspaceRoot, realRoot);

      // Root `.gitignore` applies even when listing a subdirectory.
      const matcher = new GitignoreMatcher();
      const rootLines = await loadGitignore(ctx.workspaceRoot);
      if (rootLines.length > 0) matcher.addScope("", rootLines);

      const nodes = await collectTree(realRoot, scopeRel, args.depth ?? DEFAULT_DEPTH, matcher);
      const rootLabel = scopeRel === "" ? "." : scopeRel;
      return truncateResult({ content: renderTree(rootLabel, nodes) });
    } catch (err) {
      return { content: err instanceof Error ? err.message : String(err), isError: true };
    }
  },
});

/** Normalized path of `realPath` relative to `workspaceRoot` (both realpath'd). */
function scopeRelFor(workspaceRoot: string, realPath: string): string {
  const rel = path.relative(workspaceRoot, realPath).replace(/\\/g, "/");
  return rel === "" ? "" : rel;
}
