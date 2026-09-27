import { homedir } from "node:os";
import * as path from "node:path";

import {
  AgentLoop,
  type ApprovalHandler,
  type ModelConfig,
  type ProviderAdapter,
  type SnapshotLocation,
  ToolRegistry,
  buildSystemPrompt,
  createProviderAdapter,
  editFileTool,
  executeCommandTool,
  globTool,
  listDirectoryTool,
  readFileTool,
  searchCodeTool,
  writeFileTool,
} from "@openartifact/core";

import type { ServerConfig } from "../config";

/**
 * Agent runtime wiring (§12.6, "Provider configuration").
 *
 * This module is the seam between the validated {@link ServerConfig} and the
 * engine in `@openartifact/core`: it selects the provider adapter, registers
 * the seven §8 tools, builds the versioned runtime system prompt, and returns
 * a runnable {@link AgentLoop} together with the pieces a host (the chat
 * routes) needs — the provider id, the tool registry and the prompt.
 */

/** Runtime values injected into the system prompt (§10); overridable for tests. */
export interface PromptContext {
  /** Operating system, e.g. "linux", "darwin", "win32". */
  os: string;
  /** Shell commands run under, e.g. "/bin/bash". */
  shell: string;
  /** Current date, pre-formatted as "YYYY-MM-DD". */
  date: string;
}

/** Everything needed to build a runnable agent loop from server config. */
export interface AgentRuntimeOptions {
  config: ServerConfig;
  /** Host-driven approval seam; the loop awaits it for every risky tool call. */
  approvalHandler: ApprovalHandler;
  /** Pre-mutation snapshot location (§8 "Undo"); when omitted, no snapshots are taken. */
  snapshot?: SnapshotLocation;
  /** Forwards command stdout/stderr chunks to the host as they arrive. */
  onCommandOutput?: (chunk: string, stream: "stdout" | "stderr") => void;
  /** External abort signal (server shutdown), propagated to the turn. */
  signal?: AbortSignal;
  /** Prompt runtime values; defaults to the live process environment. */
  promptContext?: PromptContext;
}

/** A runnable loop plus the pieces its host needs to inspect and drive it. */
export interface AgentRuntime {
  loop: AgentLoop;
  provider: ProviderAdapter;
  tools: ToolRegistry;
  systemPrompt: string;
}

/** The seven §8 tools, registered in the spec's canonical order. */
export function buildToolRegistry(): ToolRegistry {
  return new ToolRegistry()
    .register(readFileTool)
    .register(listDirectoryTool)
    .register(globTool)
    .register(searchCodeTool)
    .register(editFileTool)
    .register(writeFileTool)
    .register(executeCommandTool);
}

/** The adapter factory's {@link ModelConfig}, derived from the server config. */
export function toModelConfig(config: ServerConfig): ModelConfig {
  return {
    provider: config.provider,
    model: config.model,
    baseUrl: config.baseUrl,
    apiKeyRef: config.apiKeyRef,
    contextWindow: config.contextWindow,
    capabilities: config.capabilities,
  };
}

/** Default prompt context from the live process: platform, shell, today's date. */
export function defaultPromptContext(): PromptContext {
  const shell =
    process.env.SHELL ?? (process.platform === "win32" ? "cmd.exe" : "/bin/sh");
  return {
    os: process.platform,
    shell,
    date: new Date().toISOString().slice(0, 10),
  };
}

/** The default snapshot storage root (§8): `~/.openartifact/snapshots`. */
export function defaultSnapshotRoot(): string {
  return path.join(homedir(), ".openartifact", "snapshots");
}

/**
 * Assemble a runnable {@link AgentLoop} from server configuration.
 *
 * Selects the provider adapter for the configured provider, registers the
 * seven tools, and injects the runtime values (workspace root, OS, shell,
 * date, approval mode) into the versioned system prompt. The returned loop
 * owns the conversation history and is safe to run without any network access
 * until {@link AgentLoop.run} is called and the provider streams.
 */
export function createAgentRuntime(options: AgentRuntimeOptions): AgentRuntime {
  const { config, approvalHandler } = options;
  const promptContext = options.promptContext ?? defaultPromptContext();

  const provider = createProviderAdapter(toModelConfig(config));
  const tools = buildToolRegistry();
  const systemPrompt = buildSystemPrompt({
    workspaceRoot: config.workspaceRoot,
    os: promptContext.os,
    shell: promptContext.shell,
    date: promptContext.date,
    approvalMode: config.approvalMode,
    nativeTools: config.capabilities.nativeTools,
  });

  const loop = new AgentLoop({
    provider,
    model: config.model,
    tools,
    workspaceRoot: config.workspaceRoot,
    systemPrompt,
    approvalMode: config.approvalMode,
    approvalHandler,
    contextWindow: config.contextWindow,
    nativeTools: config.capabilities.nativeTools,
    ...(options.snapshot ? { snapshot: options.snapshot } : {}),
    ...(options.onCommandOutput ? { onCommandOutput: options.onCommandOutput } : {}),
    ...(options.signal ? { signal: options.signal } : {}),
  });

  return { loop, provider, tools, systemPrompt };
}
