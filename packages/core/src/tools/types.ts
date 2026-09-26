import { z } from "zod";

import type { ToolDefinition } from "../providers/types";

/**
 * Tool contract (§8 "Tools"). A tool defines its arguments once with a zod
 * schema, declares an approval category the loop uses for mode decisions, and
 * exposes a (mostly pure) executor that receives a {@link ToolContext}
 * injected by the host.
 */

/**
 * Approval category. Reads run automatically, writes run automatically in
 * `auto-edit`/`full-auto`, and commands run automatically only in `full-auto`.
 * The security layer can force approval regardless of category (secret reads,
 * `sudo`).
 */
export type ApprovalCategory = "read" | "write" | "command";

/** Everything an executor may need, injected by the host (agent loop). */
export interface ToolContext {
  /** Absolute, realpath'd workspace root; tools resolve paths relative to it. */
  workspaceRoot: string;
  /** Abort signal propagated to the provider and to running child processes. */
  signal: AbortSignal;
  /** Called before a mutation with the absolute target path, to snapshot prior content. */
  snapshot?: (absolutePath: string) => Promise<void> | void;
  /** Streams command stdout/stderr chunks to the host as they arrive. */
  onOutput?: (chunk: string, stream: "stdout" | "stderr") => void;
  /** Command timeout in milliseconds (default 120_000). */
  timeoutMs?: number;
  /** Snapshot storage root (undo). */
  snapshotRoot?: string;
  /** Conversation id segment of the snapshot path. */
  conversationId?: string;
  /** Turn id segment of the snapshot path. */
  turnId?: string;
}

/** A tool's return value. `content` is truncated centrally to the result cap. */
export interface ToolResult {
  content: string;
  isError?: boolean;
}

/**
 * A tool the agent may call. `parameters` is the single source of truth for
 * the argument schema (converted to each provider's JSON-schema dialect by the
 * adapters); `execute` receives already-parsed, typed arguments.
 */
export interface Tool<TSchema extends z.ZodType = z.ZodType> {
  name: string;
  description: string;
  parameters: TSchema;
  approval: ApprovalCategory;
  execute(args: z.infer<TSchema>, ctx: ToolContext): ToolResult | Promise<ToolResult>;
}

/**
 * Type-safe tool helper. It infers the argument type from `parameters` so
 * `execute`'s `args` are typed without repeating the schema.
 */
export function defineTool<TSchema extends z.ZodType>(tool: Tool<TSchema>): Tool<TSchema> {
  return tool;
}

/** Derive the provider-facing {@link ToolDefinition} from a {@link Tool}. */
export function toToolDefinition(tool: Tool): ToolDefinition {
  return {
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
  };
}
