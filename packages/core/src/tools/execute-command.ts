import { spawn } from "node:child_process";
import { z } from "zod";

import { resolveWithinWorkspace, resolveWorkspaceRoot } from "../security/path-jail";
import { truncateResult } from "./truncate";
import { defineTool, type ToolResult } from "./types";

/** Default `execute_command` timeout (§8 "Limits"), overridable per call. */
export const DEFAULT_COMMAND_TIMEOUT_MS = 120_000;

type OutputStream = "stdout" | "stderr";

interface CommandOutcome {
  /** Combined stdout+stderr, in arrival order. */
  output: string;
  /** Process exit code, or `null` when killed by a signal. */
  exitCode: number | null;
  timedOut: boolean;
  aborted: boolean;
}

/**
 * Run `command` via the user's shell in a detached process group so a timeout
 * or abort can kill the whole tree, streaming stdout/stderr through `onOutput`
 * as it arrives. `cwd` must be an absolute, already-jailed directory.
 */
function runCommand(
  command: string,
  cwd: string,
  timeoutMs: number,
  signal: AbortSignal,
  onOutput: (chunk: string, stream: OutputStream) => void,
): Promise<CommandOutcome> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, {
      cwd,
      shell: true,
      detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", "pipe"],
    });

    let output = "";
    let timedOut = false;
    let aborted = false;
    let exitCode: number | null = null;
    let settled = false;

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      output += chunk;
      onOutput(chunk, "stdout");
    });
    child.stderr.on("data", (chunk: string) => {
      output += chunk;
      onOutput(chunk, "stderr");
    });

    // Kill the process group (POSIX) so children spawned by the command die
    // too; on Windows fall back to killing the shell process only.
    const killTree = (): void => {
      if (child.pid === undefined) return;
      try {
        if (process.platform === "win32") {
          child.kill("SIGKILL");
        } else {
          process.kill(-child.pid, "SIGKILL");
        }
      } catch {
        // The process already exited; nothing left to kill.
      }
    };

    const timer = setTimeout(() => {
      timedOut = true;
      killTree();
    }, timeoutMs);

    const onAbort = (): void => {
      aborted = true;
      killTree();
    };

    const finish = (): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      resolve({ output, exitCode, timedOut, aborted });
    };

    signal.addEventListener("abort", onAbort, { once: true });
    // The signal may have fired between the caller's check and spawn.
    if (signal.aborted) onAbort();

    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      reject(err);
    });

    child.on("close", (code) => {
      exitCode = code;
      finish();
    });
  });
}

/** Append a status line to captured output, normalizing the trailing newline. */
function withStatus(output: string, status: string): string {
  return output === "" ? status : `${output.trimEnd()}\n${status}`;
}

/**
 * `execute_command` (§8). Runs a shell command in the workspace, streaming its
 * stdout/stderr to the host and returning the exit code plus the combined,
 * truncated output. Commands run with the user's privileges; the loop is
 * responsible for the `sudo` approval rule.
 */
export const executeCommandTool = defineTool({
  name: "execute_command",
  description:
    "Run a shell command in the workspace and return its combined output and exit code. " +
    "Output streams to the UI as it arrives. Use this for tests, builds and other shell work.",
  parameters: z.object({
    command: z.string().min(1).describe("The shell command to run"),
    cwd: z
      .string()
      .optional()
      .describe("Working directory, relative to the workspace root (default: workspace root)"),
    timeoutMs: z
      .number()
      .int()
      .positive()
      .optional()
      .describe("Timeout in milliseconds (default: 120000)"),
  }),
  approval: "command",
  async execute(args, ctx) {
    if (ctx.signal.aborted) {
      return { content: "cancelled by user", isError: true };
    }

    try {
      const cwd =
        args.cwd && args.cwd !== ""
          ? await resolveWithinWorkspace(ctx.workspaceRoot, args.cwd)
          : await resolveWorkspaceRoot(ctx.workspaceRoot);

      const timeoutMs = args.timeoutMs ?? ctx.timeoutMs ?? DEFAULT_COMMAND_TIMEOUT_MS;

      const { output, exitCode, timedOut, aborted } = await runCommand(
        args.command,
        cwd,
        timeoutMs,
        ctx.signal,
        ctx.onOutput ?? (() => {}),
      );

      if (aborted) {
        return { content: "cancelled by user", isError: true };
      }

      if (timedOut) {
        return truncateResult({
          content: withStatus(output, `[command timed out after ${timeoutMs} ms]`),
          isError: true,
        });
      }

      const status = exitCode === null ? "[terminated by signal]" : `[exit code ${exitCode}]`;
      const result: ToolResult = { content: withStatus(output, status) };
      if (exitCode !== 0) result.isError = true;
      return truncateResult(result);
    } catch (err) {
      return { content: err instanceof Error ? err.message : String(err), isError: true };
    }
  },
});
