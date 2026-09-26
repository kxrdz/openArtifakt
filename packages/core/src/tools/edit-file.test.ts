import { promises as fs } from "node:fs";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { editFileTool } from "./edit-file";
import { cleanupTempWorkspaces, makeContext, makeTempWorkspace, writeFile } from "./test-utils";

afterEach(cleanupTempWorkspaces);

describe("edit_file", () => {
  it("replaces an exact string that occurs once", async () => {
    const root = await makeTempWorkspace();
    await writeFile(`${root}/src/index.ts`, "const greet = () => 'hi';\n");

    const result = await editFileTool.execute(
      { path: "src/index.ts", oldString: "'hi'", newString: "'hello'" },
      makeContext(root),
    );

    expect(result.isError).toBeUndefined();
    await expect(fs.readFile(`${root}/src/index.ts`, "utf8")).resolves.toBe(
      "const greet = () => 'hello';\n",
    );
  });

  it("leaves the file unchanged and reports a helpful not-found error", async () => {
    const root = await makeTempWorkspace();
    const original = "const a = 1;\n";
    await writeFile(`${root}/a.ts`, original);

    const result = await editFileTool.execute(
      { path: "a.ts", oldString: "nope", newString: "yes" },
      makeContext(root),
    );

    expect(result.isError).toBe(true);
    expect(result.content).toContain("not found");
    expect(result.content).toContain("a.ts");
    await expect(fs.readFile(`${root}/a.ts`, "utf8")).resolves.toBe(original);
  });

  it("leaves the file unchanged and reports a not-unique error without replaceAll", async () => {
    const root = await makeTempWorkspace();
    const original = "x = 1;\nx = 2;\nx = 3;\n";
    await writeFile(`${root}/a.ts`, original);

    const result = await editFileTool.execute(
      { path: "a.ts", oldString: "x =", newString: "y =" },
      makeContext(root),
    );

    expect(result.isError).toBe(true);
    expect(result.content).toContain("not unique");
    expect(result.content).toContain("3 times");
    await expect(fs.readFile(`${root}/a.ts`, "utf8")).resolves.toBe(original);
  });

  it("replaces every occurrence when replaceAll is set", async () => {
    const root = await makeTempWorkspace();
    await writeFile(`${root}/a.ts`, "x = 1;\nx = 2;\n");

    const result = await editFileTool.execute(
      { path: "a.ts", oldString: "x =", newString: "y =", replaceAll: true },
      makeContext(root),
    );

    expect(result.isError).toBeUndefined();
    await expect(fs.readFile(`${root}/a.ts`, "utf8")).resolves.toBe("y = 1;\ny = 2;\n");
  });

  it("treats a literal $ in newString as literal text", async () => {
    const root = await makeTempWorkspace();
    await writeFile(`${root}/a.ts`, "price = 5;\n");

    const result = await editFileTool.execute(
      { path: "a.ts", oldString: "5", newString: "$5.00" },
      makeContext(root),
    );

    expect(result.isError).toBeUndefined();
    await expect(fs.readFile(`${root}/a.ts`, "utf8")).resolves.toBe("price = $5.00;\n");
  });

  it("rejects a path that escapes the workspace", async () => {
    const root = await makeTempWorkspace();

    const result = await editFileTool.execute(
      { path: "../outside.txt", oldString: "a", newString: "b" },
      makeContext(root),
    );

    expect(result.isError).toBe(true);
    expect(result.content).toContain("outside the workspace");
  });

  it("rejects a write inside .git/", async () => {
    const root = await makeTempWorkspace();
    await writeFile(`${root}/.git/config`, "[core]\n");

    const result = await editFileTool.execute(
      { path: ".git/config", oldString: "[core]", newString: "[core]\n\tautocrlf = false" },
      makeContext(root),
    );

    expect(result.isError).toBe(true);
    expect(result.content).toContain(".git");
    await expect(fs.readFile(`${root}/.git/config`, "utf8")).resolves.toBe("[core]\n");
  });

  it("snapshots the prior content before mutating", async () => {
    const root = await makeTempWorkspace();
    const snapshots = await makeTempWorkspace("oa-snapshots-");
    await writeFile(`${root}/a.ts`, "one\ntwo\n");

    await editFileTool.execute(
      { path: "a.ts", oldString: "two", newString: "2" },
      makeContext(root, { snapshotRoot: snapshots, conversationId: "conv", turnId: "turn" }),
    );

    const before = path.join(snapshots, "conv", "turn", "1_a.ts.before");
    await expect(fs.readFile(before, "utf8")).resolves.toBe("one\ntwo\n");
    await expect(fs.readFile(`${root}/a.ts`, "utf8")).resolves.toBe("one\n2\n");
  });
});
