import type { ParserEvent } from "./events";

type Mode = "text" | "fence-info" | "fence-body";

/**
 * The language word of a fence info string (e.g. "```mermaid" → "mermaid"),
 * lowercased so `Mermaid`/`MERMAID` also count.
 */
function parseFenceLanguage(info: string): string {
  const first = info.trim().split(/\s+/)[0] ?? "";
  return first.toLowerCase();
}

/**
 * Incremental, character-level stream parser (§5).
 *
 * It converts raw streamed model text into structured {@link ParserEvent}s:
 * ordinary prose streams immediately as `text`, fenced code blocks keep
 * `<artifact>`/`<tool_call>` tags literal, and a fence whose language is
 * `mermaid` emits `mermaid_open`/`mermaid_delta`/`mermaid_close`.
 *
 * The API is a tiny synchronous push model:
 * - `push(chunk)` feeds one delta and returns the events it produced.
 * - `end()` flushes any held-back suffix and returns the final events.
 *
 * Only the minimal ambiguous suffix is held back (at most the start of a
 * potential code fence), so text streams without waiting for the full
 * response and the same input yields the same events however it is chunked.
 */
export class StreamParser {
  private mode: Mode = "text";
  private out: ParserEvent[] = [];

  // Coalescing buffers so consecutive `text`/`mermaid_delta` events merge into
  // single events (they only split when another event type intervenes).
  private textBuf = "";
  private mermaidBuf = "";

  // TEXT state: potential fence opener (≤3 leading spaces + a backtick run).
  private lineStart = true;
  private pendingSpaces = "";
  private pendingBackticks = "";

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

  /** Feed one text delta and return the events it produced. */
  push(chunk: string): ParserEvent[] {
    const out: ParserEvent[] = [];
    this.out = out;
    this.textBuf = "";
    this.mermaidBuf = "";
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

    switch (this.mode) {
      case "text":
        this.flushHold();
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
      case "fence-info":
        this.fenceInfoChar(c);
        break;
      case "fence-body":
        this.fenceBodyChar(c);
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
      this.emitText(c);
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
  }

  private emitText(text: string): void {
    if (text.length === 0) return;
    this.flushMermaidBuf();
    this.textBuf += text;
  }

  private emitMermaidOpen(): void {
    this.flushBuffers();
    this.out.push({ type: "mermaid_open" });
  }

  private emitMermaidDelta(text: string): void {
    if (text.length === 0) return;
    this.flushTextBuf();
    this.mermaidBuf += text;
  }

  private emitMermaidClose(): void {
    this.flushBuffers();
    this.out.push({ type: "mermaid_close" });
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

  private flushBuffers(): void {
    this.flushTextBuf();
    this.flushMermaidBuf();
  }
}
