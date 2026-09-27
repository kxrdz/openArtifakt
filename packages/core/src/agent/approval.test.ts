import { describe, expect, it } from "vitest";

import { isSecretPath } from "../security/secrets";
import {
  APPROVAL_MODES,
  approve,
  approveWithEditedCommand,
  applyApprovalDecision,
  DEFAULT_APPROVAL_POLICIES,
  isSudoCommand,
  reject,
  rejectionResult,
  resolveApproval,
  type ApprovalMode,
  type ApprovalSubject,
} from "./approval";

const read: ApprovalSubject = { name: "read_file", approval: "read" };
const write: ApprovalSubject = { name: "edit_file", approval: "write" };
const command: ApprovalSubject = { name: "execute_command", approval: "command" };

describe("resolveApproval: mode resolution", () => {
  const modes: ApprovalMode[] = [...APPROVAL_MODES];

  it("runs reads automatically in every mode", () => {
    for (const mode of modes) {
      const result = resolveApproval(read, { path: "src/index.ts" }, mode);
      expect(result.needsApproval).toBe(false);
    }
  });

  it("asks for writes in ask mode, and runs them automatically otherwise", () => {
    expect(resolveApproval(write, { path: "src/index.ts", oldString: "a", newString: "b" }, "ask").needsApproval).toBe(true);
    expect(resolveApproval(write, { path: "src/index.ts" }, "auto-edit").needsApproval).toBe(false);
    expect(resolveApproval(write, { path: "src/index.ts" }, "full-auto").needsApproval).toBe(false);
  });

  it("asks for commands in ask and auto-edit modes, and runs them automatically only in full-auto", () => {
    expect(resolveApproval(command, { command: "pnpm test" }, "ask").needsApproval).toBe(true);
    expect(resolveApproval(command, { command: "pnpm test" }, "auto-edit").needsApproval).toBe(true);
    expect(resolveApproval(command, { command: "pnpm test" }, "full-auto").needsApproval).toBe(false);
  });
});

describe("resolveApproval: forced rules (§9)", () => {
  it("forces approval for a secret read in every mode, including full auto", () => {
    for (const mode of APPROVAL_MODES) {
      const result = resolveApproval(read, { path: ".env" }, mode);
      expect(result.needsApproval).toBe(true);
      expect(result.reason).toMatch(/secret/i);
    }
  });

  it("uses the default secret policy to detect .env*, *.pem, *.key and id_rsa*", () => {
    for (const p of [".env", ".env.local", "server.pem", "id_rsa", "id_rsa.pub", "cert.key"]) {
      const result = resolveApproval(read, { path: p }, "full-auto");
      expect(result.needsApproval, p).toBe(true);
    }
  });

  it("does not flag a non-secret read", () => {
    expect(isSecretPath("src/index.ts")).toBe(false);
    expect(resolveApproval(read, { path: "src/index.ts" }, "full-auto").needsApproval).toBe(false);
  });

  it("forces approval for sudo in every mode, including full auto", () => {
    for (const mode of APPROVAL_MODES) {
      const result = resolveApproval(command, { command: "sudo rm -rf dist" }, mode);
      expect(result.needsApproval).toBe(true);
      expect(result.reason).toMatch(/sudo/i);
    }
  });

  it("detects sudo only as a standalone word", () => {
    expect(isSudoCommand("sudo make install")).toBe(true);
    expect(isSudoCommand("env sudo make install")).toBe(true);
    expect(isSudoCommand("echo 'not-sudo'")).toBe(false);
    expect(isSudoCommand("sudoers.d/refresh")).toBe(false);
  });

  it("accepts injected policies, overriding the security defaults", () => {
    const policies = {
      isSecretPath: (p: string) => p === "notes.txt",
      isSudoCommand: () => false,
    };
    expect(resolveApproval(read, { path: "notes.txt" }, "full-auto", policies).needsApproval).toBe(true);
    expect(resolveApproval(read, { path: ".env" }, "full-auto", policies).needsApproval).toBe(false);
    expect(resolveApproval(command, { command: "sudo x" }, "full-auto", policies).needsApproval).toBe(false);
  });

  it("exposes the security defaults it uses", () => {
    expect(DEFAULT_APPROVAL_POLICIES.isSecretPath(".env")).toBe(true);
    expect(DEFAULT_APPROVAL_POLICIES.isSudoCommand("sudo x")).toBe(true);
  });
});

describe("approval decisions", () => {
  it("approve runs the tool with its original args", () => {
    const args = { command: "pnpm test" };
    expect(applyApprovalDecision(approve(), args)).toEqual({ run: true, args });
  });

  it("edit-command replaces the command argument before running", () => {
    const args = { command: "pnpm test", cwd: "apps/web" };
    expect(applyApprovalDecision(approveWithEditedCommand("pnpm test --runInBand"), args)).toEqual({
      run: true,
      args: { command: "pnpm test --runInBand", cwd: "apps/web" },
    });
  });

  it("reject returns the note as an error tool result and does not run", () => {
    const outcome = applyApprovalDecision(reject("Use a less aggressive command."), { command: "rm -rf dist" });
    expect(outcome).toEqual({
      run: false,
      toolResult: { content: "Use a less aggressive command.", isError: true },
    });
  });

  it("rejectionResult falls back when the note is blank", () => {
    expect(rejectionResult("")).toEqual({ content: "rejected by user", isError: true });
    expect(rejectionResult("   ")).toEqual({ content: "rejected by user", isError: true });
    expect(rejectionResult("no")).toEqual({ content: "no", isError: true });
  });
});
