import { promises as fs } from "node:fs";

import { afterEach, describe, expect, it } from "vitest";

import { globToRegExp, globTool } from "./glob";
import { cleanupTempWorkspaces, makeContext, makeTempWorkspace, writeFile } from "./test-utils";

afterEach(cleanupTempWorkspaces);

describe("globToRegExp", () => {
  it("treats `*` as not crossing `/`", () => {
    expect(globToRegExp("*.ts").test("a.ts")).toBe(true);
    expect(globToRegExp("*.ts").test("x/a.ts")).toBe(false);
  });

  it("treats `**` as crossing `/`", () => {
    const re = globToRegExp("src/**/*.ts");
    expect(re.test("src/a.ts")).toBe(true);
    expect(re.test("src/x/y.ts")).toBe(true);
    expect(re.test("lib/a.ts")).toBe(false);
  });

  it("treats `?` as exactly one non-slash character", () => {
    expect(globToRegExp("f?.txt").test("f1.txt")).toBe(true);
    expect(globToRegExp("f?.txt").test("f12.txt")).toBe(false);
    expect(globToRegExp("f?.txt").test("f/1.txt")).toBe(false);
  });
});

describe("glob", () => {
  async function makeFixture(): Promise<string> {
    const root = await makeTempWorkspace();
    await writeFile(`${root}/src/index.ts`, "export {}");
    await writeFile(`${root}/src/util.ts`, "export {}");
    await writeFile(`${root}/src/nested/deep.ts`, "export {}");
    await writeFile(`${root}/src/nested/deep.js`, "// js");
    await writeFile(`${root}/a.ts`, "export {}");
    await writeFile(`${root}/b.js`, "// js");
    await writeFile(`${root}/f1.txt`, "x");
    await writeFile(`${root}/f12.txt`, "x");
    return root;
  }

  it("matches recursive patterns with sorted relative paths", async () => {
    const root = await makeFixture();

    const result = await globTool.execute({ pattern: "src/**/*.ts" }, makeContext(root));

    expect(result.isError).toBeUndefined();
    expect(result.content).toBe("src/index.ts\nsrc/nested/deep.ts\nsrc/util.ts");
  });

  it("keeps `*` at the root level only", async () => {
    const root = await makeFixture();

    const result = await globTool.execute({ pattern: "*.ts" }, makeContext(root));

    expect(result.content).toBe("a.ts");
  });

  it("matches a single `?` character", async () => {
    const root = await makeFixture();

    const result = await globTool.execute({ pattern: "f?.txt" }, makeContext(root));

    expect(result.content).toBe("f1.txt");
  });

  it("lists only direct children for `src/*`", async () => {
    const root = await makeFixture();

    const result = await globTool.execute({ pattern: "src/*" }, makeContext(root));

    expect(result.content).toBe("src/index.ts\nsrc/util.ts");
  });

  it("reports no matches for a missing directory", async () => {
    const root = await makeFixture();

    const result = await globTool.execute({ pattern: "nope/**" }, makeContext(root));

    expect(result.isError).toBeUndefined();
    expect(result.content).toBe("(no matches)");
  });

  it("does not follow symlinks", async () => {
    const root = await makeFixture();
    await fs.symlink(`${root}/src`, `${root}/src-link`);

    const result = await globTool.execute({ pattern: "src-link/**/*.ts" }, makeContext(root));

    expect(result.content).toBe("(no matches)");
  });
});
