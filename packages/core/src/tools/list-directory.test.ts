import { promises as fs } from "node:fs";

import { afterEach, describe, expect, it } from "vitest";

import { listDirectoryTool } from "./list-directory";
import { cleanupTempWorkspaces, makeContext, makeTempWorkspace, writeFile } from "./test-utils";

afterEach(cleanupTempWorkspaces);

describe("list_directory", () => {
  it("renders a tree with directories first and trailing slashes", async () => {
    const root = await makeTempWorkspace();
    await writeFile(`${root}/src/index.ts`, "export {}");
    await writeFile(`${root}/src/deep/x.ts`, "export {}");
    await writeFile(`${root}/a.txt`, "hi");

    const result = await listDirectoryTool.execute(
      { path: ".", depth: 3 },
      makeContext(root),
    );

    expect(result.isError).toBeUndefined();
    expect(result.content).toBe(".\n  src/\n    deep/\n      x.ts\n    index.ts\n  a.txt");
  });

  it("respects the depth limit and does not expand deeper directories", async () => {
    const root = await makeTempWorkspace();
    await writeFile(`${root}/src/deep/x.ts`, "export {}");

    const result = await listDirectoryTool.execute({ path: ".", depth: 1 }, makeContext(root));

    expect(result.content).toBe(".\n  src/");
  });

  it("excludes paths matched by the root .gitignore", async () => {
    const root = await makeTempWorkspace();
    await writeFile(`${root}/.gitignore`, "node_modules/\n*.log\n!keep.log\n");
    await writeFile(`${root}/node_modules/foo.js`, "x");
    await writeFile(`${root}/app.log`, "log");
    await writeFile(`${root}/keep.log`, "log");
    await writeFile(`${root}/src/main.ts`, "export {}");

    const result = await listDirectoryTool.execute({ path: ".", depth: 3 }, makeContext(root));

    expect(result.content).toBe(".\n  src/\n    main.ts\n  .gitignore\n  keep.log");
  });

  it("respects a nested .gitignore inside a subdirectory", async () => {
    const root = await makeTempWorkspace();
    await writeFile(`${root}/src/.gitignore`, "generated/\n");
    await writeFile(`${root}/src/index.ts`, "export {}");
    await writeFile(`${root}/src/generated/x.ts`, "export {}");

    const result = await listDirectoryTool.execute({ path: "src", depth: 3 }, makeContext(root));

    expect(result.content).toBe("src\n  .gitignore\n  index.ts");
  });

  it("lists symlinks with a marker and never follows them", async () => {
    const root = await makeTempWorkspace();
    await writeFile(`${root}/real.txt`, "hi");
    await fs.symlink(`${root}/real.txt`, `${root}/link.txt`);

    const result = await listDirectoryTool.execute({ path: ".", depth: 3 }, makeContext(root));

    expect(result.content).toBe(".\n  link.txt@\n  real.txt");
  });

  it("rejects a path that escapes the workspace", async () => {
    const root = await makeTempWorkspace();

    const result = await listDirectoryTool.execute({ path: ".." }, makeContext(root));

    expect(result.isError).toBe(true);
    expect(result.content).toContain("outside the workspace");
  });
});
