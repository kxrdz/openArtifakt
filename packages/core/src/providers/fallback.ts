import type { StreamEvent } from "@openartifact/shared";

import type { ParserEvent, ToolCallEvent } from "../parser";
import { StreamParser } from "../parser";

/**
 * Tool-call fallback decorator (§4 "Tool-call fallback").
 *
 * When a provider cannot do native tool calling (`capabilities.nativeTools` is
 * false), the model is told to emit `<tool_call name="…">{…json…}</tool_call>`
 * blocks inside its streamed text. `withFallbackTools` pipes each `text_delta`
 * through the feature-2 `StreamParser` and translates the parser's `tool_call`
 * events into the canonical `tool_call_start`/`tool_call_delta`/`tool_call_end`
 * sequence, so the agent loop cannot tell native from fallback tool calls.
 *
 * Everything the parser emits that is *not* a tool call (plain prose, artifact
 * blocks and mermaid fences) is re-serialized back to literal text and emitted
 * as `text_delta`, so the downstream consumer still receives the full response
 * text and can run its own artifact/mermaid pass over it. Non-text events
 * (`usage`, `done`, `error`, native `tool_call_*`) pass through unchanged.
 */

export interface FallbackToolsOptions {
  /**
   * When true, the source already emits native tool-call events and its text
   * passes through unchanged. Defaults to false (fallback parsing active).
   */
  nativeTools?: boolean;
}

/** Quote an attribute value, using single quotes when it contains a double quote. */
function quoteAttr(value: string): string {
  return value.includes('"') ? `'${value}'` : `"${value}"`;
}

type ArtifactOpenEvent = Extract<ParserEvent, { type: "artifact_open" }>;

/** Re-serialize an `artifact_open` event as its `<artifact …>` tag. */
function artifactOpenTag(event: ArtifactOpenEvent): string {
  const attrs = [
    `identifier=${quoteAttr(event.identifier)}`,
    `type=${quoteAttr(event.artifactType)}`,
    `title=${quoteAttr(event.title)}`,
  ];
  if (event.language !== undefined) attrs.push(`language=${quoteAttr(event.language)}`);
  return `<artifact ${attrs.join(" ")}>`;
}

/** Turn one fallback `tool_call` parser event into the native-equivalent event sequence. */
function toolCallEvents(call: ToolCallEvent, id: string): StreamEvent[] {
  return [
    { type: "tool_call_start", id, name: call.name },
    { type: "tool_call_delta", id, argsDelta: JSON.stringify(call.args) ?? "{}" },
    { type: "tool_call_end", id, args: call.args },
  ];
}

/**
 * Translate parser events back into `StreamEvent`s: prose, artifact and
 * mermaid events are re-serialized as `text_delta` so the full response text
 * survives, and fallback `tool_call` events become native-equivalent tool events.
 */
function* translateParserEvents(
  events: ParserEvent[],
  nextId: () => string,
): Generator<StreamEvent, void, undefined> {
  for (const event of events) {
    switch (event.type) {
      case "text":
        yield { type: "text_delta", text: event.text };
        break;
      case "tool_call":
        yield* toolCallEvents(event, nextId());
        break;
      case "artifact_open":
        yield { type: "text_delta", text: artifactOpenTag(event) };
        break;
      case "artifact_delta":
        yield { type: "text_delta", text: event.text };
        break;
      case "artifact_close":
        // An incomplete artifact has no closing tag in the source; emit nothing
        // so the downstream parser flags it as incomplete too.
        if (!event.incomplete) {
          yield { type: "text_delta", text: "</artifact>" };
        }
        break;
      case "mermaid_open":
        yield { type: "text_delta", text: "```mermaid\n" };
        break;
      case "mermaid_delta":
        yield { type: "text_delta", text: event.text };
        break;
      case "mermaid_close":
        yield { type: "text_delta", text: "```\n" };
        break;
      default: {
        const exhaustive: never = event;
        void exhaustive;
      }
    }
  }
}

/**
 * Wrap an adapter stream with fallback tool-call extraction. See the module
 * docs for the full contract.
 */
export async function* withFallbackTools(
  source: AsyncIterable<StreamEvent>,
  options: FallbackToolsOptions = {},
): AsyncIterable<StreamEvent> {
  const { nativeTools = false } = options;

  // Native-tools providers already emit tool events; there is nothing to extract.
  if (nativeTools) {
    for await (const event of source) yield event;
    return;
  }

  const parser = new StreamParser();
  let counter = 0;
  // Ids are unique within a single stream; the agent loop correlates tool
  // results per turn, so a counter is sufficient and keeps ids deterministic.
  const nextId = (): string => `call_${counter++}`;

  for await (const event of source) {
    if (event.type === "text_delta") {
      yield* translateParserEvents(parser.push(event.text), nextId);
    } else if (event.type === "done" || event.type === "error") {
      // Flush any held-back parser suffix before the terminal event.
      yield* translateParserEvents(parser.end(), nextId);
      yield event;
      return;
    } else {
      yield event;
    }
  }

  // A well-behaved source always ends with a terminal event (handled above);
  // still flush an exhausted iterator so no text is ever silently dropped.
  yield* translateParserEvents(parser.end(), nextId);
}
