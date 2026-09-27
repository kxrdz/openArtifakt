import * as path from "node:path";

import { isSecretPath } from "../security/secrets";
import type { ApprovalCategory, ToolResult } from "../tools/types";

/**
 * Approval flow (§8 "Approval modes").
 *
 * The loop resolves whether a tool call needs a user decision before it runs.
 * Reads run automatically; writes run automatically in `auto-edit`/`full-auto`;
 * commands run automatically only in `full-auto`. Two rules from §9 override
 * every mode: reading a secret file (`.env*`, `*.pem`, `*.key`, `id_rsa*`) and
 * running `sudo` always require approval, even in full auto.
 */

export const APPROVAL_MODES = ["ask", "auto-edit", "full-auto"] as const;

/** Approval mode selected by the user (§8). */
export type ApprovalMode = (typeof APPROVAL_MODES)[number];

/** The tool being considered, from the resolver's point of view. */
export interface ApprovalSubject {
  name: string;
  approval: ApprovalCategory;
}

/**
 * Pluggable safety predicates. The loop wires these to the security layer by
 * default; tests inject simpler fakes. Both are conservative by design — a
 * false positive costs one approval, a false negative could leak a secret or
 * auto-run `sudo`.
 */
export interface ApprovalPolicies {
  /** True when `filePath` is a secret file that always requires approval. */
  isSecretPath: (filePath: string) => boolean;
  /** True when `command` invokes `sudo`. */
  isSudoCommand: (command: string) => boolean;
}

/**
 * True when `command` invokes `sudo` as a standalone word (§9). `sudo` must be
 * delimited by start/end of string, whitespace or a shell metacharacter, so
 * `env sudo x` and `echo | sudo tee` are caught while hyphenated words like
 * `not-sudo` and the prefix `sudoers` are not. False positives only cost one
 * approval; false negatives could auto-run a privileged command.
 */
export function isSudoCommand(command: string): boolean {
  return /(^|[^\w-])sudo([^\w-]|$)/.test(command);
}

/** The security-layer defaults the agent loop uses out of the box. */
export const DEFAULT_APPROVAL_POLICIES: ApprovalPolicies = {
  isSecretPath,
  isSudoCommand,
};

export interface ApprovalResolution {
  /** True when the tool must pause for a user decision before running. */
  needsApproval: boolean;
  /** Human-readable reason, shown on the approval card. */
  reason: string;
}

/** Read a single string field from (possibly arbitrary) tool arguments. */
function stringField(args: unknown, key: string): string | undefined {
  if (typeof args !== "object" || args === null) return undefined;
  const value = (args as Record<string, unknown>)[key];
  return typeof value === "string" && value !== "" ? value : undefined;
}

/**
 * Decide whether a tool call needs approval under `mode`. Forced rules (secret
 * reads, `sudo`) are checked first and apply in every mode, including full auto.
 */
export function resolveApproval(
  subject: ApprovalSubject,
  args: unknown,
  mode: ApprovalMode,
  policies: ApprovalPolicies = DEFAULT_APPROVAL_POLICIES,
): ApprovalResolution {
  const { name, approval } = subject;

  // Forced approval: reading a secret file always asks (§9 "Secrets").
  if (name === "read_file") {
    const filePath = stringField(args, "path");
    if (filePath !== undefined && policies.isSecretPath(filePath)) {
      return {
        needsApproval: true,
        reason: `Reading secret file "${path.basename(filePath)}" requires approval.`,
      };
    }
  }

  // Forced approval: sudo is never auto-approved (§9 "Commands").
  if (name === "execute_command") {
    const command = stringField(args, "command");
    if (command !== undefined && policies.isSudoCommand(command)) {
      return { needsApproval: true, reason: "sudo is never auto-approved." };
    }
  }

  switch (approval) {
    case "read":
      return { needsApproval: false, reason: "Reads run without approval." };
    case "write":
      if (mode === "ask") {
        return { needsApproval: true, reason: "Writes require approval in ask mode." };
      }
      return { needsApproval: false, reason: "Writes run automatically in this mode." };
    case "command":
      if (mode === "full-auto") {
        return { needsApproval: false, reason: "Commands run automatically in full-auto mode." };
      }
      return { needsApproval: true, reason: "Commands require approval in this mode." };
  }
}

/**
 * A user's decision on an approval request (§8). Approve runs the tool as-is;
 * edit-command replaces the command argument (for `execute_command`) and runs;
 * reject does not run the tool and returns the note to the model instead.
 */
export type ApprovalDecision =
  | { kind: "approve" }
  | { kind: "edit-command"; command: string }
  | { kind: "reject"; note: string };

/** The result of applying a decision: either run with (possibly edited) args, or a rejection result. */
export type ApprovalOutcome =
  | { run: true; args: unknown }
  | { run: false; toolResult: ToolResult };

/** Approve and run the tool with its original arguments. */
export function approve(): ApprovalDecision {
  return { kind: "approve" };
}

/** Approve after editing the command; the edited command is the one that runs. */
export function approveWithEditedCommand(command: string): ApprovalDecision {
  return { kind: "edit-command", command };
}

/** Reject without running the tool; the note is returned to the model as the tool result. */
export function reject(note: string): ApprovalDecision {
  return { kind: "reject", note };
}

/** The tool result for a rejection: the note, or a default when it is blank. */
export function rejectionResult(note: string): ToolResult {
  const trimmed = note.trim();
  return { content: trimmed === "" ? "rejected by user" : trimmed, isError: true };
}

/**
 * Apply a decision to the original arguments. Approvals keep the args; an
 * edited command merges the new `command` field over them; a rejection returns
 * the note as the tool result so the model learns the tool did not run.
 */
export function applyApprovalDecision(
  decision: ApprovalDecision,
  args: unknown,
): ApprovalOutcome {
  switch (decision.kind) {
    case "approve":
      return { run: true, args };
    case "edit-command": {
      const base =
        typeof args === "object" && args !== null ? (args as Record<string, unknown>) : {};
      return { run: true, args: { ...base, command: decision.command } };
    }
    case "reject":
      return { run: false, toolResult: rejectionResult(decision.note) };
  }
}
