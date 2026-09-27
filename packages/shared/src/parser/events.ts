/**
 * Parser event vocabulary (§5). The incremental stream parser turns raw model
 * text into these structured events; provider adapters, the web UI and core
 * consume them. This module is dependency-free (no zod, no DOM) so both the
 * browser client and a future CLI can reuse it.
 *
 * Every event discriminates on `type` (consistent with `StreamEvent` in
 * `@openartifact/shared`). Because `type` is the discriminator, the artifact's
 * declared MIME type is exposed as `artifactType` on `artifact_open`.
 */

export interface ParserTextEvent {
  type: "text";
  text: string;
}

export interface ArtifactOpenEvent {
  type: "artifact_open";
  identifier: string;
  /** Declared artifact type (e.g. "application/vnd.react"), preserved verbatim. */
  artifactType: string;
  title: string;
  language?: string;
}

export interface ArtifactDeltaEvent {
  type: "artifact_delta";
  identifier: string;
  text: string;
}

export interface ArtifactCloseEvent {
  type: "artifact_close";
  identifier: string;
  incomplete?: boolean;
}

export interface MermaidOpenEvent {
  type: "mermaid_open";
}

export interface MermaidDeltaEvent {
  type: "mermaid_delta";
  text: string;
}

export interface MermaidCloseEvent {
  type: "mermaid_close";
  /** True when the fence was still open (no closing fence) when the stream ended. */
  incomplete?: boolean;
}

export interface ToolCallEvent {
  type: "tool_call";
  name: string;
  args: unknown;
}

export type ParserEvent =
  | ParserTextEvent
  | ArtifactOpenEvent
  | ArtifactDeltaEvent
  | ArtifactCloseEvent
  | MermaidOpenEvent
  | MermaidDeltaEvent
  | MermaidCloseEvent
  | ToolCallEvent;
