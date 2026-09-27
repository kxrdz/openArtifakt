import { describe, expect, it } from "vitest";

import { readSseEvents, type SseEvent } from "./sse";

/** Build a byte stream from string chunks, as `fetch` would deliver them. */
function streamFromChunks(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
}

/** Drain the generator into an array. */
async function collect(body: ReadableStream<Uint8Array>): Promise<SseEvent[]> {
  const events: SseEvent[] = [];
  for await (const event of readSseEvents(body)) {
    events.push(event);
  }
  return events;
}

describe("readSseEvents", () => {
  it("parses a single event with its name and data", async () => {
    const events = await collect(streamFromChunks(['event: text\ndata: {"type":"text","text":"hi"}\n\n']));
    expect(events).toEqual([
      { event: "text", data: '{"type":"text","text":"hi"}' },
    ]);
  });

  it("parses multiple events separated by blank lines", async () => {
    const body = [
      'event: conversation\ndata: {"conversationId":"conv-1"}\n\n',
      'event: state\ndata: {"state":"streaming"}\n\n',
      'event: text\ndata: hi\n\n',
    ].join("");
    expect(await collect(streamFromChunks([body]))).toEqual([
      { event: "conversation", data: '{"conversationId":"conv-1"}' },
      { event: "state", data: '{"state":"streaming"}' },
      { event: "text", data: "hi" },
    ]);
  });

  it("reassembles events split across arbitrary chunk boundaries", async () => {
    const wire = 'event: text\ndata: {"type":"text","text":"streamed"}\n\nevent: done\ndata: {"stopReason":"end_turn"}\n\n';
    // Feed one character at a time.
    const chunks = wire.split("");
    const events = await collect(streamFromChunks(chunks));
    expect(events).toEqual([
      { event: "text", data: '{"type":"text","text":"streamed"}' },
      { event: "done", data: '{"stopReason":"end_turn"}' },
    ]);
  });

  it("tolerates CRLF line endings", async () => {
    const events = await collect(
      streamFromChunks(['event: text\r\ndata: hi\r\n\r\n']),
    );
    expect(events).toEqual([{ event: "text", data: "hi" }]);
  });

  it("joins multi-line data payloads with newlines", async () => {
    const events = await collect(streamFromChunks(["data: line1\ndata: line2\n\n"]));
    expect(events).toEqual([{ event: "message", data: "line1\nline2" }]);
  });

  it("defaults the event name to message and strips one leading space after the colon", async () => {
    const events = await collect(streamFromChunks(["data: payload\n\n"]));
    expect(events).toEqual([{ event: "message", data: "payload" }]);
  });

  it("ignores comment/keep-alive lines and unknown fields", async () => {
    const events = await collect(
      streamFromChunks([": keep-alive\nid: 42\nretry: 100\ndata: ok\n\n"]),
    );
    expect(events).toEqual([{ event: "message", data: "ok" }]);
  });

  it("yields a final event without a trailing blank line", async () => {
    const events = await collect(streamFromChunks(["event: done\ndata: {}"]));
    expect(events).toEqual([{ event: "done", data: "{}" }]);
  });

  it("yields nothing for an empty stream", async () => {
    expect(await collect(streamFromChunks([]))).toEqual([]);
  });
});
