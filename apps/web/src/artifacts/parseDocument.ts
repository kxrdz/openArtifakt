/**
 * Web artifact model re-export.
 *
 * The document fold lives in `@openartifact/shared/src/parser/parseDocument.ts`
 * so the server's persistence writer and the web client derive artifacts from
 * assistant text with exactly the same parser. This module keeps the web's
 * existing import paths (`./parseDocument`, `../artifacts`) working unchanged.
 */
export { parseDocument } from "@openartifact/shared";
export type {
  Artifact,
  ArtifactVersion,
  MermaidBlock,
  ParsedBlock,
  ParsedDocument,
  TextBlock,
} from "@openartifact/shared";
