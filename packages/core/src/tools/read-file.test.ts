import { afterEach, describe, expect, it } from "vitest";

import { readFileTool } from "./read-file";
import { cleanupTempWorkspaces, makeContext, makeTempWorkspace, writeFile } from "./test-utils";

afterEach(cleanupTempWorkspaces);

describe("read_file", () => {
  it("reads a file and prefixes each line with its line number", async () => {
    const root = await makeTempWorkspace();
    await writeFile(`${root}/src/index.ts`, "const a = 1;\nconst b = 2;\n");

    const result = await readFileTool.execute({ path: "src/index.ts" }, makeContext(root));

    expect(result.isError).toBeUndefined();
    expect(result.content).toBe("1|const a = 1;\n2|const b = 2;");
  });

  it("right-pads line numbers to the widest line shown", async () => {
    const root = await makeTempWorkspace();
    const lines = Array.from({ length: 12 }, (_, i) => `line ${i + 1}`);
    await writeFile(`${root}/lines.txt`, lines.join("\n"));

    const result = await readFileTool.execute({ path: "lines.txt" }, makeContext(root));

    expect(result.content!.split("\n")[0]).toBe(" 1|line 1");
    expect(result.content!.split("\n")[9]).toBe("10|line 10");
  });

  it("returns only the requested startLine..endLine slice", async () => {
    const root = await makeTempWorkspace();
    await writeFile(`${root}/nums.txt`, "one\ntwo\nthree\nfour\nfive\n");

    const result = await readFileTool.execute(
      { path: "nums.txt", startLine: 2, endLine: 4 },
      makeContext(root),
    );

    expect(result.content).toBe("2|two\n3|three\n4|four");
  });

  it("clamps the range to the file's bounds", async () => {
    const root = await makeTempWorkspace();
    await writeFile(`${root}/nums.txt`, "one\ntwo\nthree\n");

    const result = await readFileTool.execute(
      { path: "nums.txt", startLine: 1, endLine: 99 },
      makeContext(root),
    );

    expect(result.content).toBe("1|one\n2|two\n3|three");
  });

  it("notes a requested range that starts beyond the file", async () => {
    const root = await makeTempWorkspace();
    await writeFile(`${root}/nums.txt`, "one\ntwo\n");

    const result = await readFileTool.execute(
      { path: "nums.txt", startLine: 10, endLine: 20 },
      makeContext(root),
    );

    expect(result.isError).toBeUndefined();
    expect(result.content).toMatch(/has 2 lines/);
  });

  it("reports a missing file as an error result", async () => {
    const root = await makeTempWorkspace();

    const result = await readFileTool.execute({ path: "nope.txt" }, makeContext(root));

    expect(result.isError).toBe(true);
    expect(result.content).toContain("File not found: nope.txt");
  });

  it("rejects a path that escapes the workspace", async () => {
    const root = await makeTempWorkspace();

    const result = await readFileTool.execute({ path: "../secret.txt" }, makeContext(root));

    expect(result.isError).toBe(true);
    expect(result.content).toContain("outside the workspace");
  });

  it("returns an empty-file marker for a zero-length file", async () => {
    const root = await makeTempWorkspace();
    await writeFile(`${root}/empty.txt`, "");

    const result = await readFileTool.execute({ path: "empty.txt" }, makeContext(root));

    expect(result.content).toBe("(empty file)");
  });
});
