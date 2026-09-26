import type { ParserEvent } from "./events";

type Mode = "text" | "tag" | "fence-info" | "fence-body" | "artifact-body";

/** Tag names the parser can open (case-sensitive). Task 2.3 adds `tool_call`. */
const KNOWN_TAGS = ["artifact"] as const;

/**
 * The language word of a fence info string (e.g. "```mermaid" → "mermaid"),
 * lowercased so `Mermaid`/`MERMAID` also count.
 */
function parseFenceLanguage(info: string): string {
  const first = info.trim().split(/\s+/)[0] ?? "";
  return first.toLowerCase();
}

function isNameChar(c: string): boolean {
  return /[a-zA-Z0-9_-]/.test(c);
}

/** Kebab-case, lowercase, `[^a-z0-9]+` → `-`; falls back to `artifact`. */
function slugify(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug.length > 0 ? slug : "artifact";
}

interface ParsedTagName {
  name: string;
  isClose: boolean;
}

/** Extract the tag name and whether it is a close tag from a complete `<...>`. */
function parseTagName(tag: string): ParsedTagName | null {
  const body = tag.trim();
  const m = /^<\/?\s*([a-zA-Z][\w-]*)/.exec(body);
  if (!m || m[1] === undefined) return null;
  return { name: m[1], isClose: body.startsWith("</") };
}

const ATTR_RE = /([a-zA-Z_][\w-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

/** Parse `name="value"` attributes out of a complete tag string. */
function parseAttributes(tag: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  ATTR_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = ATTR_RE.exec(tag)) !== null) {
    const key = m[1];
    if (key === undefined) continue;
    attrs[key] = m[2] ?? m[3] ?? "";
  }
  return attrs;
}

/**
 * Incremental, character-level stream parser (§5).
 *
 * It converts raw streamed model text into structured {@link ParserEvent}s:
 * ordinary prose streams immediately as `text`, `<artifact …>…</artifact>`
 * blocks emit `artifact_open`/`artifact_delta`/`artifact_close`, fenced code
 * blocks keep `<artifact>`/`<tool_call>` tags literal, and a fence whose
 * language is `mermaid` emits `mermaid_open`/`mermaid_delta`/`mermaid_close`.
 *
 * The API is a tiny synchronous push model:
 * - `push(chunk)` feeds one delta and returns the events it produced.
 * - `end()` flushes any held-back suffix and returns the final events.
 *
 * Only the minimal ambiguous suffix is held back (at most the current
 * incomplete tag or fence marker), so text and code stream without waiting
 * for the full response and the same input yields the same events however it
 * is chunked.
 */
export class StreamParser {
  private mode: Mode = "text";
  private out: ParserEvent[] = [];

  // Coalescing buffers so consecutive `text`/`mermaid_delta`/`artifact_delta`
  // events merge into single events (they only split when another event type
  // intervenes). At most one is non-empty at a time.
  private textBuf = "";
  private mermaidBuf = "";
  private artifactBuf = "";

  // TEXT state: potential fence opener (≤3 leading spaces + a backtick run).
  private lineStart = true;
  private pendingSpaces = "";
  private pendingBackticks = "";

  // TAG state: potential `<artifact …>` / `</artifact>` open/close tag.
  private tagBuf = "";
  private tagName = "";
  private tagNameDone = false;

  // Fence state.
  private fenceLength = 0;
  private fenceInfo = "";
  private fenceIsMermaid = false;

  // FENCE_BODY state: potential closing fence (≤3 spaces + backtick run +
  // trailing spaces) at the start of a line.
  private bodyLineStart = true;
  private bodyIndent = "";
  private bodyBackticks = "";
  private bodyTrailing = "";

  // ARTIFACT_BODY state: raw content plus a probe for `</artifact>`.
  private artifactIdentifier = "";
  private closeProbe = "";

  /** Feed one text delta and return the events it produced. */
  push(chunk: string): ParserEvent[] {
    const out: ParserEvent[] = [];
    this.out = out;
    this.textBuf = "";
    this.mermaidBuf = "";
    this.artifactBuf = "";
    for (const c of chunk) {
      this.dispatch(c);
    }
    this.flushBuffers();
    this.out = [];
    return out;
  }

  /** Flush any held-back suffix and return the final events. */
  end(): ParserEvent[] {
    const out: ParserEvent[] = [];
    this.out = out;
    this.textBuf = "";
    this.mermaidBuf = "";
    this.artifactBuf = "";

    switch (this.mode) {
      case "text":
        this.flushHold();
        break;
      case "tag":
        // An unclosed tag (no `>` seen) is literal text.
        this.emitText(this.tagBuf);
        this.tagBuf = "";
        this.tagName = "";
        this.tagNameDone = false;
        break;
      case "fence-info":
        // An opening fence marker with no terminating newline is not a fence;
        // roll the marker and info back to literal text.
        this.emitText("`".repeat(this.fenceLength) + this.fenceInfo);
        this.enterTextMode();
        break;
      case "fence-body":
        if (this.fenceIsMermaid) {
          this.flushBodyHold(true);
          this.emitMermaidClose();
        } else {
          this.flushBodyHold(false);
        }
        this.enterTextMode();
        break;
      case "artifact-body":
        if (this.closeProbe !== "") {
          this.emitArtifactDelta(this.closeProbe);
          this.closeProbe = "";
        }
        this.closeArtifact(true);
        break;
    }

    this.flushBuffers();
    this.out = [];
    return out;
  }

  private dispatch(c: string): void {
    switch (this.mode) {
      case "text":
        this.textChar(c);
        break;
      case "tag":
        this.tagChar(c);
        break;
      case "fence-info":
        this.fenceInfoChar(c);
        break;
      case "fence-body":
        this.fenceBodyChar(c);
        break;
      case "artifact-body":
        this.artifactBodyChar(c);
        break;
    }
  }

  // ---------------------------------------------------------------------------
  // TEXT state
  // ---------------------------------------------------------------------------

  private textChar(c: string): void {
    if (c === "`") {
      if (this.lineStart) {
        this.pendingBackticks += "`";
      } else {
        this.emitText("`");
      }
      return;
    }

    if (c === "\n") {
      if (this.pendingBackticks.length >= 3) {
        // A fence with an empty info string.
        this.beginFence(this.pendingBackticks.length);
        this.fenceInfoNewline();
      } else {
        this.flushHold();
        this.emitText("\n");
        this.lineStart = true;
        this.pendingSpaces = "";
        this.pendingBackticks = "";
      }
      return;
    }

    if (c === " ") {
      if (this.pendingBackticks.length >= 3) {
        this.beginFence(this.pendingBackticks.length);
        this.fenceInfoChar(" ");
      } else if (this.pendingBackticks.length > 0) {
        // One or two backticks then a space: inline code, not a fence.
        this.flushHold();
        this.emitText(" ");
        this.lineStart = false;
      } else if (this.lineStart && this.pendingSpaces.length < 3) {
        this.pendingSpaces += " ";
      } else {
        // A mid-line space, or a 4th leading space (too indented to be a fence).
        this.flushHold();
        this.emitText(" ");
        this.lineStart = false;
      }
      return;
    }

    // Any other character.
    if (this.pendingBackticks.length >= 3) {
      this.beginFence(this.pendingBackticks.length);
      this.fenceInfoChar(c);
    } else {
      this.flushHold();
      if (c === "<") {
        this.enterTag();
      } else {
        this.emitText(c);
      }
      this.lineStart = false;
    }
  }

  /** Emit the held-back spaces/backticks as literal text and clear them. */
  private flushHold(): void {
    if (this.pendingSpaces.length > 0 || this.pendingBackticks.length > 0) {
      this.emitText(this.pendingSpaces + this.pendingBackticks);
    }
    this.pendingSpaces = "";
    this.pendingBackticks = "";
  }

  // ---------------------------------------------------------------------------
  // TAG state
  // ---------------------------------------------------------------------------

  private enterTag(): void {
    this.mode = "tag";
    this.tagBuf = "<";
    this.tagName = "";
    this.tagNameDone = false;
  }

  private tagChar(c: string): void {
    this.tagBuf += c;

    if (this.tagNameDone) {
      // Reading attributes / waiting for `>`.
      if (c === ">") this.finalizeTag();
      return;
    }

    if (c === "/") {
      // Only `</` (a close-tag start) can still become a tracked tag.
      if (this.tagBuf !== "</") this.flushTagAsText();
      return;
    }

    if (c === ">") {
      if (this.tagName === "artifact") this.finalizeTag();
      else this.flushTagAsText();
      return;
    }

    if (c === " " || c === "\t" || c === "\n" || c === "\r") {
      if (this.tagName === "artifact") this.tagNameDone = true;
      else this.flushTagAsText();
      return;
    }

    if (isNameChar(c)) {
      this.tagName += c;
      if (!KNOWN_TAGS.some((n) => n.startsWith(this.tagName))) this.flushTagAsText();
      return;
    }

    // Any other character (e.g. "<!", "<?", "<=", "<3"): not a tag.
    this.flushTagAsText();
  }

  /** The buffered `<...>` is not a tracked tag: emit it as literal text. */
  private flushTagAsText(): void {
    this.emitText(this.tagBuf);
    this.enterTextMode();
    this.lineStart = false;
  }

  private finalizeTag(): void {
    const raw = this.tagBuf;
    const parsed = parseTagName(raw);
    this.tagBuf = "";
    this.tagName = "";
    this.tagNameDone = false;

    if (!parsed || parsed.name !== "artifact") {
      // Defensive: tagChar only finalizes `artifact`, but stay safe.
      this.emitText(raw);
      this.enterTextMode();
      this.lineStart = false;
      return;
    }

    if (parsed.isClose) {
      // A stray `</artifact>` with no open artifact is literal text.
      this.emitText(raw);
      this.enterTextMode();
      this.lineStart = false;
      return;
    }

    this.openArtifact(parseAttributes(raw));
  }

  private openArtifact(attrs: Record<string, string>): void {
    const type = (attrs["type"] ?? "").trim();
    const title = (attrs["title"] ?? "").trim();
    const language = (attrs["language"] ?? "").trim();
    const identifier = (attrs["identifier"] ?? "").trim() || slugify(title);

    this.flushBuffers();
    this.out.push({
      type: "artifact_open",
      identifier,
      artifactType: type,
      title,
      ...(language ? { language } : {}),
    });
    this.mode = "artifact-body";
    this.artifactIdentifier = identifier;
    this.closeProbe = "";
  }

  // ---------------------------------------------------------------------------
  // ARTIFACT_BODY state
  // ---------------------------------------------------------------------------

  private artifactBodyChar(c: string): void {
    if (this.closeProbe !== "") {
      this.closeProbe += c;
      const status = this.closeProbeStatus(this.closeProbe);
      if (status === "complete") {
        this.closeArtifact(false);
      } else if (status === "not-close") {
        // Diverged from `</artifact>`: the probe is raw artifact content.
        this.emitArtifactDelta(this.closeProbe);
        this.closeProbe = "";
      }
      return;
    }

    if (c === "<") {
      this.closeProbe = "<";
      return;
    }
    this.emitArtifactDelta(c);
  }

  private closeProbeStatus(s: string): "pending" | "complete" | "not-close" {
    const CLOSE = "</artifact";
    if (s.length <= CLOSE.length) {
      return CLOSE.startsWith(s) ? "pending" : "not-close";
    }
    const rest = s.slice(CLOSE.length);
    if (/^[ \t\r\n]*$/.test(rest)) return "pending";
    if (/^[ \t\r\n]*>$/.test(rest)) return "complete";
    return "not-close";
  }

  private closeArtifact(incomplete: boolean): void {
    this.flushBuffers();
    this.out.push({
      type: "artifact_close",
      identifier: this.artifactIdentifier,
      ...(incomplete ? { incomplete: true } : {}),
    });
    this.artifactIdentifier = "";
    this.closeProbe = "";
    this.enterTextMode();
    this.lineStart = false;
  }

  // ---------------------------------------------------------------------------
  // FENCE_INFO state
  // ---------------------------------------------------------------------------

  private beginFence(length: number): void {
    this.pendingSpaces = "";
    this.pendingBackticks = "";
    this.fenceLength = length;
    this.fenceInfo = "";
    this.fenceIsMermaid = false;
    this.mode = "fence-info";
  }

  private fenceInfoChar(c: string): void {
    if (c === "\n") {
      this.fenceInfoNewline();
    } else {
      this.fenceInfo += c;
    }
  }

  private fenceInfoNewline(): void {
    if (parseFenceLanguage(this.fenceInfo) === "mermaid") {
      this.fenceIsMermaid = true;
      this.emitMermaidOpen();
    } else {
      // Non-mermaid fences stream as plain text, opener included.
      this.emitText("`".repeat(this.fenceLength) + this.fenceInfo + "\n");
    }
    this.mode = "fence-body";
    this.bodyLineStart = true;
    this.bodyIndent = "";
    this.bodyBackticks = "";
    this.bodyTrailing = "";
  }

  // ---------------------------------------------------------------------------
  // FENCE_BODY state
  // ---------------------------------------------------------------------------

  private fenceBodyChar(c: string): void {
    if (this.bodyLineStart) {
      if (c === " ") {
        if (this.bodyBackticks.length === 0) {
          this.bodyIndent += " ";
          if (this.bodyIndent.length > 3) {
            // More than three leading spaces: indented content, not a closer.
            this.emitContent(this.bodyIndent);
            this.bodyIndent = "";
            this.bodyLineStart = false;
          }
        } else {
          this.bodyTrailing += " ";
        }
        return;
      }

      if (c === "`") {
        this.bodyBackticks += "`";
        return;
      }

      if (c === "\n") {
        if (this.bodyBackticks.length >= this.fenceLength) {
          this.closeFence();
        } else {
          this.emitContent(this.bodyIndent + this.bodyBackticks + this.bodyTrailing + "\n");
          this.bodyIndent = "";
          this.bodyBackticks = "";
          this.bodyTrailing = "";
        }
        return;
      }

      // A non-space, non-backtick character at line start: not a closer.
      this.emitContent(this.bodyIndent + this.bodyBackticks + this.bodyTrailing + c);
      this.bodyIndent = "";
      this.bodyBackticks = "";
      this.bodyTrailing = "";
      this.bodyLineStart = false;
      return;
    }

    // Mid-line.
    if (c === "\n") {
      this.emitContent("\n");
      this.bodyLineStart = true;
      this.bodyIndent = "";
      this.bodyBackticks = "";
      this.bodyTrailing = "";
    } else {
      this.emitContent(c);
    }
  }

  private closeFence(): void {
    if (this.fenceIsMermaid) {
      this.emitMermaidClose();
    } else {
      this.emitText(this.bodyIndent + this.bodyBackticks + this.bodyTrailing + "\n");
    }
    this.enterTextMode();
  }

  /** Emit any held-back closing-fence tail as content (text or mermaid delta). */
  private flushBodyHold(asMermaid: boolean): void {
    const held = this.bodyIndent + this.bodyBackticks + this.bodyTrailing;
    if (held.length > 0) {
      if (asMermaid) {
        this.emitMermaidDelta(held);
      } else {
        this.emitText(held);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Shared helpers
  // ---------------------------------------------------------------------------

  private emitContent(text: string): void {
    if (this.fenceIsMermaid) {
      this.emitMermaidDelta(text);
    } else {
      this.emitText(text);
    }
  }

  private enterTextMode(): void {
    this.mode = "text";
    this.lineStart = true;
    this.pendingSpaces = "";
    this.pendingBackticks = "";
    this.fenceLength = 0;
    this.fenceInfo = "";
    this.fenceIsMermaid = false;
    this.bodyLineStart = false;
    this.bodyIndent = "";
    this.bodyBackticks = "";
    this.bodyTrailing = "";
    this.tagBuf = "";
    this.tagName = "";
    this.tagNameDone = false;
    this.artifactIdentifier = "";
    this.closeProbe = "";
  }

  private emitText(text: string): void {
    if (text.length === 0) return;
    this.flushMermaidBuf();
    this.flushArtifactBuf();
    this.textBuf += text;
  }

  private emitMermaidOpen(): void {
    this.flushBuffers();
    this.out.push({ type: "mermaid_open" });
  }

  private emitMermaidDelta(text: string): void {
    if (text.length === 0) return;
    this.flushTextBuf();
    this.flushArtifactBuf();
    this.mermaidBuf += text;
  }

  private emitMermaidClose(): void {
    this.flushBuffers();
    this.out.push({ type: "mermaid_close" });
  }

  private emitArtifactDelta(text: string): void {
    if (text.length === 0) return;
    this.flushTextBuf();
    this.flushMermaidBuf();
    this.artifactBuf += text;
  }

  private flushTextBuf(): void {
    if (this.textBuf.length > 0) {
      this.out.push({ type: "text", text: this.textBuf });
      this.textBuf = "";
    }
  }

  private flushMermaidBuf(): void {
    if (this.mermaidBuf.length > 0) {
      this.out.push({ type: "mermaid_delta", text: this.mermaidBuf });
      this.mermaidBuf = "";
    }
  }

  private flushArtifactBuf(): void {
    if (this.artifactBuf.length > 0) {
      this.out.push({
        type: "artifact_delta",
        identifier: this.artifactIdentifier,
        text: this.artifactBuf,
      });
      this.artifactBuf = "";
    }
  }

  private flushBuffers(): void {
    this.flushTextBuf();
    this.flushMermaidBuf();
    this.flushArtifactBuf();
  }
}
