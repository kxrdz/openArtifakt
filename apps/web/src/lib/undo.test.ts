import { describe, expect, it } from "vitest";

import type { ChatMessage, ToolCallState } from "../store/chatStore";
import { describeUndo, toolMutatedFile, turnChangedFiles } from "./undo";

/** A base tool call the tests patch to exercise each eligibility rule. */
function toolCall(patch: Partial<ToolCallState> = {}): ToolCallState {
  return {
    callId: "call-1",
    name: "edit_file",
    args: { path: "notes.txt", oldString: "a", newString: "b" },
    status: "done",
    result: "Replaced 1 occurrence in \"notes.txt\"",
    isError: false,
    ...patch,
  };
}

function assistantMessage(toolCalls: ToolCallState[]): ChatMessage {
  return { id: "a1", role: "assistant", content: "", toolCalls, createdAt: 0 };
}

describe("toolMutatedFile", () => {
  it("counts an executed edit_file or write_file", () => {
    expect(toolMutatedFile(toolCall({ name: "edit_file" }))).toBe(true);
    expect(toolMutatedFile(toolCall({ name: "write_file" }))).toBe(true);
  });

  it("counts an auto-approved write with no decision recorded", () => {
    expect(
      toolMutatedFile(toolCall({ name: "write_file", decision: undefined })),
    ).toBe(true);
  });

  it("ignores a rejected mutation (the tool never ran)", () => {
    expect(
      toolMutatedFile(toolCall({ decision: { kind: "reject", note: "no" } })),
    ).toBe(false);
  });

  it("ignores a failed edit (no file was changed)", () => {
    expect(toolMutatedFile(toolCall({ isError: true }))).toBe(false);
  });

  it("ignores non-file tools and calls without a result", () => {
    expect(toolMutatedFile(toolCall({ name: "execute_command", args: { command: "ls" } }))).toBe(
      false,
    );
    expect(toolMutatedFile(toolCall({ result: undefined, status: "running" }))).toBe(false);
  });
});

describe("turnChangedFiles", () => {
  it("is true for an assistant turn with a file mutation", () => {
    expect(turnChangedFiles(assistantMessage([toolCall()]))).toBe(true);
  });

  it("is false for a user turn and for a turn with no mutations", () => {
    const user: ChatMessage = { id: "u1", role: "user", content: "hi", toolCalls: [], createdAt: 0 };
    expect(turnChangedFiles(user)).toBe(false);
    expect(turnChangedFiles(assistantMessage([]))).toBe(false);
    expect(
      turnChangedFiles(assistantMessage([toolCall({ name: "execute_command" })])),
    ).toBe(false);
  });
});

describe("describeUndo", () => {
  it("reports restored and deleted files clearly", () => {
    expect(describeUndo(["notes.txt", "src/a.ts"], ["sub/new.txt"])).toBe(
      "Undone — restored notes.txt, src/a.ts; removed sub/new.txt.",
    );
  });

  it("reports a restore-only result", () => {
    expect(describeUndo(["notes.txt"], [])).toBe("Undone — restored notes.txt.");
  });

  it("reports when there was nothing to undo", () => {
    expect(describeUndo([], [])).toBe("No files were changed by this turn.");
  });
});
