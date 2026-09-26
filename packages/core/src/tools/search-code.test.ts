import { promises as fs } from "node:fs";
import * as path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { formatMatches, parseRgJson, searchCodeTool } from "./search-code";
import { cleanupTempWorkspaces, makeContext, makeTempWorkspace, writeFile } from "./test-utils";

afterEach(cleanupTempWorkspaces);

async function makeFixture(): Promise<string> {
  const root = await makeTempWorkspace();
  await writeFile(`${root}/src/a.ts`, "export const x = 1;\n// TODO: fix this\n");
  await writeFile(`${root}/src/b.ts`, "// TODO also\n// done\n");
  await writeFile(`${root}/docs/note.md`, "# TODO list\n");
  return root;
}

describe("search_code", () => {
  it("finds matches across files with the JS fallback", async () => {
    const root = await makeFixture();

    const result = await searchCodeTool.execute({ pattern: "TODO" }, makeContext(root));

    expect(result.isError).toBeUndefined();
    expect(result.content).toBe(
      "docs/note.md:1:# TODO list\n" +
        "src/a.ts:2:// TODO: fix this\n" +
        "src/b.ts:1:// TODO also\n" +
        "3 matches in 3 files",
    );
  });

  it("restricts files with a glob pattern", async () => {
    const root = await makeFixture();

    const result = await searchCodeTool.execute(
      { pattern: "TODO", glob: "src/*.ts" },
      makeContext(root),
    );

    expect(result.content).toBe(
      "src/a.ts:2:// TODO: fix this\n" + "src/b.ts:1:// TODO also\n" + "2 matches in 2 files",
    );
  });

  it("reports an invalid regular expression as an error", async () => {
    const root = await makeFixture();

    const result = await searchCodeTool.execute({ pattern: "(" }, makeContext(root));

    expect(result.isError).toBe(true);
    expect(result.content).toContain("Invalid regular expression");
  });

  it("caps results at the configured maximum", async () => {
    const root = await makeTempWorkspace();
    const lines = Array.from({ length: 110 }, (_, i) => `match line ${i + 1}`);
    await writeFile(`${root}/many.txt`, lines.join("\n"));

    const result = await searchCodeTool.execute({ pattern: "match" }, makeContext(root));

    const matchLines = result.content!.split("\n").filter((l) => l.startsWith("many.txt:"));
    expect(matchLines).toHaveLength(100);
    expect(result.content).toContain("capped at 100 matches");
  });

  it("uses ripgrep when a binary is provided", async () => {
    const root = await makeFixture();
    const fakeRg = path.join(root, "fake-rg");
    await writeFile(
      fakeRg,
      [
        "#!/usr/bin/env node",
        "process.stdout.write(",
        '  JSON.stringify({ type: "match", data: { path: { text: "src/index.ts" }, lines: { text: "const x = 1;" }, line_number: 1 } }) + "\\n" +',
        '  JSON.stringify({ type: "match", data: { path: { text: "src/util.ts" }, lines: { text: "x = 2;" }, line_number: 4 } }) + "\\n"',
        ");",
        "",
      ].join("\n"),
    );
    await fs.chmod(fakeRg, 0o755);

    const result = await searchCodeTool.execute(
      { pattern: "x" },
      makeContext(root, { findRipgrep: async () => fakeRg }),
    );

    expect(result.isError).toBeUndefined();
    expect(result.content).toContain("src/index.ts:1:const x = 1;");
    expect(result.content).toContain("src/util.ts:4:x = 2;");
  });

  it("surfaces a ripgrep error (exit code 2)", async () => {
    const root = await makeFixture();
    const fakeRg = path.join(root, "fake-rg-err");
    await writeFile(
      fakeRg,
      ['#!/usr/bin/env node', 'process.stderr.write("bad pattern");', "process.exit(2);", ""].join("\n"),
    );
    await fs.chmod(fakeRg, 0o755);

    const result = await searchCodeTool.execute(
      { pattern: "x" },
      makeContext(root, { findRipgrep: async () => fakeRg }),
    );

    expect(result.isError).toBe(true);
    expect(result.content).toContain("ripgrep failed");
  });

  it("falls back to the JS walk when ripgrep cannot be spawned", async () => {
    const root = await makeFixture();

    const result = await searchCodeTool.execute(
      { pattern: "TODO" },
      makeContext(root, { findRipgrep: async () => path.join(root, "missing-rg") }),
    );

    expect(result.isError).toBeUndefined();
    expect(result.content).toContain("src/a.ts:2:// TODO: fix this");
  });
});

describe("parseRgJson", () => {
  it("extracts only match records with file, line and text", () => {
    const stdout = [
      JSON.stringify({ type: "begin", data: { path: { text: "src/index.ts" } } }),
      JSON.stringify({
        type: "match",
        data: {
          path: { text: "src/index.ts" },
          lines: { text: "const x = 1;\n" },
          line_number: 1,
        },
      }),
      JSON.stringify({ type: "end", data: { path: { text: "src/index.ts" }, stats: {} } }),
      "not json",
    ].join("\n");

    expect(parseRgJson(stdout)).toEqual([
      { file: "src/index.ts", line: 1, text: "const x = 1;" },
    ]);
  });
});

describe("formatMatches", () => {
  it("formats matches and a summary, and notes a cap", () => {
    const out = formatMatches(
      [
        { file: "a.ts", line: 1, text: "x" },
        { file: "b.ts", line: 2, text: "y" },
      ],
      false,
    );
    expect(out).toBe("a.ts:1:x\nb.ts:2:y\n2 matches in 2 files");
  });
});
