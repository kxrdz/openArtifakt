import { StreamParser } from "@openartifact/shared";
import type { ParserEvent } from "@openartifact/shared";

/**
 * Web artifact model (§12.7, "Web artifact model").
 *
 * The server/adapters and the web client share one {@link StreamParser}; the
 * browser drives it in whole-document mode: `push(content)` then `end()`. The
 * chunk-boundary fuzz test guarantees that whole-input equals split-input, so
 * re-parsing the growing assistant text on every render is correct and
 * idempotent. {@link parseDocument} folds the resulting event sequence into a
 * normalized model the chat message and the artifact panel render from.
 */

/** One stored version of an artifact's content. */
export interface ArtifactVersion {
  /** 1-based version number, stable for the life of the artifact. */
  version: number;
  content: string;
  /** True while this version is still streaming (no closing `</artifact>` yet). */
  incomplete: boolean;
}

/** A distinct artifact, keyed by `identifier`, with its full version list. */
export interface Artifact {
  identifier: string;
  title: string;
  /** Declared MIME type, e.g. `application/vnd.react`; preserved verbatim. */
  artifactType: string;
  language?: string;
  /** Every version seen so far, in order. Reusing an identifier appends. */
  versions: ArtifactVersion[];
  /** True while the latest version is still streaming. */
  incomplete: boolean;
}

/** A run of prose from the assistant message (artifact tags lifted out). */
export interface TextBlock {
  type: "text";
  text: string;
}

/** A complete (or in-progress) ```mermaid fence, to render as a diagram. */
export interface MermaidBlock {
  type: "mermaid";
  source: string;
  /** False while the fence is still open (no closing ```) mid-stream. */
  complete: boolean;
}

/** Either a prose run or an inline diagram, in message order. */
export type ParsedBlock = TextBlock | MermaidBlock;

/** The folded result of parsing one assistant message's accumulated text. */
export interface ParsedDocument {
  /** Prose and inline Mermaid blocks in order; artifact content is lifted out. */
  blocks: ParsedBlock[];
  /** Artifacts in first-appearance order. */
  artifacts: Artifact[];
}

/** Feed a whole document through a fresh parser and return every event. */
function parseEvents(content: string): ParserEvent[] {
  const parser = new StreamParser();
  return [...parser.push(content), ...parser.end()];
}

/**
 * Fold a stream of {@link ParserEvent}s into the document model (pure).
 *
 * `text` events coalesce into prose blocks (adjacent prose runs, including
 * those separated only by lifted-out artifacts, merge into one block);
 * `mermaid_open`/`mermaid_delta`/`mermaid_close` build inline Mermaid blocks
 * (an `incomplete` close marks the block as still streaming); and
 * `artifact_*` events build artifacts keyed by `identifier`. Reusing an
 * identifier whose latest version is complete appends a new version; an
 * in-progress version is updated in place on re-parse, never duplicated.
 */
export function parseDocument(content: string): ParsedDocument {
  const blocks: ParsedBlock[] = [];
  const artifacts: Artifact[] = [];
  const byId = new Map<string, Artifact>();
  let mermaidSource: string | null = null;

  const appendText = (text: string): void => {
    if (text === "") return;
    const last = blocks[blocks.length - 1];
    if (last !== undefined && last.type === "text") {
      last.text += text;
    } else {
      blocks.push({ type: "text", text });
    }
  };

  for (const event of parseEvents(content)) {
    switch (event.type) {
      case "text":
        appendText(event.text);
        break;

      case "mermaid_open":
        mermaidSource = "";
        break;

      case "mermaid_delta":
        mermaidSource = (mermaidSource ?? "") + event.text;
        break;

      case "mermaid_close":
        blocks.push({
          type: "mermaid",
          source: mermaidSource ?? "",
          complete: event.incomplete !== true,
        });
        mermaidSource = null;
        break;

      case "artifact_open": {
        const existing = byId.get(event.identifier);
        if (existing === undefined) {
          const artifact: Artifact = {
            identifier: event.identifier,
            title: event.title,
            artifactType: event.artifactType,
            ...(event.language !== undefined ? { language: event.language } : {}),
            versions: [{ version: 1, content: "", incomplete: true }],
            incomplete: true,
          };
          byId.set(event.identifier, artifact);
          artifacts.push(artifact);
        } else {
          // Take the latest open tag's metadata (title/type/language can drift
          // while streaming); the version list is what must never lose history.
          existing.title = event.title;
          existing.artifactType = event.artifactType;
          if (event.language !== undefined) existing.language = event.language;

          const latest = existing.versions[existing.versions.length - 1];
          if (latest !== undefined && latest.incomplete) {
            // Same still-streaming artifact re-parsed: update it in place.
            latest.content = "";
          } else {
            existing.versions.push({
              version: existing.versions.length + 1,
              content: "",
              incomplete: true,
            });
          }
          existing.incomplete = true;
        }
        break;
      }

      case "artifact_delta": {
        const artifact = byId.get(event.identifier);
        if (artifact === undefined) break;
        const latest = artifact.versions[artifact.versions.length - 1];
        if (latest !== undefined) latest.content += event.text;
        break;
      }

      case "artifact_close": {
        const artifact = byId.get(event.identifier);
        if (artifact === undefined) break;
        const latest = artifact.versions[artifact.versions.length - 1];
        if (latest !== undefined) {
          latest.incomplete = event.incomplete === true;
          artifact.incomplete = event.incomplete === true;
        }
        break;
      }

      case "tool_call":
        // The fallback protocol is consumed by the adapters upstream; a stray
        // block in assistant text is not part of the render model.
        break;
    }
  }

  return { blocks, artifacts };
}
