import { promises as fs } from "node:fs";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { snapshotBeforeMutation, snapshotFile } from "./snapshot";
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

    expect(out).toBe(path.join(snapshots, "conv-1", "turn-3", "1_app.ts.before"));
    await expect(fs.readFile(out!, "utf8")).resolves.toBe("export const x = 1;\n");
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

    expect(out).toBe(path.join(snapshots, "c", "t", "2_a.txt.before"));
    await expect(fs.readFile(out!, "utf8")).resolves.toBe("second");
    await expect(fs.readFile(path.join(snapshots, "c", "t", "1_a.txt.before"), "utf8")).resolves.toBe(
      "first",
    );
  });

  it("returns undefined for a file that does not exist yet", async () => {
    const root = await makeTempWorkspace();
    const snapshots = await makeTempWorkspace("oa-snapshots-");

    const out = await snapshotFile(`${root}/new.txt`, {
      snapshotRoot: snapshots,
      conversationId: "c",
      turnId: "t",
    });

    expect(out).toBeUndefined();
    await expect(fs.readdir(snapshots)).resolves.toEqual([]);
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
});
