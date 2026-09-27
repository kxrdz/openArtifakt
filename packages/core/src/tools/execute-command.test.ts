import { promises as fs } from "node:fs";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { executeCommandTool } from "./execute-command";
import { cleanupTempWorkspaces, makeContext, makeTempWorkspace, writeFile } from "./test-utils";

afterEach(cleanupTempWorkspaces);

/** True when a pid still refers to a live process. */
function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // EPERM means the process exists but belongs to another user.
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}

describe("execute_command", () => {
  it("returns the exit code and combined output", async () => {
    const root = await makeTempWorkspace();

    const result = await executeCommandTool.execute(
      { command: 'echo "hello world"' },
      makeContext(root),
    );

    expect(result.isError).toBeUndefined();
    expect(result.content).toContain("hello world");
    expect(result.content).toContain("[exit code 0]");
  });

  it("reports a non-zero exit code as an error", async () => {
    const root = await makeTempWorkspace();

    const result = await executeCommandTool.execute(
      { command: "exit 3" },
      makeContext(root),
    );

    expect(result.isError).toBe(true);
    expect(result.content).toContain("[exit code 3]");
  });

  it("streams stdout and stderr through onOutput as they arrive", async () => {
    const root = await makeTempWorkspace();
    const chunks: Array<{ stream: "stdout" | "stderr"; text: string }> = [];

    const result = await executeCommandTool.execute(
      { command: 'echo "to stdout"; echo "to stderr" 1>&2' },
      makeContext(root, {
        onOutput: (text, stream) => chunks.push({ stream, text }),
      }),
    );

    expect(result.isError).toBeUndefined();
    expect(result.content).toContain("to stdout");
    expect(result.content).toContain("to stderr");

    const stdout = chunks
      .filter((c) => c.stream === "stdout")
      .map((c) => c.text)
      .join("");
    const stderr = chunks
      .filter((c) => c.stream === "stderr")
      .map((c) => c.text)
      .join("");
    expect(stdout).toContain("to stdout");
    expect(stderr).toContain("to stderr");
  });

  it("runs the command with a cwd resolved within the workspace jail", async () => {
    const root = await makeTempWorkspace();
    await writeFile(`${root}/sub/.keep`, "");

    const result = await executeCommandTool.execute(
      { command: "pwd", cwd: "sub" },
      makeContext(root),
    );

    const expected = await fs.realpath(path.join(root, "sub"));
    expect(result.isError).toBeUndefined();
    expect(result.content).toContain(expected);
  });

  it("rejects a cwd that escapes the workspace", async () => {
    const root = await makeTempWorkspace();

    const result = await executeCommandTool.execute(
      { command: "pwd", cwd: "../outside" },
      makeContext(root),
    );

    expect(result.isError).toBe(true);
    expect(result.content).toContain("outside the workspace");
  });

  it("kills the command on timeout and reports it", async () => {
    const root = await makeTempWorkspace();
    const start = Date.now();

    const result = await executeCommandTool.execute(
      { command: 'node -e "setTimeout(() => {}, 5000)"', timeoutMs: 100 },
      makeContext(root),
    );

    expect(result.isError).toBe(true);
    expect(result.content).toContain("[command timed out after 100 ms]");
    expect(Date.now() - start).toBeLessThan(3000);
  });

  it("kills the whole process tree on timeout", async () => {
    const root = await makeTempWorkspace();
    await writeFile(
      `${root}/parent.js`,
      [
        'const fs = require("fs");',
        'const { spawn } = require("child_process");',
        'const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"]);',
        'fs.writeFileSync("child.pid", String(child.pid));',
        "setInterval(() => {}, 1000);",
        "",
      ].join("\n"),
    );

    const result = await executeCommandTool.execute(
      { command: "node parent.js", timeoutMs: 200 },
      makeContext(root),
    );

    expect(result.isError).toBe(true);
    expect(result.content).toContain("timed out");

    const grandchildPid = Number(await fs.readFile(`${root}/child.pid`, "utf8"));
    expect(Number.isInteger(grandchildPid)).toBe(true);
    expect(grandchildPid).toBeGreaterThan(0);

    // The grandchild must be gone too, not just the shell that ran the command.
    const deadline = Date.now() + 2000;
    let alive = true;
    while (Date.now() < deadline) {
      if (!isAlive(grandchildPid)) {
        alive = false;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    expect(alive).toBe(false);
  });

  it("kills the command and reports cancellation when aborted", async () => {
    const root = await makeTempWorkspace();
    const controller = new AbortController();
    const start = Date.now();

    const pending = executeCommandTool.execute(
      { command: 'node -e "setTimeout(() => {}, 5000)"', timeoutMs: 5000 },
      makeContext(root, { signal: controller.signal }),
    );
    setTimeout(() => controller.abort(), 100);

    const result = await pending;

    expect(result.isError).toBe(true);
    expect(result.content).toContain("cancelled by user");
    expect(Date.now() - start).toBeLessThan(3000);
  });

  it("reports cancellation immediately when the signal is already aborted", async () => {
    const root = await makeTempWorkspace();
    const controller = new AbortController();
    controller.abort();

    const result = await executeCommandTool.execute(
      { command: "echo should not run" },
      makeContext(root, { signal: controller.signal }),
    );

    expect(result.isError).toBe(true);
    expect(result.content).toBe("cancelled by user");
  });
});
