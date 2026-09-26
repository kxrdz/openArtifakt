import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  PathJailError,
  assertWritablePath,
  isWithin,
  resolveWithinWorkspace,
} from "./path-jail";

const tmpDirs: string[] = [];

async function makeWorkspace(): Promise<{ root: string; outside: string }> {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "oa-jail-"));
  tmpDirs.push(base);
  const root = path.join(base, "workspace");
  const outside = path.join(base, "outside");
  await fs.mkdir(root, { recursive: true });
  await fs.mkdir(outside, { recursive: true });
  await fs.writeFile(path.join(outside, "secret.txt"), "outside content");
  return { root, outside };
}

afterEach(async () => {
  await Promise.all(tmpDirs.splice(0).map((d) => fs.rm(d, { recursive: true, force: true })));
});

describe("resolveWithinWorkspace", () => {
  it("resolves a path inside the workspace to its real path", async () => {
    const { root } = await makeWorkspace();
    await fs.writeFile(path.join(root, "a.txt"), "hi");
    await expect(resolveWithinWorkspace(root, "a.txt")).resolves.toBe(
      await fs.realpath(path.join(root, "a.txt")),
    );
  });

  it("allows a not-yet-created path inside the workspace", async () => {
    const { root } = await makeWorkspace();
    await expect(resolveWithinWorkspace(root, "new/dir/file.ts")).resolves.toBe(
      path.join(await fs.realpath(root), "new", "dir", "file.ts"),
    );
  });

  it("rejects parent traversal to an existing file", async () => {
    const { root } = await makeWorkspace();
    await expect(resolveWithinWorkspace(root, "../outside/secret.txt")).rejects.toThrow(
      PathJailError,
    );
  });

  it("rejects parent traversal to a non-existent file", async () => {
    const { root } = await makeWorkspace();
    await expect(resolveWithinWorkspace(root, "../nope.txt")).rejects.toThrow(PathJailError);
  });

  it("rejects an absolute path outside the workspace", async () => {
    const { root, outside } = await makeWorkspace();
    await expect(resolveWithinWorkspace(root, path.join(outside, "secret.txt"))).rejects.toThrow(
      PathJailError,
    );
  });

  it("rejects a symlink whose target escapes the workspace", async () => {
    const { root, outside } = await makeWorkspace();
    await fs.symlink(path.join(outside, "secret.txt"), path.join(root, "link.txt"));
    await expect(resolveWithinWorkspace(root, "link.txt")).rejects.toThrow(PathJailError);
  });

  it("allows a symlink that stays inside the workspace", async () => {
    const { root } = await makeWorkspace();
    await fs.writeFile(path.join(root, "real.txt"), "x");
    await fs.symlink(path.join(root, "real.txt"), path.join(root, "link.txt"));
    await expect(resolveWithinWorkspace(root, "link.txt")).resolves.toBe(
      await fs.realpath(path.join(root, "real.txt")),
    );
  });

  it("rejects a missing workspace root", async () => {
    const { root } = await makeWorkspace();
    await expect(resolveWithinWorkspace(path.join(root, "missing"), "a.txt")).rejects.toThrow(
      PathJailError,
    );
  });
});

describe("assertWritablePath", () => {
  it("denies writes inside .git", () => {
    expect(() => assertWritablePath("/ws", "/ws/.git")).toThrow(PathJailError);
    expect(() => assertWritablePath("/ws", "/ws/.git/config")).toThrow(PathJailError);
  });

  it("allows writes outside .git, including .github", () => {
    expect(() => assertWritablePath("/ws", "/ws/src/index.ts")).not.toThrow();
    expect(() => assertWritablePath("/ws", "/ws/.github/workflows/ci.yml")).not.toThrow();
  });
});

describe("isWithin", () => {
  it("treats root and descendants as within", () => {
    expect(isWithin("/ws", "/ws")).toBe(true);
    expect(isWithin("/ws", "/ws/a/b")).toBe(true);
  });

  it("treats siblings and near-prefix paths as outside", () => {
    expect(isWithin("/ws", "/ws2/a")).toBe(false);
    expect(isWithin("/ws", "/etc/passwd")).toBe(false);
  });
});
