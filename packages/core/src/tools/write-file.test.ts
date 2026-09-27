import { promises as fs } from "node:fs";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { cleanupTempWorkspaces, makeContext, makeTempWorkspace, writeFile } from "./test-utils";
import { writeFileTool } from "./write-file";

afterEach(cleanupTempWorkspaces);

describe("write_file", () => {
  it("creates a new file (and parent directories)", async () => {
    const root = await makeTempWorkspace();

    const result = await writeFileTool.execute(
      { path: "src/lib/util.ts", content: "export const ok = true;\n" },
      makeContext(root),
    );

    expect(result.isError).toBeUndefined();
    await expect(fs.readFile(`${root}/src/lib/util.ts`, "utf8")).resolves.toBe(
      "export const ok = true;\n",
    );
  });

  it("fully rewrites an existing file", async () => {
    const root = await makeTempWorkspace();
    await writeFile(`${root}/a.txt`, "old content");

    const result = await writeFileTool.execute(
      { path: "a.txt", content: "new content" },
      makeContext(root),
    );

    expect(result.isError).toBeUndefined();
    await expect(fs.readFile(`${root}/a.txt`, "utf8")).resolves.toBe("new content");
  });

  it("rejects a path that escapes the workspace", async () => {
    const root = await makeTempWorkspace();

    const result = await writeFileTool.execute(
      { path: "../outside.txt", content: "nope" },
      makeContext(root),
    );

    expect(result.isError).toBe(true);
    expect(result.content).toContain("outside the workspace");
  });

  it("rejects a write inside .git/", async () => {
    const root = await makeTempWorkspace();

    const result = await writeFileTool.execute(
      { path: ".git/hooks/pre-commit", content: "#!/bin/sh\n" },
      makeContext(root),
    );

    expect(result.isError).toBe(true);
    expect(result.content).toContain(".git");
  });

  it("snapshots an existing file before overwriting it", async () => {
    const root = await makeTempWorkspace();
    const snapshots = await makeTempWorkspace("oa-snapshots-");
    await writeFile(`${root}/a.txt`, "before");

    await writeFileTool.execute(
      { path: "a.txt", content: "after" },
      makeContext(root, { snapshotRoot: snapshots, conversationId: "conv", turnId: "turn" }),
    );

    const before = path.join(snapshots, "conv", "turn", "1_a.txt.before");
    await expect(fs.readFile(before, "utf8")).resolves.toBe("before");
    await expect(fs.readFile(`${root}/a.txt`, "utf8")).resolves.toBe("after");
  });

  it("writes a `.created` marker for a brand-new file", async () => {
    const root = await makeTempWorkspace();
    const snapshots = await makeTempWorkspace("oa-snapshots-");

    const result = await writeFileTool.execute(
      { path: "fresh.txt", content: "hi" },
      makeContext(root, { snapshotRoot: snapshots, conversationId: "conv", turnId: "turn" }),
    );

    expect(result.isError).toBeUndefined();
    expect(result.content).toContain('Created "fresh.txt"');
    const marker = path.join(snapshots, "conv", "turn", "1_fresh.txt.created");
    await expect(fs.readFile(marker, "utf8")).resolves.toBe("");
  });
});
