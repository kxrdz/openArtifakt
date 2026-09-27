import { promises as fs } from "node:fs";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { snapshotBeforeMutation, snapshotFile, restoreTurnSnapshots } from "./snapshot";
import { cleanupTempWorkspaces, makeContext, makeTempWorkspace, writeFile } from "./test-utils";

afterEach(cleanupTempWorkspaces);

describe("snapshotFile", () => {
  it("writes the pre-mutation content to <snapshotRoot>/<conversation>/<turn>/<counter>_<basename>.before", async () => {
    const root = await makeTempWorkspace();
    const snapshots = await makeTempWorkspace("oa-snapshots-");
    await writeFile(`${root}/src/app.ts`, "export const x = 1;\n");

    const out = await snapshotFile(`${root}/src/app.ts`, {
      snapshotRoot: snapshots,
      conversationId: "conv-1",
      turnId: "turn-3",
    });

    expect(out).toEqual({
      path: path.join(snapshots, "conv-1", "turn-3", "1_app.ts.before"),
      kind: "before",
    });
    await expect(fs.readFile(out.path, "utf8")).resolves.toBe("export const x = 1;\n");
  });

  it("increments the per-turn counter across successive snapshots", async () => {
    const root = await makeTempWorkspace();
    const snapshots = await makeTempWorkspace("oa-snapshots-");
    await writeFile(`${root}/a.txt`, "first");

    const location = { snapshotRoot: snapshots, conversationId: "c", turnId: "t" };
    await snapshotFile(`${root}/a.txt`, location);
    // Mutate the file so the second snapshot differs from the first.
    await writeFile(`${root}/a.txt`, "second");
    const out = await snapshotFile(`${root}/a.txt`, location);

    expect(out).toEqual({
      path: path.join(snapshots, "c", "t", "2_a.txt.before"),
      kind: "before",
    });
    await expect(fs.readFile(out.path, "utf8")).resolves.toBe("second");
    await expect(fs.readFile(path.join(snapshots, "c", "t", "1_a.txt.before"), "utf8")).resolves.toBe(
      "first",
    );
  });

  it("writes a zero-length `.created` marker for a file that does not exist yet", async () => {
    const root = await makeTempWorkspace();
    const snapshots = await makeTempWorkspace("oa-snapshots-");

    const out = await snapshotFile(`${root}/new.txt`, {
      snapshotRoot: snapshots,
      conversationId: "c",
      turnId: "t",
    });

    expect(out).toEqual({
      path: path.join(snapshots, "c", "t", "1_new.txt.created"),
      kind: "created",
    });
    await expect(fs.readFile(out.path, "utf8")).resolves.toBe("");
  });

  it("reports kind 'before' alongside the snapshot path for an existing file", async () => {
    const root = await makeTempWorkspace();
    const snapshots = await makeTempWorkspace("oa-snapshots-");
    await writeFile(`${root}/a.txt`, "prior");

    const out = await snapshotFile(`${root}/a.txt`, {
      snapshotRoot: snapshots,
      conversationId: "c",
      turnId: "t",
    });

    expect(out).toEqual({
      path: path.join(snapshots, "c", "t", "1_a.txt.before"),
      kind: "before",
    });
  });
});

describe("snapshotBeforeMutation", () => {
  it("invokes the host snapshot callback when one is provided", async () => {
    const root = await makeTempWorkspace();
    await writeFile(`${root}/a.txt`, "hello");
    const calls: string[] = [];
    const ctx = makeContext(root, {
      snapshot: async (p) => {
        calls.push(p);
      },
    });

    await snapshotBeforeMutation(ctx, `${root}/a.txt`);

    expect(calls).toEqual([`${root}/a.txt`]);
  });

  it("writes a file snapshot when snapshotRoot is set and defaults the segments", async () => {
    const root = await makeTempWorkspace();
    const snapshots = await makeTempWorkspace("oa-snapshots-");
    await writeFile(`${root}/b.txt`, "before");
    const ctx = makeContext(root, { snapshotRoot: snapshots });

    await snapshotBeforeMutation(ctx, `${root}/b.txt`);

    const out = path.join(snapshots, "default", "default", "1_b.txt.before");
    await expect(fs.readFile(out, "utf8")).resolves.toBe("before");
  });

  it("returns the recorded kind for existing and created files", async () => {
    const root = await makeTempWorkspace();
    const snapshots = await makeTempWorkspace("oa-snapshots-");
    await writeFile(`${root}/exists.txt`, "content");
    const ctx = makeContext(root, { snapshotRoot: snapshots });

    const before = await snapshotBeforeMutation(ctx, `${root}/exists.txt`);
    expect(before?.kind).toBe("before");

    const created = await snapshotBeforeMutation(ctx, `${root}/new.txt`);
    expect(created?.kind).toBe("created");
    await expect(fs.readFile(created!.path, "utf8")).resolves.toBe("");
  });

  it("returns undefined when no snapshot root is configured", async () => {
    const root = await makeTempWorkspace();
    await writeFile(`${root}/a.txt`, "hello");
    const ctx = makeContext(root);

    await expect(snapshotBeforeMutation(ctx, `${root}/a.txt`)).resolves.toBeUndefined();
  });

  it("preserves the workspace-relative directory for nested files", async () => {
    const root = await makeTempWorkspace();
    const snapshots = await makeTempWorkspace("oa-snapshots-");
    await writeFile(`${root}/src/app.ts`, "const x = 1;\n");
    const ctx = makeContext(root, {
      snapshotRoot: snapshots,
      conversationId: "conv",
      turnId: "turn",
    });

    const out = await snapshotBeforeMutation(ctx, `${root}/src/app.ts`);

    expect(out).toEqual({
      path: path.join(snapshots, "conv", "turn", "src", "1_app.ts.before"),
      kind: "before",
    });
    await expect(fs.readFile(out!.path, "utf8")).resolves.toBe("const x = 1;\n");
  });
});

describe("restoreTurnSnapshots", () => {
  it("restores edited files in reverse order and deletes files the turn created", async () => {
    const root = await makeTempWorkspace();
    const snapshots = await makeTempWorkspace("oa-snapshots-");
    await writeFile(`${root}/a.txt`, "v0");

    const location = { snapshotRoot: snapshots, conversationId: "c", turnId: "t" };
    // Two mutations of a.txt and one created file, mirroring a turn's order.
    await snapshotFile(`${root}/a.txt`, location, "a.txt"); // v0 -> .before
    await writeFile(`${root}/a.txt`, "v1");
    await snapshotFile(`${root}/a.txt`, location, "a.txt"); // v1 -> .before
    await writeFile(`${root}/a.txt`, "v2");
    await snapshotFile(`${root}/new.txt`, location, "new.txt"); // created marker
    await writeFile(`${root}/new.txt`, "brand new");

    const result = await restoreTurnSnapshots(location, root);

    // Reverse order: the earliest .before (v0) wins; the created file is removed.
    await expect(fs.readFile(`${root}/a.txt`, "utf8")).resolves.toBe("v0");
    await expect(fs.readFile(`${root}/new.txt`, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    expect(result.restored).toEqual(["a.txt"]);
    expect(result.deleted).toEqual(["new.txt"]);

    // The turn's snapshot directory is gone.
    await expect(fs.access(path.join(snapshots, "c", "t"))).rejects.toMatchObject({ code: "ENOENT" });
  });
});
