import { describe, expect, it } from "vitest";
import { StreamParser } from "../src/parser";
import type { ParserEvent } from "../src/parser";
import { fixtures } from "./fixtures";

/**
 * Events that carry streaming text. Chunk-boundary invariance is asserted on a
 * normalized sequence that merges adjacent text-bearing events of the same
 * type/identifier: the physical boundaries of `text`/`artifact_delta`/
 * `mermaid_delta` events legitimately depend on how the input was chunked, so
 * literal object equality would fail under the minimal-buffering streaming
 * requirement (§5). Open/close/tool_call events are atomic and compare directly.
 */
type TextBearingEvent =
  | Extract<ParserEvent, { type: "text" }>
  | Extract<ParserEvent, { type: "artifact_delta" }>
  | Extract<ParserEvent, { type: "mermaid_delta" }>;

function isTextBearing(e: ParserEvent): e is TextBearingEvent {
  return e.type === "text" || e.type === "artifact_delta" || e.type === "mermaid_delta";
}

function sameStream(a: TextBearingEvent, b: TextBearingEvent): boolean {
  if (a.type !== b.type) return false;
  if (a.type === "artifact_delta" && b.type === "artifact_delta") {
    return a.identifier === b.identifier;
  }
  return true;
}

/** Merge adjacent text-bearing events of the same type/identifier. */
function normalize(events: ParserEvent[]): ParserEvent[] {
  const out: ParserEvent[] = [];
  for (const event of events) {
    const prev = out[out.length - 1];
    if (
      prev !== undefined &&
      isTextBearing(prev) &&
      isTextBearing(event) &&
      sameStream(prev, event)
    ) {
      out[out.length - 1] = { ...prev, text: prev.text + event.text } as ParserEvent;
    } else {
      out.push(event);
    }
  }
  return out;
}

/** Feed the input as a sequence of chunks and return the normalized events. */
function feed(chunks: string[]): ParserEvent[] {
  const parser = new StreamParser();
  const events: ParserEvent[] = [];
  for (const chunk of chunks) {
    events.push(...parser.push(chunk));
  }
  events.push(...parser.end());
  return normalize(events);
}

/** Deterministic PRNG (mulberry32) so the fuzz splits are reproducible. */
function mulberry32(seed: number): () => number {
  let state = seed | 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Split the text at deterministic random interior points (max `maxChunks` chunks). */
function randomSplits(text: string, rng: () => number, maxChunks: number): string[] {
  const points = new Set<number>([0, text.length]);
  const target = 2 + Math.floor(rng() * Math.max(1, maxChunks - 1));
  while (points.size < target && points.size < text.length + 1) {
    points.add(1 + Math.floor(rng() * Math.max(1, text.length - 1)));
  }
  const sorted = [...points].sort((a, b) => a - b);
  const chunks: string[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    chunks.push(text.slice(sorted[i]!, sorted[i + 1]!));
  }
  return chunks;
}

describe("StreamParser: chunk-boundary fuzz", () => {
  for (const fixture of fixtures) {
    describe(`fixture ${fixture.name}`, () => {
      const whole = feed([fixture.text]);

      it("matches the whole-input event sequence at every single split boundary", () => {
        for (let k = 1; k < fixture.text.length; k++) {
          expect(feed([fixture.text.slice(0, k), fixture.text.slice(k)])).toEqual(whole);
        }
      });

      it("matches the whole-input event sequence when fed one character at a time", () => {
        expect(feed([...fixture.text])).toEqual(whole);
      });

      it("matches the whole-input event sequence at deterministic random multi-split points", () => {
        const rng = mulberry32(0x0a1b2c3d);
        for (let trial = 0; trial < 32; trial++) {
          const chunks = randomSplits(fixture.text, rng, 12);
          expect(feed(chunks)).toEqual(whole);
        }
      });
    });
  }
});
