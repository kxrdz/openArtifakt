/**
 * Minimal SSE-over-fetch parser (§12.6, design decision 3 & 8).
 *
 * The chat transport uses `POST /api/chat` and streams `text/event-stream`
 * over a `fetch` response body (EventSource is GET-only and cannot carry the
 * POST body). This turns that body into a sequence of {@link SseEvent}s,
 * handling events split across network chunks, `\r\n` and `\n` line endings,
 * multi-line `data:` payloads, `:` comment/keep-alive lines, and a final
 * unterminated event.
 */

/** One parsed SSE event: its `event:` name and its accumulated `data:` payload. */
export interface SseEvent {
  /** The `event:` field value, or `"message"` when the field is absent. */
  event: string;
  /** The accumulated `data:` payload lines, joined with `\n`. */
  data: string;
}

/**
 * Parse an SSE body into events.
 *
 * @param body the `fetch` response body (a byte stream of `text/event-stream`)
 * @returns an async generator yielding one {@link SseEvent} per completed frame
 */
export async function* readSseEvents(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<SseEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  // The in-progress event being assembled from its field lines.
  let eventName = "";
  const dataLines: string[] = [];

  const dispatch = (): SseEvent => {
    const event = {
      event: eventName === "" ? "message" : eventName,
      data: dataLines.join("\n"),
    };
    eventName = "";
    dataLines.length = 0;
    return event;
  };

  const consumeLine = (rawLine: string): SseEvent | null => {
    let line = rawLine;
    if (line.endsWith("\r")) line = line.slice(0, -1);

    // A blank line terminates the current event.
    if (line === "") {
      if (eventName === "" && dataLines.length === 0) return null;
      return dispatch();
    }

    // `:` prefix marks a comment or keep-alive; ignore it.
    if (line.startsWith(":")) return null;

    const colon = line.indexOf(":");
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? "" : line.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);

    if (field === "event") eventName = value;
    else if (field === "data") dataLines.push(value);
    // Other fields (`id`, `retry`) are ignored by this minimal parser.

    return null;
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let newline = buffer.indexOf("\n");
      while (newline !== -1) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        const event = consumeLine(line);
        if (event !== null) yield event;
        newline = buffer.indexOf("\n");
      }
    }

    // Flush the decoder's trailing bytes, then any final line or event.
    buffer += decoder.decode();
    if (buffer !== "") {
      const event = consumeLine(buffer);
      if (event !== null) yield event;
    }
    if (eventName !== "" || dataLines.length > 0) {
      yield dispatch();
    }
  } finally {
    reader.releaseLock();
  }
}
