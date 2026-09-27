/**
 * Re-export of the shared incremental stream parser (§5).
 *
 * The parser lives in `@openartifact/shared` (the only dependency-free package
 * shared by the server, the web client and core); core re-exports it so
 * `providers/fallback.ts` and anything importing `../parser` keep working
 * unchanged. See `packages/shared/src/parser/` for the implementation.
 */
export type {
  ArtifactCloseEvent,
  ArtifactDeltaEvent,
  ArtifactOpenEvent,
  MermaidCloseEvent,
  MermaidDeltaEvent,
  MermaidOpenEvent,
  ParserEvent,
  ParserTextEvent,
  ToolCallEvent,
} from "@openartifact/shared";
export { StreamParser } from "@openartifact/shared";
