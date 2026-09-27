import { promises as fs } from "node:fs";
import * as path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { FakeProvider, finalAnswer, toolCallTurn } from "../../test/fake-provider";

import { approve, type ApprovalMode } from "./approval";
import { pendingToolCallIds } from "./cancellation";
import { AgentLoop, type AgentEvent, type ApprovalHandler, type ApprovalRequest } from "./loop";
import { executeCommandTool } from "../tools/execute-command";
import { editFileTool } from "../tools/edit-file";
import { globTool } from "../tools/glob";
import { listDirectoryTool } from "../tools/list-directory";
import { readFileTool } from "../tools/read-file";
import { ToolRegistry } from "../tools/registry";
import { searchCodeTool } from "../tools/search-code";
import { cleanupTempWorkspaces, makeTempWorkspace, writeFile } from "../tools/test-utils";
import { writeFileTool } from "../tools/write-file";

afterEach(cleanupTempWorkspaces);

/** The seven §8 tools registered in one registry, as the real host would. */
function createRegistry(): ToolRegistry {
  return new ToolRegistry()
    .register(readFileTool)
    .register(listDirectoryTool)
    .register(globTool)
    .register(searchCodeTool)
    .register(editFileTool)
    .register(writeFileTool)
    .register(executeCommandTool);
}

/** An approval handler that approves everything and records the requests. */
function recordingApprover(): { handler: ApprovalHandler; requests: ApprovalRequest[] } {
  const requests: ApprovalRequest[] = [];
  const handler: ApprovalHandler = (request) => {
    requests.push(request);
    return approve();
  };
  return { handler, requests };
}

function makeLoop(
  root: string,
  provider: FakeProvider,
  approval: ApprovalHandler,
  approvalMode: ApprovalMode = "ask",
): AgentLoop {
  return new AgentLoop({
    provider,
    model: "scripted-model",
    tools: createRegistry(),
    workspaceRoot: root,
    systemPrompt: "You are a test assistant. Use tools to complete the task.",
    approvalMode,
    approvalHandler: approval,
    contextWindow: 100_000,
    nativeTools: true,
  });
}

describe("agent loop integration (§12.4)", () => {
  it("runs read → edit → execute-tests → final answer in a temp directory", async () => {
    const root = await makeTempWorkspace("oa-loop-");
    await writeFile(path.join(root, "greeting.ts"), 'export const greeting = "hello";\n');

    const check =
      "const fs=require('fs'); const c=fs.readFileSync('greeting.ts','utf8'); " +
      "process.exit(c.includes('hi') ? 0 : 1);";
    const command = `node -e ${JSON.stringify(check)}`;

    const provider = new FakeProvider([
      toolCallTurn("call-read", "read_file", { path: "greeting.ts" }),
      toolCallTurn("call-edit", "edit_file", {
        path: "greeting.ts",
        oldString: '"hello"',
        newString: '"hi"',
      }),
      toolCallTurn("call-test", "execute_command", { command }),
      finalAnswer("Done: greeting.ts now says hi and the check passed."),
    ]);

    const { handler, requests } = recordingApprover();
    const loop = makeLoop(root, provider, handler);

    const events: AgentEvent[] = [];
    for await (const event of loop.run("Change the greeting and verify it")) {
      events.push(event);
    }

    // The turn completed and the history stays provider-valid.
    expect(loop.state).toBe("done");
    expect(pendingToolCallIds(loop.messages)).toEqual([]);

    // The edit actually landed on disk.
    const onDisk = await fs.readFile(path.join(root, "greeting.ts"), "utf8");
    expect(onDisk).toContain('export const greeting = "hi";');

    // Tools ran in order.
    const started = events
      .filter((e): e is Extract<AgentEvent, { type: "tool_start" }> => e.type === "tool_start")
      .map((e) => e.name);
    expect(started).toEqual(["read_file", "edit_file", "execute_command"]);

    // Reads run automatically; writes and commands ask (ask mode).
    expect(requests.map((r) => r.name)).toEqual(["edit_file", "execute_command"]);

    // The test command passed.
    const testResult = events.find(
      (e): e is Extract<AgentEvent, { type: "tool_result" }> =>
        e.type === "tool_result" && e.callId === "call-test",
    );
    expect(testResult?.content).toContain("[exit code 0]");
    expect(testResult?.isError).toBeFalsy();

    // The model's final answer is the last message.
    const last = loop.messages[loop.messages.length - 1]!;
    expect(last.role).toBe("assistant");
    expect(last.parts.some((p) => p.type === "text" && p.text.includes("Done"))).toBe(true);
  });

  it("rejects .. traversal and symlink escapes through the loop", async () => {
    const root = await makeTempWorkspace("oa-jail-");
    const outside = await makeTempWorkspace("oa-outside-");
    await writeFile(path.join(outside, "secret.txt"), "top secret\n");
    await fs.symlink(path.join(outside, "secret.txt"), path.join(root, "link.txt"));

    const traversal = `../${path.basename(outside)}/secret.txt`;

    const provider = new FakeProvider([
      {
        toolCalls: [
          { id: "call-traversal", name: "read_file", args: { path: traversal } },
          { id: "call-symlink", name: "read_file", args: { path: "link.txt" } },
        ],
      },
      finalAnswer("Both escapes were rejected by the path jail."),
    ]);

    const { handler } = recordingApprover();
    const loop = makeLoop(root, provider, handler);

    const events: AgentEvent[] = [];
    for await (const event of loop.run("Read the secret files")) {
      events.push(event);
    }

    expect(loop.state).toBe("done");
    expect(pendingToolCallIds(loop.messages)).toEqual([]);

    const results = events.filter(
      (e): e is Extract<AgentEvent, { type: "tool_result" }> => e.type === "tool_result",
    );
    expect(results).toHaveLength(2);
    for (const result of results) {
      expect(result.isError).toBe(true);
      expect(result.content).toContain("outside the workspace");
    }
  });

  it("cancelling mid-command leaves a valid history", async () => {
    const root = await makeTempWorkspace("oa-cancel-");

    const provider = new FakeProvider([
      toolCallTurn("call-slow", "execute_command", { command: "sleep 30" }),
    ]);

    const loop = makeLoop(root, provider, async () => approve(), "full-auto");

    const events: AgentEvent[] = [];
    for await (const event of loop.run("Run a slow command")) {
      events.push(event);
      if (event.type === "tool_start" && event.name === "execute_command") {
        // Cancel while the child process is still running.
        setTimeout(() => loop.cancel(), 50);
      }
    }

    expect(loop.state).toBe("cancelled");
    expect(pendingToolCallIds(loop.messages)).toEqual([]);

    const cancelledResult = events.find(
      (e): e is Extract<AgentEvent, { type: "tool_result" }> =>
        e.type === "tool_result" && e.callId === "call-slow",
    );
    expect(cancelledResult?.content).toBe("cancelled by user");
    expect(cancelledResult?.isError).toBe(true);

    const done = events.find((e) => e.type === "done");
    expect(done).toMatchObject({ type: "done", stopReason: "cancelled" });
  });
});
